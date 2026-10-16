"use client"

import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
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

import { Can } from "@/features/authentication"

import { CampaignListTable } from "./campaign-list-table"
import { CampaignModuleNav } from "./campaign-module-nav"

export function CampaignListScreen() {
  const router = useRouter()
  const t = useTranslations("campaigns.listScreen")

  return (
    <div className="space-y-4">
      <CampaignModuleNav />
      <AppPageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <Can permission="campaigns:create">
            <AppDropdownMenu>
              <AppDropdownMenuTrigger asChild>
                <AppButton icon={<Plus className="size-4" />}>
                  {t("newCampaign")}
                  <ChevronDown className="size-4" />
                </AppButton>
              </AppDropdownMenuTrigger>
              <AppDropdownMenuContent align="end">
                <AppDropdownMenuItem onClick={() => router.push(ROUTES.campaignsCreate)}>
                  {t("createCampaign")}
                </AppDropdownMenuItem>
                <AppDropdownMenuItem>
                  <Upload className="size-4" />
                  {t("importCsv")}
                </AppDropdownMenuItem>
                <AppDropdownMenuSeparator />
                <AppDropdownMenuItem disabled>
                  {t("importFrom", { platform: "Meta" })}
                </AppDropdownMenuItem>
                <AppDropdownMenuItem disabled>
                  {t("importFrom", { platform: "Google" })}
                </AppDropdownMenuItem>
              </AppDropdownMenuContent>
            </AppDropdownMenu>
          </Can>
        }
      />
      <CampaignListTable />
    </div>
  )
}
