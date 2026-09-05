//
//  RecitationShared.swift
//  Partagé entre l'app et l'extension RecitationWidget (double appartenance).
//
//  État écrit par la WebView (plugin RecitationBridge) dans l'App Group, lu
//  par le widget et l'activité en direct. Le compte à rebours n'est PAS stocké
//  en minutes restantes : on stocke l'époque de fin (slotEndEpoch) et les vues
//  utilisent Text(timerInterval:) — aucun rafraîchissement périodique.
//

import Foundation
#if canImport(ActivityKit)
import ActivityKit
#endif

/// Identifiant App Group partagé app ↔ extension.
public let recitationAppGroupId = "group.com.almuraja3a.app"
/// Clé UserDefaults (suite App Group) contenant le JSON d'état.
public let recitationStateKey = "recitationWidgetState"

/// Miroir Swift de l'état construit côté TypeScript (widgetSync.ts).
public struct SharedRecitationState: Codable {
    public var phase: String        // "active" | "upcoming" | "idle"
    public var date: String
    public var slotStartMin: Int
    public var slotEndMin: Int
    public var slotEndEpoch: Int    // secondes epoch — fin du créneau
    public var totalPages: Int
    public var recitedPages: Int
    public var firstPage: Int
    public var lastPage: Int
    public var pagesLabel: String   // « Pages 3 à 6 »
    public var slotLabel: String    // « 18 h – 19 h »

    public static func load() -> SharedRecitationState? {
        guard
            let defaults = UserDefaults(suiteName: recitationAppGroupId),
            let raw = defaults.string(forKey: recitationStateKey),
            let data = raw.data(using: .utf8)
        else { return nil }
        return try? JSONDecoder().decode(SharedRecitationState.self, from: data)
    }

    public var isActive: Bool { phase == "active" && totalPages > 0 }
    public var remainingPages: Int { max(0, totalPages - recitedPages) }
    public var slotEndDate: Date { Date(timeIntervalSince1970: TimeInterval(slotEndEpoch)) }
    /// « Encore 2 pages avant 19 h » (fin du créneau en heure locale).
    public var remainingLabel: String {
        let h = slotEndMin / 60
        let m = slotEndMin % 60
        let hour = m == 0 ? "\(h) h" : String(format: "%d h %02d", h, m)
        if remainingPages == 0 { return "Objectif atteint — qu’Allah accepte" }
        return "Encore \(remainingPages) page\(remainingPages > 1 ? "s" : "") avant \(hour)"
    }
}

#if canImport(ActivityKit)
/// Attributs de l'activité en direct (écran verrouillé + Dynamic Island).
@available(iOS 16.2, *)
public struct RecitationActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        public var recitedPages: Int
        public var totalPages: Int
        public var pagesLabel: String
        public var slotEndEpoch: Int
        public init(recitedPages: Int, totalPages: Int, pagesLabel: String, slotEndEpoch: Int) {
            self.recitedPages = recitedPages
            self.totalPages = totalPages
            self.pagesLabel = pagesLabel
            self.slotEndEpoch = slotEndEpoch
        }
    }
    public var slotLabel: String
    public init(slotLabel: String) { self.slotLabel = slotLabel }
}
#endif
