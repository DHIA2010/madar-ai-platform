import { NextResponse, type NextRequest } from "next/server"

import { environment } from "@/infrastructure/environment/app-environment"

// Temporary proxy: Snapchat's currently-approved app only allows redirect URIs on the
// madar.my domain (https://www.madar.my/api/auth/callback/snapchat), not the identity
// platform's own api.madar.my domain that every other connector uses. A new app version
// requesting the correct URL (https://api.madar.my/v1/integrations/snapchat-ads/oauth/callback)
// is pending Snapchat's review. Until that's approved, the backend's configured redirect
// URI points here, and this route transparently forwards the callback (code/state and all)
// to the real handler and relays its response -- no OAuth logic is duplicated.
//
// To remove once the new app version is approved: switch the redirect URI in the
// madar/prod/connectors/snapchat secret back to the real backend URL above, then this
// route can be deleted (or simply left in place unused).
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const backendUrl = new URL(
    "/v1/integrations/snapchat-ads/oauth/callback",
    environment.API_BASE_URL
  )
  backendUrl.search = request.nextUrl.search

  const backendResponse = await fetch(backendUrl.toString(), { redirect: "manual" })

  const location = backendResponse.headers.get("location")
  if (backendResponse.status >= 300 && backendResponse.status < 400 && location) {
    return NextResponse.redirect(location, { status: backendResponse.status })
  }

  // Unexpected non-redirect response from the backend -- surface it rather than silently
  // producing a blank page, so a real failure here is actually visible.
  const body = await backendResponse.text()
  return new NextResponse(body, {
    status: backendResponse.status,
    headers: {
      "content-type": backendResponse.headers.get("content-type") ?? "text/plain",
    },
  })
}
