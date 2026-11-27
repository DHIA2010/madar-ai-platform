/* eslint-disable @typescript-eslint/no-explicit-any -- fake Graph client and actors are built loosely */
import { newDb } from "pg-mem"
import { beforeEach, describe, expect, it } from "vitest"

import { PostgresDatabase } from "../infrastructure/postgres/database"
import { runIdentityMigrations } from "../infrastructure/postgres/migration-runner"
import { designWarnings, InstagramAgent, type InstagramWriter, toDraft } from "../instagram/agent"
import {
  INSTAGRAM_STATE_PREFIX,
  InstagramConnector,
  InstagramPublisher,
  type MetaAppAccess,
} from "../instagram/publisher"
import { InstagramService } from "../instagram/service"
import { handleAdminInstagramRoute } from "../interfaces/rest/instagram-routes"

// Madar's Instagram agent: the account is connected once through the Meta app, the agent writes
// the week's posts on Sunday, nothing is posted before approval, approved posts go out on
// Sun/Tue/Thu 20:00 Riyadh by default with their first comment, and a refused post is retried.

const app: MetaAppAccess = {
  clientId: "app-1",
  redirectUri: "https://api.madar.my/v1/integrations/meta-ads/oauth/callback",
  authorizationUrl: "https://www.facebook.com/v21.0/dialog/oauth",
  exchangeCode: async (code) => `user-token-for-${code}`,
  seal: (text) => `sealed:${text}`,
  open: (sealed) => sealed.replace(/^sealed:/, ""),
}

function fakeGraph() {
  const calls: any[] = []
  let failures = 0
  return {
    calls,
    failNext(times: number) {
      failures = times
    },
    async accounts(token: string) {
      calls.push(["accounts", token])
      return [
        {
          pageId: "page-1",
          pageName: "مدار",
          pageToken: "page-token",
          igUserId: "ig-1",
          igUsername: "madar.my",
          igPictureUrl: null,
        },
      ]
    },
    async publishPhoto(input: any) {
      calls.push(["publish", input])
      if (failures > 0) {
        failures -= 1
        throw new Error("Media download has failed")
      }
      return { mediaId: `media-${calls.length}`, permalink: "https://instagram.com/p/x" }
    },
    async comment(mediaId: string, token: string, message: string) {
      calls.push(["comment", mediaId, token, message])
    },
    async insights() {
      return { reach: 120, likes: 9, comments: 2, saved: 1, shares: 0, views: 300 }
    },
  }
}

const writer: InstagramWriter = {
  async write(input) {
    return Array.from({ length: input.count }, (_, index) =>
      toDraft({
        template: (["a", "b", "c"] as const)[index % 3],
        kind: index === 0 ? "news" : "tip",
        topic: `موضوع ${index + 1}`,
        titleTop: index === 2 ? "عنوان طويل جداً لا يتسع في السطر" : "كل تجارتك",
        titleBottom: "في مدار واحد",
        search: "برنامج كاشير",
        sub: "سطر فرعي",
        points: ["نقطة 1", "نقطة 2", "نقطة 3"],
        chips: ["ملصق 1", "ملصق 2"],
        screen: "cashier",
        cards: [{ icon: "pos", title: "الكاشير", text: "نص" }],
        cta: "جرّب مدار مجاناً",
        caption: "كابشن المنشور",
        hashtags: ["مدار", "#كاشير"],
        firstComment: "وش أكثر شي يتعبك؟ 👇",
        featureKeys: index === 0 ? ["campaign-coach", "made-up"] : [],
      })
    )
  },
}

describe("instagram agent", () => {
  let database: PostgresDatabase
  let clock: Date
  let service: InstagramService
  let graph: ReturnType<typeof fakeGraph>
  let notes: string[]

  beforeEach(async () => {
    const mem = newDb({ autoCreateForeignKeyIndices: true })
    const adapter = mem.adapters.createPg()
    database = new PostgresDatabase(new adapter.Pool())
    await runIdentityMigrations(database, process.cwd())
    // Sunday 29 Nov 2026, 10:00 Riyadh.
    clock = new Date("2026-11-29T07:00:00.000Z")
    service = new InstagramService(database, () => clock)
    graph = fakeGraph()
    notes = []
  })

  const agent = () =>
    new InstagramAgent(
      database,
      service,
      null,
      writer,
      async () => ({ text: "- pos: 99 ريال شهرياً", values: [99] }),
      async (text) => {
        notes.push(text)
      },
      () => clock
    )
  const publisher = () =>
    new InstagramPublisher(
      service,
      graph as any,
      async () => app.open,
      async (text) => {
        notes.push(text)
      },
      () => clock
    )

  it("connects Madar's account once through the Meta app", async () => {
    const connector = new InstagramConnector(service, graph as any, async () => app)
    const url = new URL(await connector.start("owner"))
    const state = url.searchParams.get("state")!
    expect(state.startsWith(INSTAGRAM_STATE_PREFIX)).toBe(true)
    expect(url.searchParams.get("scope")).toContain("instagram_content_publish")
    expect(url.searchParams.get("redirect_uri")).toBe(app.redirectUri)

    expect(await connector.complete("code-1", state)).toBe("connected")
    expect(await service.connection()).toMatchObject({
      connected: true,
      igUsername: "madar.my",
      pageName: "مدار",
    })
    expect(await service.credentials()).toEqual({
      igUserId: "ig-1",
      sealedPageToken: "sealed:page-token",
    })
    // A state works once.
    expect(await connector.complete("code-1", state)).toBe("state_invalid")
  })

  it("writes the week's posts on Sunday morning, once, and tells the team", async () => {
    expect(await agent().tick()).toBe(3)
    clock = new Date("2026-11-29T12:00:00.000Z")
    expect(await agent().tick()).toBe(0)
    const posts = await service.list()
    expect(posts).toHaveLength(3)
    expect(posts.every((post) => post.status === "draft" && post.weekStart === "2026-11-29")).toBe(
      true
    )
    expect(notes[0]).toContain("(3)")
    const news = posts.find((post) => post.kind === "news")!
    // Only real feature keys are kept.
    expect(news.featureKeys).toEqual(["campaign-coach"])
    // Hashtags always start with #.
    expect(news.hashtags).toEqual(["#مدار", "#كاشير"])
    // A headline too long for the image is flagged for the reviewer.
    const long = posts.find((post) => post.design.titleTop.startsWith("عنوان طويل"))!
    expect(long.warnings.join(" ")).toContain("العنوان الأول")
  })

  it("approval needs the image, then schedules Sun/Tue/Thu at 20:00 Riyadh", async () => {
    await agent().tick()
    const posts = await service.list()
    await expect(service.approveWeek("2026-11-29", "owner")).rejects.toThrow()
    for (const post of posts) await service.setImage(post.id, `https://cdn/${post.id}.jpg`)
    const approved = await service.approveWeek("2026-11-29", "owner")
    expect(approved.map((post) => post.scheduledAt).sort()).toEqual([
      "2026-11-29T17:00:00.000Z",
      "2026-12-01T17:00:00.000Z",
      "2026-12-03T17:00:00.000Z",
    ])
    // Editing a post drops its image, so the new words get a new one.
    const edited = await service.update(approved[0].id, { caption: "جديد" })
    expect(edited.imageUrl).toBeNull()
  })

  it("posts what's due with caption, hashtags and the first comment", async () => {
    const connector = new InstagramConnector(service, graph as any, async () => app)
    const state = new URL(await connector.start("owner")).searchParams.get("state")!
    await connector.complete("code-1", state)
    await agent().tick()
    for (const post of await service.list())
      await service.setImage(post.id, `https://cdn/${post.id}.jpg`)
    await service.approveWeek("2026-11-29", "owner")

    expect(await publisher().tick()).toBe(0)
    clock = new Date("2026-11-29T17:01:00.000Z")
    expect(await publisher().tick()).toBe(1)
    const publish = graph.calls.find((call) => call[0] === "publish")[1]
    expect(publish).toMatchObject({ igUserId: "ig-1", token: "page-token" })
    expect(publish.caption).toBe("كابشن المنشور\n\n#مدار #كاشير")
    expect(
      graph.calls.some((call) => call[0] === "comment" && call[3] === "وش أكثر شي يتعبك؟ 👇")
    ).toBe(true)
    const published = (await service.list()).filter((post) => post.status === "published")
    expect(published).toHaveLength(1)
    expect(published[0].permalink).toBe("https://instagram.com/p/x")

    await publisher().refreshInsights()
    expect((await service.get(published[0].id)).insights?.reach).toBe(120)
  })

  it("a refused post is retried, and after the third failure the team is told", async () => {
    const connector = new InstagramConnector(service, graph as any, async () => app)
    const state = new URL(await connector.start("owner")).searchParams.get("state")!
    await connector.complete("code-1", state)
    await agent().tick()
    const [first] = await service.list()
    await service.setImage(first.id, "https://cdn/a.jpg")
    await service.publishNow(first.id)
    graph.failNext(3)
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await publisher().tick()
      clock = new Date(clock.getTime() + 11 * 60_000)
    }
    const post = await service.get(first.id)
    expect(post.status).toBe("failed")
    expect(post.lastError).toContain("Media download")
    expect(notes.some((note) => note.includes("تعذر نشر منشور إنستقرام"))).toBe(true)
  })

  it("flags words too long for their place on the image", () => {
    expect(
      designWarnings("c", {
        titleTop: "قصير",
        titleBottom: "قصير",
        cta: "ابدأ",
        cards: [{ icon: "pos", title: "عنوان بطاقة طويل جداً", text: "قصير" }],
      })
    ).toEqual(["عنوان البطاقة أطول من المساحة (21/14 حرفاً)"])
  })

  it("the admin addresses need CRM access and upload the image under its own name", async () => {
    await agent().tick()
    const [post] = await service.list()
    let sent: any = null
    const uploads: string[] = []
    const call = (permissions: string[], method: string, path: string, body: unknown = {}) =>
      handleAdminInstagramRoute({
        method,
        url: new URL(`http://x/v1/platform-admin/instagram${path}`),
        actor: { userId: "u1", isPlatformAdmin: true, platformPermissions: permissions } as any,
        service,
        connector: null,
        publisher: null,
        agent: null,
        uploadImage: async (_body, key) => {
          uploads.push(key)
          return `https://cdn/${key}`
        },
        readJsonBody: async () => body,
        send: (status, payload) => {
          sent = { status, payload }
          return true
        },
      })
    await expect(call(["billing:view"], "GET", "/posts")).rejects.toThrow()
    await call(["crm:manage"], "POST", `/posts/${post.id}/image`, {
      contentType: "image/jpeg",
      dataBase64: "A".repeat(400),
    })
    expect(sent.status).toBe(200)
    expect(uploads[0].startsWith(`${post.id}-`)).toBe(true)
    expect(sent.payload.imageUrl).toContain(post.id)
  })
})
