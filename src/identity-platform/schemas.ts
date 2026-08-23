import { z } from "zod"

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

export const posLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export const posCreateRoleSchema = z.object({
  name: z.string().min(2).max(100),
  permissions: z.array(z.string().min(1).max(100)).default([]),
})

export const posUpdateRoleSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  permissions: z.array(z.string().min(1).max(100)).optional(),
})

export const posCreateEmployeeSchema = z.object({
  fullName: z.string().min(2).max(150),
  email: z.string().email(),
  password: z.string().min(8).max(200),
  posRoleId: z.string().uuid().nullable().optional(),
})

export const posUpdateEmployeeSchema = z.object({
  fullName: z.string().min(2).max(150).optional(),
  posRoleId: z.string().uuid().nullable().optional(),
  status: z.enum(["active", "inactive"]).optional(),
  password: z.string().min(8).max(200).optional(),
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

export const aggregateCampaignLinksSchema = z.object({
  metricDate: dateOnlySchema.optional(),
})
