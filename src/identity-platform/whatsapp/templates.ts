import { IdentityError } from "../application/errors/IdentityError"
import { renderInvoicePdf } from "../pdf/invoice-pdf"
import { WhatsAppApiError } from "./cloud-api"
import {
  getTemplateStatus,
  submitTemplate,
  type TemplateDefinition,
  type TemplateStatus,
} from "./messaging"
import type { WhatsAppPlatformService, WhatsAppSendingContext } from "./platform-config"

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
  // Meta refuses a template that starts or ends with a variable (a trailing "." doesn't count),
  // hence the closing line.
  body: "مرحباً {{1}}،\nشكراً لتسوقك من {{2}}. مرفقة فاتورتك رقم {{3}} بإجمالي {{4}}.\nنسعد بخدمتك دائماً.",
  bodyExamples: ["عبدالله", "متجر الريم", "INV-000068", "57.50 ر.س"],
  footer: "أُرسلت عبر مدار",
}

// The daily store report sent to the merchant's chosen numbers (whatsapp/daily-report.ts).
// Utility -- an update about the merchant's own account. Meta's rules shape it: a variable can't
// hold a line break, so the lists are a fixed number of lines ("—" when empty), and the body
// can't end with a variable, hence the closing line.
//   {{1}} day · {{2}}-{{5}} sales, purchases, expenses, returns · {{6}}-{{10}} shifts: total,
//   closed, open, cash difference, working hours · {{11}}-{{14}} payments: cash, card, bank
//   transfer, other · {{15}}-{{17}} best sellers · {{18}}-{{20}} low stock
export const DAILY_REPORT_TEMPLATE: TemplateDefinition = {
  name: "madar_daily_report",
  language: "ar",
  category: "UTILITY",
  body: [
    "📊 *تقريرك اليومي مع مدار*",
    "ملخص أداء متجرك ليوم *{{1}}*",
    "",
    "💰 *الملخص المالي*",
    "• المبيعات: {{2}} ر.س",
    "• المشتريات: {{3}} ر.س",
    "• المصروفات: {{4}} ر.س",
    "• المرتجعات: {{5}} ر.س",
    "",
    "⏱️ *الورديات*",
    "• إجمالي الورديات: {{6}}",
    "• الورديات المغلقة: {{7}}",
    "• الورديات المفتوحة: {{8}}",
    "• فرق الصندوق: {{9}} ر.س",
    "• إجمالي ساعات العمل: {{10}}",
    "",
    "💳 *طرق الدفع*",
    "• نقدي: {{11}} ر.س",
    "• شبكة: {{12}} ر.س",
    "• تحويل بنكي: {{13}} ر.س",
    "• أخرى: {{14}} ر.س",
    "",
    "🏆 *الأكثر مبيعاً*",
    "• {{15}}",
    "• {{16}}",
    "• {{17}}",
    "",
    "⚠️ *منتجات منخفضة المخزون*",
    "• {{18}}",
    "• {{19}}",
    "• {{20}}",
    "",
    "💙 *مدار، شريكك التقني في عالم التجزئة.*",
  ].join("\n"),
  bodyExamples: [
    "2026-01-14",
    "1,170",
    "1,000",
    "0",
    "0",
    "3",
    "2",
    "1",
    "0",
    "17.5",
    "820",
    "350",
    "0",
    "0",
    "هيل أمريكي 1: 8",
    "فستان سهرة راقٍ: 2",
    "قهوة عربية: 1",
    "باب ألمنيوم: -8.3",
    "حماية كاميرا 15 برو: -3",
    "هيل أمريكي 1: -2",
  ],
}

// The alert Madar's own team gets when a new lead arrives (whatsapp/lead-alerts.ts): {{1}} what
// happened (a "talk to sales" request or a new account), {{2}} name, {{3}} mobile, {{4}} email,
// {{5}} where they came from. Worded as a plain account notice -- no emoji, no "lead", no call to
// action -- because Meta filed the first version (below) under marketing, and marketing messages
// are capped per recipient: after three alerts in one night the rest were dropped (error 131049).
export const LEAD_ALERT_TEMPLATE: TemplateDefinition = {
  name: "madar_account_alert",
  language: "ar",
  category: "UTILITY",
  body: [
    "تنبيه من حسابك في مدار",
    "تم استلام طلب جديد في حسابك.",
    "",
    "• النوع: {{1}}",
    "• الاسم: {{2}}",
    "• الجوال: {{3}}",
    "• البريد: {{4}}",
    "• المصدر: {{5}}",
    "",
    "هذه رسالة تلقائية من نظام مدار.",
  ].join("\n"),
  bodyExamples: [
    "تسجيل حساب جديد",
    "مؤسسة الريم التجارية",
    "0551234567",
    "info@example.com",
    "الموقع",
  ],
}

// The first version of that alert, with the same five values. Meta filed it under marketing; it
// is only sent while Meta hasn't approved the one above, and isn't offered for submission.
export const FIRST_LEAD_ALERT_TEMPLATE: TemplateDefinition = {
  name: "madar_new_lead",
  language: "ar",
  category: "UTILITY",
  body: [
    "🔔 *عميل محتمل جديد في مدار*",
    "النوع: {{1}}",
    "",
    "• الاسم: {{2}}",
    "• الجوال: {{3}}",
    "• البريد: {{4}}",
    "• المصدر: {{5}}",
    "",
    "افتح لوحة إدارة مدار لمتابعة العميل.",
  ].join("\n"),
  bodyExamples: [
    "طلب تواصل مع المبيعات",
    "مؤسسة الريم التجارية",
    "0551234567",
    "info@example.com",
    "snapchat",
  ],
}

export const MADAR_TEMPLATES: TemplateDefinition[] = [
  POS_INVOICE_TEMPLATE,
  DAILY_REPORT_TEMPLATE,
  LEAD_ALERT_TEMPLATE,
]

// The sample document Meta reviews with a document-header template.
export function sampleDocument(template: TemplateDefinition) {
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

  // Whether a template can be sent right now (an approval is remembered for a few minutes) -- on
  // Madar's own account, or on the account `sendingFrom` belongs to (a merchant's own number,
  // whose templates are approved on their own account).
  async requireApproved(
    template: TemplateDefinition,
    sendingFrom?: WhatsAppSendingContext
  ): Promise<void> {
    const context = sendingFrom ?? (await this.platform.sendingContext())
    const cacheKey = `${context.wabaId}:${template.name}`
    const cachedAt = this.approvedCache.get(cacheKey)
    if (cachedAt && Date.now() - cachedAt < STATUS_CACHE_MS) return
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
    this.approvedCache.set(cacheKey, Date.now())
  }
}
