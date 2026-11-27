import type { WhatsAppPlatformService } from "../whatsapp/platform-config"
import { decryptSecret, encryptSecret } from "../whatsapp/platform-config"
import type { MetaAppAccess } from "./publisher"

// Madar's Instagram is connected with Madar's own Meta app -- the one WhatsApp runs on (its id
// and secret are in Madar Admin's WhatsApp settings). The earlier ads-sign-in app was deleted on
// Meta's side, so it can't be used.
//
// The sign-in returns to INSTAGRAM_REDIRECT_URI, which must be listed in that app's
// "Valid OAuth Redirect URIs" (Facebook Login → Settings).

export const INSTAGRAM_REDIRECT_URI =
  process.env.INSTAGRAM_OAUTH_REDIRECT_URI?.trim() ||
  "https://api.madar.my/v1/public/instagram/oauth/callback"

type Json = Record<string, unknown>

async function tokenCall(url: URL): Promise<string> {
  const response = await fetch(url)
  const json = (await response.json().catch(() => ({}))) as Json
  if (!response.ok || typeof json.access_token !== "string") {
    const error = (json.error ?? {}) as Json
    throw new Error(String(error.message ?? "Meta refused the sign-in."))
  }
  return json.access_token
}

export async function whatsAppMetaApp(platform: WhatsAppPlatformService): Promise<MetaAppAccess> {
  const { appId, appSecret, apiVersion } = await platform.appCredentials()
  const graph = `https://graph.facebook.com/${apiVersion}`
  return {
    clientId: appId,
    redirectUri: INSTAGRAM_REDIRECT_URI,
    authorizationUrl: `https://www.facebook.com/${apiVersion}/dialog/oauth`,
    exchangeCode: async (code) => {
      const short = new URL(`${graph}/oauth/access_token`)
      short.searchParams.set("client_id", appId)
      short.searchParams.set("client_secret", appSecret)
      short.searchParams.set("redirect_uri", INSTAGRAM_REDIRECT_URI)
      short.searchParams.set("code", code)
      const shortToken = await tokenCall(short)
      // A long-lived sign-in makes page tokens that don't expire.
      const long = new URL(`${graph}/oauth/access_token`)
      long.searchParams.set("grant_type", "fb_exchange_token")
      long.searchParams.set("client_id", appId)
      long.searchParams.set("client_secret", appSecret)
      long.searchParams.set("fb_exchange_token", shortToken)
      return tokenCall(long)
    },
    seal: encryptSecret,
    open: decryptSecret,
  }
}
