import { IdentityError } from "../application/errors/IdentityError"
import type { PostgresDatabase } from "../infrastructure/postgres/database"
import { loadOrganizationEntitlements } from "./entitlements"

// Server-side app access for POS, Ads and E-commerce: their routes answer only for an
// organization subscribed to the app they belong to (organizations.settings `{app}Enabled`, with
// a lapsed trial counting as off) -- the same flags the app's sidebar shows them by, so the two
// always agree. Invoicing also opens through a plan that includes it (POS احترافي, Madar Complete --
// see entitlements.ts), without a subscription of its own. Apps with their own guards (Supplies, Expenses, Promotions, Custom reports, AI)
// keep them; everything not listed here (auth, settings, administration, reports, billing) is
// open to any organization.
//
// Several screens serve more than one app (invoices for POS and E-commerce, products for POS,
// E-commerce and Supplies), so a rule lists every app that may use it -- any one is enough.

type GatedApplication = "pos" | "ecommerce" | "advertising" | "procurement" | "invoicing"

interface AccessRule {
  prefix: string
  applications: GatedApplication[]
}

// Most specific prefixes first: the first match decides.
const RULES: AccessRule[] = [
  // Shared by the invoices page (POS and E-commerce).
  { prefix: "/v1/pos/invoices", applications: ["pos", "ecommerce"] },
  { prefix: "/v1/pos/payment-methods", applications: ["pos", "ecommerce"] },
  { prefix: "/v1/pos/settings", applications: ["pos", "ecommerce"] },
  { prefix: "/v1/pos/", applications: ["pos"] },
  { prefix: "/v1/zatca/", applications: ["pos", "ecommerce", "invoicing"] },
  { prefix: "/v1/customers", applications: ["pos", "ecommerce", "invoicing"] },
  // Purchases need the product list and stock too; quotations and invoices pick products.
  { prefix: "/v1/products", applications: ["pos", "ecommerce", "procurement", "invoicing"] },
  {
    prefix: "/v1/product-categories",
    applications: ["pos", "ecommerce", "procurement", "invoicing"],
  },
  { prefix: "/v1/invoicing/", applications: ["invoicing"] },
  { prefix: "/v1/inventory/", applications: ["pos", "ecommerce", "procurement"] },
  { prefix: "/v1/orders", applications: ["ecommerce"] },
  { prefix: "/v1/stores", applications: ["ecommerce"] },
  { prefix: "/v1/tracking/live-", applications: ["ecommerce"] },
  { prefix: "/v1/campaigns", applications: ["advertising"] },
  { prefix: "/v1/campaign-links", applications: ["advertising"] },
  { prefix: "/v1/channels/", applications: ["advertising", "ecommerce"] },
  { prefix: "/v1/integrations/", applications: ["advertising", "ecommerce"] },
]

// Linking a store installed from Salla's / Zid's app market into an organization is how a merchant
// signs up -- always allowed; the store's data stays behind the E-commerce subscription.
const EXEMPT = [
  /^\/v1\/integrations\/zid\/install\/[^/]+\/claim$/,
  /^\/v1\/integrations\/salla\/pending-installs\/[^/]+\/claim$/,
  /^\/v1\/integrations\/salla\/connect-intents(\/[^/]+\/status)?$/,
]

export function applicationsForPath(pathname: string): GatedApplication[] | null {
  if (EXEMPT.some((pattern) => pattern.test(pathname))) return null
  // A prefix ending in "/" or "-" matches anything under it; otherwise the path itself or what's
  // under it ("/v1/products" matches "/v1/products/x", not "/v1/products-x").
  const rule = RULES.find(({ prefix }) =>
    /[/-]$/.test(prefix)
      ? pathname.startsWith(prefix) || pathname === prefix.slice(0, -1)
      : pathname === prefix || pathname.startsWith(`${prefix}/`)
  )
  return rule?.applications ?? null
}

function isOn(settings: Record<string, unknown>, application: GatedApplication): boolean {
  if (settings[`${application}Enabled`] !== true) return false
  const trialEndsAt = settings[`${application}TrialEndsAt`]
  return !(
    typeof trialEndsAt === "string" &&
    trialEndsAt !== "" &&
    new Date(trialEndsAt).getTime() <= Date.now()
  )
}

export class ApplicationAccessService {
  constructor(private readonly db: PostgresDatabase) {}

  // Refuses a route of an app the organization isn't subscribed to.
  async requireForPath(organizationId: string, pathname: string): Promise<void> {
    const applications = applicationsForPath(pathname)
    if (!applications) return
    const result = await this.db.query<{ settings: Record<string, unknown> }>(
      "SELECT settings FROM organizations WHERE id = $1 AND deleted_at IS NULL",
      [organizationId]
    )
    const settings = result.rows[0]?.settings ?? {}
    if (applications.some((application) => isOn(settings, application))) return
    if (
      applications.includes("invoicing") &&
      (await loadOrganizationEntitlements(this.db, organizationId)).invoicing
    ) {
      return
    }
    throw new IdentityError(
      "APPLICATION_NOT_SUBSCRIBED",
      403,
      "business",
      "Your organization isn't subscribed to this application.",
      { applications }
    )
  }
}
