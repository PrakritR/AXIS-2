import { registerPlugin } from "@capacitor/core";

export type WebAuthSessionAuthenticateOptions = {
  url: string;
  callbackScheme: string;
};

export type WebAuthSessionAuthenticateResult = {
  url: string;
};

export interface WebAuthSessionPlugin {
  authenticate(options: WebAuthSessionAuthenticateOptions): Promise<WebAuthSessionAuthenticateResult>;
}

export const WebAuthSession = registerPlugin<WebAuthSessionPlugin>("WebAuthSession", {
  web: () =>
    import("@/lib/native/web-auth-session.web").then((module) => new module.WebAuthSessionWeb()),
});
