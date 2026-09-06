//
//  RecitationWidget.swift
//  Widget d'écran d'accueil (brief §12) : créneau, pages prévues, repères du
//  passage, progression et temps restant.
//
//  Deux principes tiennent tout l'affichage :
//   • Le widget reçoit TOUTES les sessions à venir et choisit lui-même celle
//     qui correspond à l'instant de rendu — il change donc de créneau sans
//     que l'app soit ouverte. La timeline pose une entrée à chaque bascule.
//   • Le temps restant est un anneau DESSINÉ (Circle().trim) recalculé à
//     chaque entrée + un Text(timerInterval:) vivant : rien à rafraîchir.
//

import WidgetKit
import SwiftUI

// Palette de l'app (fond clair, vert profond, touches dorées).
private let greenDeep = Color(red: 0.10, green: 0.26, blue: 0.20)
private let gold = Color(red: 0.77, green: 0.63, blue: 0.35)

struct RecitationEntry: TimelineEntry {
    let date: Date
    /// Session en cours à `date` (nil hors créneau).
    let active: RecitationSession?
    /// Prochaine session après `date`.
    let next: RecitationSession?
}

struct RecitationProvider: TimelineProvider {
    func placeholder(in context: Context) -> RecitationEntry {
        RecitationEntry(date: .now, active: .placeholder, next: nil)
    }

    func getSnapshot(in context: Context, completion: @escaping (RecitationEntry) -> Void) {
        completion(entry(at: .now, from: SharedRecitationState.load()))
    }

    private func entry(at date: Date, from state: SharedRecitationState?) -> RecitationEntry {
        RecitationEntry(
            date: date,
            active: state?.session(at: date),
            next: state?.nextSession(after: date)
        )
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<RecitationEntry>) -> Void) {
        let state = SharedRecitationState.load()
        let now = Date.now
        var dates: Set<Date> = [now]

        // Minute par minute pendant les 2 prochaines heures : l'anneau de temps
        // reste exact. Les entrées d'UNE MÊME timeline sont rendues par le
        // système sans nouvelle requête — elles ne coûtent aucun rechargement.
        var t = now
        for _ in 0..<120 {
            t = t.addingTimeInterval(60)
            dates.insert(t)
        }
        // Puis chaque bascule de session (début / fin), pour les jours suivants.
        if let state {
            for boundary in state.boundaries where boundary > now {
                dates.insert(boundary)
                dates.insert(boundary.addingTimeInterval(1))
            }
        }

        let entries = dates.sorted().prefix(400).map { entry(at: $0, from: state) }
        // Rechargement de sûreté dans 2 h : ramène les pages récitées et
        // prolonge l'horizon si l'app n'a pas été ouverte entre-temps.
        completion(Timeline(entries: Array(entries), policy: .after(now.addingTimeInterval(2 * 3600))))
    }
}

extension RecitationSession {
    static let placeholder = RecitationSession(
        startEpoch: Int(Date.now.addingTimeInterval(-23 * 60).timeIntervalSince1970),
        endEpoch: Int(Date.now.addingTimeInterval(37 * 60).timeIntervalSince1970),
        slotLabel: "18 h – 19 h", dayLabel: "", pagesLabel: "02/pages 2 à 5",
        kind: "cycle", title: "Récitation en cours",
        firstPageLabel: "02/page 2", lastPageLabel: "02/page 5",
        firstPage: 3, lastPage: 6, totalPages: 4, recitedPages: 2,
        startVerse: "إِنَّ ٱلَّذِينَ كَفَرُوا۟ سَوَآءٌ عَلَيْهِمْ ءَأَنذَرْتَهُمْ أَمْ لَمْ تُنذِرْهُمْ …",
        endVerse: "هُوَ ٱلَّذِى خَلَقَ لَكُم مَّا فِى ٱلْأَرْضِ جَمِيعًا …"
    )
}

/// Un repère du passage : étiquette + verset arabe.
/// Texte Unicode othmanien (les polices QCF de la WebView, une par page et en
/// woff2, ne sont pas utilisables dans une extension) — tronqué par lineLimit.
struct VerseBlock: View {
    let label: String
    let text: String
    let lines: Int
    let size: CGFloat

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.system(size: 9, weight: .heavy))
                .foregroundStyle(gold)
            Text(text)
                .font(.system(size: size))
                .foregroundStyle(.white.opacity(0.92))
                .lineLimit(lines)
                .multilineTextAlignment(.trailing)
                .minimumScaleFactor(0.7)
                .environment(\.layoutDirection, .rightToLeft)
                .frame(maxWidth: .infinity, alignment: .trailing)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

/// Barre de progression segmentée (une barrette par page, or = récitée).
struct PageSegments: View {
    let total: Int
    let done: Int
    var body: some View {
        HStack(spacing: 5) {
            ForEach(0..<max(total, 1), id: \.self) { i in
                Capsule()
                    .fill(i < done ? gold : Color.white.opacity(0.22))
                    .frame(height: 6)
            }
        }
    }
}

struct RecitationWidgetView: View {
    var entry: RecitationEntry
    @Environment(\.widgetFamily) private var family

    var body: some View {
        Group {
            if let s = entry.active, !s.isComplete {
                switch family {
                case .systemSmall: small(s)
                case .systemLarge: large(s)
                default: medium(s)
                }
            } else if let n = entry.next {
                // Créneau accompli (ou hors créneau) : la progression n'apprend
                // plus rien — on annonce la prochaine récitation.
                upcoming(n, done: entry.active?.isComplete ?? false)
            } else {
                idle
            }
        }
        .containerBackground(for: .widget) { greenDeep }
        .widgetURL(URL(string: "almuraja3a://recitation/en-cours"))
    }

    // ---- Créneau en cours ----

    private func header(_ s: RecitationSession, size: CGFloat) -> some View {
        HStack(spacing: 6) {
            Image(systemName: s.isLearning ? "sparkles" : "book.fill")
                .foregroundStyle(gold)
                .font(.system(size: size - 1))
            Text(s.title)
                .font(.system(size: size, weight: .bold))
                .foregroundStyle(.white)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            Spacer(minLength: 4)
            Text(s.slotLabel)
                .font(.system(size: size - 2, weight: .semibold))
                .foregroundStyle(gold)
                .lineLimit(1)
                .fixedSize()
        }
    }

    private func medium(_ s: RecitationSession) -> some View {
        HStack(spacing: 14) {
            VStack(alignment: .leading, spacing: 3) {
                header(s, size: 14)
                Spacer(minLength: 0)
                Text("\(s.recitedPages) / \(s.totalPages) pages")
                    .font(.system(size: 28, weight: .heavy))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                Text(s.pagesLabel)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(.white.opacity(0.75))
                    .lineLimit(1)
                PageSegments(total: s.totalPages, done: s.recitedPages)
                    .padding(.top, 2)
                if !s.startVerse.isEmpty {
                    VerseBlock(label: "DÉBUT", text: s.startVerse, lines: 1, size: 14)
                }
                Text(s.remainingLabel)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.85))
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            gauge(s)
        }
        .padding(2)
    }

    private func small(_ s: RecitationSession) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack(spacing: 6) {
                Image(systemName: "book.fill").foregroundStyle(gold).font(.system(size: 13))
                Text(s.slotLabel)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(gold)
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
            Text("\(s.recitedPages) / \(s.totalPages)")
                .font(.system(size: 28, weight: .heavy))
                .foregroundStyle(.white)
            Text("pages récitées")
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(.white.opacity(0.75))
            PageSegments(total: s.totalPages, done: s.recitedPages)
            Text(timerInterval: entry.date...s.endDate, countsDown: true)
                .font(.system(size: 13, weight: .bold).monospacedDigit())
                .foregroundStyle(gold)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
    }

    /// Grand format : l'espace disponible va aux DEUX repères du passage,
    /// deux lignes chacun (le reste est tronqué par le système).
    private func large(_ s: RecitationSession) -> some View {
        VStack(alignment: .leading, spacing: 9) {
            header(s, size: 16)
            HStack(alignment: .center, spacing: 14) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(s.recitedPages) / \(s.totalPages) pages")
                        .font(.system(size: 32, weight: .heavy))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                    Text(s.pagesLabel)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(.white.opacity(0.78))
                        .lineLimit(1)
                }
                Spacer(minLength: 0)
                gauge(s)
            }
            PageSegments(total: s.totalPages, done: s.recitedPages)
            if !s.startVerse.isEmpty {
                VerseBlock(label: "DÉBUT · \(s.firstPageLabel)", text: s.startVerse, lines: 2, size: 17)
            }
            if !s.endVerse.isEmpty {
                Divider().overlay(Color.white.opacity(0.15))
                VerseBlock(label: "FIN · \(s.lastPageLabel)", text: s.endVerse, lines: 2, size: 17)
            }
            Spacer(minLength: 0)
            Text(s.remainingLabel)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(.white.opacity(0.85))
                .lineLimit(1)
        }
    }

    /// Anneau de temps restant, DESSINÉ : entièrement contenu dans son cadre.
    /// La fraction est calculée pour l'instant de l'entrée — exacte à la
    /// minute — et le décompte central reste vivant à la seconde.
    private func gauge(_ s: RecitationSession) -> some View {
        let total = max(1, TimeInterval(s.endEpoch - s.startEpoch))
        let left = max(0, s.endDate.timeIntervalSince(entry.date))
        let fraction = min(1, max(0, left / total))

        return ZStack {
            Circle().stroke(Color.white.opacity(0.18), lineWidth: 8)
            Circle()
                .trim(from: 0, to: fraction)
                .stroke(gold, style: StrokeStyle(lineWidth: 8, lineCap: .round))
                .rotationEffect(.degrees(-90))
            VStack(spacing: 0) {
                Text(timerInterval: entry.date...s.endDate, countsDown: true)
                    .font(.system(size: 16, weight: .heavy).monospacedDigit())
                    .foregroundStyle(.white)
                    .multilineTextAlignment(.center)
                    .minimumScaleFactor(0.7)
                    .lineLimit(1)
                Text("restantes")
                    .font(.system(size: 9, weight: .medium))
                    .foregroundStyle(.white.opacity(0.75))
            }
            .padding(.horizontal, 6)
        }
        .frame(width: 84, height: 84)
    }

    // ---- Prochaine session (créneau accompli ou hors créneau) ----

    private func upcoming(_ n: RecitationSession, done: Bool) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 7) {
                Image(systemName: done ? "checkmark.seal.fill" : "book.fill")
                    .foregroundStyle(gold)
                    .font(.system(size: 14))
                Text(done ? "Séance terminée" : (n.isLearning ? "Prochaine : sourate en cours" : "Prochaine récitation"))
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            Spacer(minLength: 0)
            Text("Prochaine \(n.whenLabel)")
                .font(.system(size: family == .systemSmall ? 18 : 23, weight: .heavy))
                .foregroundStyle(.white)
                .lineLimit(2)
                .minimumScaleFactor(0.6)
            Text(n.pagesLabel)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(gold)
                .lineLimit(1)
            if family == .systemLarge {
                if !n.startVerse.isEmpty {
                    VerseBlock(label: "DÉBUT · \(n.firstPageLabel)", text: n.startVerse, lines: 2, size: 17)
                        .padding(.top, 4)
                }
                if !n.endVerse.isEmpty {
                    Divider().overlay(Color.white.opacity(0.15))
                    VerseBlock(label: "FIN · \(n.lastPageLabel)", text: n.endVerse, lines: 2, size: 17)
                }
                Spacer(minLength: 0)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var idle: some View {
        VStack(spacing: 6) {
            Image(systemName: "book.closed.fill").foregroundStyle(gold).font(.system(size: 22))
            Text("Al Muraja3a")
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(.white)
            Text("Aucune session prévue")
                .font(.system(size: 11))
                .foregroundStyle(.white.opacity(0.7))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

struct RecitationWidget: Widget {
    let kind = "RecitationWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: RecitationProvider()) { entry in
            RecitationWidgetView(entry: entry)
        }
        .configurationDisplayName("Récitation")
        .description("Suivez votre créneau de récitation : pages, passage et temps restant.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}
