import { headers } from "next/headers"

import { isAttributionParam } from "@/lib/attribution"

import { isMadarAppHostname, MARKETING_GTM_CONTAINER_ID } from "../marketing-constants"

import { GoogleTagManagerNoScript, GoogleTagManagerScript } from "@/components/google-tag-manager"

type SearchParams = Record<string, string | string[] | undefined>

// Google Tag Manager on the app's sign-up pages (register, welcome), so the ad platforms can count
// a sign-up that started from an ad on madar.my. The rest of the app never loads it.
//
// The pixels report the page's full URL, so it loads only when the query string carries nothing
// but campaign tags (plus whatever the page itself lists in `allowedParams`): a register link
// with an invitation or a marketplace-install token stays untracked.
export async function SignUpFunnelTagManager({
  searchParams,
  allowedParams = [],
}: {
  searchParams: SearchParams
  allowedParams?: string[]
}) {
  const headersList = await headers()
  if (!isMadarAppHostname(headersList.get("host") ?? "")) return null
  const onlyCampaignTags = Object.keys(searchParams).every(
    (key) => isAttributionParam(key) || allowedParams.includes(key)
  )
  if (!onlyCampaignTags) return null

  return (
    <>
      <GoogleTagManagerNoScript containerId={MARKETING_GTM_CONTAINER_ID} />
      <GoogleTagManagerScript containerId={MARKETING_GTM_CONTAINER_ID} />
    </>
  )
}
