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
    /// Plugins locaux (non distribués en package) : enregistrés à la main.
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(RecitationBridge())
    }

    /// iPad : verrou PAYSAGE (voir note ci-dessus). iPhone : portrait naturel —
    /// la récitation (programme, widget, activité en direct) se vit en portrait.
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask {
        if UIDevice.current.userInterfaceIdiom == .pad {
            return .landscape
        }
        return [.portrait, .landscapeLeft, .landscapeRight]
    }

    override var shouldAutorotate: Bool {
        return true
    }

    // iPadOS 26 : régression Apple — quand le verrou de rotation est OFF, le
    // système laisse passer le portrait malgré la déclaration paysage. On force
    // activement le retour en paysage à chaque apparition / changement.
    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        if UIDevice.current.userInterfaceIdiom == .pad { forceLandscape() }
    }

    override func viewWillTransition(
        to size: CGSize, with coordinator: UIViewControllerTransitionCoordinator
    ) {
        super.viewWillTransition(to: size, with: coordinator)
        if UIDevice.current.userInterfaceIdiom == .pad, size.height > size.width {
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
