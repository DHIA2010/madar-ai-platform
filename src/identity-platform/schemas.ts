import { z } from "zod"

// Imported rather than restated as local tuples (the pattern the rest of this file uses for
// small closed sets) so the request contract and the service's own rules cannot drift apart:
// adding a product type in one place and forgetting the other would be silently accepted.
import { PRODUCT_STATUSES, PRODUCT_TYPES, PRODUCT_UNITS } from "./products/catalog-types"
import { PAYMENT_KINDS } from "./pos/payment-methods-service"
import { TAX_RATE_TYPES } from "./tax/tax-rates-service"
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
  fullName: z.string().min(2).optional(),
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
  // Targets one specific membership (a member has one per workspace) -- omitted, the command
  // falls back to an arbitrary membership in the org, which is only safe for a member who has
  // just one.
  workspaceId: z.string().uuid().nullable().optional(),
  profile: z.record(z.string(), z.string()),
})

export const updateMemberIdentitySchema = z.object({
  fullName: z.string().min(2).optional(),
})

// Admin-on-a-member counterpart to createMemberDirectSchema's password rule and
// registerSchema's own -- 12-char minimum kept consistent across every place a password is set.
export const createMemberDirectSchema = z.object({
  workspaceIds: z.array(z.string().uuid()).optional(),
  email: z.string().email(),
  fullName: z.string().min(2),
  password: z.string().min(12),
})

export const assignUserWorkspacesSchema = z.object({
  workspaceIds: z.array(z.string().uuid()).min(1),
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

// Same shape as uploadAvatarSchema -- an admin uploading a photo for another member, not the
// caller's own avatar.
export const uploadMemberAvatarSchema = z.object({
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
  trigger: z.enum(["manual", "retry", "scheduled"]).default("manual"),
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

export const posSettingsUpdateSchema = z.object({
  allowBelowCostSale: z.boolean(),
  allowOutOfStockSale: z.boolean(),
  confirmSale: z.boolean(),
  autoOpenCashDrawer: z.boolean(),
  allowManualPriceEdit: z.boolean(),
  applyDiscounts: z.boolean(),
  defaultPrinterDeviceId: z.string().uuid().nullable(),
  paperWidth: z.enum(["58mm", "80mm"]),
  autoPrintInvoice: z.boolean(),
  printKitchenCopy: z.boolean(),
  copiesCount: z.number().int().min(1).max(5),
  showQuickPaymentScreen: z.boolean(),
  allowSplitPayment: z.boolean(),
  rememberLastPaymentMethod: z.boolean(),
  requirePaymentMethodSelection: z.boolean(),
  showProductImages: z.boolean(),
  useCompactMode: z.boolean(),
  showCategoryPanel: z.boolean(),
  showGridView: z.boolean(),
  showListView: z.boolean(),
  enableBarcodeScanner: z.boolean(),
  playScanSound: z.boolean(),
})

const TIME_LOCAL_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

export const saveConnectionSyncScheduleSchema = z
  .object({
    enabled: z.boolean(),
    frequencyMinutes: z
      .union([z.literal(15), z.literal(30), z.literal(60), z.literal(360), z.literal(1440)])
      .nullable(),
    customCron: z.string().trim().min(9).max(100).nullable(),
    activeDays: z.array(z.number().int().min(0).max(6)).max(7),
    startTimeLocal: z.string().regex(TIME_LOCAL_PATTERN, "Expected HH:MM"),
    timezone: z.string().min(1).max(64),
    retryOnConnectionFailure: z.boolean(),
    retryMaxAttempts: z.number().int().min(0).max(10),
    notifyOnFailure: z.boolean(),
  })
  .refine((value) => (value.frequencyMinutes === null) !== (value.customCron === null), {
    message: "Exactly one of frequencyMinutes or customCron must be set.",
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
  // Null means "use the organization's default rate" -- see catalog-types.ts's CreateProductInput.
  taxRateId: z.string().uuid().nullable().optional().default(null),
  priceIncludesTax: z.boolean().default(false),
  // Which workspace (branch) this product belongs to -- the Add Product form makes this a
  // required choice, but it's optional here too so a caller that never sends one (bulk import,
  // an older client) still falls back to the request's own active-workspace context, same as
  // before this field existed. See server.ts's product create route.
  workspaceId: z.string().uuid().nullable().optional().default(null),
})

// A products-list "select several, change their status" quick action -- see
// ProductCatalogService.bulkUpdateStatus.
export const bulkUpdateProductStatusSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
  status: z.enum(PRODUCT_STATUSES),
})

// A bulk CSV import of native products -- every field is a plain string (or null), exactly like a
// spreadsheet cell, since ProductCatalogService.bulkImport() does the real type coercion and
// per-row validation (the same rules createProductSchema/create() already enforce for one
// product). name is deliberately not required at the schema level -- an invalid row is skipped
// and reported back, not one bad row failing the whole file.
export const bulkImportProductsSchema = z.object({
  products: z
    .array(
      z.object({
        name: z.string().max(200),
        sku: z.string().max(120).nullable().optional().default(null),
        category: z.string().max(200).nullable().optional().default(null),
        productType: z.string().max(40).nullable().optional().default(null),
        status: z.string().max(40).nullable().optional().default(null),
        costPrice: z.string().max(40).nullable().optional().default(null),
        sellPrice: z.string().max(40).nullable().optional().default(null),
        stockQuantity: z.string().max(40).nullable().optional().default(null),
        minStock: z.string().max(40).nullable().optional().default(null),
        baseUnit: z.string().max(60).nullable().optional().default(null),
        description: z.string().max(2000).nullable().optional().default(null),
      })
    )
    .min(1)
    .max(1000),
})

// A per-organization named tax rate -- see tax-rates-service.ts and migration 068_tax_rates.sql.
export const createTaxRateSchema = z.object({
  name: z.string().min(1).max(120),
  type: z.enum(TAX_RATE_TYPES),
  ratePercent: z.number().min(0).max(100),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
})

// Every field optional -- an edit only ever sends what actually changed, same convention as
// updateCustomerSchema below.
export const updateTaxRateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  type: z.enum(TAX_RATE_TYPES).optional(),
  ratePercent: z.number().min(0).max(100).optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
})

// Settings -> الضرائب -> "الأسعار تشمل الضريبة", applied to every existing priced product at once
// -- see ProductCatalogService.applyPriceTaxConvention.
export const applyProductsTaxConventionSchema = z.object({
  includeTax: z.boolean(),
})

// A native (Madar-authored) customer -- see native-customers-service.ts and migration
// 060_native_customers.sql.
export const createCustomerSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().max(160).nullable().optional().default(null),
  phone: z.string().max(30).nullable().optional().default(null),
  notes: z.string().max(500).nullable().optional().default(null),
  region: z.string().max(120).nullable().optional().default(null),
  // B2B identity + Saudi National Address, for a VAT-registered business customer -- lets a sale
  // to them carry the BUYER's own VAT number/address on the invoice, the same way the seller's
  // own already does (see migration 067_pos_invoice_zatca.sql). All optional -- a walk-in
  // customer never fills any of this in.
  isBusinessCustomer: z.boolean().optional().default(false),
  vatNumber: z.string().max(30).nullable().optional().default(null),
  commercialRegistration: z.string().max(30).nullable().optional().default(null),
  buildingNumber: z.string().max(10).nullable().optional().default(null),
  secondaryNumber: z.string().max(10).nullable().optional().default(null),
  street: z.string().max(160).nullable().optional().default(null),
  city: z.string().max(120).nullable().optional().default(null),
  district: z.string().max(120).nullable().optional().default(null),
  postalCode: z.string().max(10).nullable().optional().default(null),
  countryCode: z.string().max(3).nullable().optional().default("SA"),
})

// A partial edit of a native customer's own fields -- every field optional, since an edit only
// ever sends what actually changed (see NativeCustomersService.update).
export const updateCustomerSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  email: z.string().max(160).nullable().optional(),
  phone: z.string().max(30).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  region: z.string().max(120).nullable().optional(),
  isBusinessCustomer: z.boolean().optional(),
  vatNumber: z.string().max(30).nullable().optional(),
  commercialRegistration: z.string().max(30).nullable().optional(),
  buildingNumber: z.string().max(10).nullable().optional(),
  secondaryNumber: z.string().max(10).nullable().optional(),
  street: z.string().max(160).nullable().optional(),
  city: z.string().max(120).nullable().optional(),
  district: z.string().max(120).nullable().optional(),
  postalCode: z.string().max(10).nullable().optional(),
  countryCode: z.string().max(3).nullable().optional(),
})

// A bulk CSV import of native customers -- name is deliberately not required at the schema
// level (unlike createCustomerSchema) because an invalid row should be skipped and reported
// back, not fail the whole request; NativeCustomersService.bulkImport does that per-row check.
export const bulkImportCustomersSchema = z.object({
  customers: z
    .array(
      z.object({
        name: z.string().max(120),
        email: z.string().max(160).nullable().optional().default(null),
        phone: z.string().max(30).nullable().optional().default(null),
        region: z.string().max(120).nullable().optional().default(null),
      })
    )
    .min(1)
    .max(1000),
})

// A receipt ("سند قبض" -- also how a wallet top-up now works, since both credit the same real
// account) or payment/disbursement ("سند صرف") against a customer's unified account balance --
// see migration 066_customer_unified_account.sql and
// NativeCustomersService.createAccountTransaction. Attachments are optional and uploaded inline
// with the voucher, same contentType/dataBase64 shape as uploadAvatarSchema, capped at 5MB each
// to match the mockup's stated limit.
export const createBalanceVoucherSchema = z.object({
  amount: z.number().positive(),
  taxInclusive: z.boolean().optional().default(false),
  taxAmount: z.number().nonnegative().optional().default(0),
  paymentMethodCode: z.string().min(1).max(60),
  notes: z.string().max(500).nullable().optional().default(null),
  // The voucher's own recorded date -- defaults to today in the UI, but stays editable (e.g. to
  // backdate a receipt collected earlier and only entered now). Omitted or left empty falls back
  // to the database's own now() default, same as before this field existed.
  transactionDate: z.string().min(1).optional(),
  attachments: z
    .array(
      z.object({
        contentType: z.enum(["application/pdf", "image/png", "image/jpeg"]),
        dataBase64: z.string().min(1),
      })
    )
    .max(5)
    .optional()
    .default([]),
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
  // Which specific combination of a "variable" product (size/color etc.) this line actually is --
  // see PosInvoicesService.computeStockConsumption, which decrements this exact variant's own
  // stock rather than the parent product's.
  variantId: z.string().uuid().nullable().optional().default(null),
  productName: z.string().min(1).max(200),
  unitPrice: z.number().min(0),
  quantity: z.number().positive(),
  // A discount applied to just this line, distinct from the invoice's own order-wide
  // discountAmount below -- see migration 071_pos_invoice_item_discount.sql.
  discountAmount: z.number().min(0).optional().default(0),
})

// One settling line -- an invoice can be paid across more than one of these (see
// PosInvoicesService.create(), migration 062_pos_split_payments.sql).
export const createInvoicePaymentSchema = z.object({
  paymentMethodCode: z.string().min(1).max(60),
  amount: z.number().positive(),
})

export const createInvoiceSchema = z.object({
  // Null customer name is a deliberate value, not a missing field -- it is how "عميل نقدي"
  // (walk-in, no customer) is recorded.
  customerName: z.string().max(120).nullable().optional().default(null),
  customerPhone: z.string().max(30).nullable().optional().default(null),
  // A real customer this sale is attributed to -- required whenever a payment line uses a
  // "credit" (آجل) method, since that amount has to land on an actual account.
  customerId: z.string().uuid().nullable().optional().default(null),
  payments: z.array(createInvoicePaymentSchema).min(1),
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

// "returned" is no longer a valid value here -- a return is now its own real, itemized event
// (see createInvoiceReturnSchema below and PosInvoicesService.createReturn()), not a blunt
// whole-invoice status flip.
export const invoiceStatusSchema = z.object({
  status: z.enum(["cancelled"]),
})

// One line of a return -- invoiceItemId names the exact pos_invoice_items row (not just a
// product), since two lines on the same invoice could share a product, and quantity is only ever
// what's actually being returned THIS event (createReturn() itself enforces it can't exceed
// what's still left on that line).
export const createInvoiceReturnItemSchema = z.object({
  invoiceItemId: z.string().uuid(),
  quantity: z.number().positive(),
})

// Unlike a sale's own payment lines, amount is optional here -- a single-method refund (the
// common case) always refunds the return's own computed total, so the caller doesn't have to
// already know that total just to ask for it. It becomes required the moment there's more than
// one line (see PosInvoicesService.createReturn()), since a split can't be inferred.
export const createInvoiceReturnPaymentSchema = z.object({
  paymentMethodCode: z.string().min(1).max(60),
  amount: z.number().positive().optional(),
})

export const createInvoiceReturnSchema = z.object({
  items: z.array(createInvoiceReturnItemSchema).min(1),
  // The refund can be split across more than one method (half cash, half store credit, etc.) --
  // every method used must be one this branch has enabled, and once there's more than one line
  // their amounts must sum to exactly what this return actually totals (see
  // PosInvoicesService.createReturn()).
  payments: z.array(createInvoiceReturnPaymentSchema).min(1),
  notes: z.string().max(500).nullable().optional().default(null),
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

// ZATCA Phase 2 device onboarding -- see zatca-devices-service.ts. Step 1 (no live ZATCA
// dependency): generates a real CSR from these fields.
export const createZatcaDeviceSchema = z.object({
  workspaceId: z.string().uuid().nullable().optional().default(null),
  commonName: z.string().min(1).max(120),
  environment: z.enum(["sandbox", "simulation", "production"]),
  vatNumber: z.string().min(15).max(15),
  organizationName: z.string().min(1).max(200),
  organizationUnit: z.string().min(1).max(120),
  egsSerialNumber: z.string().min(1).max(200),
  location: z.string().min(1).max(200),
  industry: z.string().min(1).max(120),
})

// Step 2 -- the one call gated on a real Fatoora-portal OTP the taxpayer supplies themselves.
export const submitZatcaComplianceOtpSchema = z.object({
  otp: z.string().min(1).max(20),
})
