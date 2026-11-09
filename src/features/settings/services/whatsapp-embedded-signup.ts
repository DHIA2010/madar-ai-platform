// Meta's Embedded Signup, run in the browser: Facebook's JS SDK opens Meta's own window, where the
// merchant logs in to Facebook, picks (or creates) their business and WhatsApp account, adds and
// verifies their number. Meta then hands the page two things -- a code (FB.login's response) and
// the account and number picked (a "WA_EMBEDDED_SIGNUP" postMessage) -- which the backend turns
// into the connection (whatsapp/merchant-connection.ts).
// https://developers.facebook.com/docs/whatsapp/embedded-signup

interface FacebookSdk {
  init(options: { appId: string; version: string; xfbml?: boolean; cookie?: boolean }): void
  login(
    callback: (response: { authResponse?: { code?: string } | null; status?: string }) => void,
    options: Record<string, unknown>
  ): void
}

declare global {
  interface Window {
    FB?: FacebookSdk
    fbAsyncInit?: () => void
  }
}

const SDK_URL = "https://connect.facebook.net/en_US/sdk.js"
let sdkPromise: Promise<FacebookSdk> | null = null

function loadSdk(appId: string, version: string): Promise<FacebookSdk> {
  if (sdkPromise) return sdkPromise
  sdkPromise = new Promise<FacebookSdk>((resolve, reject) => {
    const ready = () => {
      if (!window.FB) return reject(new Error("FACEBOOK_SDK_UNAVAILABLE"))
      window.FB.init({ appId, version, xfbml: false, cookie: true })
      resolve(window.FB)
    }
    if (window.FB) return ready()
    window.fbAsyncInit = ready
    const script = document.createElement("script")
    script.src = SDK_URL
    script.async = true
    script.defer = true
    script.crossOrigin = "anonymous"
    script.onerror = () => {
      sdkPromise = null
      reject(new Error("FACEBOOK_SDK_UNAVAILABLE"))
    }
    document.body.appendChild(script)
  })
  return sdkPromise
}

export type EmbeddedSignupResult =
  | { kind: "finished"; code: string; wabaId: string; phoneNumberId: string }
  // The merchant closed Meta's window; `step` is where they stopped, when Meta says.
  | { kind: "cancelled"; step: string | null }
  | { kind: "error"; message: string | null }

const isFacebookOrigin = (origin: string) => {
  try {
    return new URL(origin).hostname.endsWith("facebook.com")
  } catch {
    return false
  }
}

export async function runEmbeddedSignup(config: {
  appId: string
  configId: string
  apiVersion: string
}): Promise<EmbeddedSignupResult> {
  const sdk = await loadSdk(config.appId, config.apiVersion)

  return new Promise<EmbeddedSignupResult>((resolve) => {
    let code: string | null = null
    let picked: { wabaId: string; phoneNumberId: string } | null = null
    let settled = false
    const settle = (result: EmbeddedSignupResult) => {
      if (settled) return
      settled = true
      window.removeEventListener("message", onMessage)
      resolve(result)
    }
    const finishIfReady = () => {
      if (code && picked) settle({ kind: "finished", code, ...picked })
    }

    function onMessage(event: MessageEvent) {
      if (!isFacebookOrigin(event.origin)) return
      let data: { type?: string; event?: string; data?: Record<string, string> }
      try {
        data = typeof event.data === "string" ? JSON.parse(event.data) : event.data
      } catch {
        return
      }
      if (data?.type !== "WA_EMBEDDED_SIGNUP") return
      if (data.event === "FINISH" || data.event === "FINISH_ONLY_WABA") {
        const wabaId = data.data?.waba_id
        const phoneNumberId = data.data?.phone_number_id
        if (wabaId && phoneNumberId) {
          picked = { wabaId, phoneNumberId }
          finishIfReady()
        }
      } else if (data.event === "CANCEL") {
        settle({ kind: "cancelled", step: data.data?.current_step ?? null })
      } else if (data.event === "ERROR") {
        settle({ kind: "error", message: data.data?.error_message ?? null })
      }
    }
    window.addEventListener("message", onMessage)

    sdk.login(
      (response) => {
        const returned = response.authResponse?.code
        if (!returned) {
          // Closed without finishing -- unless the account/number message is still on its way.
          setTimeout(() => settle({ kind: "cancelled", step: null }), 1500)
          return
        }
        code = returned
        finishIfReady()
        // The postMessage normally arrives first; give it a moment if it hasn't.
        setTimeout(() => {
          if (!picked) settle({ kind: "error", message: null })
        }, 5000)
      },
      {
        config_id: config.configId,
        response_type: "code",
        override_default_response_type: true,
        extras: { setup: {}, featureType: "", sessionInfoVersion: "3" },
      }
    )
  })
}
