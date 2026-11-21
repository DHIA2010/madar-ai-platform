// Moyasar's own payment form, loaded only while a customer is paying for a booking. The card is
// typed into Moyasar's form and goes to Moyasar; it never passes through Madar. (The billing
// feature has a loader of its own for Madar's subscriptions; each feature keeps its copy.)

// Pinned, so a change in the form's behaviour never arrives between deploys.
const VERSION = "1.14.0"
const SCRIPT_URL = `https://cdn.moyasar.com/mpf/${VERSION}/moyasar.js`
const STYLESHEET_URL = `https://cdn.moyasar.com/mpf/${VERSION}/moyasar.css`

interface MoyasarFormOptions {
  element: HTMLElement
  publishable_api_key: string
  // In halalas.
  amount: number
  currency: string
  description: string
  callback_url: string
  metadata?: Record<string, string>
  // Cards only (mada, Visa, Mastercard): Apple Pay needs the business's own domain verified
  // with Moyasar, and listing it without that stops the whole form from showing.
  methods?: Array<"creditcard" | "applepay" | "stcpay">
  on_failure?: () => void
}

type MoyasarWindow = Window & { Moyasar?: { init: (options: MoyasarFormOptions) => void } }

let loading: Promise<void> | null = null

function load(): Promise<void> {
  if (!document.querySelector(`link[href="${STYLESHEET_URL}"]`)) {
    const link = document.createElement("link")
    link.rel = "stylesheet"
    link.href = STYLESHEET_URL
    document.head.appendChild(link)
  }
  if ((window as MoyasarWindow).Moyasar) return Promise.resolve()
  loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script")
    script.src = SCRIPT_URL
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => {
      loading = null
      reject(new Error("moyasar"))
    }
    document.head.appendChild(script)
  })
  return loading
}

// Draws the form into an element. Resolves once it is on screen.
export async function showMoyasarForm(options: MoyasarFormOptions): Promise<void> {
  await load()
  const moyasar = (window as MoyasarWindow).Moyasar
  if (!moyasar) throw new Error("moyasar")
  options.element.innerHTML = ""
  moyasar.init({ methods: ["creditcard"], ...options })
}

// Moyasar's stylesheet resets styles page-wide, so it leaves with the form.
export function removeMoyasarForm() {
  document.querySelector(`link[href="${STYLESHEET_URL}"]`)?.remove()
}
