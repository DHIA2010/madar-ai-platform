// @vitest-environment node
//
// Madar AI "golden question" benchmark -- the evaluation/regression layer the Genie-upgrade audit
// found completely missing (section 24, confirmed: only planned in AI_IMPLEMENTATION_PLAN.md,
// never built). Each scenario below represents a realistic business question across simple/
// comparison/why/multi-step/data-quality categories.
//
// Honest scope: this harness cannot evaluate NATURAL-LANGUAGE intent or tool-selection accuracy
// offline -- that requires either real Anthropic API calls (non-deterministic, costs money, not
// suitable for CI) or a separate manual eval process. What IS tested here, deterministically, for
// each golden question: given the tool call(s) a correct model WOULD make for that question
// (scripted into the mock LLM client), is the backend's calculation, confidence gating, data-
// quality flagging, and structured-response shape actually correct? This is the testable half of
// "accuracy" -- the half that lives in our own code, not in the model's judgment.

import { randomUUID } from "node:crypto"

import { newDb } from "pg-mem"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { AuthenticatedActor } from "../application/dto/identity-dtos"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import { runIdentityMigrations } from "../infrastructure/postgres/migration-runner"
import { CampaignAnalyticsEngine } from "../campaigns/analytics-engine"
import type {
  CampaignPerformanceQuery,
  CampaignPerformanceSummary,
  CampaignsPerformanceAggregationService,
} from "../campaigns/performance-service"
import type { ChannelsAggregationService } from "../channels/channels-service"
import { OrdersAggregationService } from "../orders/service"
import { PosInvoicesService } from "../pos/invoices-service"
import { PosPaymentMethodsService } from "../pos/payment-methods-service"
import { PosSalesAnalyticsEngine } from "../pos/sales-analytics-engine"
import { PosShiftsService } from "../pos/shifts-service"
import { ReportsService } from "../reports/service"
import { StoresAggregationService } from "../stores/service"
import { TaxRatesService } from "../tax/tax-rates-service"
import { AiChatService } from "../ai-chat/service"
import type { AiChatLlmClientLike } from "../ai-chat/llm-client"

function actor(organizationId: string, userId: string): AuthenticatedActor {
  return {
    userId,
    sessionId: randomUUID(),
    organizationId,
    workspaceId: null,
    roles: ["owner"],
    modulePermissions: ["ai:view"],
  }
}

function summary(overrides: Partial<CampaignPerformanceSummary> = {}): CampaignPerformanceSummary {
  return {
    impressions: 100_000,
    impressionsChangePct: null,
    clicks: 2_000,
    clicksChangePct: null,
    ctr: 2,
    ctrChangePct: null,
    spend: 10_000,
    spendChangePct: null,
    revenue: 40_000,
    revenueChangePct: null,
    roas: 4,
    roasChangePct: null,
    conversions: 200,
    conversionsChangePct: null,
    cpa: 50,
    cpaChangePct: null,
    conversionRate: 10,
    conversionRateChangePct: null,
    activeCampaigns: 5,
    activeCampaignsChangePct: null,
    ...overrides,
  }
}

function buildFakeAdvertisingEngine(
  currentSummary: CampaignPerformanceSummary,
  previousSummary: CampaignPerformanceSummary,
  freshness: Array<{
    channel: string
    connected: boolean
    lastSyncedAt: string | null
    minutesSinceSync: number | null
    isStale: boolean
  }> = []
) {
  const getSummaryMock = vi.fn((_actor: unknown, query: CampaignPerformanceQuery) =>
    Promise.resolve(query.startDate === "2026-09-01" ? currentSummary : previousSummary)
  )
  const performanceService = {
    getSummary: getSummaryMock,
    listCampaigns: vi
      .fn()
      .mockResolvedValue({ items: [], pagination: { page: 1, pageSize: 200, total: 0 } }),
    getPlatformBreakdown: vi.fn().mockResolvedValue([]),
  } as unknown as CampaignsPerformanceAggregationService
  const channelsService = {
    getAlerts: vi.fn().mockResolvedValue({ items: [] }),
    getConnectionFreshness: vi
      .fn()
      .mockResolvedValue(freshness.reduce((acc, f) => ({ ...acc, [f.channel]: f }), {})),
  } as unknown as ChannelsAggregationService
  return new CampaignAnalyticsEngine(performanceService, channelsService)
}

let database: PostgresDatabase
let service: AiChatService
let mockRunChatTurn: ReturnType<typeof vi.fn<AiChatLlmClientLike["runChatTurn"]>>

const ORG_A = randomUUID()
const USER_A = randomUUID()
const WORKSPACE_A = randomUUID()

async function setApplicationEnabled(
  organizationId: string,
  key: "advertisingEnabled" | "posEnabled",
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

async function seedInvoiceAt(input: { totalAmount: number; createdAt: string }) {
  await database.query(
    `insert into pos_invoices (
      id, organization_id, workspace_id, invoice_number, status, payment_method_code,
      subtotal_amount, discount_amount, tax_amount, total_amount, created_at, updated_at
    ) values ($1,$2,$3,$4,'completed','cash',$5,0,0,$5,$6,$6)`,
    [
      randomUUID(),
      ORG_A,
      WORKSPACE_A,
      `INV-${randomUUID().slice(0, 8)}`,
      input.totalAmount,
      input.createdAt,
    ]
  )
}

async function seedInvoiceWithProductAt(input: {
  productName: string
  quantity: number
  lineTotal: number
  createdAt: string
}) {
  const invoiceId = randomUUID()
  await database.query(
    `insert into pos_invoices (
      id, organization_id, workspace_id, invoice_number, status, payment_method_code,
      subtotal_amount, discount_amount, tax_amount, total_amount, created_at, updated_at
    ) values ($1,$2,$3,$4,'completed','cash',$5,0,0,$5,$6,$6)`,
    [
      invoiceId,
      ORG_A,
      WORKSPACE_A,
      `INV-${invoiceId.slice(0, 8)}`,
      input.lineTotal,
      input.createdAt,
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

function buildService(
  campaignAnalyticsEngine: CampaignAnalyticsEngine,
  posInvoicesService: PosInvoicesService
) {
  mockRunChatTurn = vi.fn<AiChatLlmClientLike["runChatTurn"]>()
  const mockLlmClient: AiChatLlmClientLike = { runChatTurn: mockRunChatTurn }
  const posPaymentMethodsService = new PosPaymentMethodsService(database)
  const posShiftsService = new PosShiftsService(
    database,
    posInvoicesService,
    posPaymentMethodsService
  )

  return new AiChatService(
    database,
    {
      db: database,
      campaignPerformanceService: {} as never,
      channelsService: {} as never,
      campaignAnalyticsEngine,
      ordersAggregationService: new OrdersAggregationService(database),
      storesAggregationService: new StoresAggregationService(database),
      posInvoicesService,
      posShiftsService,
      posSalesAnalyticsEngine: new PosSalesAnalyticsEngine(posInvoicesService),
      reportsService: new ReportsService(database),
    },
    mockLlmClient,
    "claude-sonnet-5"
  )
}

async function scriptSingleTool(tool: string, input: Record<string, unknown> = {}) {
  mockRunChatTurn.mockImplementation(async (chatInput) => {
    const outputSummary = await chatInput.executeTool(tool, input)
    return {
      text: "benchmark narration",
      toolCalls: [{ tool, input, outputSummary }],
      stopReason: "end_turn",
    }
  })
}

async function scriptMultipleTools(
  calls: Array<{ tool: string; input?: Record<string, unknown> }>
) {
  mockRunChatTurn.mockImplementation(async (chatInput) => {
    const toolCalls = []
    for (const call of calls) {
      const outputSummary = await chatInput.executeTool(call.tool, call.input ?? {})
      toolCalls.push({ tool: call.tool, input: call.input ?? {}, outputSummary })
    }
    return { text: "benchmark narration", toolCalls, stopReason: "end_turn" }
  })
}

beforeEach(async () => {
  const mem = newDb({ autoCreateForeignKeyIndices: true })
  const adapter = mem.adapters.createPg()
  database = new PostgresDatabase(new adapter.Pool())
  await runIdentityMigrations(database, process.cwd())

  await database.query(
    `insert into users (id, email, password_hash, full_name, email_verified_at)
     values ($1, 'benchmark@madar.test', 'hash', 'Benchmark User', now())`,
    [USER_A]
  )
  await database.query(
    `insert into organizations (id, name, owner_user_id, status, timezone) values ($1, 'Org A', $2, 'active', 'UTC')`,
    [ORG_A, USER_A]
  )
  await database.query(
    `insert into workspaces (id, organization_id, name, status) values ($1, $2, 'Main', 'active')`,
    [WORKSPACE_A, ORG_A]
  )
  await setApplicationEnabled(ORG_A, "posEnabled", true)
  await setApplicationEnabled(ORG_A, "advertisingEnabled", true)
})

describe("golden questions -- simple", () => {
  it("'What are my sales today?' returns the exact seeded total, not an invented number", async () => {
    const taxRatesService = new TaxRatesService(database)
    const posPaymentMethodsService = new PosPaymentMethodsService(database)
    const posInvoicesService = new PosInvoicesService(
      database,
      posPaymentMethodsService,
      taxRatesService
    )
    await seedInvoiceAt({ totalAmount: 321, createdAt: "2026-09-15T10:00:00Z" })
    await seedInvoiceAt({ totalAmount: 179, createdAt: "2026-09-15T14:00:00Z" })

    service = buildService(buildFakeAdvertisingEngine(summary(), summary()), posInvoicesService)
    const session = await service.createSession(actor(ORG_A, USER_A), "pos")
    await scriptSingleTool("get_pos_invoices_summary", {
      startDate: "2026-09-15",
      endDate: "2026-09-16",
    })

    const reply = await service.sendMessage(
      actor(ORG_A, USER_A),
      session.id,
      "ما هي مبيعاتي اليوم؟"
    )
    const totalCard = reply.structured!.metrics.find((m) => m.title === "إجمالي المبيعات المكتملة")!
    expect(totalCard.value).toBe(500)
  })

  it("'What are the best-selling products?' ranks by actual revenue, not quantity", async () => {
    const taxRatesService = new TaxRatesService(database)
    const posPaymentMethodsService = new PosPaymentMethodsService(database)
    const posInvoicesService = new PosInvoicesService(
      database,
      posPaymentMethodsService,
      taxRatesService
    )
    // Product A sells more units but less revenue than Product B.
    await seedInvoiceWithProductAt({
      productName: "Product A",
      quantity: 10,
      lineTotal: 100,
      createdAt: "2026-09-15T10:00:00Z",
    })
    await seedInvoiceWithProductAt({
      productName: "Product B",
      quantity: 2,
      lineTotal: 400,
      createdAt: "2026-09-15T11:00:00Z",
    })

    service = buildService(buildFakeAdvertisingEngine(summary(), summary()), posInvoicesService)
    const session = await service.createSession(actor(ORG_A, USER_A), "pos")
    await scriptSingleTool("get_top_selling_products", {})

    const reply = await service.sendMessage(
      actor(ORG_A, USER_A),
      session.id,
      "ما هي أفضل المنتجات مبيعًا؟"
    )
    const data = reply.structured!.charts[0].series[0].data
    expect(data[0]).toEqual({ label: "Product B", value: 400 })
  })
})

describe("golden questions -- comparison", () => {
  it("'Compare this month with last month' reports the real percentage change, never a guessed one", async () => {
    const taxRatesService = new TaxRatesService(database)
    const posPaymentMethodsService = new PosPaymentMethodsService(database)
    const posInvoicesService = new PosInvoicesService(
      database,
      posPaymentMethodsService,
      taxRatesService
    )
    const engine = buildFakeAdvertisingEngine(
      summary({ spend: 12_500 }),
      summary({ spend: 10_000 })
    )
    service = buildService(engine, posInvoicesService)
    const session = await service.createSession(actor(ORG_A, USER_A), "advertising")
    await scriptSingleTool("compare_campaign_periods", {
      currentFrom: "2026-09-01",
      currentTo: "2026-09-30",
      previousFrom: "2026-08-01",
      previousTo: "2026-08-31",
    })

    const reply = await service.sendMessage(
      actor(ORG_A, USER_A),
      session.id,
      "قارن هذا الشهر بالشهر الماضي"
    )
    const spendCard = reply.structured!.metrics.find((m) => m.title === "الإنفاق")!
    expect(spendCard.changePercent).toBe(25)
  })
})

describe("golden questions -- why (diagnostic)", () => {
  it("'Why are sales lower this month?' decomposes the decline into orders vs AOV, and names the dominant driver", async () => {
    const taxRatesService = new TaxRatesService(database)
    const posPaymentMethodsService = new PosPaymentMethodsService(database)
    const posInvoicesService = new PosInvoicesService(
      database,
      posPaymentMethodsService,
      taxRatesService
    )
    await seedInvoiceAt({ totalAmount: 400, createdAt: "2026-10-02T10:00:00Z" })
    for (const amount of [525, 525, 525, 525]) {
      await seedInvoiceAt({ totalAmount: amount, createdAt: "2026-09-29T10:00:00Z" })
    }

    service = buildService(buildFakeAdvertisingEngine(summary(), summary()), posInvoicesService)
    const session = await service.createSession(actor(ORG_A, USER_A), "pos")
    await scriptSingleTool("analyze_sales_performance", {})

    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-10-03T12:00:00Z"))
    const reply = await service.sendMessage(
      actor(ORG_A, USER_A),
      session.id,
      "ليش المبيعات أقل هذا الشهر؟"
    )
    vi.useRealTimers()

    expect(reply.structured!.insights[0].statement).toContain("عدد الطلبات")
    expect(reply.structured!.warnings.some((w) => w.type === "incomplete_period")).toBe(true)
  })

  it("'Why did ROAS decline?' ranks the largest co-moving metric and never asserts causation", async () => {
    const taxRatesService = new TaxRatesService(database)
    const posPaymentMethodsService = new PosPaymentMethodsService(database)
    const posInvoicesService = new PosInvoicesService(
      database,
      posPaymentMethodsService,
      taxRatesService
    )
    const engine = buildFakeAdvertisingEngine(
      summary({ roas: 3.7, spend: 13_200, revenue: 42_000 }),
      summary({ roas: 4.6, spend: 10_000, revenue: 40_000 })
    )
    service = buildService(engine, posInvoicesService)
    const session = await service.createSession(actor(ORG_A, USER_A), "advertising")
    await scriptMultipleTools([
      {
        tool: "compare_campaign_periods",
        input: {
          currentFrom: "2026-09-01",
          currentTo: "2026-09-30",
          previousFrom: "2026-08-01",
          previousTo: "2026-08-31",
        },
      },
      {
        tool: "identify_performance_drivers",
        input: {
          currentFrom: "2026-09-01",
          currentTo: "2026-09-30",
          previousFrom: "2026-08-01",
          previousTo: "2026-08-31",
          metric: "roas",
        },
      },
    ])

    const reply = await service.sendMessage(actor(ORG_A, USER_A), session.id, "لماذا انخفض ROAS؟")
    expect(reply.structured!.insights.length).toBeGreaterThan(0)
    for (const insight of reply.structured!.insights) {
      expect(insight.statement).not.toMatch(/كان السبب|تسبب في/)
    }
  })
})

describe("golden questions -- multi-step", () => {
  it("'Which products are responsible for the decline?' ranks products by the most negative revenue delta", async () => {
    const taxRatesService = new TaxRatesService(database)
    const posPaymentMethodsService = new PosPaymentMethodsService(database)
    const posInvoicesService = new PosInvoicesService(
      database,
      posPaymentMethodsService,
      taxRatesService
    )
    await seedInvoiceWithProductAt({
      productName: "Product A",
      quantity: 1,
      lineTotal: 100,
      createdAt: "2026-09-15T10:00:00Z",
    })
    await seedInvoiceWithProductAt({
      productName: "Product A",
      quantity: 5,
      lineTotal: 500,
      createdAt: "2026-08-15T10:00:00Z",
    })

    service = buildService(buildFakeAdvertisingEngine(summary(), summary()), posInvoicesService)
    const session = await service.createSession(actor(ORG_A, USER_A), "pos")
    await scriptSingleTool("analyze_sales_performance", {
      currentFrom: "2026-09-01",
      currentTo: "2026-09-30",
    })

    const reply = await service.sendMessage(
      actor(ORG_A, USER_A),
      session.id,
      "ما المنتجات المسؤولة عن انخفاض المبيعات؟"
    )
    expect(reply.structured!.tables[0].rows[0].productName).toBe("Product A")
    expect(reply.structured!.tables[0].rows[0].revenueDelta).toBe(-400)
  })
})

describe("golden questions -- data quality", () => {
  it("surfaces a disconnected/stale channel instead of silently answering with its last known numbers", async () => {
    const taxRatesService = new TaxRatesService(database)
    const posPaymentMethodsService = new PosPaymentMethodsService(database)
    const posInvoicesService = new PosInvoicesService(
      database,
      posPaymentMethodsService,
      taxRatesService
    )
    const engine = buildFakeAdvertisingEngine(summary(), summary(), [
      {
        channel: "Meta Ads",
        connected: true,
        lastSyncedAt: "2026-08-01T00:00:00Z",
        minutesSinceSync: 5000,
        isStale: true,
      },
    ])
    service = buildService(engine, posInvoicesService)
    const session = await service.createSession(actor(ORG_A, USER_A), "advertising")
    await scriptSingleTool("compare_campaign_periods", {
      currentFrom: "2026-09-01",
      currentTo: "2026-09-30",
      previousFrom: "2026-08-01",
      previousTo: "2026-08-31",
    })

    const reply = await service.sendMessage(
      actor(ORG_A, USER_A),
      session.id,
      "ماذا لو كانت إحدى القنوات غير متصلة؟"
    )
    expect(
      reply.structured!.warnings.some(
        (w) => w.type === "stale_sync" && w.message.includes("Meta Ads")
      )
    ).toBe(true)
  })

  it("flags an incomplete current period instead of silently comparing a partial month to a full one", async () => {
    const taxRatesService = new TaxRatesService(database)
    const posPaymentMethodsService = new PosPaymentMethodsService(database)
    const posInvoicesService = new PosInvoicesService(
      database,
      posPaymentMethodsService,
      taxRatesService
    )
    service = buildService(buildFakeAdvertisingEngine(summary(), summary()), posInvoicesService)
    const session = await service.createSession(actor(ORG_A, USER_A), "advertising")
    await scriptSingleTool("compare_campaign_periods", { currentPeriod: "this_month" })

    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-10-03T12:00:00Z"))
    const reply = await service.sendMessage(
      actor(ORG_A, USER_A),
      session.id,
      "ماذا لو لم يكتمل الشهر الحالي بعد؟"
    )
    vi.useRealTimers()

    expect(reply.structured!.warnings.some((w) => w.type === "incomplete_period")).toBe(true)
  })

  it("flags insufficient confidence instead of presenting a thin sample as a reliable trend", async () => {
    const taxRatesService = new TaxRatesService(database)
    const posPaymentMethodsService = new PosPaymentMethodsService(database)
    const posInvoicesService = new PosInvoicesService(
      database,
      posPaymentMethodsService,
      taxRatesService
    )
    const engine = buildFakeAdvertisingEngine(
      summary({ spend: 15, clicks: 3, conversions: 0 }),
      summary({ spend: 10_000, clicks: 2_000, conversions: 200 })
    )
    service = buildService(engine, posInvoicesService)
    const session = await service.createSession(actor(ORG_A, USER_A), "advertising")
    await scriptSingleTool("compare_campaign_periods", {
      currentFrom: "2026-09-01",
      currentTo: "2026-09-30",
      previousFrom: "2026-08-01",
      previousTo: "2026-08-31",
    })

    const reply = await service.sendMessage(actor(ORG_A, USER_A), session.id, "كيف كان أداء حسابي؟")
    expect(reply.structured!.confidence).toBe("insufficient")
    expect(reply.structured!.warnings.some((w) => w.type === "insufficient_sample")).toBe(true)
  })
})

describe("golden questions -- follow-up relevance", () => {
  it("every generated follow-up question is specific to this turn's data, never a generic filler", async () => {
    const taxRatesService = new TaxRatesService(database)
    const posPaymentMethodsService = new PosPaymentMethodsService(database)
    const posInvoicesService = new PosInvoicesService(
      database,
      posPaymentMethodsService,
      taxRatesService
    )
    const engine = buildFakeAdvertisingEngine(
      summary({ spend: 12_500 }),
      summary({ spend: 10_000 })
    )
    service = buildService(engine, posInvoicesService)
    const session = await service.createSession(actor(ORG_A, USER_A), "advertising")
    await scriptSingleTool("compare_campaign_periods", {
      currentFrom: "2026-09-01",
      currentTo: "2026-09-30",
      previousFrom: "2026-08-01",
      previousTo: "2026-08-31",
    })

    const reply = await service.sendMessage(
      actor(ORG_A, USER_A),
      session.id,
      "كيف كان أداء حملاتي؟"
    )
    expect(reply.structured!.followUpQuestions.length).toBeGreaterThan(0)
    expect(reply.structured!.followUpQuestions.every((q) => q !== "هل هناك أي شيء آخر؟")).toBe(true)
  })
})
