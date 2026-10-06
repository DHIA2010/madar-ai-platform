// Pinned to a specific version rather than "latest" -- an unannounced widget upgrade changing
// Moyasar.init's behavior should never silently reach production between deploys.
const MOYASAR_WIDGET_VERSION = "1.14.0"
const MOYASAR_SCRIPT_URL = `https://cdn.moyasar.com/mpf/${MOYASAR_WIDGET_VERSION}/moyasar.js`
const MOYASAR_STYLESHEET_URL = `https://cdn.moyasar.com/mpf/${MOYASAR_WIDGET_VERSION}/moyasar.css`

// https://docs.moyasar.com/guides/references/form-configuration -- only the options this feature
// actually passes; the widget accepts several more (apple_pay, sender, recipient, etc.) this app
// doesn't use yet.
export interface MoyasarInitOptions {
  element: string | HTMLElement
  publishable_api_key: string
  amount: number
  currency: string
  description: string
  callback_url: string
  metadata?: Record<string, string>
  // Explicitly credit-card-only -- Apple Pay is enabled on the Moyasar dashboard account but its
  // domain verification (label/validation URL/country) isn't configured there yet, which made the
  // widget fail to render at all (it tried to mount Apple Pay first and errored out before ever
  // reaching the card form). Leaving this unset would otherwise default to every method the
  // dashboard has toggled on, Apple Pay included. The field is called "methods", not
  // "payment_methods" -- confirmed by testing against the real widget after the first guess
  // (payment_methods, going off a doc summary that turned out wrong) silently did nothing.
  methods?: Array<"creditcard" | "applepay" | "samsungpay" | "stcpay">
  on_failure?: (payment: { id: string; status: string }) => void
}

declare global {
  interface Window {
    Moyasar?: { init: (options: MoyasarInitOptions) => void }
  }
}

let loadPromise: Promise<void> | null = null

function loadStylesheetOnce() {
  if (document.querySelector(`link[href="${MOYASAR_STYLESHEET_URL}"]`)) {
    return
  }
  const link = document.createElement("link")
  link.rel = "stylesheet"
  link.href = MOYASAR_STYLESHEET_URL
  document.head.appendChild(link)
}

// Idempotent and safe to call from multiple mounts (e.g. the activation dialog re-opening) --
// resolves immediately once the script has already loaded once this session.
export function loadMoyasarWidget(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Moyasar widget can only load in the browser."))
  }
  if (window.Moyasar) {
    return Promise.resolve()
  }
  if (loadPromise) {
    return loadPromise
  }

  loadStylesheetOnce()
  loadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${MOYASAR_SCRIPT_URL}"]`
    )
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true })
      existing.addEventListener("error", () => reject(new Error("MOYASAR_SCRIPT_LOAD_FAILED")), {
        once: true,
      })
      return
    }
    const script = document.createElement("script")
    script.src = MOYASAR_SCRIPT_URL
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error("MOYASAR_SCRIPT_LOAD_FAILED"))
    document.head.appendChild(script)
  }).catch((error: unknown) => {
    // Don't poison the module-level cache on a transient network failure -- the next mount
    // should get a fresh attempt, same reasoning as the backend's *-credentials.ts providers.
    loadPromise = null
    throw error
  })

  return loadPromise
}
