import { randomUUID } from "node:crypto"

import { IdentityError } from "../application/errors/IdentityError"
import type { PostgresDatabase } from "../infrastructure/postgres/database"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const ERRORS = {
  notFound: () =>
    new IdentityError("PAYMENT_METHOD_NOT_FOUND", 404, "business", "Payment method not found."),
  duplicateCode: (code: string) =>
    new IdentityError(
      "PAYMENT_METHOD_CODE_TAKEN",
      409,
      "business",
      `A payment method with the code "${code}" already exists.`
    ),
}

// How a method is settled, which is what decides the icon and what its settings mean. Two kinds
// never collect money at sale time -- both always require a real customerId (see
// invoices-service.ts): "credit" and "prepaid" both debit the same unified account_balance,
// one via an "آجل" deferred amount (no floor -- that is what deferred means), the other via
// their real prepaid credit (capped at what they actually have).
export const PAYMENT_KINDS = [
  "cash",
  "card",
  "wallet",
  "transfer",
  "bnpl",
  "credit",
  "prepaid",
] as const
export type PaymentKind = (typeof PAYMENT_KINDS)[number]

export interface PaymentMethodCatalogEntry {
  code: string
  name: string
  subtitle: string
  kind: PaymentKind
  // What the provider typically charges. A starting point the branch can correct -- fees are
  // negotiated per merchant, so this is never presented as the real rate until saved.
  defaultFeePercent: number
  defaultEnabled: boolean
}

// The built-in methods, in the order a Saudi counter usually lists them. Adding one here reaches
// every branch without a migration, because only overrides are stored.
export const PAYMENT_METHOD_CATALOG: PaymentMethodCatalogEntry[] = [
  {
    code: "cash",
    name: "نقدي",
    subtitle: "المدفوعات النقدية",
    kind: "cash",
    defaultFeePercent: 0,
    defaultEnabled: true,
  },
  {
    code: "mada",
    name: "مدى",
    subtitle: "بطاقات مدى البنكية",
    kind: "card",
    defaultFeePercent: 0,
    defaultEnabled: true,
  },
  {
    code: "visa_mastercard",
    name: "فيزا / ماستركارد",
    subtitle: "بطاقات الائتمان والدفع",
    kind: "card",
    defaultFeePercent: 0,
    defaultEnabled: true,
  },
  {
    code: "apple_pay",
    name: "أبل باي",
    subtitle: "Apple Pay",
    kind: "wallet",
    defaultFeePercent: 0,
    defaultEnabled: true,
  },
  {
    code: "stc_pay",
    name: "مدفوعات STC Pay",
    subtitle: "الدفع عبر STC Pay",
    kind: "wallet",
    defaultFeePercent: 0,
    defaultEnabled: true,
  },
  {
    code: "bank_transfer",
    name: "تحويل بنكي",
    subtitle: "التحويل البنكي المباشر",
    kind: "transfer",
    defaultFeePercent: 0,
    defaultEnabled: false,
  },
  {
    code: "tamara",
    name: "دفع لاحق (تمارا)",
    subtitle: "اشتر الآن وادفع لاحقاً",
    kind: "bnpl",
    defaultFeePercent: 0,
    defaultEnabled: false,
  },
  {
    code: "tabby",
    name: "قسّط (تابي)",
    subtitle: "التقسيط بدون فوائد",
    kind: "bnpl",
    defaultFeePercent: 0,
    defaultEnabled: false,
  },
  {
    code: "customer_credit",
    name: "آجل",
    subtitle: "يُسجَّل في حساب العميل",
    kind: "credit",
    defaultFeePercent: 0,
    // Off by default: unlike every other method, turning this on lets a cashier create real
    // customer debt, so a branch has to opt in deliberately.
    defaultEnabled: false,
  },
  {
    code: "customer_wallet",
    name: "محفظة العميل",
    subtitle: "خصم من رصيد العميل المسبق",
    kind: "prepaid",
    defaultFeePercent: 0,
    // Off by default, same reasoning as customer_credit -- this spends a customer's real prepaid
    // balance, so a branch has to opt in deliberately.
    defaultEnabled: false,
  },
]

export interface PaymentMethodView {
  id: string | null
  code: string
  name: string
  subtitle: string
  kind: PaymentKind
  enabled: boolean
  feePercent: number
  isCustom: boolean
  // False while the branch is still on the catalogue default and has saved nothing.
  configured: boolean
  position: number
  merchantId: string | null
  apiKey: string | null
}

export interface PaymentMethodUpdate {
  enabled: boolean
  feePercent: number
  merchantId: string | null
  apiKey: string | null
  // Only meaningful for a branch's own method -- a catalogue entry's name/subtitle always come
  // from PAYMENT_METHOD_CATALOG (see list()), so save() ignores these for one.
  name?: string
  subtitle?: string | null
}

export interface CustomPaymentMethodInput extends PaymentMethodUpdate {
  code: string
  name: string
  subtitle: string | null
  kind: PaymentKind
}

interface MethodRow {
  id: string
  code: string
  name: string | null
  subtitle: string | null
  enabled: boolean
  fee_percent: string | number
  is_custom: boolean
  settings: unknown
  position: number
  [key: string]: unknown
}

function toNumber(value: string | number): number {
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

// jsonb arrives parsed through node-postgres but as a string through some drivers and pg-mem.
function toSettings(value: unknown): {
  merchantId: string | null
  apiKey: string | null
  kind: PaymentKind | null
} {
  const parsed =
    typeof value === "string"
      ? (() => {
          try {
            return JSON.parse(value) as unknown
          } catch {
            return null
          }
        })()
      : value

  const record = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {}
  return {
    merchantId: typeof record.merchantId === "string" ? record.merchantId : null,
    apiKey: typeof record.apiKey === "string" ? record.apiKey : null,
    kind: PAYMENT_KINDS.includes(record.kind as PaymentKind) ? (record.kind as PaymentKind) : null,
  }
}

export class PosPaymentMethodsService {
  constructor(private readonly database: PostgresDatabase) {}

  // The catalogue with any stored overrides applied, then the branch's own methods appended.
  async list(organizationId: string, workspaceId: string | null): Promise<PaymentMethodView[]> {
    const rows = await this.rows(organizationId, workspaceId)
    const byCode = new Map(rows.map((row) => [row.code, row]))

    const catalogue = PAYMENT_METHOD_CATALOG.map((entry, index) => {
      const stored = byCode.get(entry.code)
      const settings = toSettings(stored?.settings)

      return {
        id: stored?.id ?? null,
        code: entry.code,
        name: entry.name,
        subtitle: entry.subtitle,
        kind: entry.kind,
        enabled: stored ? stored.enabled : entry.defaultEnabled,
        feePercent: stored ? toNumber(stored.fee_percent) : entry.defaultFeePercent,
        isCustom: false,
        configured: Boolean(stored),
        position: index,
        merchantId: settings.merchantId,
        apiKey: settings.apiKey,
      }
    })

    const custom = rows
      .filter((row) => row.is_custom)
      .map((row, index) => {
        const settings = toSettings(row.settings)
        return {
          id: row.id,
          code: row.code,
          name: row.name ?? row.code,
          subtitle: row.subtitle ?? "",
          // Picked when the method was created (see createCustom) and stored alongside the
          // provider fields -- there is no dedicated column, only the catalogue rows above get
          // their kind for free from PAYMENT_METHOD_CATALOG.
          kind: settings.kind ?? "cash",
          enabled: row.enabled,
          feePercent: toNumber(row.fee_percent),
          isCustom: true,
          configured: true,
          position: catalogue.length + index,
          merchantId: settings.merchantId,
          apiKey: settings.apiKey,
        }
      })

    return [...catalogue, ...custom]
  }

  async save(input: {
    organizationId: string
    workspaceId: string | null
    updatedBy: string | null
    code: string
    update: PaymentMethodUpdate
  }): Promise<PaymentMethodView[]> {
    const known = PAYMENT_METHOD_CATALOG.some((entry) => entry.code === input.code)
    const rows = await this.rows(input.organizationId, input.workspaceId)
    const existing = rows.find((row) => row.code === input.code)

    if (!known && !existing) throw ERRORS.notFound()

    if (existing) {
      // Merged, not replaced -- a custom row's settings also carry its `kind` (see
      // createCustom), which this update must not clobber since it never asks for it back.
      const existingSettings = toSettings(existing.settings)
      const settings = {
        ...(existingSettings.kind ? { kind: existingSettings.kind } : {}),
        merchantId: input.update.merchantId,
        apiKey: input.update.apiKey,
      }
      // A catalogue row's name/subtitle are never read back (list() always sources them from
      // PAYMENT_METHOD_CATALOG) -- only a custom row's own wording can actually change here.
      const name =
        existing.is_custom && input.update.name !== undefined
          ? input.update.name.trim()
          : existing.name
      const subtitle =
        existing.is_custom && input.update.subtitle !== undefined
          ? input.update.subtitle
          : existing.subtitle
      await this.database.query(
        `UPDATE pos_payment_methods
            SET enabled = $2, fee_percent = $3, name = $4, subtitle = $5, settings = $6::jsonb,
                updated_by = $7, updated_at = now()
          WHERE id = $1`,
        [
          existing.id,
          input.update.enabled,
          input.update.feePercent,
          name,
          subtitle,
          JSON.stringify(settings),
          input.updatedBy,
        ]
      )
    } else {
      await this.database.query(
        `INSERT INTO pos_payment_methods
           (id, organization_id, workspace_id, code, enabled, fee_percent, settings, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
        [
          randomUUID(),
          input.organizationId,
          input.workspaceId,
          input.code,
          input.update.enabled,
          input.update.feePercent,
          JSON.stringify({ merchantId: input.update.merchantId, apiKey: input.update.apiKey }),
          input.updatedBy,
        ]
      )
    }

    return this.list(input.organizationId, input.workspaceId)
  }

  async createCustom(input: {
    organizationId: string
    workspaceId: string | null
    updatedBy: string | null
    method: CustomPaymentMethodInput
  }): Promise<PaymentMethodView[]> {
    const code = input.method.code.trim().toLowerCase()

    if (PAYMENT_METHOD_CATALOG.some((entry) => entry.code === code)) {
      throw ERRORS.duplicateCode(code)
    }
    const rows = await this.rows(input.organizationId, input.workspaceId)
    if (rows.some((row) => row.code === code)) throw ERRORS.duplicateCode(code)

    await this.database.query(
      `INSERT INTO pos_payment_methods
         (id, organization_id, workspace_id, code, name, subtitle, enabled, fee_percent,
          is_custom, settings, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $9::jsonb, $10)`,
      [
        randomUUID(),
        input.organizationId,
        input.workspaceId,
        code,
        input.method.name.trim(),
        input.method.subtitle,
        input.method.enabled,
        input.method.feePercent,
        JSON.stringify({
          kind: input.method.kind,
          merchantId: input.method.merchantId,
          apiKey: input.method.apiKey,
        }),
        input.updatedBy,
      ]
    )

    return this.list(input.organizationId, input.workspaceId)
  }

  // Only a branch's own method can be removed. A catalogue method is disabled instead -- it
  // still exists as a way to pay, the branch just does not accept it.
  async deleteCustom(organizationId: string, id: string): Promise<void> {
    if (!UUID_PATTERN.test(id)) throw ERRORS.notFound()

    const result = await this.database.query(
      `UPDATE pos_payment_methods SET deleted_at = now(), updated_at = now()
        WHERE organization_id = $1 AND id = $2 AND is_custom = true AND deleted_at IS NULL`,
      [organizationId, id]
    )
    if (result.rowCount === 0) throw ERRORS.notFound()
  }

  private async rows(organizationId: string, workspaceId: string | null): Promise<MethodRow[]> {
    const result = await this.database.query<MethodRow>(
      `SELECT id, code, name, subtitle, enabled, fee_percent, is_custom, settings, position
         FROM pos_payment_methods
        WHERE organization_id = $1 AND deleted_at IS NULL
          AND ((workspace_id IS NULL AND $2::uuid IS NULL) OR workspace_id = $2::uuid)
        ORDER BY position, created_at`,
      [organizationId, workspaceId]
    )
    return result.rows
  }
}
