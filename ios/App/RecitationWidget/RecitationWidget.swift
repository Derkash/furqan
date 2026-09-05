//
//  RecitationWidget.swift
//  Widget d'écran d'accueil (brief §12, maquette 2) : créneau, pages prévues,
//  progression, temps restant. Le compte à rebours est rendu par
//  Text(timerInterval:) / ProgressView(timerInterval:) — il défile TOUT SEUL,
//  sans recharge de timeline. La timeline ne contient que deux entrées : l'état
//  courant et la bascule à la fin du créneau.
//

import WidgetKit
import SwiftUI

// Palette de l'app (fond clair, vert profond, touches dorées).
private let greenDeep = Color(red: 0.10, green: 0.26, blue: 0.20)
private let gold = Color(red: 0.77, green: 0.63, blue: 0.35)
private let goldLight = Color(red: 0.97, green: 0.94, blue: 0.88)

struct RecitationEntry: TimelineEntry {
    let date: Date
    let state: SharedRecitationState?
}

struct RecitationProvider: TimelineProvider {
    func placeholder(in context: Context) -> RecitationEntry {
        RecitationEntry(date: .now, state: .placeholder)
    }

    func getSnapshot(in context: Context, completion: @escaping (RecitationEntry) -> Void) {
        completion(RecitationEntry(date: .now, state: SharedRecitationState.load() ?? .placeholder))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<RecitationEntry>) -> Void) {
        let state = SharedRecitationState.load()
        var entries = [RecitationEntry(date: .now, state: state)]
        // À la fin du créneau, le widget bascule tout seul sur un état neutre ;
        // la prochaine synchronisation de l'app fournira le créneau suivant.
        if let state, state.isActive, state.slotEndDate > .now {
            entries.append(RecitationEntry(date: state.slotEndDate, state: nil))
        }
        completion(Timeline(entries: entries, policy: .never))
    }
}

extension SharedRecitationState {
    static let placeholder = SharedRecitationState(
        phase: "active", date: "", slotStartMin: 1080, slotEndMin: 1140,
        slotEndEpoch: Int(Date.now.addingTimeInterval(37 * 60).timeIntervalSince1970),
        totalPages: 4, recitedPages: 2, firstPage: 3, lastPage: 6,
        pagesLabel: "Pages 3 à 6", slotLabel: "18 h – 19 h"
    )
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
            if let state = entry.state, state.isActive {
                if family == .systemSmall { small(state) } else { medium(state) }
            } else if let state = entry.state, state.phase == "upcoming" {
                upcoming(state)
            } else {
                idle
            }
        }
        .containerBackground(for: .widget) { greenDeep }
        .widgetURL(URL(string: "almuraja3a://recitation/en-cours"))
    }

    // ---- Créneau actif (maquette 2) ----

    private func medium(_ state: SharedRecitationState) -> some View {
        HStack(spacing: 14) {
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 7) {
                    Image(systemName: "book.fill").foregroundStyle(gold).font(.system(size: 15))
                    Text("Récitation en cours")
                        .font(.system(size: 15, weight: .bold))
                        .foregroundStyle(.white)
                    Spacer(minLength: 0)
                    Text(state.slotLabel)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(gold)
                }
                Spacer(minLength: 0)
                Text("\(state.recitedPages) / \(state.totalPages) pages")
                    .font(.system(size: 30, weight: .heavy))
                    .foregroundStyle(.white)
                Text("récitées")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(.white.opacity(0.75))
                PageSegments(total: state.totalPages, done: state.recitedPages)
                    .padding(.top, 3)
                Text(state.remainingLabel)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.85))
                    .lineLimit(1)
            }
            gauge(state)
        }
        .padding(2)
    }

    private func small(_ state: SharedRecitationState) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack(spacing: 6) {
                Image(systemName: "book.fill").foregroundStyle(gold).font(.system(size: 13))
                Text(state.slotLabel)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(gold)
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
            Text("\(state.recitedPages) / \(state.totalPages)")
                .font(.system(size: 28, weight: .heavy))
                .foregroundStyle(.white)
            Text("pages récitées")
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(.white.opacity(0.75))
            PageSegments(total: state.totalPages, done: state.recitedPages)
            Text(timerInterval: Date.now...state.slotEndDate, countsDown: true)
                .font(.system(size: 13, weight: .bold).monospacedDigit())
                .foregroundStyle(gold)
        }
    }

    /// Jauge circulaire : ProgressView(timerInterval:) défile sans recharge.
    private func gauge(_ state: SharedRecitationState) -> some View {
        ZStack {
            ProgressView(
                timerInterval: Date.now...state.slotEndDate,
                countsDown: true,
                label: { EmptyView() },
                currentValueLabel: { EmptyView() }
            )
            .progressViewStyle(.circular)
            .tint(gold)
            .scaleEffect(2.4)
            VStack(spacing: 0) {
                Text(timerInterval: Date.now...state.slotEndDate, countsDown: true)
                    .font(.system(size: 15, weight: .heavy).monospacedDigit())
                    .foregroundStyle(.white)
                    .multilineTextAlignment(.center)
                    .frame(width: 64)
                Text("restantes")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(.white.opacity(0.75))
            }
        }
        .frame(width: 92, height: 92)
    }

    // ---- Prochaine session / repos ----

    private func upcoming(_ state: SharedRecitationState) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack(spacing: 7) {
                Image(systemName: "book.fill").foregroundStyle(gold).font(.system(size: 14))
                Text("Prochaine récitation")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(.white)
            }
            Spacer(minLength: 0)
            Text(state.slotLabel)
                .font(.system(size: 24, weight: .heavy))
                .foregroundStyle(gold)
            Text(state.pagesLabel)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(.white.opacity(0.8))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var idle: some View {
        VStack(spacing: 6) {
            Image(systemName: "book.closed.fill").foregroundStyle(gold).font(.system(size: 22))
            Text("Al Muraja3a")
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(.white)
            Text("Aucune session en cours")
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
        .description("Suivez votre créneau de récitation : pages récitées et temps restant.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
