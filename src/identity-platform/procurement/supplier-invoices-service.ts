import { randomUUID } from "node:crypto"

import { ERRORS } from "../application/errors/IdentityError"
import type { ObjectStorageGateway } from "../application/ports"
import type { PostgresDatabase } from "../infrastructure/postgres/database"

import { requireProcurementEnabled } from "./guards"
import type { ExtractedInvoice, InvoiceExtractor, InvoiceMediaType } from "./invoice-reader"

const MAX_INVOICE_BYTES = 8 * 1024 * 1024

export type InvoiceMatchSource = "memory" | "sku" | "name"

export interface InvoiceProduct {
  id: string
  name: string
  sku: string
  costPrice: number | null
}

export interface ScannedInvoiceLine {
  code: string | null
  name: string
  qty: number
  unitCost: number
  discount: number
  taxPercent: number | null
  // The product this line most likely is, and how it was found; null when nothing fits.
  match: { productId: string; productName: string; sku: string; by: InvoiceMatchSource } | null
}

export interface ScannedInvoice {
  attachmentUrl: string | null
  supplierName: string | null
  invoiceNumber: string | null
  invoiceDate: string | null
  lines: ScannedInvoiceLine[]
}

function codeKey(code: string) {
  return code.trim().toLowerCase()
}

// What a supplier's line is remembered by: its code, or -- on an invoice that prints no codes,
// like a supermarket receipt -- its name as the supplier writes it.
function memoryKey(line: { code: string | null; name: string }) {
  const code = line.code?.trim()
  return code ? codeKey(code) : `name:${normalizeProductName(line.name)}`
}

// Names are compared loosely: case, extra spaces, Arabic diacritics/tatweel and the common
// alef / ya / ta marbuta spelling variants don't count as differences.
export function normalizeProductName(name: string) {
  return name
    .toLowerCase()
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim()
}

// Matches each invoice line to a product: first the code this supplier's invoices were confirmed
// to mean before, then the product's own SKU, then its name (exact, or the only product whose name
// contains -- or is contained in -- the line's).
export function matchInvoiceLines(
  lines: ExtractedInvoice["lines"],
  products: InvoiceProduct[],
  remembered: Map<string, string>
): ScannedInvoiceLine[] {
  const byId = new Map(products.map((product) => [product.id, product]))
  const bySku = new Map(
    products.filter((product) => product.sku).map((product) => [codeKey(product.sku), product])
  )
  const named = products.map((product) => ({ product, key: normalizeProductName(product.name) }))

  return lines.map((line) => {
    const code = line.code?.trim() || null
    let match: ScannedInvoiceLine["match"] = null
    const found = (product: InvoiceProduct, by: InvoiceMatchSource) => ({
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      by,
    })

    const rememberedProduct = byId.get(remembered.get(memoryKey({ code, name: line.name })) ?? "")
    const skuProduct = code ? bySku.get(codeKey(code)) : undefined
    if (rememberedProduct) {
      match = found(rememberedProduct, "memory")
    } else if (skuProduct) {
      match = found(skuProduct, "sku")
    } else {
      const key = normalizeProductName(line.name)
      const exact = named.find((entry) => entry.key === key)
      const partial = key
        ? named.filter((entry) => entry.key && (entry.key.includes(key) || key.includes(entry.key)))
        : []
      const byName = exact?.product ?? (partial.length === 1 ? partial[0].product : undefined)
      if (byName) match = found(byName, "name")
    }

    return {
      code,
      name: line.name,
      qty: line.qty,
      unitCost: line.unitCost,
      discount: line.discount,
      taxPercent: line.taxPercent,
      match,
    }
  })
}

// Reads a supplier's invoice into purchase lines, and remembers which of that supplier's codes
// mean which product once a user confirms them.
export class SupplierInvoicesService {
  constructor(
    private readonly db: PostgresDatabase,
    private readonly storage: ObjectStorageGateway | null,
    private readonly extractor: InvoiceExtractor | null
  ) {}

  private async requireSupplier(organizationId: string, supplierId: string) {
    const result = await this.db.query(
      "SELECT id FROM suppliers WHERE organization_id = $1 AND id = $2 AND deleted_at IS NULL",
      [organizationId, supplierId]
    )
    if (result.rows.length === 0) throw ERRORS.notFound("Supplier")
  }

  async scan(input: {
    organizationId: string
    supplierId: string
    fileBase64: string
    contentType: InvoiceMediaType
  }): Promise<ScannedInvoice> {
    await requireProcurementEnabled(this.db, input.organizationId)
    if (!this.extractor) {
      throw ERRORS.serviceUnavailable("Reading supplier invoices is not available right now.")
    }
    await this.requireSupplier(input.organizationId, input.supplierId)

    const buffer = Buffer.from(input.fileBase64, "base64")
    if (buffer.length === 0 || buffer.length > MAX_INVOICE_BYTES) {
      throw ERRORS.validation({ file: "The invoice must be between 1 byte and 8MB." })
    }

    let extracted: ExtractedInvoice
    try {
      extracted = await this.extractor.extract({
        data: buffer.toString("base64"),
        mediaType: input.contentType,
      })
    } catch (error) {
      console.error("procurement.invoice_read_failed", error)
      throw ERRORS.conflict("INVOICE_UNREADABLE", "The invoice could not be read.")
    }

    const extension =
      input.contentType === "application/pdf"
        ? "pdf"
        : input.contentType === "image/jpeg"
          ? "jpg"
          : input.contentType.split("/")[1]
    const attachmentUrl = this.storage
      ? await this.storage.uploadPublicObject({
          key: `purchase-invoices/${input.organizationId}/${randomUUID()}.${extension}`,
          body: buffer,
          contentType: input.contentType,
        })
      : null

    const [products, remembered] = await Promise.all([
      this.db.query<{ id: string; name: string; sku: string | null; cost_price: string | null }>(
        `SELECT id, name, sku, cost_price FROM products
          WHERE organization_id = $1 AND deleted_at IS NULL`,
        [input.organizationId]
      ),
      this.db.query<{ code_key: string; product_id: string }>(
        `SELECT code_key, product_id FROM supplier_product_codes
          WHERE organization_id = $1 AND supplier_id = $2`,
        [input.organizationId, input.supplierId]
      ),
    ])

    return {
      attachmentUrl,
      supplierName: extracted.supplierName,
      invoiceNumber: extracted.invoiceNumber,
      invoiceDate: extracted.invoiceDate,
      lines: matchInvoiceLines(
        extracted.lines,
        products.rows.map((row) => ({
          id: row.id,
          name: row.name,
          sku: row.sku ?? "",
          costPrice: row.cost_price === null ? null : Number(row.cost_price),
        })),
        new Map(remembered.rows.map((row) => [row.code_key, row.product_id]))
      ),
    }
  }

  // Saves "this supplier's code (or line name) X is our product Y" for each confirmed line.
  async rememberCodes(input: {
    organizationId: string
    supplierId: string
    links: { code: string | null; name: string; productId: string }[]
  }): Promise<{ saved: number }> {
    await requireProcurementEnabled(this.db, input.organizationId)
    await this.requireSupplier(input.organizationId, input.supplierId)

    let saved = 0
    for (const link of input.links) {
      const code = link.code?.trim() || link.name.trim()
      if (!code) continue
      const owned = await this.db.query(
        "SELECT id FROM products WHERE organization_id = $1 AND id = $2 AND deleted_at IS NULL",
        [input.organizationId, link.productId]
      )
      if (owned.rows.length === 0) continue
      await this.db.query(
        `INSERT INTO supplier_product_codes
           (id, organization_id, supplier_id, code, code_key, product_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (organization_id, supplier_id, code_key)
         DO UPDATE SET code = EXCLUDED.code, product_id = EXCLUDED.product_id, updated_at = now()`,
        [
          randomUUID(),
          input.organizationId,
          input.supplierId,
          code,
          memoryKey(link),
          link.productId,
        ]
      )
      saved += 1
    }
    return { saved }
  }
}
