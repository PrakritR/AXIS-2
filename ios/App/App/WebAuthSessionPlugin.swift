import AuthenticationServices
import Capacitor
import UIKit

/// ASWebAuthenticationSession wrapper for OAuth — intercepts custom-scheme callbacks
/// that SFSafariViewController (@capacitor/browser) cannot handle on iOS.
@objc(WebAuthSessionPlugin)
public class WebAuthSessionPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WebAuthSessionPlugin"
    public let jsName = "WebAuthSession"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "authenticate", returnType: CAPPluginReturnPromise),
    ]

    private var session: ASWebAuthenticationSession?
    private var presentationContext: WebAuthPresentationContext?

    @objc func authenticate(_ call: CAPPluginCall) {
        guard let urlString = call.getString("url"),
              let url = URL(string: urlString),
              let scheme = call.getString("callbackScheme") else {
            call.reject("url and callbackScheme are required")
            return
        }

        DispatchQueue.main.async {
            guard let anchor = self.presentationAnchorWindow() else {
                call.reject("No app window is available to present sign-in", "NO_ANCHOR")
                return
            }
            let context = WebAuthPresentationContext(anchor: anchor)
            self.presentationContext = context

            let session = ASWebAuthenticationSession(url: url, callbackURLScheme: scheme) { callbackURL, error in
                self.session = nil
                self.presentationContext = nil

                if let authError = error as? ASWebAuthenticationSessionError,
                   authError.code == .canceledLogin {
                    call.reject("User canceled", "CANCELED")
                    return
                }

                if let error {
                    call.reject(error.localizedDescription)
                    return
                }

                guard let callbackURL else {
                    call.reject("No callback URL returned")
                    return
                }

                call.resolve(["url": callbackURL.absoluteString])
            }

            session.presentationContextProvider = context
            session.prefersEphemeralWebBrowserSession = false
            self.session = session

            if !session.start() {
                self.session = nil
                self.presentationContext = nil
                call.reject("Failed to start authentication session")
            }
        }
    }

    /// The window the auth sheet is anchored to.
    ///
    /// Ask the Capacitor bridge for its own view controller's window first. Scanning
    /// `UIApplication.shared.connectedScenes` is a guess, and it is wrong on "iPhone and iPad
    /// Apps on Mac": that runtime gives the process an extra `NSMenuBarScene` alongside the
    /// real app scene, so "the first scene with a key window" can resolve to something that is
    /// not the app's window. The scene scan stays only as a fallback, and a detached
    /// `ASPresentationAnchor()` is never returned — a session anchored to a window with no
    /// scene silently fails to present, which is indistinguishable from the button doing
    /// nothing. Rejecting instead lets the web layer show the user why.
    private func presentationAnchorWindow() -> UIWindow? {
        if let window = bridge?.viewController?.view.window {
            return window
        }
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        let active = scenes.filter { $0.activationState == .foregroundActive }
        for scene in active + scenes {
            if let window = scene.windows.first(where: { $0.isKeyWindow }) {
                return window
            }
        }
        return (active + scenes).flatMap(\.windows).first
    }
}

private final class WebAuthPresentationContext: NSObject, ASWebAuthenticationPresentationContextProviding {
    private let anchor: UIWindow

    init(anchor: UIWindow) {
        self.anchor = anchor
        super.init()
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        return anchor
    }
}
