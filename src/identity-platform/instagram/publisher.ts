import { randomBytes } from "node:crypto"

import type { InstagramGraph } from "./graph"
import type { InstagramService } from "./service"

// Connecting Madar's Instagram account, and posting the approved posts on their day.

export const INSTAGRAM_SCOPES = [
  "instagram_basic",
  "instagram_content_publish",
  "instagram_manage_comments",
  "instagram_manage_insights",
  "pages_show_list",
  "pages_read_engagement",
  "business_management",
]

// Marks the sign-ins Madar Admin starts for Madar's Instagram.
export const INSTAGRAM_STATE_PREFIX = "ig."

export interface MetaAppAccess {
  clientId: string
  redirectUri: string
  authorizationUrl: string
  exchangeCode: (code: string) => Promise<string>
  seal: (plainText: string) => string
  open: (sealed: string) => string
}

export class InstagramConnector {
  constructor(
    private readonly service: InstagramService,
    private readonly graph: InstagramGraph,
    private readonly app: () => Promise<MetaAppAccess>
  ) {}

  async start(userId: string): Promise<string> {
    const app = await this.app()
    const state = `${INSTAGRAM_STATE_PREFIX}${randomBytes(24).toString("base64url")}`
    await this.service.saveState(state, userId)
    const url = new URL(app.authorizationUrl)
    url.searchParams.set("client_id", app.clientId)
    url.searchParams.set("redirect_uri", app.redirectUri)
    url.searchParams.set("response_type", "code")
    url.searchParams.set("scope", INSTAGRAM_SCOPES.join(","))
    url.searchParams.set("state", state)
    return url.toString()
  }

  // Returns what to tell Madar Admin: "connected" or a short reason.
  async complete(code: string | null, state: string): Promise<string> {
    const userId = await this.service.consumeState(state)
    if (!userId) return "state_invalid"
    if (!code) return "cancelled"
    const app = await this.app()
    let userToken: string
    try {
      userToken = await app.exchangeCode(code)
    } catch {
      return "token_failed"
    }
    let accounts
    try {
      accounts = await this.graph.accounts(userToken)
    } catch {
      return "accounts_failed"
    }
    const choice = accounts[0]
    if (!choice) return "no_instagram"
    await this.service.saveConnection({
      pageId: choice.pageId,
      pageName: choice.pageName,
      igUserId: choice.igUserId,
      igUsername: choice.igUsername,
      igPictureUrl: choice.igPictureUrl,
      // A page token made from a long-lived sign-in doesn't expire.
      sealedPageToken: app.seal(choice.pageToken),
      connectedBy: userId,
    })
    return "connected"
  }
}

export class InstagramPublisher {
  constructor(
    private readonly service: InstagramService,
    private readonly graph: InstagramGraph,
    private readonly open: () => Promise<(sealed: string) => string>,
    private readonly notify: (text: string) => Promise<void>,
    private readonly now: () => Date = () => new Date()
  ) {}

  private async token(): Promise<{ igUserId: string; token: string } | null> {
    const credentials = await this.service.credentials()
    if (!credentials) return null
    const open = await this.open()
    return { igUserId: credentials.igUserId, token: open(credentials.sealedPageToken) }
  }

  // Every few minutes (server.ts): posts whatever is due. Returns how many went out.
  async tick(): Promise<number> {
    const access = await this.token()
    if (!access) return 0
    const due = await this.service.claimDue()
    let published = 0
    for (const post of due) {
      if (!post.imageUrl) {
        await this.service.markFailed(post.id, "The post has no image.")
        continue
      }
      const caption = [post.caption.trim(), post.hashtags.join(" ")].filter(Boolean).join("\n\n")
      try {
        const result = await this.graph.publishPhoto({
          igUserId: access.igUserId,
          token: access.token,
          imageUrl: post.imageUrl,
          caption,
        })
        await this.service.markPublished(post.id, result.mediaId, result.permalink)
        published += 1
        if (post.firstComment?.trim()) {
          // The post is out either way; a refused comment only costs the comment.
          await this.graph
            .comment(result.mediaId, access.token, post.firstComment.trim())
            .catch(() => undefined)
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const outcome = await this.service.markFailed(post.id, message)
        if (outcome === "failed") {
          await this.notify(
            `⚠️ *تعذر نشر منشور إنستقرام*\n${post.topic ?? post.design.titleTop}\nالسبب: ${message}\nافتح مدار أدمن ← إنستقرام لإعادة المحاولة.`
          )
        }
      }
    }
    return published
  }

  // Refreshes the numbers of posts from the last 30 days (at most every 6 hours per post).
  async refreshInsights(): Promise<void> {
    const access = await this.token()
    if (!access) return
    const posts = await this.service.list()
    const cutoff = this.now().getTime() - 30 * 86_400_000
    for (const post of posts) {
      if (post.status !== "published" || !post.igMediaId || !post.publishedAt) continue
      if (Date.parse(post.publishedAt) < cutoff) continue
      try {
        await this.service.saveInsights(
          post.id,
          await this.graph.insights(post.igMediaId, access.token)
        )
      } catch {
        // A post Instagram has no numbers for yet: try next time.
      }
    }
  }
}

let registered: InstagramPublisher | null = null
export const registerInstagramPublisher = (publisher: InstagramPublisher | null) => {
  registered = publisher
}
export const registeredInstagramPublisher = () => registered
