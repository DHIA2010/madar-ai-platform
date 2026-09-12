import { z } from "zod"

// Imported rather than restated as local tuples (the pattern the rest of this file uses for
// small closed sets) so the request contract and the service's own rules cannot drift apart:
// adding a product type in one place and forgetting the other would be silently accepted.
import { PRODUCT_STATUSES, PRODUCT_TYPES, PRODUCT_UNITS } from "./products/catalog-types"
import { PAYMENT_KINDS } from "./pos/payment-methods-service"
import {
  BAUD_RATES,
  DEVICE_CONNECTIONS,
  PAPER_WIDTHS,
  PRINT_DENSITIES,
  PRINT_DIRECTIONS,
  PRINTER_CHARSETS,
  PRINTER_ROLES,
  TRAILING_DIGIT_MEANINGS,
  WEIGHT_UNITS,
} from "./pos/device-settings-types"

export const registerSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(12),
    fullName: z.string().min(2),
    organizationName: z.string().min(2).optional(),
    invitationToken: z.string().optional(),
    rememberMe: z.boolean().optional(),
    timezone: z.string().default("UTC"),
    language: z.string().default("en"),
  })
  .refine((value) => Boolean(value.organizationName) || Boolean(value.invitationToken), {
    message: "organizationName is required unless registering via an invitation",
    path: ["organizationName"],
  })

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  rememberMe: z.boolean().optional(),
})

export const refreshSchema = z.object({
  refreshToken: z.string().min(24),
})

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
})

export const resetPasswordSchema = z.object({
  token: z.string().min(24),
  password: z.string().min(12),
})

export const verifyEmailSchema = z.object({
  token: z.string().min(24),
})

export const createWorkspaceSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().min(2),
  metadata: z.record(z.string(), z.string()).optional(),
  // Previously absent from this schema, so a request that included it (e.g. a branch's initial
  // currency/timezone) had it silently stripped by parse() before the command ever saw it -- the
  // workspace was created with empty settings no matter what the caller sent.
  settings: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
})

const rolePermissionSchema = z.object({
  module: z.string().min(1).max(50),
  action: z.string().min(1).max(50),
})

export const createTeamSchema = z.object({
  workspaceId: z.string().uuid().optional(),
  name: z.string().min(2).max(200),
  description: z.string().max(2000).optional(),
  color: z.string().max(50).optional(),
  roleReference: z.string().max(64).nullable().optional(),
})

export const addTeamMemberSchema = z.object({
  userId: z.string().uuid(),
})

export const updateTeamSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  description: z.string().max(2000).optional(),
  workspaceId: z.string().uuid().nullable().optional(),
  color: z.string().max(50).optional(),
  roleReference: z.string().max(64).nullable().optional(),
})

export const createCustomRoleSchema = z.object({
  name: z.string().min(2).max(200),
  description: z.string().max(2000).optional(),
  permissions: z.array(rolePermissionSchema),
})

export const updateCustomRoleSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  description: z.string().max(2000).optional(),
  permissions: z.array(rolePermissionSchema).optional(),
})

export const updateWorkspaceSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  status: z.enum(["active", "archived"]).optional(),
  metadata: z.record(z.string(), z.string()).optional(),
  settings: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
})

export const switchWorkspaceSchema = z.object({
  workspaceId: z.string().uuid(),
})

export const inviteMemberSchema = z.object({
  organizationId: z.string().uuid(),
  workspaceId: z.string().uuid().optional(),
  email: z.string().email(),
  role: z.enum(["owner", "admin", "manager", "analyst", "viewer"]),
  idempotencyKey: z.string().min(8).max(100).optional(),
})

export const inviteOrganizationMemberSchema = z.object({
  workspaceId: z.string().uuid().optional(),
  email: z.string().email(),
  role: z.enum(["owner", "admin", "manager", "analyst", "viewer"]),
  idempotencyKey: z.string().min(8).max(100).optional(),
})

export const updateOrganizationSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  status: z.enum(["active", "archived", "deleted"]).optional(),
  metadata: z.record(z.string(), z.string()).optional(),
  branding: z.record(z.string(), z.string()).optional(),
  logoUrl: z.string().url().nullable().optional(),
  timezone: z.string().optional(),
  locale: z.string().optional(),
  currency: z.string().optional(),
  subscriptionReference: z.string().nullable().optional(),
  settings: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
})

export const createOrganizationSchema = updateOrganizationSchema.extend({
  name: z.string().min(2).max(200),
})

export const assignRoleSchema = z.object({
  role: z.enum(["owner", "admin", "manager", "analyst", "viewer"]),
})

export const assignCustomRoleSchema = z.object({
  customRoleId: z.string().uuid().nullable(),
})

export const setMemberModuleAccessSchema = z.object({
  revoked: z.boolean(),
})

export const suspendMemberSchema = z.object({
  reason: z.string().min(2),
})

export const removeMemberSchema = z.object({
  reason: z.string().min(2),
})

export const updateMemberProfileSchema = z.object({
  profile: z.record(z.string(), z.string()),
})

export const updateProfileSchema = z.object({
  fullName: z.string().min(2).optional(),
  avatarUrl: z.string().url().nullable().optional(),
  timezone: z.string().optional(),
  language: z.string().optional(),
  preferences: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
})

export const uploadAvatarSchema = z.object({
  contentType: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]),
  dataBase64: z.string().min(1),
})

// Same shape as uploadAvatarSchema (contentType/dataBase64) -- a separate schema rather than
// reusing uploadAvatarSchema by name, since the two uploads are semantically distinct (org logo
// vs. a specific user's avatar) even though the wire shape happens to match today.
export const uploadOrganizationLogoSchema = z.object({
  contentType: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]),
  dataBase64: z.string().min(1),
})

// One image at a time, uploaded ahead of the product create/update call -- a product can be
// created with several images, and during creation there is no product id yet to attach to.
export const uploadProductImageSchema = z.object({
  contentType: z.enum(["image/png", "image/jpeg", "image/webp"]),
  dataBase64: z.string().min(1),
})

// 12-char minimum matches registerSchema's own password rule, for consistency across the app.
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(12),
})

export const revokeSessionSchema = z.object({
  sessionId: z.string().uuid(),
})

export const googleOAuthStartSchema = z.object({
  connectionId: z.string().uuid().nullable().optional(),
  workspaceId: z.string().uuid().nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
  connectionName: z.string().min(1).max(200).nullable().optional(),
  // Shop-scoped providers (Shopify) need this to build a per-store authorize URL. Ignored
  // by every other provider's oauthStart implementation.
  shopDomain: z.string().min(1).max(255).nullable().optional(),
})

export const integrationOAuthStartSchema = googleOAuthStartSchema

export const googleAdsSyncSchema = z.object({
  connectionId: z.string().uuid(),
  customerId: z.string().min(1).max(64),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  idempotencyKey: z.string().min(8).max(200),
  mode: z.enum(["full", "incremental"]).default("incremental"),
  trigger: z.enum(["manual", "retry"]).default("manual"),
})

export const integrationSyncSchema = googleAdsSyncSchema

export const googleAdsRecordsQuerySchema = z.object({
  connectionId: z.string().uuid(),
  customerId: z.string().min(1).max(64),
  entityType: z
    .enum([
      "customer_account",
      "campaign",
      "campaign_metric",
      "ad_group",
      "ad_group_metric",
      "ad",
      "ad_metric",
      "keyword",
      "keyword_metric",
      "search_term",
      "geo_metric",
      "device_metric",
      "conversion_action",
    ])
    .optional(),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  pageSize: z.coerce.number().int().min(1).max(1000).optional(),
})

export const integrationRecordsQuerySchema = z.object({
  connectionId: z.string().uuid(),
  customerId: z.string().min(1).max(64),
  entityType: z.string().min(1).max(128).optional(),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  pageSize: z.coerce.number().int().min(1).max(1000).optional(),
})

export const googleAdsAccountsQuerySchema = z.object({
  connectionId: z.string().uuid(),
})

export const integrationAccountsQuerySchema = googleAdsAccountsQuerySchema

export const googleAdsAccountSelectionSchema = z.object({
  connectionId: z.string().uuid(),
  customerId: z.string().min(1).max(64),
})

export const integrationAccountSelectionSchema = googleAdsAccountSelectionSchema

export const integrationDisconnectSchema = z.object({
  reason: z.string().min(1).max(300).optional(),
})

export const integrationEventsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

const CAMPAIGN_PLATFORM_VALUES = ["google_ads", "meta_ads", "snapchat_ads", "tiktok_ads"] as const
const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")

export const createNativeCampaignSchema = z.object({
  displayName: z.string().min(2).max(200),
  objective: z.string().max(200).nullable().optional(),
  budgetCurrency: z.string().length(3).nullable().optional(),
  budgetAmount: z.number().nonnegative().nullable().optional(),
  startDate: dateOnlySchema.nullable().optional(),
  endDate: dateOnlySchema.nullable().optional(),
})

export const importCampaignsSchema = z.object({
  platform: z.enum(CAMPAIGN_PLATFORM_VALUES),
  connectionId: z.string().uuid().optional(),
})

const trackingTypeSchema = z.enum(["FULL_URL", "SHORT_LINK"])

const utmFieldsSchema = z.object({
  utmSource: z.string().min(1).max(200),
  utmMedium: z.string().min(1).max(200),
  utmCampaign: z.string().min(1).max(200),
  utmContent: z.string().max(200).nullable().optional(),
  utmTerm: z.string().max(200).nullable().optional(),
})

const customParamsSchema = z.record(z.string(), z.string().max(200)).optional()

export const createCampaignLinkSchema = z
  .object({
    campaignId: z.string().uuid(),
    name: z.string().min(2).max(200),
    trackingType: trackingTypeSchema,
    destinationBaseUrl: z.string().url().startsWith("https://"),
    adGroupName: z.string().max(200).nullable().optional(),
    adName: z.string().max(200).nullable().optional(),
    platform: z.enum(CAMPAIGN_PLATFORM_VALUES).nullable().optional(),
    customParams: customParamsSchema,
  })
  .merge(utmFieldsSchema)

export const previewCampaignLinkSchema = createCampaignLinkSchema

// adGroupName/adName are deliberately absent -- like UTM fields, they're tracking identifiers
// fixed at creation, not display metadata.
export const updateCampaignLinkSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  customParams: customParamsSchema,
})

export const matchOrdersSchema = z.object({
  provider: z.enum(["salla", "shopify", "zid"]).optional(),
  connectionId: z.string().uuid().optional(),
})

// The full Madar Tracking SDK event vocabulary (spec section 6) plus two internal-only event
// names the wire payload also uses: "identify" (Madar.identify(customerId)) and "heartbeat"
// (the live-visitor presence ping) -- both flow through the same /v1/tracking/capture endpoint
// rather than needing dedicated routes.
export const TRACKING_EVENT_NAMES = [
  "page_view",
  "product_view",
  "product_list_view",
  "search",
  "add_to_cart",
  "remove_from_cart",
  "cart_view",
  "checkout_started",
  "checkout_completed",
  "purchase",
  "identify",
  "heartbeat",
] as const

const trackingDeviceSchema = z.object({
  type: z.string().max(20).nullable().optional(),
  browser: z.string().max(50).nullable().optional(),
  browserVersion: z.string().max(20).nullable().optional(),
  os: z.string().max(50).nullable().optional(),
  screenWidth: z.number().int().nonnegative().nullable().optional(),
  screenHeight: z.number().int().nonnegative().nullable().optional(),
  language: z.string().max(20).nullable().optional(),
  timezone: z.string().max(100).nullable().optional(),
})

// Public, unauthenticated -- posted by the storefront capture snippet/SDK (tracking/snippet.ts,
// tracking/sdk.ts), not a signed-in user. siteKey (not organizationId) is the tenant identifier;
// see the public_tracking_key column comment in migration 037. `event` defaults to "page_view"
// so an older cached snippet that never sends it keeps behaving exactly as before.
export const captureTrackingEventSchema = z.object({
  siteKey: z.string().min(1).max(100),
  visitorId: z.string().min(1).max(200),
  sessionId: z.string().min(1).max(200),
  event: z.enum(TRACKING_EVENT_NAMES).default("page_view"),
  eventId: z.string().max(200).nullable().optional(),
  pageUrl: z.string().url(),
  pageTitle: z.string().max(500).nullable().optional(),
  referrerUrl: z.string().max(2000).nullable().optional(),
  utmSource: z.string().max(200).nullable().optional(),
  utmMedium: z.string().max(200).nullable().optional(),
  utmCampaign: z.string().max(200).nullable().optional(),
  utmContent: z.string().max(200).nullable().optional(),
  utmTerm: z.string().max(200).nullable().optional(),
  clickId: z.string().max(200).nullable().optional(),
  clickIdPlatform: z.enum(CAMPAIGN_PLATFORM_VALUES).nullable().optional(),
  platformCampaignId: z.string().max(200).nullable().optional(),
  platformAdgroupId: z.string().max(200).nullable().optional(),
  platformKeyword: z.string().max(200).nullable().optional(),
  platformCreativeId: z.string().max(200).nullable().optional(),
  customerEmail: z.string().email().nullable().optional(),
  // Set by Madar.identify(customerId) -- distinct from customerEmail (best-effort, scraped from
  // the storefront's own checkout globals); this is an explicit, platform-provided identifier.
  customerId: z.string().max(200).nullable().optional(),
  properties: z.record(z.string(), z.unknown()).nullable().optional(),
  device: trackingDeviceSchema.nullable().optional(),
})

export const aggregateCampaignLinksSchema = z.object({
  metricDate: dateOnlySchema.optional(),
})

// --- Native product catalogue (migration 047) ---------------------------------------------
//
// Shape-level validation only. The rules that depend on the chosen product type -- which types
// carry a stock code, which need a price, that a bundle has components and a variable product
// has priced variants -- live in products/catalog-service.ts, because they are business rules
// about a product rather than facts about the request body.

const productMoneySchema = z.number().finite().min(0).max(1_000_000_000)
const productQuantitySchema = z.number().finite().min(0).max(1_000_000_000)

const productComponentSchema = z.object({
  componentRef: z.string().min(1).max(200).nullable().default(null),
  customName: z.string().max(200).nullable().default(null),
  customStock: productQuantitySchema.nullable().default(null),
  requiredQuantity: z.number().finite().positive().max(1_000_000_000),
  requiredUnit: z.enum(PRODUCT_UNITS),
  stockUnit: z.enum(PRODUCT_UNITS),
  conversionFactor: z.number().finite().positive().max(1_000_000).nullable().default(null),
  note: z.string().max(500).nullable().default(null),
})

const productVariantOptionSchema = z.object({
  name: z.string().min(1).max(120),
  values: z.array(z.string().min(1).max(120)).max(50),
})

const productVariantSchema = z.object({
  sku: z.string().max(120).nullable().default(null),
  price: productMoneySchema.nullable().default(null),
  stock: productQuantitySchema.nullable().default(null),
  optionValues: z.array(z.string().min(1).max(120)).max(8),
})

// A closed set rather than free-form jsonb: unknown keys are dropped, so a typo in the client
// cannot quietly persist a field nothing will ever read back.
const productAttributesSchema = z.object({
  unitsPerCarton: productQuantitySchema.nullable().optional(),
  linkedUnitProductId: z.string().max(200).nullable().optional(),
  supplier: z.string().max(200).nullable().optional(),
  stockNotes: z.string().max(500).nullable().optional(),
  stockLocation: z.string().max(200).nullable().optional(),
  batchNumber: z.string().max(120).nullable().optional(),
  brand: z.string().max(200).nullable().optional(),
  model: z.string().max(200).nullable().optional(),
  barcode: z.string().max(120).nullable().optional(),
  countryOfOrigin: z.string().max(200).nullable().optional(),
  minPurchase: productQuantitySchema.nullable().optional(),
  internalNotes: z.string().max(1000).nullable().optional(),
  expiryDate: dateOnlySchema.nullable().optional(),
  pricingType: z.string().max(60).nullable().optional(),
  serviceDuration: productQuantitySchema.nullable().optional(),
  serviceDurationUnit: z.string().max(30).nullable().optional(),
  deliveryMethod: z.string().max(60).nullable().optional(),
  bookingEnabled: z.boolean().nullable().optional(),
  offerPrice: productMoneySchema.nullable().optional(),
  systemRequirements: z.string().max(1000).nullable().optional(),
  productLanguage: z.string().max(60).nullable().optional(),
  preparationMinutes: productQuantitySchema.nullable().optional(),
})

export const createProductSchema = z.object({
  productType: z.enum(PRODUCT_TYPES),
  name: z.string().min(1).max(200),
  sku: z.string().max(120).nullable().optional().default(null),
  category: z.string().max(200).default(""),
  description: z.string().max(2000).default(""),
  status: z.enum(PRODUCT_STATUSES).default("draft"),
  currency: z.string().length(3).default("SAR"),
  baseUnit: z.string().max(60).nullable().optional().default(null),
  sellPrice: productMoneySchema.nullable().optional().default(null),
  costPrice: productMoneySchema.nullable().optional().default(null),
  stockQuantity: productQuantitySchema.nullable().optional().default(null),
  minStock: productQuantitySchema.nullable().optional().default(null),
  // Already-hosted URLs, uploaded separately via POST /v1/products/images -- this schema stores
  // what it is given rather than accepting raw file bytes itself.
  imageUrls: z.array(z.string().url().max(2000)).max(12).default([]),
  attributes: productAttributesSchema.default({}),
  components: z.array(productComponentSchema).max(100).default([]),
  variantOptions: z.array(productVariantOptionSchema).max(8).default([]),
  variants: z.array(productVariantSchema).max(200).default([]),
})

// A native (Madar-authored) customer -- see native-customers-service.ts and migration
// 060_native_customers.sql.
export const createCustomerSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().max(160).nullable().optional().default(null),
  phone: z.string().max(30).nullable().optional().default(null),
  notes: z.string().max(500).nullable().optional().default(null),
})

// Per-device settings. Keyed to deviceType via the discriminated union below, so a printer's
// settings are actually validated against printer fields instead of silently being checked
// against the scale's shape (and anything that didn't happen to also be a scale field being
// dropped) -- which is what a single shared `settings` schema used to do regardless of the
// row's real deviceType.
const deviceScaleSettingsSchema = z.object({
  defaultWeightUnit: z.enum(WEIGHT_UNITS),
  trailingDigits: z.enum(TRAILING_DIGIT_MEANINGS),
  indicatorStart: z.number().int().min(1).max(255),
  decimals: z.number().int().min(0).max(4),
  autoZero: z.boolean(),
  blockUnstableWeight: z.boolean(),
})

const devicePrinterSettingsSchema = z.object({
  role: z.enum(PRINTER_ROLES),
  paperWidth: z.enum(PAPER_WIDTHS),
  printDirection: z.enum(PRINT_DIRECTIONS),
  printDensity: z.enum(PRINT_DENSITIES),
  charset: z.enum(PRINTER_CHARSETS),
  networkAddress: z.string().max(120).nullable(),
  autoCut: z.boolean(),
  printLogo: z.boolean(),
  extraCopy: z.boolean(),
  footerText: z.string().max(200).nullable(),
})

const baseDeviceFields = {
  name: z.string().min(1).max(120),
  model: z.string().max(120).nullable().default(null),
  description: z.string().max(300).nullable().default(null),
  connection: z.enum(DEVICE_CONNECTIONS),
  // COM3, USB, or an address -- the shape follows the connection, so it stays free text.
  port: z.string().max(60).nullable().default(null),
  baudRate: z
    .number()
    .int()
    .refine((rate) => (BAUD_RATES as readonly number[]).includes(rate), {
      message: "Unsupported baud rate",
    })
    .nullable()
    .default(null),
  enabled: z.boolean().default(true),
}

// Every kind besides scale/receipt_printer stores an empty object rather than a null, so the
// column always holds a readable shape even though nothing has a per-unit setting to put there
// yet.
const emptyDeviceSettingsSchema = z.object({}).default({})

export const posDeviceSchema = z.discriminatedUnion("deviceType", [
  z.object({
    ...baseDeviceFields,
    deviceType: z.literal("scale"),
    settings: deviceScaleSettingsSchema.partial().default({}),
  }),
  z.object({
    ...baseDeviceFields,
    deviceType: z.literal("receipt_printer"),
    settings: devicePrinterSettingsSchema.partial().default({}),
  }),
  z.object({
    ...baseDeviceFields,
    deviceType: z.literal("barcode_scanner"),
    settings: emptyDeviceSettingsSchema,
  }),
  z.object({
    ...baseDeviceFields,
    deviceType: z.literal("cash_drawer"),
    settings: emptyDeviceSettingsSchema,
  }),
  z.object({
    ...baseDeviceFields,
    deviceType: z.literal("customer_display"),
    settings: emptyDeviceSettingsSchema,
  }),
  z.object({
    ...baseDeviceFields,
    deviceType: z.literal("card_reader"),
    settings: emptyDeviceSettingsSchema,
  }),
])

// A cashier's session at a branch -- opened with a counted starting float, closed with a counted
// ending one. Amounts are counted cash, never negative.
export const openShiftSchema = z.object({
  // Explicit rather than inferred from the caller's own session workspace: this screen manages
  // every branch's shifts at once, and the admin opening one on a cashier's behalf picks which
  // branch it belongs to.
  workspaceId: z.string().uuid(),
  cashierUserId: z.string().uuid(),
  openingCashAmount: z.number().min(0),
  openingNotes: z.string().max(500).nullable().optional().default(null),
})

export const closeShiftSchema = z.object({
  closingCashAmount: z.number().min(0),
  closingNotes: z.string().max(500).nullable().optional().default(null),
})

export const recordCashMovementSchema = z.object({
  type: z.enum(["withdrawal", "deposit"]),
  amount: z.number().positive(),
  note: z.string().max(300).nullable().optional().default(null),
})

// A line item is a snapshot at the moment of sale, not a live reference: productId carries
// whatever id the picker had (a native product's uuid, a synced storefront product's external
// id, or nothing for a hand-typed line), but productName/unitPrice are what the invoice actually
// reads, so a later price change or product deletion never rewrites history.
export const createInvoiceItemSchema = z.object({
  productId: z.string().max(120).nullable().optional().default(null),
  productName: z.string().min(1).max(200),
  unitPrice: z.number().min(0),
  quantity: z.number().positive(),
})

export const createInvoiceSchema = z.object({
  // Null customer name is a deliberate value, not a missing field -- it is how "عميل نقدي"
  // (walk-in, no customer) is recorded.
  customerName: z.string().max(120).nullable().optional().default(null),
  customerPhone: z.string().max(30).nullable().optional().default(null),
  paymentMethodCode: z.string().min(1).max(60),
  discountAmount: z.number().min(0).default(0),
  notes: z.string().max(500).nullable().optional().default(null),
  items: z.array(createInvoiceItemSchema).min(1),
})

// A parked cart -- same item/customer/discount/notes shape as createInvoiceSchema, minus a
// payment method (not chosen yet, that only happens at actual checkout). workspaceId travels
// explicitly in the body, the same way openShiftSchema takes it, rather than being inferred.
export const holdOrderSchema = z.object({
  workspaceId: z.string().min(1),
  customerName: z.string().max(120).nullable().optional().default(null),
  customerPhone: z.string().max(30).nullable().optional().default(null),
  discountAmount: z.number().min(0).default(0),
  notes: z.string().max(500).nullable().optional().default(null),
  items: z.array(createInvoiceItemSchema).min(1),
})

export const invoiceStatusSchema = z.object({
  status: z.enum(["cancelled", "returned"]),
})

export const paymentMethodUpdateSchema = z.object({
  enabled: z.boolean(),
  // Percent, not basis points -- the screen and the provider's contract both talk in percent.
  feePercent: z.number().min(0).max(100),
  // Provider-linking fields with no dedicated column -- stored in pos_payment_methods.settings
  // jsonb, the same free-form pattern workspace metadata already uses for branch fields.
  merchantId: z.string().max(120).nullable().default(null),
  apiKey: z.string().max(300).nullable().default(null),
  // Only applied when the target row is a branch's own method -- see save()'s own comment.
  name: z.string().min(1).max(120).optional(),
  subtitle: z.string().max(200).nullable().optional(),
})

export const customPaymentMethodSchema = paymentMethodUpdateSchema.extend({
  // Lowercase, no spaces: the code is how a till refers to the method, not what it displays.
  code: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9_]+$/, "Use lowercase letters, digits and underscores"),
  name: z.string().min(1).max(120),
  subtitle: z.string().max(200).nullable().default(null),
  kind: z.enum(PAYMENT_KINDS),
})
