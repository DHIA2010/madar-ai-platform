// @vitest-environment node
//
// Covers the saved sale-notes library (migration 110): GET/POST /v1/pos/saved-notes, PATCH/DELETE
// /v1/pos/saved-notes/:id, and notesLines round-tripping through POST /v1/pos/invoices and
// /v1/pos/held-orders (PosSavedNotesService, mirroring tax-rates.http.test.ts's own coverage).

import type { AddressInfo } from "node:net"

import { newDb } from "pg-mem"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { createIdentityPlatform } from "../bootstrap/create-identity-platform"
import { runIdentityMigrations, runSqlFile } from "../infrastructure/postgres/migration-runner"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import { createIdentityApiServer } from "../interfaces/rest/server"

let database: PostgresDatabase
let server: ReturnType<typeof createIdentityApiServer>
let baseUrl = ""
let container: ReturnType<typeof createIdentityPlatform>

beforeEach(async () => {
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000"
  process.env.IDENTITY_PLATFORM_TOKEN_HASH_SECRET = "12345678901234567890123456789012"

  const mem = newDb({ autoCreateForeignKeyIndices: true })
  const adapter = mem.adapters.createPg()
  database = new PostgresDatabase(new adapter.Pool())

  await runIdentityMigrations(database, process.cwd())
  await runSqlFile(
    database,
    `${process.cwd()}/src/project-platform/migrations/001_project_core.sql`
  )

  container = createIdentityPlatform({ mode: "memory" })
  ;(container.infrastructure as { database?: PostgresDatabase }).database = database

  server = createIdentityApiServer(container)
  await new Promise<void>((resolve) => server.listen(0, resolve))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  }
  await database.end()
})

async function signIn(email: string, orgName: string) {
  const registerResponse = await fetch(`${baseUrl}/v1/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email,
      password: "VeryStrongPassword123!",
      fullName: "Saved Notes Test",
      organizationName: orgName,
    }),
  })
  const registration = (await registerResponse.json()) as { verificationToken: string }

  await fetch(`${baseUrl}/v1/auth/verify-email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: registration.verificationToken }),
  })

  const loginResponse = await fetch(`${baseUrl}/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "VeryStrongPassword123!" }),
  })
  const login = (await loginResponse.json()) as { session: { accessToken: string } }
  const actor = await container.commands.resolveActorFromAccessToken(login.session.accessToken)

  await database.query(
    `insert into users (id, email, password_hash, full_name, email_verified_at)
     values ($1, $2, 'hash', 'Saved Notes Test', now()) on conflict (id) do nothing`,
    [actor.userId, email]
  )
  await database.query(
    `insert into organizations (id, name, owner_user_id, status)
     values ($1, $2, $3, 'active') on conflict (id) do nothing`,
    [actor.organizationId, orgName, actor.userId]
  )
  if (actor.workspaceId) {
    await database.query(
      `insert into workspaces (id, organization_id, name, status)
       values ($1, $2, $3, 'active') on conflict (id) do nothing`,
      [actor.workspaceId, actor.organizationId, `${orgName} Workspace`]
    )
  }

  return { token: login.session.accessToken, actor }
}

function authHeaders(token: string) {
  return { "content-type": "application/json", authorization: `Bearer ${token}` }
}

async function listSavedNotes(token: string) {
  const response = await fetch(`${baseUrl}/v1/pos/saved-notes`, { headers: authHeaders(token) })
  return { status: response.status, body: (await response.json()) as Record<string, unknown> }
}

async function createSavedNote(token: string, body: Record<string, unknown>) {
  const response = await fetch(`${baseUrl}/v1/pos/saved-notes`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  })
  return { status: response.status, body: (await response.json()) as Record<string, unknown> }
}

async function updateSavedNote(token: string, id: string, body: Record<string, unknown>) {
  const response = await fetch(`${baseUrl}/v1/pos/saved-notes/${id}`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  })
  return { status: response.status, body: (await response.json()) as Record<string, unknown> }
}

async function deleteSavedNote(token: string, id: string) {
  const response = await fetch(`${baseUrl}/v1/pos/saved-notes/${id}`, {
    method: "DELETE",
    headers: authHeaders(token),
  })
  return { status: response.status, body: (await response.json()) as Record<string, unknown> }
}

async function clearDefaultSavedNote(token: string) {
  const response = await fetch(`${baseUrl}/v1/pos/saved-notes/clear-default`, {
    method: "POST",
    headers: authHeaders(token),
  })
  return { status: response.status, body: (await response.json()) as Record<string, unknown> }
}

const THANK_YOU_LINES = [
  { text: "Thank you!", bold: true, align: "center", fontSize: 14, color: "#0d1b3e" },
  { text: "012-345-6789", bold: false, align: "center", fontSize: 12, color: "#0d1b3e" },
]

describe("POS saved notes library", () => {
  it("starts empty -- unlike tax rates, there is no lazily-seeded default row", async () => {
    const { token } = await signIn("notes-empty@example.com", "Notes Empty")

    const result = await listSavedNotes(token)
    expect(result.status).toBe(200)
    expect(result.body.items).toEqual([])
  })

  it("creates a note and can make it the default, unsetting the previous one", async () => {
    const { token } = await signIn("notes-create@example.com", "Notes Create")

    const first = await createSavedNote(token, {
      title: "Standard thank-you",
      lines: THANK_YOU_LINES,
      isDefault: true,
    })
    expect(first.status).toBe(201)
    expect(first.body).toMatchObject({ title: "Standard thank-you", isDefault: true })

    const second = await createSavedNote(token, {
      title: "Gift wrap note",
      lines: [
        {
          text: "Gift wrapped with care",
          bold: false,
          align: "left",
          fontSize: 12,
          color: "#0d1b3e",
        },
      ],
      isDefault: true,
    })
    expect(second.status).toBe(201)
    expect(second.body).toMatchObject({ isDefault: true })

    const list = await listSavedNotes(token)
    const items = list.body.items as Array<Record<string, unknown>>
    expect(items).toHaveLength(2)
    const defaults = items.filter((item) => item.isDefault === true)
    expect(defaults).toHaveLength(1)
    expect(defaults[0]).toMatchObject({ title: "Gift wrap note" })
  })

  it("refuses to delete the default note", async () => {
    const { token } = await signIn("notes-delete-default@example.com", "Notes Delete Default")
    const created = await createSavedNote(token, {
      title: "Only note",
      lines: THANK_YOU_LINES,
      isDefault: true,
    })

    const deleted = await deleteSavedNote(token, created.body.id as string)
    expect(deleted.status).toBe(409)
    expect(deleted.body).toMatchObject({ code: "SAVED_NOTE_CANNOT_DELETE_DEFAULT" })
  })

  it("refuses to unset a note's default status directly", async () => {
    const { token } = await signIn("notes-unset-default@example.com", "Notes Unset Default")
    const created = await createSavedNote(token, {
      title: "Only note",
      lines: THANK_YOU_LINES,
      isDefault: true,
    })

    const unset = await updateSavedNote(token, created.body.id as string, { isDefault: false })
    expect(unset.status).toBe(409)
    expect(unset.body).toMatchObject({ code: "SAVED_NOTE_CANNOT_UNSET_DEFAULT" })
  })

  // The Settings page's own "Without a note" row (NotesSettings.tsx) -- unlike a PATCH on the
  // note itself, this is explicitly allowed to leave the organization with no default note at
  // all, since that's a normal resting state for this feature.
  it("pins 'no note' as the default via clear-default, bypassing the usual unset guard", async () => {
    const { token } = await signIn("notes-clear-default@example.com", "Notes Clear Default")
    const created = await createSavedNote(token, {
      title: "Only note",
      lines: THANK_YOU_LINES,
      isDefault: true,
    })

    const cleared = await clearDefaultSavedNote(token)
    expect(cleared.status).toBe(200)

    const list = await listSavedNotes(token)
    const items = list.body.items as Array<Record<string, unknown>>
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ id: created.body.id, isDefault: false })

    // A no-op, not an error, when nothing was default to begin with.
    const clearedAgain = await clearDefaultSavedNote(token)
    expect(clearedAgain.status).toBe(200)
  })

  it("deletes a non-default note normally", async () => {
    const { token } = await signIn("notes-delete-normal@example.com", "Notes Delete Normal")
    const created = await createSavedNote(token, {
      title: "Extra note",
      lines: THANK_YOU_LINES,
      isDefault: false,
    })

    const deleted = await deleteSavedNote(token, created.body.id as string)
    expect(deleted.status).toBe(200)

    const list = await listSavedNotes(token)
    expect((list.body.items as unknown[]).length).toBe(0)
  })

  it("rejects a note with no lines", async () => {
    const { token } = await signIn("notes-invalid@example.com", "Notes Invalid")
    const response = await createSavedNote(token, { title: "Empty", lines: [], isDefault: false })
    expect(response.status).toBe(400)
  })

  it("refuses saved-note management for an unauthenticated request", async () => {
    const response = await fetch(`${baseUrl}/v1/pos/saved-notes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "x", lines: THANK_YOU_LINES, isDefault: false }),
    })
    expect(response.status).toBe(401)
  })

  // The flattened plain-text `notes` mirror is computed client-side (CashierPage.tsx's
  // notePayload()) and sent alongside notesLines -- this test calls the route the same way a real
  // client does, with both fields already filled in together, rather than expecting the backend
  // to derive one from the other.
  it("persists a formatted note snapshot on a sale, alongside its flattened plain-text mirror", async () => {
    const { token } = await signIn("notes-invoice@example.com", "Notes Invoice")
    await fetch(`${baseUrl}/v1/pos/payment-methods/cash`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify({ enabled: true, feePercent: 0, merchantId: null, apiKey: null }),
    })

    const created = await fetch(`${baseUrl}/v1/pos/invoices`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({
        customerName: null,
        customerPhone: null,
        customerId: null,
        payments: [{ paymentMethodCode: "cash", amount: 115 }],
        discountAmount: 0,
        notes: "Thank you!\n012-345-6789",
        notesLines: THANK_YOU_LINES,
        items: [{ productId: null, productName: "منتج", unitPrice: 100, quantity: 1 }],
      }),
    })
    const invoice = (await created.json()) as Record<string, unknown>

    expect(created.status).toBe(201)
    expect(invoice.notesLines).toEqual(THANK_YOU_LINES)
    expect(invoice.notes).toBe("Thank you!\n012-345-6789")
  })

  it("round-trips notesLines through a held order", async () => {
    const { token, actor } = await signIn("notes-held@example.com", "Notes Held")

    const held = await fetch(`${baseUrl}/v1/pos/held-orders`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({
        workspaceId: actor.workspaceId,
        customerName: null,
        customerPhone: null,
        discountAmount: 0,
        notes: "Thank you!\n012-345-6789",
        notesLines: THANK_YOU_LINES,
        items: [{ productId: null, productName: "منتج", unitPrice: 50, quantity: 1 }],
      }),
    })
    expect(held.status).toBe(201)
    const heldBody = (await held.json()) as Record<string, unknown>
    expect(heldBody.notesLines).toEqual(THANK_YOU_LINES)

    const list = await fetch(`${baseUrl}/v1/pos/held-orders?workspaceId=${actor.workspaceId}`, {
      headers: authHeaders(token),
    })
    const listBody = (await list.json()) as { items: Array<Record<string, unknown>> }
    expect(listBody.items[0]).toMatchObject({ notesLines: THANK_YOU_LINES })
  })
})
