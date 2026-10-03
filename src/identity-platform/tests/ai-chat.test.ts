// @vitest-environment node

import { randomUUID } from "node:crypto"

import { newDb } from "pg-mem"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { AuthenticatedActor } from "../application/dto/identity-dtos"
import { IdentityError } from "../application/errors/IdentityError"
import { runIdentityMigrations } from "../infrastructure/postgres/migration-runner"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import { CampaignAnalyticsEngine } from "../campaigns/analytics-engine"
import { CampaignsPerformanceAggregationService } from "../campaigns/performance-service"
import { ChannelsAggregationService } from "../channels/channels-service"
import { OrdersAggregationService } from "../orders/service"
import { StoresAggregationService } from "../stores/service"
import { PosInvoicesService } from "../pos/invoices-service"
import { PosShiftsService } from "../pos/shifts-service"
import { PosPaymentMethodsService } from "../pos/payment-methods-service"
import { TaxRatesService } from "../tax/tax-rates-service"
import { ReportsService } from "../reports/service"
import { AiChatService } from "../ai-chat/service"
import { buildToolsForCategory } from "../ai-chat/tools"
import type { AiChatLlmClientLike } from "../ai-chat/llm-client"

let database: PostgresDatabase
let service: AiChatService
let mockRunChatTurn: ReturnType<typeof vi.fn<AiChatLlmClientLike["runChatTurn"]>>

const ORG_A = randomUUID()
const ORG_B = randomUUID()
const USER_A = randomUUID()
const WORKSPACE_A = randomUUID()

function actor(overrides: Partial<AuthenticatedActor> = {}): AuthenticatedActor {
  return {
    userId: USER_A,
    sessionId: randomUUID(),
    organizationId: ORG_A,
    workspaceId: null,
    roles: ["owner"],
    modulePermissions: ["ai:view"],
    ...overrides,
  }
}

async function setApplicationEnabled(
  organizationId: string,
  key: "advertisingEnabled" | "ecommerceEnabled" | "posEnabled" | "madarAppsEnabled",
  value: boolean
) {
  const existing = await database.query<{ settings: Record<string, unknown> }>(
    "select settings from organizations where id = $1",
    [organizationId]
  )
  const merged = { ...(existing.rows[0]?.settings ?? {}), [key]: value }
  await database.query("update organizations set settings = $2::jsonb where id = $1", [
    organizationId,
    JSON.stringify(merged),
  ])
}

async function setOrgSettingValue(organizationId: string, key: string, value: unknown) {
  const existing = await database.query<{ settings: Record<string, unknown> }>(
    "select settings from organizations where id = $1",
    [organizationId]
  )
  const merged = { ...(existing.rows[0]?.settings ?? {}), [key]: value }
  await database.query("update organizations set settings = $2::jsonb where id = $1", [
    organizationId,
    JSON.stringify(merged),
  ])
}

async function seedInvoice(input: {
  organizationId: string
  workspaceId: string | null
  totalAmount: number
}) {
  await database.query(
    `insert into pos_invoices (
      id, organization_id, workspace_id, invoice_number, status, payment_method_code,
      subtotal_amount, discount_amount, tax_amount, total_amount, created_at, updated_at
    ) values ($1,$2,$3,$4,'completed','cash',$5,0,0,$5,now(),now())`,
    [
      randomUUID(),
      input.organizationId,
      input.workspaceId,
      `INV-${randomUUID().slice(0, 8)}`,
      input.totalAmount,
    ]
  )
}

async function seedInvoiceWithProduct(input: {
  organizationId: string
  workspaceId: string | null
  productName: string
  quantity: number
  lineTotal: number
}) {
  const invoiceId = randomUUID()
  await database.query(
    `insert into pos_invoices (
      id, organization_id, workspace_id, invoice_number, status, payment_method_code,
      subtotal_amount, discount_amount, tax_amount, total_amount, created_at, updated_at
    ) values ($1,$2,$3,$4,'completed','cash',$5,0,0,$5,now(),now())`,
    [
      invoiceId,
      input.organizationId,
      input.workspaceId,
      `INV-${invoiceId.slice(0, 8)}`,
      input.lineTotal,
    ]
  )
  await database.query(
    `insert into pos_invoice_items (id, invoice_id, product_id, product_name, unit_price, quantity, line_total)
     values ($1,$2,null,$3,$4,$5,$6)`,
    [
      randomUUID(),
      invoiceId,
      input.productName,
      input.lineTotal / input.quantity,
      input.quantity,
      input.lineTotal,
    ]
  )
}

async function seedShift(input: {
  organizationId: string
  workspaceId: string
  cashierUserId: string
  shiftNumber: number
  status: "open" | "closed"
  openedAt: string
  closedAt: string | null
}) {
  await database.query(
    `insert into pos_shifts (
      id, organization_id, workspace_id, cashier_user_id, status, shift_number,
      opening_cash_amount, opened_at, closing_cash_amount, closed_at
    ) values ($1,$2,$3,$4,$5,$6,500,$7,$8,$9)`,
    [
      randomUUID(),
      input.organizationId,
      input.workspaceId,
      input.cashierUserId,
      input.status,
      input.shiftNumber,
      input.openedAt,
      input.status === "closed" ? 620 : null,
      input.closedAt,
    ]
  )
}

beforeEach(async () => {
  const mem = newDb({ autoCreateForeignKeyIndices: true })
  const adapter = mem.adapters.createPg()
  database = new PostgresDatabase(new adapter.Pool())
  await runIdentityMigrations(database, process.cwd())

  await database.query(
    `insert into users (id, email, password_hash, full_name, email_verified_at)
     values ($1, 'ai-chat-test@madar.test', 'hash', 'AI Chat Test', now())`,
    [USER_A]
  )
  await database.query(
    `insert into organizations (id, name, owner_user_id, status) values ($1, 'Org A', $2, 'active')`,
    [ORG_A, USER_A]
  )
  await database.query(
    `insert into organizations (id, name, owner_user_id, status) values ($1, 'Org B', $2, 'active')`,
    [ORG_B, USER_A]
  )
  await database.query(
    `insert into workspaces (id, organization_id, name, status) values ($1, $2, 'Main', 'active')`,
    [WORKSPACE_A, ORG_A]
  )

  const posPaymentMethodsService = new PosPaymentMethodsService(database)
  const taxRatesService = new TaxRatesService(database)
  const posInvoicesService = new PosInvoicesService(
    database,
    posPaymentMethodsService,
    taxRatesService
  )
  const posShiftsService = new PosShiftsService(
    database,
    posInvoicesService,
    posPaymentMethodsService
  )

  mockRunChatTurn = vi.fn<AiChatLlmClientLike["runChatTurn"]>().mockResolvedValue({
    text: "ok",
    toolCalls: [],
    stopReason: "end_turn",
  })
  const mockLlmClient: AiChatLlmClientLike = { runChatTurn: mockRunChatTurn }

  const campaignPerformanceService = new CampaignsPerformanceAggregationService(database)
  const channelsService = new ChannelsAggregationService(database)

  service = new AiChatService(
    database,
    {
      db: database,
      campaignPerformanceService,
      channelsService,
      campaignAnalyticsEngine: new CampaignAnalyticsEngine(
        campaignPerformanceService,
        channelsService
      ),
      ordersAggregationService: new OrdersAggregationService(database),
      storesAggregationService: new StoresAggregationService(database),
      posInvoicesService,
      posShiftsService,
      reportsService: new ReportsService(database),
    },
    mockLlmClient,
    "claude-sonnet-5"
  )
})

describe("ai-chat: per-application scoping", () => {
  it("rejects creating a session for a category the org hasn't activated", async () => {
    await expect(service.createSession(actor(), "pos")).rejects.toThrow(IdentityError)
  })

  it("allows creating a session once the category is activated", async () => {
    await setApplicationEnabled(ORG_A, "posEnabled", true)
    const session = await service.createSession(actor(), "pos")
    expect(session.applicationCategory).toBe("pos")
    expect(session.organizationId).toBe(ORG_A)
  })

  it("allows a session while a free trial is active, even without a real approval", async () => {
    await setApplicationEnabled(ORG_A, "posEnabled", true)
    await setOrgSettingValue(
      ORG_A,
      "posTrialEndsAt",
      new Date(Date.now() + 86_400_000).toISOString()
    )
    const session = await service.createSession(actor(), "pos")
    expect(session.applicationCategory).toBe("pos")
  })

  it("treats a lapsed trial as inactive even though *Enabled is still true in storage", async () => {
    await setApplicationEnabled(ORG_A, "posEnabled", true)
    await setOrgSettingValue(
      ORG_A,
      "posTrialEndsAt",
      new Date(Date.now() - 3_600_000).toISOString()
    )
    await expect(service.createSession(actor(), "pos")).rejects.toThrow(IdentityError)
  })

  it("rejects an actor whose role omits ai:view even though the category is activated", async () => {
    await setApplicationEnabled(ORG_A, "advertisingEnabled", true)
    await expect(
      service.createSession(actor({ modulePermissions: [] }), "advertising")
    ).rejects.toThrow(IdentityError)
  })

  it("never offers tools from another category, even when both are activated", () => {
    const advertisingTools = buildToolsForCategory("advertising").map((tool) => tool.name)
    expect(advertisingTools).not.toContain("get_pos_invoices_summary")
    expect(advertisingTools).not.toContain("list_orders")
    expect(advertisingTools.length).toBeGreaterThan(0)
  })

  it("exposes the full campaign analytics tool set under advertising only", () => {
    const advertisingTools = buildToolsForCategory("advertising").map((tool) => tool.name)
    expect(advertisingTools).toEqual(
      expect.arrayContaining([
        "get_campaign_summary",
        "compare_campaign_periods",
        "get_channel_comparison",
        "get_top_campaigns",
        "get_campaign_declines",
        "get_campaign_anomalies",
        "identify_performance_drivers",
        "generate_campaign_recommendations",
        "get_channel_spend_trend",
      ])
    )
    for (const category of ["pos", "ecommerce", "madarApps"] as const) {
      const names = buildToolsForCategory(category).map((tool) => tool.name)
      expect(names).not.toContain("generate_campaign_recommendations")
      expect(names).not.toContain("compare_campaign_periods")
    }
  })

  it("re-checks application-enabled on every send, not just at session creation", async () => {
    await setApplicationEnabled(ORG_A, "posEnabled", true)
    const session = await service.createSession(actor(), "pos")

    await setApplicationEnabled(ORG_A, "posEnabled", false)
    const reply = await service.sendMessage(actor(), session.id, "ما هي المبيعات اليوم؟")

    expect(reply.role).toBe("system_notice")
    expect(mockRunChatTurn).not.toHaveBeenCalled()
  })

  it("rejects reading/sending into another organization's session", async () => {
    await setApplicationEnabled(ORG_A, "advertisingEnabled", true)
    const session = await service.createSession(actor(), "advertising")

    const otherOrgActor = actor({ organizationId: ORG_B, modulePermissions: ["ai:view"] })
    await expect(service.listMessages(otherOrgActor, session.id)).rejects.toThrow(IdentityError)
    await expect(service.sendMessage(otherOrgActor, session.id, "hi")).rejects.toThrow(
      IdentityError
    )
  })

  it("grounds the assistant's stored message in the real tool result, not invented text", async () => {
    await setApplicationEnabled(ORG_A, "posEnabled", true)
    await seedInvoice({ organizationId: ORG_A, workspaceId: WORKSPACE_A, totalAmount: 321 })
    const session = await service.createSession(actor(), "pos")

    mockRunChatTurn.mockImplementation(async (input) => {
      const toolResultText = await input.executeTool("get_pos_invoices_summary", {})
      return {
        text: `summary: ${toolResultText}`,
        toolCalls: [{ tool: "get_pos_invoices_summary", input: {}, outputSummary: toolResultText }],
        stopReason: "end_turn",
      }
    })

    const reply = await service.sendMessage(actor(), session.id, "كم إجمالي المبيعات؟")

    expect(reply.content).toContain("321")
    expect(reply.toolCalls?.[0]?.outputSummary).toContain("321")
  })

  it("populates the structured envelope from the real tool output when an analytics tool is called", async () => {
    await setApplicationEnabled(ORG_A, "advertisingEnabled", true)
    const session = await service.createSession(actor(), "advertising")

    mockRunChatTurn.mockImplementation(async (input) => {
      const toolResultText = await input.executeTool("get_campaign_summary", {})
      return {
        text: `summary: ${toolResultText}`,
        toolCalls: [{ tool: "get_campaign_summary", input: {}, outputSummary: toolResultText }],
        stopReason: "end_turn",
      }
    })

    const reply = await service.sendMessage(actor(), session.id, "ما ملخص أداء حملاتي؟")

    expect(reply.structured).not.toBeNull()
    expect(reply.structured!.type).toBe("analytics_response")
    expect(reply.structured!.metrics.length).toBeGreaterThan(0)

    // Persisted, not just returned in-memory -- re-reading the message from the repository must
    // round-trip the same structured envelope.
    const assistantMessage = (await service.listMessages(actor(), session.id)).find(
      (m) => m.role === "assistant"
    )
    expect(assistantMessage?.structured).not.toBeNull()
    expect(assistantMessage?.structured?.type).toBe("analytics_response")
  })

  it("leaves the structured envelope null when no analytics tool was called this turn", async () => {
    await setApplicationEnabled(ORG_A, "posEnabled", true)
    await seedInvoice({ organizationId: ORG_A, workspaceId: WORKSPACE_A, totalAmount: 100 })
    const session = await service.createSession(actor(), "pos")

    mockRunChatTurn.mockResolvedValue({
      text: "لا أملك معلومات كافية.",
      toolCalls: [],
      stopReason: "end_turn",
    })

    const reply = await service.sendMessage(actor(), session.id, "ما هي سياسة الإرجاع؟")
    expect(reply.structured).toBeNull()
  })

  it("populates a pos-domain structured chart when get_top_selling_products is called", async () => {
    await setApplicationEnabled(ORG_A, "posEnabled", true)
    await seedInvoiceWithProduct({
      organizationId: ORG_A,
      workspaceId: WORKSPACE_A,
      productName: "Product A",
      quantity: 4,
      lineTotal: 400,
    })
    const session = await service.createSession(actor(), "pos")

    mockRunChatTurn.mockImplementation(async (input) => {
      const toolResultText = await input.executeTool("get_top_selling_products", {})
      return {
        text: `top products: ${toolResultText}`,
        toolCalls: [{ tool: "get_top_selling_products", input: {}, outputSummary: toolResultText }],
        stopReason: "end_turn",
      }
    })

    const reply = await service.sendMessage(actor(), session.id, "ما هي أفضل المنتجات مبيعًا؟")

    expect(reply.structured).not.toBeNull()
    expect(reply.structured!.source).toEqual({ domain: "pos" })
    expect(reply.structured!.charts).toHaveLength(1)
    expect(reply.structured!.charts[0].series[0].data[0]).toEqual({
      label: "Product A",
      value: 400,
    })
  })

  // This is the exact regression reported against production: a question like "إيش أفضل وردية؟"
  // left the LLM with nothing but a raw array of shift records to narrate, and it fell back to
  // dumping them as a pipe-delimited pseudo-table in plain prose. Proving this end-to-end (real
  // seeded shift rows -> service.sendMessage -> persisted structured.tables) is what verifies the
  // fix structurally, not just that response-formatter.ts's unit tests pass in isolation.
  it("renders list_pos_shifts as a ReportTable with Arabic dates in the org's own timezone, never raw ISO or pipe-delimited text", async () => {
    await database.query("update organizations set timezone = $2 where id = $1", [
      ORG_A,
      "Asia/Riyadh",
    ])
    await setApplicationEnabled(ORG_A, "posEnabled", true)
    await seedShift({
      organizationId: ORG_A,
      workspaceId: WORKSPACE_A,
      cashierUserId: USER_A,
      shiftNumber: 1,
      status: "closed",
      openedAt: "2026-09-14T06:00:00.000Z",
      closedAt: "2026-09-22T17:32:00.000Z",
    })
    await seedShift({
      organizationId: ORG_A,
      workspaceId: WORKSPACE_A,
      cashierUserId: USER_A,
      shiftNumber: 2,
      status: "open",
      openedAt: "2026-09-22T17:32:00.000Z",
      closedAt: null,
    })
    const session = await service.createSession(actor(), "pos")

    mockRunChatTurn.mockImplementation(async (input) => {
      const toolResultText = await input.executeTool("list_pos_shifts", {})
      return {
        text: "تم العثور على وردّيتين خلال الفترة المحددة.",
        toolCalls: [{ tool: "list_pos_shifts", input: {}, outputSummary: toolResultText }],
        stopReason: "end_turn",
      }
    })

    const reply = await service.sendMessage(actor(), session.id, "إيش أفضل وردية؟")

    expect(reply.structured).not.toBeNull()
    expect(reply.structured!.tables).toHaveLength(1)
    const table = reply.structured!.tables[0]
    expect(table.rows).toHaveLength(2)

    const closedRow = table.rows.find((r) => r.status === "مغلقة")!
    expect(closedRow.shiftNumber).toBe("#1")
    expect(closedRow.closedAt).toContain("سبتمبر")
    expect(closedRow.closedAt).not.toMatch(/\d{4}-\d{2}-\d{2}/)
    expect(closedRow.closedAt).not.toMatch(/\|/)

    const openRow = table.rows.find((r) => r.status === "مفتوحة")!
    expect(openRow.shiftNumber).toBe("#2")
    expect(openRow.closedAt).toBeNull()

    // No raw pipe-delimited record dump anywhere in the final content either -- the chat prose
    // itself now only needs a short summary, since the table carries the record-level detail.
    expect(reply.content).not.toMatch(/\|.*\|.*\|/)
  })

  it("instructs the model never to hand-draw pipe tables and to keep prose brief when a tool returns a record list", async () => {
    await setApplicationEnabled(ORG_A, "posEnabled", true)
    const session = await service.createSession(actor(), "pos")

    let capturedSystemPrompt = ""
    mockRunChatTurn.mockImplementation(async (input) => {
      capturedSystemPrompt = input.systemPrompt
      return { text: "ok", toolCalls: [], stopReason: "end_turn" }
    })

    await service.sendMessage(actor(), session.id, "مرحبا")

    expect(capturedSystemPrompt).toContain("|")
    expect(capturedSystemPrompt).toMatch(/جدول منفصل ضمن واجهة المحادثة/)
  })
})
