import { getOfflineDb } from "./db"

import type { AuthSessionDto } from "@/application/contracts/authentication.contracts"

// Mirrors just enough of the current session into IndexedDB so the service worker's own
// background-sync handler -- which, unlike the main thread, cannot read localStorage -- can build
// the authorization/x-workspace-id headers itself when flushing pendingInvoices. Same same-origin
// exposure as the token already sitting in localStorage today, not a new risk category.
export async function syncAuthMirror(
  workspaceId: string,
  session: AuthSessionDto | null
): Promise<void> {
  if (!session) return
  const db = await getOfflineDb()
  await db.put("authMirror", {
    id: "current",
    accessToken: session.accessToken.token,
    tokenType: session.accessToken.tokenType,
    workspaceId,
  })
}
