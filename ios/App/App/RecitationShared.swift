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
    public var pagesLabel: String   // « 02/pages 1 à 4 » (repère de sourate)
    /// "cycle" (révision du périmètre) ou "learning" (sourate en cours).
    public var kind: String
    /// Titre de la séance, calculé côté app.
    public var title: String
    /// Repères de page en numérotation de sourate, pour les étiquettes.
    public var firstPageLabel: String
    public var lastPageLabel: String
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
    public var isLearning: Bool { kind == "learning" }

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
    /// Le retard reste-t-il dû (préférence de report ≠ « jamais ») ?
    public var carryOverDue: Bool?
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

    /// Pages en retard à cet instant : restes des sessions passées du jour.
    /// Le widget peut ainsi afficher le retard SANS que l'app soit ouverte.
    public func overdueCount(at date: Date) -> Int {
        guard carryOverDue ?? true else { return 0 }
        let t = Int(date.timeIntervalSince1970)
        let cal = Calendar.current
        return sessions
            .filter { $0.endEpoch <= t && cal.isDate($0.startDate, inSameDayAs: date) }
            .reduce(0) { $0 + max(0, $1.totalPages - $1.recitedPages) }
    }
}

#if canImport(ActivityKit)
/// Attributs de l'activité en direct (écran verrouillé + Dynamic Island).
@available(iOS 16.2, *)
public struct RecitationActivityAttributes: ActivityAttributes {
    /// L'activité couvre TOUTE la journée : trois phases.
    /// 'active'   — créneau en cours (décompte vers sa fin) ;
    /// 'overdue'  — pages en retard hors créneau (décompte vers la prochaine) ;
    /// 'upcoming' — rien de dû, prochaine séance (décompte vers son début).
    public struct ContentState: Codable, Hashable {
        public var phase: String
        public var dueCount: Int
        public var recitedPages: Int
        public var totalPages: Int
        public var pagesLabel: String
        /// Époque de référence du décompte (fin du créneau ou début du prochain).
        public var refEpoch: Int
        public var slotLabel: String
        public var startVerse: String

        public var refDate: Date { Date(timeIntervalSince1970: TimeInterval(refEpoch)) }
        public var isActive: Bool { phase == "active" }
        public var isOverdue: Bool { phase == "overdue" }
    }
    public init() {}
}
#endif
