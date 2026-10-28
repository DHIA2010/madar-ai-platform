// Platform-wide settings edited from Madar Admin's "إعدادات المنصة" and packages pages. Stored as
// one JSON row (platform_settings, id = 1); any key missing there falls back to these defaults.
export interface PlatformSettings {
  platformName: string
  supportEmail: string
  // Shown at the top of every customer's dashboard while non-empty.
  announcementBanner: string
  // Blocks sign-in (and ends existing sessions) for everyone except Madar staff.
  maintenanceMode: boolean
  // Off closes new registrations; existing customers are unaffected.
  newSignupsEnabled: boolean
  // Free-trial length, the same for every application.
  trialDays: number
  // Renewal policy -- used by renewal reminders and lapsed-payment handling.
  renewalReminderDays: number
  gracePeriodDays: number
}

export const DEFAULT_PLATFORM_SETTINGS: PlatformSettings = {
  platformName: "مدار",
  supportEmail: "support@madar.my",
  announcementBanner: "",
  maintenanceMode: false,
  newSignupsEnabled: true,
  trialDays: 7,
  renewalReminderDays: 3,
  gracePeriodDays: 7,
}

// The subset anyone may read (before signing in, too): what the login/sign-up pages and the
// customer dashboard need to show.
export type PublicPlatformSettings = Pick<
  PlatformSettings,
  "platformName" | "supportEmail" | "announcementBanner" | "maintenanceMode" | "newSignupsEnabled"
>

export function toPublicPlatformSettings(settings: PlatformSettings): PublicPlatformSettings {
  return {
    platformName: settings.platformName,
    supportEmail: settings.supportEmail,
    announcementBanner: settings.announcementBanner,
    maintenanceMode: settings.maintenanceMode,
    newSignupsEnabled: settings.newSignupsEnabled,
  }
}

export interface PlatformSettingsRepository {
  get(): Promise<PlatformSettings>
  update(patch: Partial<PlatformSettings>, updatedByUserId: string): Promise<PlatformSettings>
}
