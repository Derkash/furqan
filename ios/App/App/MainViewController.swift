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

    // iPadOS 26 : régression Apple — quand le verrou de rotation est OFF, le
    // système laisse passer le portrait malgré la déclaration paysage. On force
    // activement le retour en paysage à chaque apparition / changement.
    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        forceLandscape()
    }

    override func viewWillTransition(
        to size: CGSize, with coordinator: UIViewControllerTransitionCoordinator
    ) {
        super.viewWillTransition(to: size, with: coordinator)
        if size.height > size.width {
            DispatchQueue.main.async { [weak self] in self?.forceLandscape() }
        }
    }

    private func forceLandscape() {
        setNeedsUpdateOfSupportedInterfaceOrientations()
        if #available(iOS 16.0, *) {
            guard let scene = view.window?.windowScene else { return }
            scene.requestGeometryUpdate(
                .iOS(interfaceOrientations: .landscape)
            ) { _ in }
        }
    }
}
