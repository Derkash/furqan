//
//  RecitationBridge.swift
//  Plugin Capacitor local : reçoit l'état de la WebView (widgetSync.ts),
//  l'écrit dans l'App Group, recharge le widget et pilote l'activité en
//  direct. Enregistré dans MainViewController.capacitorDidLoad().
//

import Foundation
import Capacitor
import WidgetKit
#if canImport(ActivityKit)
import ActivityKit
#endif

@objc(RecitationBridge)
public class RecitationBridge: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "RecitationBridge"
    public let jsName = "RecitationBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "syncState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startLiveActivity", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "updateLiveActivity", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "endLiveActivity", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "diagnostics", returnType: CAPPluginReturnPromise),
    ]

    // ---------- Widget (App Group + reload) ----------

    @objc func syncState(_ call: CAPPluginCall) {
        let state = call.getString("state") ?? "{}"
        if let defaults = UserDefaults(suiteName: recitationAppGroupId) {
            defaults.set(state, forKey: recitationStateKey)
        }
        WidgetCenter.shared.reloadAllTimelines()
        call.resolve()
    }

    // ---------- Activité en direct ----------

    /// L'activité en direct reçoit son contenu déjà phasé (LiveContent JS).
    @available(iOS 16.2, *)
    private func decodeContent(_ call: CAPPluginCall) -> RecitationActivityAttributes.ContentState? {
        guard
            let raw = call.getString("state"),
            let data = raw.data(using: .utf8)
        else { return nil }
        return try? JSONDecoder().decode(RecitationActivityAttributes.ContentState.self, from: data)
    }

    /// Les échecs sont REMONTÉS (et non avalés) : sans cela, une activité qui
    /// ne démarre pas est indiscernable d'une activité désactivée.
    @objc func startLiveActivity(_ call: CAPPluginCall) {
        #if canImport(ActivityKit)
        if #available(iOS 16.2, *) {
            guard let content = decodeContent(call) else {
                call.reject("payload d'activité illisible")
                return
            }
            guard ActivityAuthorizationInfo().areActivitiesEnabled else {
                call.reject("activités en direct désactivées pour cette app")
                return
            }
            // Une seule activité de récitation à la fois — vivante toute la
            // journée, mise à jour à chaque phase.
            if Activity<RecitationActivityAttributes>.activities.isEmpty {
                let activityContent = ActivityContent(state: content, staleDate: staleDate(for: content))
                do {
                    _ = try Activity.request(attributes: RecitationActivityAttributes(), content: activityContent)
                } catch {
                    call.reject("démarrage refusé : \(error.localizedDescription)")
                    return
                }
            } else {
                update(with: content)
            }
            call.resolve()
            return
        }
        call.reject("iOS 16.2 requis pour les activités en direct")
        return
        #else
        call.reject("ActivityKit indisponible")
        #endif
    }

    @objc func updateLiveActivity(_ call: CAPPluginCall) {
        #if canImport(ActivityKit)
        if #available(iOS 16.2, *), let content = decodeContent(call) {
            update(with: content)
        }
        #endif
        call.resolve()
    }

    /// État réel du pont : ce que le widget peut lire, ce qu'iOS autorise.
    @objc func diagnostics(_ call: CAPPluginCall) {
        var info: [String: Any] = [:]
        let defaults = UserDefaults(suiteName: recitationAppGroupId)
        info["appGroupReachable"] = defaults != nil
        let raw = defaults?.string(forKey: recitationStateKey)
        info["stateBytes"] = raw?.count ?? 0
        if let raw, let data = raw.data(using: .utf8),
           let decoded = try? JSONDecoder().decode(SharedRecitationState.self, from: data) {
            info["sessionCount"] = decoded.sessions.count
            info["generatedAt"] = decoded.generatedAt
            if let s = decoded.session(at: Date()) {
                info["activeSlot"] = s.slotLabel
                info["activePages"] = s.pagesLabel
            }
            if let n = decoded.nextSession(after: Date()) {
                info["nextSlot"] = n.slotLabel
                info["nextDay"] = n.dayLabel
            }
        }
        #if canImport(ActivityKit)
        if #available(iOS 16.2, *) {
            info["activitiesEnabled"] = ActivityAuthorizationInfo().areActivitiesEnabled
            info["runningActivities"] = Activity<RecitationActivityAttributes>.activities.count
        }
        #endif
        call.resolve(info)
    }

    @objc func endLiveActivity(_ call: CAPPluginCall) {
        #if canImport(ActivityKit)
        if #available(iOS 16.2, *) {
            Task {
                for activity in Activity<RecitationActivityAttributes>.activities {
                    await activity.end(nil, dismissalPolicy: .immediate)
                }
            }
        }
        #endif
        call.resolve()
    }

    #if canImport(ActivityKit)
    /// L'activité reste pertinente au moins jusqu'à sa référence de décompte,
    /// avec une marge — l'app la rafraîchit à chaque passage au premier plan.
    @available(iOS 16.2, *)
    private func staleDate(for content: RecitationActivityAttributes.ContentState) -> Date {
        max(content.refDate, Date()).addingTimeInterval(2 * 3600)
    }

    @available(iOS 16.2, *)
    private func update(with content: RecitationActivityAttributes.ContentState) {
        let activityContent = ActivityContent(state: content, staleDate: staleDate(for: content))
        Task {
            for activity in Activity<RecitationActivityAttributes>.activities {
                await activity.update(activityContent)
            }
        }
    }
    #endif
}
