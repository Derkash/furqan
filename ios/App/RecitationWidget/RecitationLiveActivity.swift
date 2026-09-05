//
//  RecitationLiveActivity.swift
//  Activité en direct (brief §13, maquette 3) : suivi de la session sur
//  l'écran verrouillé et la Dynamic Island, dans l'esprit d'un suivi
//  d'exercice. Mise à jour par RecitationBridge à chaque page validée ;
//  disparaît à la fin de la session.
//

import ActivityKit
import WidgetKit
import SwiftUI

private let gold = Color(red: 0.77, green: 0.63, blue: 0.35)
private let greenDeep = Color(red: 0.10, green: 0.26, blue: 0.20)

@available(iOS 16.2, *)
struct RecitationLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: RecitationActivityAttributes.self) { context in
            // ---- Écran verrouillé (maquette 3) ----
            LockScreenView(context: context)
                .activityBackgroundTint(Color.black.opacity(0.55))
                .activitySystemActionForegroundColor(gold)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    HStack(spacing: 8) {
                        BookBadge()
                        VStack(alignment: .leading, spacing: 1) {
                            Text("Al Muraja3a")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundStyle(.white.opacity(0.8))
                            Text("\(context.state.recitedPages) / \(context.state.totalPages) pages")
                                .font(.system(size: 16, weight: .heavy))
                                .foregroundStyle(.white)
                        }
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Countdown(end: context.state.endDate)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Segments(total: context.state.totalPages, done: context.state.recitedPages)
                        .padding(.top, 4)
                }
            } compactLeading: {
                Image(systemName: "book.fill").foregroundStyle(gold)
            } compactTrailing: {
                Text(timerInterval: Date.now...context.state.endDate, countsDown: true)
                    .font(.system(size: 13, weight: .bold).monospacedDigit())
                    .foregroundStyle(gold)
                    .frame(maxWidth: 52)
                    .multilineTextAlignment(.trailing)
            } minimal: {
                Image(systemName: "book.fill").foregroundStyle(gold)
            }
            .widgetURL(URL(string: "almuraja3a://recitation/en-cours"))
        }
    }
}

@available(iOS 16.2, *)
private extension RecitationActivityAttributes.ContentState {
    var endDate: Date { Date(timeIntervalSince1970: TimeInterval(slotEndEpoch)) }
}

private struct BookBadge: View {
    var body: some View {
        ZStack {
            Circle().fill(greenDeep)
            Image(systemName: "book.fill").foregroundStyle(gold).font(.system(size: 15))
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

private struct Countdown: View {
    let end: Date
    var body: some View {
        VStack(alignment: .trailing, spacing: 0) {
            Text(timerInterval: Date.now...end, countsDown: true)
                .font(.system(size: 26, weight: .heavy).monospacedDigit())
                .foregroundStyle(gold)
                .frame(maxWidth: 86)
                .multilineTextAlignment(.trailing)
            Text("restantes")
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(.white.opacity(0.75))
        }
    }
}

@available(iOS 16.2, *)
private struct LockScreenView: View {
    let context: ActivityViewContext<RecitationActivityAttributes>

    var body: some View {
        HStack(spacing: 12) {
            BookBadge()
            VStack(alignment: .leading, spacing: 3) {
                Text("Al Muraja3a")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.8))
                Text("\(context.state.recitedPages) / \(context.state.totalPages) pages")
                    .font(.system(size: 17, weight: .heavy))
                    .foregroundStyle(.white)
                Segments(total: context.state.totalPages, done: context.state.recitedPages)
                    .frame(maxWidth: 150)
            }
            Spacer(minLength: 8)
            Countdown(end: context.state.endDate)
        }
        .padding(14)
    }
}
