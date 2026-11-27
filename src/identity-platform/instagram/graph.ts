import type { InstagramInsights } from "./types"

// The few Instagram Graph API calls Madar needs to post on its own account (through the linked
// Facebook page): find the account, publish a photo with its caption, add the first comment,
// and read a post's numbers. https://developers.facebook.com/docs/instagram-platform

const DEFAULT_BASE = "https://graph.facebook.com/v21.0"

export class InstagramGraphError extends Error {}

export interface InstagramAccountChoice {
  pageId: string
  pageName: string
  pageToken: string
  igUserId: string
  igUsername: string
  igPictureUrl: string | null
}

type Json = Record<string, unknown>

export class InstagramGraph {
  constructor(
    private readonly base = DEFAULT_BASE,
    private readonly sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms))
  ) {}

  private async call(
    method: "GET" | "POST",
    path: string,
    params: Record<string, string>
  ): Promise<Json> {
    const url = new URL(`${this.base}${path}`)
    const body = new URLSearchParams(params)
    let response: Response
    if (method === "GET") {
      for (const [key, value] of body) url.searchParams.set(key, value)
      response = await fetch(url)
    } else {
      response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
      })
    }
    const json = (await response.json().catch(() => ({}))) as Json
    if (!response.ok || json.error) {
      const error = (json.error ?? {}) as Json
      throw new InstagramGraphError(
        String(error.error_user_msg ?? error.message ?? `Instagram error ${response.status}`)
      )
    }
    return json
  }

  // The Facebook pages this sign-in manages that have an Instagram professional account linked.
  async accounts(userToken: string): Promise<InstagramAccountChoice[]> {
    const result = await this.call("GET", "/me/accounts", {
      fields: "id,name,access_token,instagram_business_account{id,username,profile_picture_url}",
      limit: "100",
      access_token: userToken,
    })
    const pages = (result.data ?? []) as Json[]
    return pages
      .filter((page) => page.instagram_business_account && page.access_token)
      .map((page) => {
        const ig = page.instagram_business_account as Json
        return {
          pageId: String(page.id),
          pageName: String(page.name ?? ""),
          pageToken: String(page.access_token),
          igUserId: String(ig.id),
          igUsername: String(ig.username ?? ""),
          igPictureUrl: (ig.profile_picture_url as string | undefined) ?? null,
        }
      })
  }

  // Posts one photo with its caption. Returns the new post's id and link.
  async publishPhoto(input: {
    igUserId: string
    token: string
    imageUrl: string
    caption: string
  }): Promise<{ mediaId: string; permalink: string | null }> {
    const container = await this.call("POST", `/${input.igUserId}/media`, {
      image_url: input.imageUrl,
      caption: input.caption,
      access_token: input.token,
    })
    const creationId = String(container.id)
    // Instagram fetches and checks the image first; wait until it says it's ready.
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const status = await this.call("GET", `/${creationId}`, {
        fields: "status_code,status",
        access_token: input.token,
      })
      if (status.status_code === "FINISHED") break
      if (status.status_code === "ERROR" || status.status_code === "EXPIRED") {
        throw new InstagramGraphError(`Instagram refused the image: ${String(status.status ?? "")}`)
      }
      await this.sleep(3000)
    }
    const published = await this.call("POST", `/${input.igUserId}/media_publish`, {
      creation_id: creationId,
      access_token: input.token,
    })
    const mediaId = String(published.id)
    let permalink: string | null = null
    try {
      const media = await this.call("GET", `/${mediaId}`, {
        fields: "permalink",
        access_token: input.token,
      })
      permalink = (media.permalink as string | undefined) ?? null
    } catch {
      permalink = null
    }
    return { mediaId, permalink }
  }

  async comment(mediaId: string, token: string, message: string): Promise<void> {
    await this.call("POST", `/${mediaId}/comments`, { message, access_token: token })
  }

  async insights(mediaId: string, token: string): Promise<InstagramInsights> {
    const result = await this.call("GET", `/${mediaId}/insights`, {
      metric: "reach,likes,comments,saved,shares,views",
      access_token: token,
    })
    const value = (name: string) => {
      const entry = ((result.data ?? []) as Json[]).find((item) => item.name === name)
      const values = (entry?.values ?? []) as Json[]
      return Number(values[0]?.value ?? entry?.total_value ?? 0) || 0
    }
    return {
      reach: value("reach"),
      likes: value("likes"),
      comments: value("comments"),
      saved: value("saved"),
      shares: value("shares"),
      views: value("views"),
    }
  }
}
