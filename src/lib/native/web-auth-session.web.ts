import type {
  WebAuthSessionAuthenticateOptions,
  WebAuthSessionAuthenticateResult,
  WebAuthSessionPlugin,
} from "@/lib/native/web-auth-session";

export class WebAuthSessionWeb implements WebAuthSessionPlugin {
  async authenticate(_options: WebAuthSessionAuthenticateOptions): Promise<WebAuthSessionAuthenticateResult> {
    throw new Error("WebAuthSession is only available on iOS");
  }
}
