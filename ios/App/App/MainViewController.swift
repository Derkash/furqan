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
        bridge?.registerPluginInstance(PencilBridge())
    }

    /// Orientation demandée par un écran précis (ex. l'exercice Écriture en
    /// PORTRAIT). nil = comportement par défaut ci-dessous.
    static var orientationOverride: UIInterfaceOrientationMask?

    /// Applique (ou retire) l'orientation imposée par un écran.
    func applyOrientationOverride(_ mask: UIInterfaceOrientationMask?) {
        MainViewController.orientationOverride = mask
        if #available(iOS 16.0, *) {
            setNeedsUpdateOfSupportedInterfaceOrientations()
            guard let scene = view.window?.windowScene else { return }
            let target = mask ?? (UIDevice.current.userInterfaceIdiom == .pad ? .landscape : .allButUpsideDown)
            scene.requestGeometryUpdate(.iOS(interfaceOrientations: target)) { _ in }
        }
    }

    /// iPad : verrou PAYSAGE (voir note ci-dessus). iPhone : portrait naturel —
    /// la récitation (programme, widget, activité en direct) se vit en portrait.
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask {
        if let o = MainViewController.orientationOverride { return o }
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
        if UIDevice.current.userInterfaceIdiom == .pad, MainViewController.orientationOverride == nil { forceLandscape() }
    }

    override func viewWillTransition(
        to size: CGSize, with coordinator: UIViewControllerTransitionCoordinator
    ) {
        super.viewWillTransition(to: size, with: coordinator)
        if UIDevice.current.userInterfaceIdiom == .pad, size.height > size.width,
           MainViewController.orientationOverride == nil {
            DispatchQueue.main.async { [weak self] in self?.forceLandscape() }
        }
    }

    private func forceLandscape() {
        if #available(iOS 16.0, *) {
            setNeedsUpdateOfSupportedInterfaceOrientations()
            guard let scene = view.window?.windowScene else { return }
            scene.requestGeometryUpdate(
                .iOS(interfaceOrientations: .landscape)
            ) { _ in }
        }
    }
}


// MARK: - Apple Pencil (double toucher, pression Pencil Pro) + orientation

/// Plugin local « PencilBridge » : relaie au JS les gestes du Pencil que le web
/// ne reçoit pas (double toucher, pression/squeeze du Pencil Pro) avec l'action
/// préférée choisie dans Réglages › Apple Pencil, et permet à un écran
/// d'imposer une orientation (l'exercice Écriture se fait en portrait).
@objc(PencilBridge)
public class PencilBridge: CAPPlugin, CAPBridgedPlugin, UIPencilInteractionDelegate {
    public let identifier = "PencilBridge"
    public let jsName = "PencilBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "enable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "disable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setOrientation", returnType: CAPPluginReturnPromise),
    ]

    private var interaction: UIPencilInteraction?

    private func actionName(_ a: UIPencilPreferredAction) -> String {
        switch a {
        case .ignore: return "ignore"
        case .switchEraser: return "switchEraser"
        case .switchPrevious: return "switchPrevious"
        case .showColorPalette: return "showColorPalette"
        default:
            if #available(iOS 16.0, *), a == .showInkAttributes { return "showInkAttributes" }
            return "showContextualPalette"
        }
    }

    @objc func enable(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let view = self.bridge?.webView else { call.resolve(); return }
            if self.interaction == nil {
                let i = UIPencilInteraction()
                i.delegate = self
                view.addInteraction(i)
                self.interaction = i
            }
            call.resolve(["tapAction": self.actionName(UIPencilInteraction.preferredTapAction)])
        }
    }

    @objc func disable(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if let i = self.interaction { self.bridge?.webView?.removeInteraction(i) }
            self.interaction = nil
            call.resolve()
        }
    }

    @objc func setOrientation(_ call: CAPPluginCall) {
        let mode = call.getString("mode") ?? "default"
        DispatchQueue.main.async {
            let vc = self.bridge?.viewController as? MainViewController
            vc?.applyOrientationOverride(mode == "portrait" ? .portrait : nil)
            call.resolve()
        }
    }

    // iOS 17.5+ : double toucher et pression, avec la position de survol.
    @available(iOS 17.5, *)
    public func pencilInteraction(_ interaction: UIPencilInteraction, didReceiveTap tap: UIPencilInteraction.Tap) {
        var data: [String: Any] = ["action": actionName(UIPencilInteraction.preferredTapAction)]
        if let p = tap.hoverPose?.location { data["x"] = p.x; data["y"] = p.y }
        notifyListeners("tap", data: data)
    }

    @available(iOS 17.5, *)
    public func pencilInteraction(_ interaction: UIPencilInteraction, didReceiveSqueeze squeeze: UIPencilInteraction.Squeeze) {
        guard squeeze.phase == .ended else { return }
        var data: [String: Any] = ["action": actionName(UIPencilInteraction.preferredSqueezeAction)]
        if let p = squeeze.hoverPose?.location { data["x"] = p.x; data["y"] = p.y }
        notifyListeners("squeeze", data: data)
    }

    // Avant iOS 17.5 : double toucher seul.
    public func pencilInteractionDidTap(_ interaction: UIPencilInteraction) {
        notifyListeners("tap", data: ["action": actionName(UIPencilInteraction.preferredTapAction)])
    }
}
