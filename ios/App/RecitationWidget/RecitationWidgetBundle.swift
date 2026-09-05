//
//  RecitationWidgetBundle.swift
//  Extension RecitationWidget — widget d'accueil + activité en direct.
//

import WidgetKit
import SwiftUI

@main
struct RecitationWidgetBundle: WidgetBundle {
    var body: some Widget {
        RecitationWidget()
        if #available(iOS 16.2, *) {
            RecitationLiveActivity()
        }
    }
}
