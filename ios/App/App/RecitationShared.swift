//
//  RecitationShared.swift
//  Partagé entre l'app et l'extension RecitationWidget (double appartenance).
//
//  L'app écrit dans l'App Group la LISTE des prochaines sessions (aujourd'hui
//  + les jours suivants du cycle), chacune bornée par des époques. Le widget
//  choisit ensuite lui-même la session correspondant à l'instant de rendu :
//  il change donc de créneau, de pages et de versets SANS que l'application
//  soit ouverte. Le décompte, lui, est rendu par Text(timerInterval:).
//

import Foundation
#if canImport(ActivityKit)
import ActivityKit
#endif

/// Identifiant App Group partagé app ↔ extension.
public let recitationAppGroupId = "group.com.almuraja3a.app"
/// Clé UserDefaults (suite App Group) contenant le JSON d'état.
public let recitationStateKey = "recitationWidgetState"

/// Une occurrence de créneau, autonome pour l'affichage.
public struct RecitationSession: Codable, Hashable {
    public var startEpoch: Int
    public var endEpoch: Int
    public var slotLabel: String    // « 11 h – 12 h »
    public var dayLabel: String     // vide si aujourd'hui
    public var pagesLabel: String   // « Pages 4 à 5 »
    public var firstPage: Int
    public var lastPage: Int
    public var totalPages: Int
    public var recitedPages: Int
    public var startVerse: String   // début du premier verset (othmanien)
    public var endVerse: String     // début du dernier verset

    public var startDate: Date { Date(timeIntervalSince1970: TimeInterval(startEpoch)) }
    public var endDate: Date { Date(timeIntervalSince1970: TimeInterval(endEpoch)) }
    public var remainingPages: Int { max(0, totalPages - recitedPages) }
    public var isComplete: Bool { totalPages > 0 && recitedPages >= totalPages }

    /// « à 11 h » / « mardi 8 septembre, à 8 h » — début de la session.
    public var whenLabel: String {
        let hour = slotLabel.components(separatedBy: " – ").first ?? slotLabel
        return dayLabel.isEmpty ? "à \(hour)" : "\(dayLabel), à \(hour)"
    }

    /// « Encore 2 pages avant 12 h ».
    public var remainingLabel: String {
        let end = slotLabel.components(separatedBy: " – ").last ?? ""
        if remainingPages == 0 { return "Objectif atteint — qu’Allah accepte" }
        return "Encore \(remainingPages) page\(remainingPages > 1 ? "s" : "") avant \(end)"
    }
}

/// État partagé complet : toutes les sessions à venir.
public struct SharedRecitationState: Codable {
    public var generatedAt: Int
    public var sessions: [RecitationSession]

    public static func load() -> SharedRecitationState? {
        guard
            let defaults = UserDefaults(suiteName: recitationAppGroupId),
            let raw = defaults.string(forKey: recitationStateKey),
            let data = raw.data(using: .utf8)
        else { return nil }
        return try? JSONDecoder().decode(SharedRecitationState.self, from: data)
    }

    /// Session en cours à cet instant.
    public func session(at date: Date) -> RecitationSession? {
        let t = Int(date.timeIntervalSince1970)
        return sessions.first { t >= $0.startEpoch && t < $0.endEpoch }
    }

    /// Première session à venir strictement après cet instant.
    public func nextSession(after date: Date) -> RecitationSession? {
        let t = Int(date.timeIntervalSince1970)
        return sessions.first { $0.startEpoch > t }
    }

    /// Instants où l'affichage doit basculer (débuts et fins de session).
    public var boundaries: [Date] {
        sessions.flatMap { [$0.startDate, $0.endDate] }.sorted()
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
        /// Début du premier verset à réciter (Unicode othmanien, tronqué).
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
