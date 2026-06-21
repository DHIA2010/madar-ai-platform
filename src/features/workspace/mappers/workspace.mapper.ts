import type { Organization, TenantContext, Workspace } from "../types"

const fallbackLocale = "ar-SA"
const fallbackTimezone = "Asia/Riyadh"

export function buildTenantContext(
  organization: Organization | null,
  workspace: Workspace | null
): TenantContext {
  return {
    organizationId: organization?.id ?? null,
    workspaceId: workspace?.id ?? null,
    subscription: organization?.subscription ?? null,
    locale: workspace?.settings.locale ?? fallbackLocale,
    timezone: workspace?.settings.timezone ?? fallbackTimezone,
  }
}
