"use client"

import { CampaignForm } from "./campaign-form"
import { CampaignModuleNav } from "./campaign-module-nav"

export function CampaignCreateScreen() {
  return (
    <div className="space-y-4">
      <CampaignModuleNav />
      <CampaignForm mode="create" />
    </div>
  )
}
