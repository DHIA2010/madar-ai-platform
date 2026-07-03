import { z } from "zod"

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12),
  fullName: z.string().min(2),
  organizationName: z.string().min(2),
  rememberMe: z.boolean().optional(),
  timezone: z.string().default("UTC"),
  language: z.string().default("en"),
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

export const revokeSessionSchema = z.object({
  sessionId: z.string().uuid(),
})

export const googleOAuthStartSchema = z.object({
  workspaceId: z.string().uuid().nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
  connectionName: z.string().min(1).max(200).nullable().optional(),
})

export const googleAdsSyncSchema = z.object({
  connectionId: z.string().uuid(),
  customerId: z.string().min(1).max(64),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  idempotencyKey: z.string().min(8).max(200),
  mode: z.enum(["full", "incremental"]).default("incremental"),
})

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
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  pageSize: z.coerce.number().int().min(1).max(1000).optional(),
})

export const googleAdsAccountsQuerySchema = z.object({
  connectionId: z.string().uuid(),
})
