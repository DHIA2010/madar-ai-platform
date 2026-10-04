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
import { runIdentityMigrations, runSqlFile } from "../infrastructure/postgres/migration-runner"
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
let mockRunChatTurnStreaming: ReturnType<typeof vi.fn<AiChatLlmClientLike["runChatTurnStreaming"]>>

const ORG_A = randomUUID()
const USER_A = randomUUID()
const WORKSPACE_A = randomUUID()

async function setApplicationEnabled(
  organizationId: string,
  key: "advertisingEnabled" | "posEnabled" | "madarAppsEnabled" | "ecommerceEnabled",
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
  // See ai-chat.test.ts's identical comment -- delegates to mockRunChatTurn so every existing
  // scriptSingleTool/scriptMultipleTools-configured test gets equivalent sendMessageStream
  // behavior for free.
  mockRunChatTurnStreaming = vi.fn<AiChatLlmClientLike["runChatTurnStreaming"]>(async (input) => {
    const result = await mockRunChatTurn(input)
    if (result.text) input.onEvent({ type: "text_delta", delta: result.text })
    return result
  })
  const mockLlmClient: AiChatLlmClientLike = {
    runChatTurn: mockRunChatTurn,
    runChatTurnStreaming: mockRunChatTurnStreaming,
  }
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
  await runSqlFile(
    database,
    `${process.cwd()}/src/project-platform/migrations/001_project_core.sql`
  )

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

  // Final-polish audit section 22, benchmark Q5 ("وش تنصحني أسوي؟"): proves
  // generate_campaign_recommendations' output reaches reply.structured.recommendations end-to-
  // end (not just the response-formatter unit level already covered elsewhere) -- this is the
  // field the previous phase's ChatRecommendationsPanel renders, which had no end-to-end test.
  it("'وش تنصحني أسوي؟' -- evidence-gated recommendations reach structured.recommendations end-to-end", async () => {
    const taxRatesService = new TaxRatesService(database)
    const posPaymentMethodsService = new PosPaymentMethodsService(database)
    const posInvoicesService = new PosInvoicesService(
      database,
      posPaymentMethodsService,
      taxRatesService
    )
    const engine = buildFakeAdvertisingEngine(
      summary({ roas: 6, spend: 10_000, revenue: 60_000 }),
      summary({ roas: 4, spend: 10_000, revenue: 40_000 })
    )
    service = buildService(engine, posInvoicesService)
    const session = await service.createSession(actor(ORG_A, USER_A), "advertising")
    await scriptSingleTool("generate_campaign_recommendations", {
      currentFrom: "2026-09-01",
      currentTo: "2026-09-30",
      previousFrom: "2026-08-01",
      previousTo: "2026-08-31",
    })

    const reply = await service.sendMessage(actor(ORG_A, USER_A), session.id, "وش تنصحني أسوي؟")

    expect(reply.structured).not.toBeNull()
    expect(reply.structured!.recommendations.length).toBeGreaterThan(0)
    for (const recommendation of reply.structured!.recommendations) {
      expect(recommendation.evidence.length).toBeGreaterThan(0)
      expect(recommendation.confidence).toBeDefined()
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
    // Genie-level quality audit section 6: this product-contribution data now lives only in
    // contributions[] (richer: carries contributionSharePercent too) -- no duplicate ReportTable.
    expect(reply.structured!.contributions[0].label).toBe("Product A")
    expect(reply.structured!.contributions[0].delta).toBe(-400)
  })

  // Genie-level analytical response upgrade section 8: POS/e-commerce had NO evidence-based
  // recommendation at all before this -- every "what should I do" question for these two domains
  // fell back to ungated free LLM prose (confirmed audit gap). Proves the new
  // recommendationsFromPosAnalysis path reaches reply.structured.recommendations end-to-end
  // (not just the response-formatter unit level), naming the single dominant product by entity.
  it("'وش أسوي بخصوص انخفاض المبيعات؟' -- POS evidence-based recommendations reach structured.recommendations end-to-end", async () => {
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
      "وش أسوي بخصوص انخفاض المبيعات؟"
    )

    expect(reply.structured).not.toBeNull()
    expect(reply.structured!.recommendations).toHaveLength(1)
    expect(reply.structured!.recommendations[0].type).toBe("investigate_decline")
    expect(reply.structured!.recommendations[0].entityType).toBe("product")
    expect(reply.structured!.recommendations[0].entityName).toBe("Product A")
    expect(reply.structured!.recommendations[0].evidence.length).toBeGreaterThan(0)
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

  // Section 13 of the "Next Level" audit: an empty dataset (zero rows, e.g. a newly connected
  // store/workspace with no invoices yet) must resolve to a real, honest 0 -- never an error,
  // never a fabricated placeholder number -- through the generic query engine specifically (no
  // dedicated tool exists for this data source).
  it("run_kpi_preview resolves a genuinely empty dataset to 0, not an error or a fabricated number", async () => {
    const taxRatesService = new TaxRatesService(database)
    const posPaymentMethodsService = new PosPaymentMethodsService(database)
    const posInvoicesService = new PosInvoicesService(
      database,
      posPaymentMethodsService,
      taxRatesService
    )
    // No invoices seeded at all for ORG_A.
    service = buildService(buildFakeAdvertisingEngine(summary(), summary()), posInvoicesService)
    const session = await service.createSession(actor(ORG_A, USER_A), "pos")
    await scriptSingleTool("run_kpi_preview", {
      dataSource: "sales",
      field: "total_revenue",
      aggregation: "sum",
      timeGrouping: "none",
    })

    const reply = await service.sendMessage(actor(ORG_A, USER_A), session.id, "كم مبيعاتي؟")

    expect(reply.structured).not.toBeNull()
    expect(reply.structured!.metrics[0].value).toBe(0)
    expect(reply.structured!.warnings.some((w) => w.type === "insufficient_sample")).toBe(false)
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

// Universal Data Intelligence "Next Level" audit, Section 3: the LLM only ever sees the message
// history ai-chat/service.ts builds -- previously plain {role, content} with the prior turn's
// prose and nothing else, so a follow-up like "قارنها بالشهر الماضي" had no structured anchor to
// what was actually queried (dataSource/field/period), only lossy prose to infer from. These
// tests prove the fix structurally: the prior turn's real tool call (name + exact input) now
// reaches the model's own `messages` input on the NEXT turn, independent of trusting any real
// LLM's behavior (which can't be asserted on deterministically).
describe("golden questions -- conversational context (structured tool-call history)", () => {
  it("a follow-up turn's LLM call receives the prior turn's exact tool name and input as part of message history", async () => {
    const taxRatesService = new TaxRatesService(database)
    const posPaymentMethodsService = new PosPaymentMethodsService(database)
    const posInvoicesService = new PosInvoicesService(
      database,
      posPaymentMethodsService,
      taxRatesService
    )
    await seedInvoiceAt({ totalAmount: 500, createdAt: "2026-10-02T10:00:00Z" })

    service = buildService(buildFakeAdvertisingEngine(summary(), summary()), posInvoicesService)
    const session = await service.createSession(actor(ORG_A, USER_A), "pos")

    await scriptSingleTool("run_kpi_preview", {
      dataSource: "sales",
      field: "total_revenue",
      aggregation: "sum",
      timeGrouping: "none",
      period: "this_month",
    })
    await service.sendMessage(actor(ORG_A, USER_A), session.id, "كم مبيعاتي هذا الشهر؟")

    let capturedMessages: Array<{ role: string; content: string }> = []
    mockRunChatTurn.mockImplementation(async (input) => {
      capturedMessages = input.messages
      const outputSummary = await input.executeTool("run_kpi_preview", {
        dataSource: "sales",
        field: "total_revenue",
        aggregation: "sum",
        timeGrouping: "none",
        period: "last_month",
      })
      return {
        text: "comparison narration",
        toolCalls: [
          {
            tool: "run_kpi_preview",
            input: { dataSource: "sales", field: "total_revenue", period: "last_month" },
            outputSummary,
          },
        ],
        stopReason: "end_turn",
      }
    })
    await service.sendMessage(actor(ORG_A, USER_A), session.id, "قارنها بالشهر الماضي")

    const assistantTurnWithAnnotation = capturedMessages.find(
      (m) => m.role === "assistant" && m.content.includes("أدوات مستخدمة")
    )
    expect(assistantTurnWithAnnotation).toBeDefined()
    expect(assistantTurnWithAnnotation!.content).toContain("run_kpi_preview")
    expect(assistantTurnWithAnnotation!.content).toContain('"dataSource":"sales"')
    expect(assistantTurnWithAnnotation!.content).toContain('"period":"this_month"')
  })

  it("the annotation never corrupts what is actually persisted/rendered for the user (DB content stays unannotated)", async () => {
    const taxRatesService = new TaxRatesService(database)
    const posPaymentMethodsService = new PosPaymentMethodsService(database)
    const posInvoicesService = new PosInvoicesService(
      database,
      posPaymentMethodsService,
      taxRatesService
    )
    service = buildService(buildFakeAdvertisingEngine(summary(), summary()), posInvoicesService)
    const session = await service.createSession(actor(ORG_A, USER_A), "pos")

    await scriptSingleTool("run_kpi_preview", {
      dataSource: "sales",
      field: "total_revenue",
      aggregation: "sum",
      timeGrouping: "none",
    })
    const reply = await service.sendMessage(actor(ORG_A, USER_A), session.id, "كم مبيعاتي؟")

    expect(reply.content).not.toContain("أدوات مستخدمة")

    const stored = await service.listMessages(actor(ORG_A, USER_A), session.id)
    const assistantMessage = stored.find((m) => m.role === "assistant")!
    expect(assistantMessage.content).not.toContain("أدوات مستخدمة")
  })
})

// Universal Data Intelligence audit, Step 3: proves the generic query engine (get_report_catalog
// + run_kpi_preview, backed by the existing, already-tested reports/query-builder.ts) can answer
// a real question with NO dedicated tool behind it -- the actual success criterion this whole
// architecture change exists for, not just that the two tools are wired in.
describe("golden questions -- generic query engine (no dedicated tool)", () => {
  it("'Which customer spent the most?' -- answered via run_kpi_preview, not a hand-written get_top_customers tool", async () => {
    const taxRatesService = new TaxRatesService(database)
    const posPaymentMethodsService = new PosPaymentMethodsService(database)
    const posInvoicesService = new PosInvoicesService(
      database,
      posPaymentMethodsService,
      taxRatesService
    )

    const customerA = randomUUID()
    const customerB = randomUUID()
    await database.query(
      `insert into customers (id, organization_id, workspace_id, name, created_by, created_at, updated_at)
       values ($1,$2,$3,'Ahmed',$4,now(),now()), ($5,$2,$3,'Sara',$4,now(),now())`,
      [customerA, ORG_A, WORKSPACE_A, USER_A, customerB]
    )
    await database.query(
      `insert into pos_invoices (
         id, organization_id, workspace_id, customer_id, invoice_number, status, payment_method_code,
         subtotal_amount, discount_amount, tax_amount, total_amount, created_at, updated_at
       ) values
         ($1,$2,$3,$4,'INV-1','completed','cash',500,0,0,500,$6,$6),
         ($5,$2,$3,$7,'INV-2','completed','cash',120,0,0,120,$6,$6)`,
      [randomUUID(), ORG_A, WORKSPACE_A, customerA, randomUUID(), "2026-09-15T10:00:00Z", customerB]
    )

    service = buildService(buildFakeAdvertisingEngine(summary(), summary()), posInvoicesService)
    const session = await service.createSession(actor(ORG_A, USER_A), "pos")
    await scriptSingleTool("run_kpi_preview", {
      dataSource: "customers",
      field: "total_spend",
      aggregation: "sum",
      timeGrouping: "none",
      groupByDimension: "customer_name",
    })

    const reply = await service.sendMessage(
      actor(ORG_A, USER_A),
      session.id,
      "مين أكثر عميل اشترى؟"
    )

    expect(reply.structured).not.toBeNull()
    expect(reply.structured!.source).toEqual({ domain: "pos" })
    expect(reply.structured!.charts).toHaveLength(1)
    expect(reply.structured!.charts[0].series[0].data[0]).toEqual({ label: "Ahmed", value: 500 })
  })

  it("get_report_catalog for a pos session only returns pos-application data sources", async () => {
    const taxRatesService = new TaxRatesService(database)
    const posPaymentMethodsService = new PosPaymentMethodsService(database)
    const posInvoicesService = new PosInvoicesService(
      database,
      posPaymentMethodsService,
      taxRatesService
    )
    service = buildService(buildFakeAdvertisingEngine(summary(), summary()), posInvoicesService)
    const session = await service.createSession(actor(ORG_A, USER_A), "pos")

    let capturedCatalog: Array<{ application: string }> = []
    mockRunChatTurn.mockImplementation(async (input) => {
      const outputSummary = await input.executeTool("get_report_catalog", {})
      capturedCatalog = JSON.parse(outputSummary)
      return {
        text: "ok",
        toolCalls: [{ tool: "get_report_catalog", input: {}, outputSummary }],
        stopReason: "end_turn",
      }
    })

    await service.sendMessage(actor(ORG_A, USER_A), session.id, "ما البيانات المتاحة؟")

    expect(capturedCatalog.length).toBeGreaterThan(0)
    expect(capturedCatalog.every((source) => source.application === "pos")).toBe(true)
  })

  it("flags a generic query result computed from too few records instead of presenting it as a trustworthy ranking", async () => {
    const taxRatesService = new TaxRatesService(database)
    const posPaymentMethodsService = new PosPaymentMethodsService(database)
    const posInvoicesService = new PosInvoicesService(
      database,
      posPaymentMethodsService,
      taxRatesService
    )
    await seedInvoiceAt({ totalAmount: 100, createdAt: "2026-09-15T10:00:00Z" })

    service = buildService(buildFakeAdvertisingEngine(summary(), summary()), posInvoicesService)
    const session = await service.createSession(actor(ORG_A, USER_A), "pos")
    await scriptSingleTool("run_kpi_preview", {
      dataSource: "sales",
      field: "total_revenue",
      aggregation: "sum",
      timeGrouping: "none",
    })

    const reply = await service.sendMessage(actor(ORG_A, USER_A), session.id, "كم إجمالي المبيعات؟")

    expect(reply.structured!.warnings.some((w) => w.type === "insufficient_sample")).toBe(true)
  })

  // Universal Data Intelligence "Next Level" audit, Priority 1: run_kpi_preview previously had no
  // date-range/period input at all -- previewKpi always ran against a fixed last-12-months
  // window, so a "last month" question and a "this month" question against the same data source
  // were indistinguishable. Proves period resolution now actually constrains the query (not just
  // that the schema accepts the field).
  it("run_kpi_preview resolves 'period' deterministically, excluding rows outside the named period", async () => {
    const taxRatesService = new TaxRatesService(database)
    const posPaymentMethodsService = new PosPaymentMethodsService(database)
    const posInvoicesService = new PosInvoicesService(
      database,
      posPaymentMethodsService,
      taxRatesService
    )
    await seedInvoiceAt({ totalAmount: 300, createdAt: "2026-09-10T10:00:00Z" }) // last month
    await seedInvoiceAt({ totalAmount: 999, createdAt: "2026-10-02T10:00:00Z" }) // this month

    service = buildService(buildFakeAdvertisingEngine(summary(), summary()), posInvoicesService)
    const session = await service.createSession(actor(ORG_A, USER_A), "pos")
    await scriptSingleTool("run_kpi_preview", {
      dataSource: "sales",
      field: "total_revenue",
      aggregation: "sum",
      timeGrouping: "none",
      period: "last_month",
    })

    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-10-03T12:00:00Z"))
    const reply = await service.sendMessage(
      actor(ORG_A, USER_A),
      session.id,
      "كم إجمالي المبيعات الشهر الماضي؟"
    )
    vi.useRealTimers()

    expect(reply.structured!.metrics[0].value).toBe(300)
  })

  // Section 2 of the "Next Level" audit: "all_time" for the generic engine specifically must
  // resolve to the real earliest/latest invoice date actually present (reusing the same
  // getDateCoverage-backed resolveAllTimeRange already proven for the hand-written tools in
  // ai-chat.test.ts), not run_kpi_preview's own hardcoded last-12-months default -- the 2020
  // invoice falls well outside that default window and must still be counted.
  it("run_kpi_preview resolves period='all_time' to the real earliest-to-latest invoice coverage, not the default window", async () => {
    const taxRatesService = new TaxRatesService(database)
    const posPaymentMethodsService = new PosPaymentMethodsService(database)
    const posInvoicesService = new PosInvoicesService(
      database,
      posPaymentMethodsService,
      taxRatesService
    )
    await seedInvoiceAt({ totalAmount: 999, createdAt: "2020-03-10T10:00:00Z" })
    await seedInvoiceAt({ totalAmount: 1, createdAt: "2026-09-20T10:00:00Z" })

    service = buildService(buildFakeAdvertisingEngine(summary(), summary()), posInvoicesService)
    const session = await service.createSession(actor(ORG_A, USER_A), "pos")
    await scriptSingleTool("run_kpi_preview", {
      dataSource: "sales",
      field: "total_revenue",
      aggregation: "sum",
      timeGrouping: "none",
      period: "all_time",
    })

    const reply = await service.sendMessage(
      actor(ORG_A, USER_A),
      session.id,
      "كم مبيعاتي من البداية؟"
    )

    expect(reply.structured!.metrics[0].value).toBe(1000)
    expect(reply.structured!.dataPeriod?.from).toBe("2020-03-10")
  })

  // Confirms the resolved period comes from the CATALOG ENTRY's own application tag, not the
  // session's own category -- needed because a madarApps-scoped session's catalog spans every
  // domain (reports/service.ts's getCatalogForApplication special-cases madarApps to the full,
  // unfiltered catalog), so "last_month" must still resolve correctly for a pos-owned data source
  // even when queried from a madarApps-scoped session.
  it("resolves 'period' correctly for a madarApps-scoped session querying a pos-owned data source", async () => {
    const taxRatesService = new TaxRatesService(database)
    const posPaymentMethodsService = new PosPaymentMethodsService(database)
    const posInvoicesService = new PosInvoicesService(
      database,
      posPaymentMethodsService,
      taxRatesService
    )
    await seedInvoiceAt({ totalAmount: 300, createdAt: "2026-09-10T10:00:00Z" })
    await seedInvoiceAt({ totalAmount: 999, createdAt: "2026-10-02T10:00:00Z" })
    await setApplicationEnabled(ORG_A, "madarAppsEnabled", true)

    service = buildService(buildFakeAdvertisingEngine(summary(), summary()), posInvoicesService)
    const session = await service.createSession(actor(ORG_A, USER_A), "madarApps")
    await scriptSingleTool("run_kpi_preview", {
      dataSource: "sales",
      field: "total_revenue",
      aggregation: "sum",
      timeGrouping: "none",
      period: "last_month",
    })

    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-10-03T12:00:00Z"))
    const reply = await service.sendMessage(
      actor(ORG_A, USER_A),
      session.id,
      "كم إجمالي المبيعات الشهر الماضي؟"
    )
    vi.useRealTimers()

    expect(reply.structured!.metrics[0].value).toBe(300)
  })

  // Universal Data Intelligence "Next Level" audit, Section 6: proves the generic contribution/
  // driver mode end-to-end -- "which product caused the decline" answered via run_kpi_preview
  // (groupByDimension + compareEnabled together) with no dedicated tool for this data source,
  // surfaced as a hedged, non-causal insight (never "caused"/"because of").
  it("'Which product caused the decline?' -- answered via run_kpi_preview's generic contribution mode", async () => {
    const taxRatesService = new TaxRatesService(database)
    const posPaymentMethodsService = new PosPaymentMethodsService(database)
    const posInvoicesService = new PosInvoicesService(
      database,
      posPaymentMethodsService,
      taxRatesService
    )

    service = buildService(buildFakeAdvertisingEngine(summary(), summary()), posInvoicesService)
    const session = await service.createSession(actor(ORG_A, USER_A), "pos")
    await scriptSingleTool("run_kpi_preview", {
      dataSource: "sales",
      field: "total_revenue",
      aggregation: "sum",
      timeGrouping: "none",
      groupByDimension: "payment_method",
      compareEnabled: true,
      startDate: "2026-06-01T00:00:00Z",
      endDate: "2026-06-08T00:00:00Z",
    })
    // Previous period (computed server-side as the equal-length span before startDate):
    // [2026-05-25T00:00:00Z, 2026-06-01T00:00:00Z). Two different payment methods so the grouped
    // breakdown has more than one point -- a single-group result would collapse to a plain KPI
    // card instead of exercising the chart+insights contribution path.
    await database.query(
      `insert into pos_invoices (
        id, organization_id, workspace_id, invoice_number, status, payment_method_code,
        subtotal_amount, discount_amount, tax_amount, total_amount, created_at, updated_at
      ) values
        ($1,$2,$3,$4,'completed','cash',20,0,0,20,$5,$5),
        ($6,$2,$3,$7,'completed','card',200,0,0,200,$8,$8),
        ($9,$2,$3,$10,'completed','cash',100,0,0,100,$11,$11),
        ($12,$2,$3,$13,'completed','card',50,0,0,50,$14,$14)`,
      [
        randomUUID(),
        ORG_A,
        WORKSPACE_A,
        `INV-${randomUUID().slice(0, 8)}`,
        "2026-05-26T10:00:00Z",
        randomUUID(),
        `INV-${randomUUID().slice(0, 8)}`,
        "2026-05-27T10:00:00Z",
        randomUUID(),
        `INV-${randomUUID().slice(0, 8)}`,
        "2026-06-02T10:00:00Z",
        randomUUID(),
        `INV-${randomUUID().slice(0, 8)}`,
        "2026-06-03T10:00:00Z",
      ]
    )

    const reply = await service.sendMessage(
      actor(ORG_A, USER_A),
      session.id,
      "أي طريقة دفع ساهمت أكثر في التغيّر؟"
    )

    expect(reply.structured!.insights.length).toBeGreaterThan(0)
    expect(reply.structured!.insights[0].statement).toContain("أكبر مساهم في التغيّر")
    for (const insight of reply.structured!.insights) {
      expect(insight.statement).not.toMatch(/كان السبب|تسبب في/)
    }
  })

  // Section 7/10 of the "Next Level" audit: run_kpi_preview's compareEnabled path must warn when
  // the current period hasn't fully elapsed yet, the same way compare_campaign_periods already
  // does -- otherwise "this month" at 3 days in would silently read like a full-month comparison.
  it("run_kpi_preview warns when a compareEnabled period hasn't fully elapsed yet", async () => {
    const taxRatesService = new TaxRatesService(database)
    const posPaymentMethodsService = new PosPaymentMethodsService(database)
    const posInvoicesService = new PosInvoicesService(
      database,
      posPaymentMethodsService,
      taxRatesService
    )
    await seedInvoiceAt({ totalAmount: 300, createdAt: "2026-10-02T10:00:00Z" })
    await seedInvoiceAt({ totalAmount: 100, createdAt: "2026-09-15T10:00:00Z" })

    service = buildService(buildFakeAdvertisingEngine(summary(), summary()), posInvoicesService)
    const session = await service.createSession(actor(ORG_A, USER_A), "pos")
    await scriptSingleTool("run_kpi_preview", {
      dataSource: "sales",
      field: "total_revenue",
      aggregation: "sum",
      timeGrouping: "none",
      compareEnabled: true,
      period: "this_month",
    })

    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-10-03T12:00:00Z"))
    const reply = await service.sendMessage(
      actor(ORG_A, USER_A),
      session.id,
      "كم مبيعاتي هذا الشهر مقارنة بالشهر الماضي؟"
    )
    vi.useRealTimers()

    expect(reply.structured!.warnings.some((w) => w.type === "incomplete_period")).toBe(true)
  })

  it("Step 5: the generic query engine also answers an advertising question with no dedicated tool shape, grouped by campaign", async () => {
    const taxRatesService = new TaxRatesService(database)
    const posPaymentMethodsService = new PosPaymentMethodsService(database)
    const posInvoicesService = new PosInvoicesService(
      database,
      posPaymentMethodsService,
      taxRatesService
    )

    const connectionId = randomUUID()
    const projectId = randomUUID()
    const oauthAccountId = randomUUID()
    await database.query(
      `insert into projects (id, organization_id, workspace_id, owner_user_id, name, status)
       values ($1,$2,$3,$4,'Google Ads Project','active')`,
      [projectId, ORG_A, WORKSPACE_A, USER_A]
    )
    await database.query(
      `insert into google_oauth_connections (
         id, organization_id, workspace_id, project_id, status, created_by_user_id, updated_by_user_id, created_at, updated_at
       ) values ($1,$2,$3,$4,'connected',$5,$5,now(),now())`,
      [connectionId, ORG_A, WORKSPACE_A, projectId, USER_A]
    )
    await database.query(
      `insert into oauth_accounts (
         id, provider_family, organization_id, workspace_id, status, created_by_user_id, updated_by_user_id, created_at, updated_at
       ) values ($1,'google',$2,$3,'active',$4,$4,now(),now())`,
      [oauthAccountId, ORG_A, WORKSPACE_A, USER_A]
    )
    await database.query(
      `insert into integration_connections (
         id, provider_id, provider_family, platform, organization_id, workspace_id, project_id, oauth_account_id,
         status, created_by_user_id, updated_by_user_id, created_at, updated_at
       ) values ($1,'google-ads','google','marketing',$2,$3,$4,$5,'connected',$6,$6,now(),now())`,
      [connectionId, ORG_A, WORKSPACE_A, projectId, oauthAccountId, USER_A]
    )
    const syncRunId = randomUUID()
    await database.query(
      `insert into google_ads_sync_runs (
         id, connection_id, organization_id, workspace_id, project_id, customer_id,
         date_start, date_end, idempotency_key, status, created_by_user_id, updated_by_user_id, created_at, updated_at
       ) values ($1,$2,$3,$4,$5,'111222333','2026-09-01'::date,'2026-09-30'::date,$6,'completed',$7,$7,now(),now())`,
      [syncRunId, connectionId, ORG_A, WORKSPACE_A, projectId, `seed-${syncRunId}`, USER_A]
    )
    await database.query(
      `insert into google_ads_daily_metrics (
         id, connection_id, sync_run_id, customer_id, metric_scope, metric_entity_id, campaign_id, metric_date,
         impressions, clicks, ctr, cost_micros, average_cpc, average_cpm, conversions, conversion_value,
         payload, created_at, updated_at
       ) values
         ($1,$2,$3,'111222333','campaign','camp-a','camp-a','2026-09-15'::date,1000,50,0,500000000,0,0,5,500,'{}'::jsonb,now(),now()),
         ($4,$2,$3,'111222333','campaign','camp-b','camp-b','2026-09-15'::date,2000,80,0,200000000,0,0,8,800,'{}'::jsonb,now(),now())`,
      [randomUUID(), connectionId, syncRunId, randomUUID()]
    )

    service = buildService(buildFakeAdvertisingEngine(summary(), summary()), posInvoicesService)
    const session = await service.createSession(actor(ORG_A, USER_A), "advertising")
    // No period/startDate/endDate given -- previewKpi falls back to its own default last-12-
    // months window (reports/service.ts's defaultRange()). The seeded metric date just needs to
    // fall inside it; real period resolution (period: "this_month"/"all_time"/etc) is covered
    // separately below.
    await scriptSingleTool("run_kpi_preview", {
      dataSource: "marketing",
      field: "spend",
      aggregation: "sum",
      timeGrouping: "none",
      groupByDimension: "campaign",
    })

    const reply = await service.sendMessage(
      actor(ORG_A, USER_A),
      session.id,
      "ما الإنفاق لكل حملة هذا الشهر؟"
    )

    expect(reply.structured).not.toBeNull()
    expect(reply.structured!.source).toEqual({ domain: "advertising" })
    expect(reply.structured!.charts).toHaveLength(1)
    // 500000000 micros = 500 SAR, 200000000 micros = 200 SAR.
    expect(reply.structured!.charts[0].series[0].data).toEqual(
      expect.arrayContaining([
        { label: "camp-a", value: 500 },
        { label: "camp-b", value: 200 },
      ])
    )
  })
})

async function insertConnectedSallaConnection(input: {
  organizationId: string
  workspaceId: string
  userId: string
}) {
  const connectionId = randomUUID()
  await database.query(
    `insert into salla_oauth_connections (
       id, organization_id, workspace_id, project_id, status,
       created_by_user_id, updated_by_user_id, created_at, updated_at
     ) values ($1, $2, $3, $4, 'connected', $5, $5, now(), now())`,
    [connectionId, input.organizationId, input.workspaceId, randomUUID(), input.userId]
  )
  return connectionId
}

async function insertSallaOrderRecord(input: {
  connectionId: string
  entityId: string
  payload: Record<string, unknown>
  recordDate: string
}) {
  await database.query(
    `insert into salla_records (
       id, connection_id, customer_id, entity_type, entity_id, record_date, payload, created_at, updated_at
     ) values ($1, $2, 'store-1', 'orders', $3, $4::date, $5::jsonb, now(), $4::timestamptz)`,
    [
      randomUUID(),
      input.connectionId,
      input.entityId,
      input.recordDate,
      JSON.stringify(input.payload),
    ]
  )
}

// Analysis Orchestration audit (Genie-upgrade, round 2) section 4/15/18: proves the e-commerce
// "why did sales change" chain end-to-end with real seeded Salla orders -- list_orders' summary
// now carries the same decomposeRevenueChange methodology POS already had, reaching parity for
// the first time. Mirrors the spec's own "Important Example" (section 18), just for e-commerce
// instead of POS (POS's equivalent is already covered by the "why are sales lower" tests above).
describe("golden questions -- ecommerce driver analysis (parity with POS)", () => {
  it("'Why are ecommerce sales lower this period?' -- list_orders decomposes the change into orders vs AOV effect", async () => {
    const taxRatesService = new TaxRatesService(database)
    const posPaymentMethodsService = new PosPaymentMethodsService(database)
    const posInvoicesService = new PosInvoicesService(
      database,
      posPaymentMethodsService,
      taxRatesService
    )
    await setApplicationEnabled(ORG_A, "ecommerceEnabled", true)

    const connectionId = await insertConnectedSallaConnection({
      organizationId: ORG_A,
      workspaceId: WORKSPACE_A,
      userId: USER_A,
    })
    const order = (reference: number, amount: number, dateIso: string) => ({
      reference_id: reference,
      customer: { full_name: "Test Customer" },
      source: "web",
      total: { amount, currency: "SAR" },
      status: { name: "Completed", slug: "completed" },
      items: [{ name: "Item", quantity: 1 }],
      is_pending_payment: false,
      date: { date: `${dateIso} 00:00:00` },
    })
    // Current window (2026-09-01..2026-09-08): 1 order, 400 SAR.
    await insertSallaOrderRecord({
      connectionId,
      entityId: "500001",
      recordDate: "2026-09-03",
      payload: order(500001, 400, "2026-09-03"),
    })
    // Previous window (computed server-side as the equal-length span before 2026-09-01): 4
    // orders totalling 2100 SAR.
    for (const [index, amount] of [600, 500, 500, 500].entries()) {
      await insertSallaOrderRecord({
        connectionId,
        entityId: `500${100 + index}`,
        recordDate: "2026-08-28",
        payload: order(500100 + index, amount, "2026-08-28"),
      })
    }

    service = buildService(buildFakeAdvertisingEngine(summary(), summary()), posInvoicesService)
    const session = await service.createSession(actor(ORG_A, USER_A), "ecommerce")
    await scriptSingleTool("list_orders", {
      startDate: "2026-09-01",
      endDate: "2026-09-08",
    })

    const reply = await service.sendMessage(
      actor(ORG_A, USER_A),
      session.id,
      "لماذا مبيعاتي أقل هذه الفترة؟"
    )

    expect(reply.structured).not.toBeNull()
    expect(reply.structured!.source).toEqual({ domain: "ecommerce" })
    const salesCard = reply.structured!.metrics.find((m) => m.title === "إجمالي المبيعات")!
    expect(salesCard.value).toBe(400)
    expect(salesCard.previousValue).toBe(2100)

    // orderEffect = (1-4)*525 = -1575; aovEffect = 1*(400-525) = -125; sum = -1700 = 400-2100.
    expect(reply.structured!.drivers.length).toBeGreaterThan(0)
    const ordersDriver = reply.structured!.drivers.find((d) => d.metric === "orders")!
    expect(ordersDriver.role).toBe("primary")
    expect(ordersDriver.direction).toBe("down")
  })
})
