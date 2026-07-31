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
            let context = WebAuthPresentationContext()
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
}

private final class WebAuthPresentationContext: NSObject, ASWebAuthenticationPresentationContextProviding {
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        for scene in scenes {
            if let window = scene.windows.first(where: { $0.isKeyWindow }) {
                return window
            }
        }
        return scenes.flatMap(\.windows).first ?? ASPresentationAnchor()
    }
}
