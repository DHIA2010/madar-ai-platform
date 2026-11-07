import { IdentityError } from "../application/errors/IdentityError"
import { renderInvoicePdf } from "../pdf/invoice-pdf"
import { WhatsAppApiError } from "./cloud-api"
import {
  getTemplateStatus,
  submitTemplate,
  type TemplateDefinition,
  type TemplateStatus,
} from "./messaging"
import type { WhatsAppPlatformService } from "./platform-config"

// The message templates Madar sends from its own number. Meta must approve each one before it can
// be used (usually minutes to a few hours); Madar Admin -> settings -> WhatsApp submits them and
// shows where each stands.

// A POS sale's receipt, the PDF attached: {{1}} customer, {{2}} store, {{3}} invoice number,
// {{4}} total. Utility (a transaction the customer just made), so no marketing opt-in is needed.
export const POS_INVOICE_TEMPLATE: TemplateDefinition = {
  name: "madar_pos_invoice",
  language: "ar",
  category: "UTILITY",
  documentHeader: true,
  body: "مرحباً {{1}}،\nشكراً لتسوقك من {{2}}. مرفقة فاتورتك رقم {{3}} بإجمالي {{4}}.",
  bodyExamples: ["عبدالله", "متجر الريم", "INV-000068", "57.50 ر.س"],
  footer: "أُرسلت عبر مدار",
}

export const MADAR_TEMPLATES: TemplateDefinition[] = [POS_INVOICE_TEMPLATE]

// The sample document Meta reviews with a document-header template.
function sampleDocument(template: TemplateDefinition) {
  if (template.name !== POS_INVOICE_TEMPLATE.name) return undefined
  return {
    filename: "INV-000068.pdf",
    bytes: renderInvoicePdf({
      invoiceNumber: "INV-000068",
      orderNumber: null,
      createdAt: new Date().toISOString(),
      sellerName: "متجر الريم",
      sellerVatNumber: "300000000000003",
      sellerAddress: "الرياض",
      customerName: "عبدالله",
      customerPhone: null,
      customerVatNumber: null,
      items: [{ productName: "قهوة عربية", quantity: 2, netAmount: 50, taxAmount: 7.5 }],
      subtotalAmount: 50,
      discountAmount: 0,
      taxAmount: 7.5,
      totalAmount: 57.5,
      payments: [{ label: "مدى", amount: 57.5 }],
      qrCode: null,
      notes: null,
    }),
  }
}

const STATUS_CACHE_MS = 5 * 60_000

export class WhatsAppTemplatesService {
  private approvedCache = new Map<string, number>()

  constructor(private readonly platform: WhatsAppPlatformService) {}

  async statuses(): Promise<Array<TemplateStatus & { category: string }>> {
    const context = await this.platform.sendingContext()
    return Promise.all(
      MADAR_TEMPLATES.map(async (template) => ({
        ...(await getTemplateStatus(
          context.auth,
          context.wabaId,
          template.name,
          template.language
        )),
        category: template.category,
      }))
    )
  }

  async submit(name: string): Promise<TemplateStatus> {
    const template = MADAR_TEMPLATES.find((entry) => entry.name === name)
    if (!template) {
      throw new IdentityError("WHATSAPP_TEMPLATE_UNKNOWN", 404, "business", "Unknown template.")
    }
    const context = await this.platform.sendingContext()
    try {
      await submitTemplate(context.auth, {
        wabaId: context.wabaId,
        appId: context.appId,
        template,
        sampleDocument: sampleDocument(template),
      })
    } catch (error) {
      if (error instanceof WhatsAppApiError) {
        throw new IdentityError("WHATSAPP_REJECTED", 422, "business", error.message)
      }
      throw error
    }
    return getTemplateStatus(context.auth, context.wabaId, template.name, template.language)
  }

  // Whether a template can be sent right now (an approval is remembered for a few minutes).
  async requireApproved(template: TemplateDefinition): Promise<void> {
    const cachedAt = this.approvedCache.get(template.name)
    if (cachedAt && Date.now() - cachedAt < STATUS_CACHE_MS) return
    const context = await this.platform.sendingContext()
    const status = await getTemplateStatus(
      context.auth,
      context.wabaId,
      template.name,
      template.language
    )
    if (status.status !== "APPROVED") {
      throw new IdentityError(
        "WHATSAPP_TEMPLATE_NOT_READY",
        409,
        "business",
        `The WhatsApp template "${template.name}" isn't approved by Meta yet (${status.status}).`,
        { status: status.status }
      )
    }
    this.approvedCache.set(template.name, Date.now())
  }
}
