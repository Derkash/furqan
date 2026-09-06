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

    /// L'activité en direct reçoit la session EN COURS (et non tout l'état).
    private func decodeSession(_ call: CAPPluginCall) -> RecitationSession? {
        guard
            let raw = call.getString("state"),
            let data = raw.data(using: .utf8)
        else { return nil }
        return try? JSONDecoder().decode(RecitationSession.self, from: data)
    }

    @objc func startLiveActivity(_ call: CAPPluginCall) {
        #if canImport(ActivityKit)
        if #available(iOS 16.2, *) {
            guard ActivityAuthorizationInfo().areActivitiesEnabled,
                  let state = decodeSession(call) else {
                call.resolve()
                return
            }
            // Une seule activité de récitation à la fois.
            if Activity<RecitationActivityAttributes>.activities.isEmpty {
                let attributes = RecitationActivityAttributes(slotLabel: state.slotLabel)
                let content = ActivityContent(
                    state: contentState(from: state),
                    staleDate: state.endDate
                )
                _ = try? Activity.request(attributes: attributes, content: content)
            } else {
                update(with: state)
            }
        }
        #endif
        call.resolve()
    }

    @objc func updateLiveActivity(_ call: CAPPluginCall) {
        #if canImport(ActivityKit)
        if #available(iOS 16.2, *), let state = decodeSession(call) {
            update(with: state)
        }
        #endif
        call.resolve()
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
    @available(iOS 16.2, *)
    private func contentState(from state: RecitationSession) -> RecitationActivityAttributes.ContentState {
        RecitationActivityAttributes.ContentState(
            recitedPages: state.recitedPages,
            totalPages: state.totalPages,
            pagesLabel: state.pagesLabel,
            slotEndEpoch: state.endEpoch,
            startVerse: state.startVerse
        )
    }

    @available(iOS 16.2, *)
    private func update(with state: RecitationSession) {
        let content = ActivityContent(state: contentState(from: state), staleDate: state.endDate)
        Task {
            for activity in Activity<RecitationActivityAttributes>.activities {
                await activity.update(content)
            }
        }
    }
    #endif
}
