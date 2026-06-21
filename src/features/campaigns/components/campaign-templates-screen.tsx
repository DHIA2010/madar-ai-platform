import { AppBadge, AppButton, AppCard, AppPageHeader } from "@/components/app"

import { CampaignModuleNav } from "./campaign-module-nav"

const TEMPLATE_CARDS = ["Lead Generation", "Sales", "Traffic", "Awareness", "Remarketing"]

export function CampaignTemplatesScreen() {
  return (
    <div className="space-y-4">
      <CampaignModuleNav />

      <AppPageHeader
        title="Templates"
        subtitle="Choose from campaign template placeholders to accelerate setup."
      />

      <AppCard title="Campaign Templates" subtitle="Prebuilt campaign blueprints (UI placeholder).">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {TEMPLATE_CARDS.map((template) => (
            <article key={template} className="rounded-xl border border-border/70 bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-sm font-semibold">{template}</h3>
                <AppBadge variant="outline" className="text-xs">
                  Placeholder
                </AppBadge>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Template structure is ready. Logic and automation will be added in a future sprint.
              </p>
              <div className="mt-4">
                <AppButton size="sm" variant="outline" disabled>
                  Use Template (Coming Soon)
                </AppButton>
              </div>
            </article>
          ))}
        </div>
      </AppCard>
    </div>
  )
}
