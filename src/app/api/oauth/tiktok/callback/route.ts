import { NextResponse, type NextRequest } from "next/server"

import { environment } from "@/infrastructure/environment/app-environment"

// TikTok's approved app only allows a redirect URL on the app.madar.my domain
// (https://app.madar.my/api/oauth/tiktok/callback), not the identity platform's own
// api.madar.my domain that every other connector uses -- and unlike Snapchat's version of
// this same situation, there's no pending app review to eventually remove this for: TikTok
// apps generally don't support changing the redirect URL post-approval without resubmission.
// This route transparently forwards the callback (code/state and all) to the real handler
// and relays its response -- no OAuth logic is duplicated. See
// src/app/api/auth/callback/snapchat/route.ts for the identical pattern.
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const backendUrl = new URL("/v1/integrations/tiktok-ads/oauth/callback", environment.API_BASE_URL)
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
