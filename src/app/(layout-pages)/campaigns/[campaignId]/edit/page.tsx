import { CampaignEditScreen } from "@/features/campaigns"

export function generateStaticParams() {
  return [
    { campaignId: "cmp_01" },
    { campaignId: "cmp_02" },
    { campaignId: "cmp_03" },
    { campaignId: "cmp_04" },
    { campaignId: "cmp_05" },
    { campaignId: "cmp_06" },
    { campaignId: "cmp_07" },
    { campaignId: "cmp_08" },
  ]
}

interface CampaignEditPageProps {
  params: {
    campaignId: string
  }
}

export default function Page({ params }: CampaignEditPageProps) {
  return <CampaignEditScreen campaignId={params.campaignId} />
}
