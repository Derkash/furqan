import UIKit
import Capacitor

/// Contrôleur racine de l'app = pont Capacitor + verrouillage PAYSAGE.
///
/// L'app utilise un SceneDelegate : dans ce cas iOS ignore
/// `application(_:supportedInterfaceOrientationsFor:)` de l'AppDelegate et se
/// fie aux orientations supportées par le view controller RACINE. On les force
/// donc ici en paysage (la clé Info.plist UIRequiresFullScreen étant dépréciée
/// et ignorée sur iPadOS 26).
class MainViewController: CAPBridgeViewController {
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask {
        return .landscape
    }

    override var shouldAutorotate: Bool {
        return true
    }
}
