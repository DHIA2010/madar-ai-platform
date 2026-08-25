import { createHttpDataClient } from "@/infrastructure/data/api/http-data-client"
import { createSessionManager } from "@/infrastructure/identity"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function getWorkspaceIdFromStorage(): string | null {
  if (typeof window === "undefined") {
    return null
  }

  const raw = window.localStorage.getItem("workspace-context")
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as { state?: { currentWorkspace?: { id?: string } } }
    const workspaceId = parsed.state?.currentWorkspace?.id ?? null
    if (!workspaceId) {
      return null
    }

    return UUID_PATTERN.test(workspaceId) ? workspaceId : null
  } catch {
    return null
  }
}

export interface TrackingSiteKeyRecord {
  siteKey: string
  snippetUrl: string
}

const SITE_KEY_ENDPOINT = ["", "v1", "tracking", "site-key"].join(String.fromCharCode(47))

const sessionManager = createSessionManager()
const client = createHttpDataClient({
  getSession: () => sessionManager.restore(),
  getWorkspaceId: getWorkspaceIdFromStorage,
})

export const trackingSnippetService = {
  // Lazily created on the backend on first call -- same key every time after.
  async getSiteKey(): Promise<TrackingSiteKeyRecord> {
    return client.get<TrackingSiteKeyRecord>(SITE_KEY_ENDPOINT)
  },
}

export function buildSnippetTag(siteKey: TrackingSiteKeyRecord): string {
  return `<script src="${siteKey.snippetUrl}" data-madar-site="${siteKey.siteKey}" async></script>`
}
