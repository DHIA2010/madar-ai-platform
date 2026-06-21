"use client"

import AnalyticsProductsTable from "./AnalyticsProductsTable"
import OrderStatus from "@/app/(layout-pages)/dashboard/eCommerce/OrderStatus"
import {
  CampaignAiDecisionCenterCard,
  CampaignKpiGrid,
  CampaignRevenueTrendCard,
  CampaignSpendDistributionCard,
  CampaignTopCampaignsCard,
  useCampaignDashboardData,
} from "@/features/campaigns/components/campaign-dashboard-widgets"

export default function AnalyticsDashboard() {
  const { campaigns, kpis, distribution, topCampaigns } = useCampaignDashboardData()

  return (
    <div className="space-y-4">
      <CampaignKpiGrid kpis={kpis} />

      <div className="grid gap-4 xl:grid-cols-[7fr_3fr]">
        <CampaignRevenueTrendCard campaigns={campaigns} />
        <CampaignSpendDistributionCard distribution={distribution} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
        <CampaignTopCampaignsCard topCampaigns={topCampaigns} />
        <div className="h-full [&>*]:h-full">
          <OrderStatus />
        </div>
      </div>

      <AnalyticsProductsTable />

      <CampaignAiDecisionCenterCard />
    </div>
  )
}
