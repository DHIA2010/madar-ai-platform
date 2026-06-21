"use client"

import { useRouter } from "next/navigation"
import { ChevronDown, Plus, Upload } from "lucide-react"

import { ROUTES } from "@/constants/routes"

import {
  AppButton,
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuItem,
  AppDropdownMenuSeparator,
  AppDropdownMenuTrigger,
  AppPageHeader,
} from "@/components/app"

import { CampaignListTable } from "./campaign-list-table"
import { CampaignModuleNav } from "./campaign-module-nav"

export function CampaignListScreen() {
  const router = useRouter()

  return (
    <div className="space-y-4">
      <CampaignModuleNav />
      <AppPageHeader
        title="Campaign List"
        subtitle="Search, filter, and manage campaigns in one operational table."
        actions={
          <AppDropdownMenu>
            <AppDropdownMenuTrigger asChild>
              <AppButton icon={<Plus className="size-4" />}>
                New Campaign
                <ChevronDown className="size-4" />
              </AppButton>
            </AppDropdownMenuTrigger>
            <AppDropdownMenuContent align="end">
              <AppDropdownMenuItem onClick={() => router.push(ROUTES.campaignsCreate)}>
                Create Campaign
              </AppDropdownMenuItem>
              <AppDropdownMenuItem>
                <Upload className="size-4" />
                Import CSV
              </AppDropdownMenuItem>
              <AppDropdownMenuSeparator />
              <AppDropdownMenuItem disabled>Import from Meta (Coming Soon)</AppDropdownMenuItem>
              <AppDropdownMenuItem disabled>Import from Google (Coming Soon)</AppDropdownMenuItem>
            </AppDropdownMenuContent>
          </AppDropdownMenu>
        }
      />
      <CampaignListTable />
    </div>
  )
}
