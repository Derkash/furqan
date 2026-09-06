//
//  RecitationLiveActivity.swift
//  Activité en direct (brief §13) : présente sur l'écran verrouillé du matin
//  au soir tant qu'une récitation est due ou à venir — pas seulement pendant
//  un créneau. Trois phases : créneau en cours, retard, prochaine séance.
//  Mise à jour par RecitationBridge ; jamais floutée (.privacySensitive(false),
//  rien de confidentiel ici).
//

import ActivityKit
import WidgetKit
import SwiftUI

private let gold = Color(red: 0.77, green: 0.63, blue: 0.35)
private let greenDeep = Color(red: 0.10, green: 0.26, blue: 0.20)
private let rust = Color(red: 0.85, green: 0.45, blue: 0.25)

@available(iOS 16.2, *)
struct RecitationLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: RecitationActivityAttributes.self) { context in
            LockScreenView(state: context.state)
                .privacySensitive(false)
                .activityBackgroundTint(Color.black.opacity(0.55))
                .activitySystemActionForegroundColor(gold)
        } dynamicIsland: { context in
            let s = context.state
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    HStack(spacing: 8) {
                        BookBadge(overdue: s.isOverdue)
                        VStack(alignment: .leading, spacing: 1) {
                            Text("Al Muraja3a")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundStyle(.white.opacity(0.8))
                            Text(headline(s))
                                .font(.system(size: 16, weight: .heavy))
                                .foregroundStyle(.white)
                        }
                    }
                    .privacySensitive(false)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Countdown(state: s).privacySensitive(false)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    bottomLine(s).privacySensitive(false)
                }
            } compactLeading: {
                Image(systemName: s.isOverdue ? "exclamationmark.circle.fill" : "book.fill")
                    .foregroundStyle(s.isOverdue ? rust : gold)
                    .privacySensitive(false)
            } compactTrailing: {
                Text(timerInterval: Date.now...s.refDate, countsDown: true)
                    .font(.system(size: 13, weight: .bold).monospacedDigit())
                    .foregroundStyle(s.isOverdue ? rust : gold)
                    .frame(maxWidth: 52)
                    .multilineTextAlignment(.trailing)
                    .privacySensitive(false)
            } minimal: {
                Image(systemName: s.isOverdue ? "exclamationmark.circle.fill" : "book.fill")
                    .foregroundStyle(s.isOverdue ? rust : gold)
                    .privacySensitive(false)
            }
            .widgetURL(URL(string: "almuraja3a://recitation/en-cours"))
        }
    }
}

@available(iOS 16.2, *)
private func headline(_ s: RecitationActivityAttributes.ContentState) -> String {
    switch s.phase {
    case "active": return "\(s.recitedPages) / \(s.totalPages) pages"
    case "overdue": return "\(s.dueCount) page\(s.dueCount > 1 ? "s" : "") en retard"
    default: return "Prochaine récitation"
    }
}

@available(iOS 16.2, *)
@ViewBuilder
private func bottomLine(_ s: RecitationActivityAttributes.ContentState) -> some View {
    if s.isActive {
        Segments(total: s.totalPages, done: s.recitedPages).padding(.top, 4)
    } else {
        Text(s.pagesLabel)
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(.white.opacity(0.8))
            .lineLimit(1)
    }
}

private struct BookBadge: View {
    var overdue = false
    var body: some View {
        ZStack {
            Circle().fill(greenDeep)
            Image(systemName: overdue ? "exclamationmark.circle.fill" : "book.fill")
                .foregroundStyle(overdue ? rust : gold)
                .font(.system(size: 15))
        }
        .frame(width: 34, height: 34)
    }
}

private struct Segments: View {
    let total: Int
    let done: Int
    var body: some View {
        HStack(spacing: 5) {
            ForEach(0..<max(total, 1), id: \.self) { i in
                Capsule()
                    .fill(i < done ? gold : Color.white.opacity(0.25))
                    .frame(height: 5)
            }
        }
    }
}

@available(iOS 16.2, *)
private struct Countdown: View {
    let state: RecitationActivityAttributes.ContentState
    var body: some View {
        VStack(alignment: .trailing, spacing: 0) {
            Text(timerInterval: Date.now...state.refDate, countsDown: true)
                .font(.system(size: 26, weight: .heavy).monospacedDigit())
                .foregroundStyle(state.isOverdue ? rust : gold)
                .frame(maxWidth: 86)
                .multilineTextAlignment(.trailing)
            Text(state.isActive ? "restantes" : state.isOverdue ? "avant la suite" : "avant le début")
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(.white.opacity(0.75))
        }
    }
}

@available(iOS 16.2, *)
private struct LockScreenView: View {
    let state: RecitationActivityAttributes.ContentState

    var body: some View {
        HStack(spacing: 12) {
            BookBadge(overdue: state.isOverdue)
            VStack(alignment: .leading, spacing: 3) {
                Text(state.isActive ? "Al Muraja3a · \(state.slotLabel)" : "Al Muraja3a")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.8))
                    .lineLimit(1)
                Text(headline(state))
                    .font(.system(size: 17, weight: .heavy))
                    .foregroundStyle(.white)
                if state.isActive {
                    Segments(total: state.totalPages, done: state.recitedPages)
                        .frame(maxWidth: 160)
                }
                if !state.startVerse.isEmpty {
                    Text(state.startVerse)
                        .font(.system(size: 13))
                        .foregroundStyle(.white.opacity(0.85))
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                        .environment(\.layoutDirection, .rightToLeft)
                        .frame(maxWidth: 170, alignment: .trailing)
                } else if !state.isActive {
                    Text(state.pagesLabel)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.75))
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 8)
            Countdown(state: state)
        }
        .padding(14)
    }
}
