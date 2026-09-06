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
    /// "active" (créneau en cours, pages restantes) | "done" (objectif atteint
    /// → on montre la prochaine session) | "upcoming" | "idle"
    public var phase: String
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
    /// Début du premier / dernier verset à réciter (Unicode othmanien,
    /// tronqué côté JS). Vide tant que le texte n'est pas chargé.
    public var startVerse: String
    public var endVerse: String
    // Prochaine session (phases "done" et "upcoming")
    public var nextSlotLabel: String
    public var nextPagesLabel: String
    public var nextDayLabel: String

    public static func load() -> SharedRecitationState? {
        guard
            let defaults = UserDefaults(suiteName: recitationAppGroupId),
            let raw = defaults.string(forKey: recitationStateKey),
            let data = raw.data(using: .utf8)
        else { return nil }
        return try? JSONDecoder().decode(SharedRecitationState.self, from: data)
    }

    public var isActive: Bool { phase == "active" && totalPages > 0 }
    public var isDone: Bool { phase == "done" }
    public var hasNext: Bool { !nextSlotLabel.isEmpty }
    /// « à 11 h » ou « mardi 8 septembre, à 8 h »
    public var nextLabel: String {
        if nextSlotLabel.isEmpty { return "" }
        if nextDayLabel.isEmpty || nextDayLabel == "aujourd’hui" { return "à \(nextSlotLabel)" }
        return "\(nextDayLabel), à \(nextSlotLabel)"
    }
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
        /// Début du prochain verset à réciter (Unicode othmanien, tronqué).
        public var startVerse: String
        public init(recitedPages: Int, totalPages: Int, pagesLabel: String, slotEndEpoch: Int, startVerse: String) {
            self.recitedPages = recitedPages
            self.totalPages = totalPages
            self.pagesLabel = pagesLabel
            self.slotEndEpoch = slotEndEpoch
            self.startVerse = startVerse
        }
    }
    public var slotLabel: String
    public init(slotLabel: String) { self.slotLabel = slotLabel }
}
#endif
