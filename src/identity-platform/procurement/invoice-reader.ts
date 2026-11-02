import Anthropic from "@anthropic-ai/sdk"
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod"
import { z } from "zod"

export const INVOICE_MEDIA_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const
export type InvoiceMediaType = (typeof INVOICE_MEDIA_TYPES)[number]

const extractedInvoiceSchema = z.object({
  supplierName: z.string().nullable(),
  invoiceNumber: z.string().nullable(),
  // YYYY-MM-DD, or null when the invoice shows no date.
  invoiceDate: z.string().nullable(),
  lines: z.array(
    z.object({
      // The supplier's own product code / SKU / barcode for the line, if printed.
      code: z.string().nullable(),
      name: z.string(),
      qty: z.number(),
      // Per unit, before VAT and before the line's discount.
      unitCost: z.number(),
      // The line's total discount amount (not per unit, not a percentage); 0 when none.
      discount: z.number(),
      // The line's VAT rate in percent (e.g. 15), or null when the invoice doesn't show one.
      taxPercent: z.number().nullable(),
    })
  ),
})

export type ExtractedInvoice = z.infer<typeof extractedInvoiceSchema>

export interface InvoiceExtractor {
  extract(file: { data: string; mediaType: InvoiceMediaType }): Promise<ExtractedInvoice>
}

const INSTRUCTIONS = `This is a supplier's invoice (often Saudi, Arabic and/or English). Read every product line on it.

For each line give the supplier's product code exactly as printed (SKU, item code or barcode -- null if the line has none), the product name as printed, the quantity, the unit cost before VAT, the line's total discount amount (0 if none), and the VAT rate in percent if the invoice shows one per line or for the whole invoice (null if it shows none).

If a price on the invoice includes VAT, convert it to the price before VAT. Use plain numbers (no currency symbols or thousands separators; convert Arabic-Indic digits). Skip rows that are not products: subtotals, totals, VAT rows, shipping and notes.

Also give the supplier's name, the invoice number, and the invoice date as YYYY-MM-DD (null for anything not shown).`

// Reads a supplier invoice (PDF or photo) into structured lines with Claude.
export class ClaudeInvoiceExtractor implements InvoiceExtractor {
  private readonly client: Anthropic

  constructor(
    apiKey: string,
    private readonly model: string
  ) {
    this.client = new Anthropic({ apiKey })
  }

  async extract(file: { data: string; mediaType: InvoiceMediaType }): Promise<ExtractedInvoice> {
    const fileBlock: Anthropic.Beta.BetaContentBlockParam =
      file.mediaType === "application/pdf"
        ? {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: file.data },
          }
        : {
            type: "image",
            source: { type: "base64", media_type: file.mediaType, data: file.data },
          }

    const response = await this.client.beta.messages.parse({
      model: this.model,
      max_tokens: 16000,
      // On a policy decline the API re-runs the request on a fallback model instead of stopping.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      // Low effort keeps a read well inside the load balancer's 60s idle timeout; reading a
      // table off an invoice doesn't need deep reasoning.
      output_config: { effort: "low", format: betaZodOutputFormat(extractedInvoiceSchema) },
      messages: [{ role: "user", content: [fileBlock, { type: "text", text: INSTRUCTIONS }] }],
    })

    if (response.stop_reason === "refusal" || !response.parsed_output) {
      throw new Error(`Invoice could not be read (stop_reason: ${response.stop_reason}).`)
    }
    return response.parsed_output
  }
}
