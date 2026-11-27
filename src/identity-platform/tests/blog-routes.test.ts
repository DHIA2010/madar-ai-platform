/* eslint-disable @typescript-eslint/no-explicit-any -- test actors are built loosely */
import { newDb } from "pg-mem"
import { beforeEach, describe, expect, it } from "vitest"

import { BlogService } from "../blog/service"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import { runIdentityMigrations } from "../infrastructure/postgres/migration-runner"
import { handleAdminBlogRoute, handlePublicBlogRoute } from "../interfaces/rest/blog-routes"

// The blog's web addresses: the public site sees only published articles and can record reader
// events; Madar Admin's blog needs CRM (marketing) access.

describe("blog routes", () => {
  let blog: BlogService
  let clock: Date
  let sent: { status: number; body: any } | null

  const send = (status: number, body: unknown) => {
    sent = { status, body }
    return true
  }
  const publicCall = (method: string, pathname: string, body: unknown = {}) =>
    handlePublicBlogRoute({
      method,
      pathname,
      blog,
      readJsonBody: async () => body,
      send,
      limit: async () => true,
    })
  const staff = (permissions: string[]) =>
    ({ userId: "u1", isPlatformAdmin: true, platformPermissions: permissions }) as any
  const adminCall = (actor: any, method: string, path: string, body: unknown = {}) =>
    handleAdminBlogRoute({
      method,
      url: new URL(`http://x/v1/platform-admin/blog${path}`),
      actor,
      blog,
      agent: null,
      readJsonBody: async () => body,
      send,
    })

  beforeEach(async () => {
    const mem = newDb({ autoCreateForeignKeyIndices: true })
    const adapter = mem.adapters.createPg()
    const database = new PostgresDatabase(new adapter.Pool())
    await runIdentityMigrations(database, process.cwd())
    clock = new Date("2026-11-29T06:00:00.000Z")
    blog = new BlogService(database, () => clock)
    sent = null
  })

  it("only published articles reach the site", async () => {
    const draft = await blog.createDraft({
      slug: "pos-guide",
      title: "دليل الكاشير",
      excerpt: "وصف",
      category: "pos",
      body: [{ type: "p", text: "نص" }],
    })
    await publicCall("GET", "/v1/public/blog/posts")
    expect(sent?.body.posts).toEqual([])
    await publicCall("GET", "/v1/public/blog/posts/pos-guide")
    expect(sent?.status).toBe(404)

    await blog.publishNow(draft.id)
    await publicCall("GET", "/v1/public/blog/posts/pos-guide")
    expect(sent?.status).toBe(200)
    expect(sent?.body.title).toBe("دليل الكاشير")
  })

  it("records a reader event and refuses a malformed one", async () => {
    await publicCall("POST", "/v1/public/blog/events", { slug: "pos-guide", event: "view" })
    expect(sent?.status).toBe(200)
    await publicCall("POST", "/v1/public/blog/events", { slug: "Bad Slug", event: "view" })
    expect(sent?.status).toBe(400)
    await publicCall("POST", "/v1/public/blog/events", { slug: "pos-guide", event: "hack" })
    expect(sent?.status).toBe(400)
  })

  it("Madar Admin's blog needs CRM access", async () => {
    await expect(adminCall(staff(["billing:view"]), "GET", "/posts")).rejects.toThrow()
    await adminCall(staff(["crm:manage"]), "POST", "/posts", {
      slug: "new-article",
      title: "مقال جديد للتجربة",
      excerpt: "وصف المقال الجديد",
      category: "booking",
      body: [{ type: "p", text: "نص" }],
    })
    expect(sent?.status).toBe(201)
    const id = sent?.body.id
    await adminCall(staff(["crm:manage"]), "POST", `/posts/${id}/approve`)
    expect(sent?.body.scheduledAt).toBe("2026-11-30T07:00:00.000Z")
    await adminCall(staff(["crm:manage"]), "PATCH", "/settings", {
      publishDays: [0],
      publishHour: 9,
    })
    expect(sent?.body.publishDays).toEqual([0])
  })
})
