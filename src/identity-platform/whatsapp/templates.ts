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

// The daily ads report sent to the merchant's chosen numbers (whatsapp/ads-report.ts). Utility --
// an update about the merchant's own ad accounts, worded as a plain account report with no call
// to action (Meta files anything promotional under marketing, which is capped per recipient).
// Fixed lines, "—" when empty, as in the daily store report.
//   {{1}} day · {{2}}-{{6}} spend, impressions, clicks, results, cost per result ·
//   {{7}}-{{9}} one line per ad platform · {{10}}-{{12}} the check-up's findings
export const ADS_REPORT_TEMPLATE: TemplateDefinition = {
  name: "madar_ads_report",
  language: "ar",
  category: "UTILITY",
  body: [
    "📊 *تقرير إعلاناتك اليومي مع مدار*",
    "ملخص أداء حملاتك ليوم *{{1}}*",
    "",
    "💰 *الملخص*",
    "• الصرف: {{2}}",
    "• مرات الظهور: {{3}}",
    "• النقرات: {{4}}",
    "• النتائج: {{5}}",
    "• تكلفة النتيجة: {{6}}",
    "",
    "📱 *حسب المنصة*",
    "• {{7}}",
    "• {{8}}",
    "• {{9}}",
    "",
    "⚠️ *ملاحظات فحص الحملات*",
    "• {{10}}",
    "• {{11}}",
    "• {{12}}",
    "",
    "هذه رسالة تلقائية من حسابك في مدار.",
  ].join("\n"),
  bodyExamples: [
    "2026-01-14",
    "150 ر.س",
    "12,400",
    "310",
    "4",
    "37.5 ر.س",
    "سناب شات: 100 ر.س · نقرات 210 · نتائج 3",
    "تيك توك: 50 ر.س · نقرات 100 · نتائج 1",
    "—",
    "حملة «عروض الشتاء» وصلت ميزانيتها اليومية",
    "إعلان «فيديو الكاشير» نقراته أقل من بقية الإعلانات",
    "—",
  ],
}

// The alert Madar's own team gets when a new lead arrives (whatsapp/lead-alerts.ts): {{1}} what
// happened, {{2}} name, {{3}} mobile, {{4}} email, {{5}} where they came from.
export const LEAD_ALERT_TEMPLATE: TemplateDefinition = {
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

// The team's alert for a brand-new account (the app's sign-up form or Google sign-up), with the
// same five values. A message of its own, worded as a plain account notice -- no emoji, no call to
// action -- because Meta filed the lead alert above under marketing, and marketing messages are
// capped per recipient: after three alerts in one night the sign-up ones were dropped (error
// 131049).
export const SIGNUP_ALERT_TEMPLATE: TemplateDefinition = {
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

// The Booking app's two messages to a business's customers (booking/automation.ts): a booking
// confirmed, and a reminder before it. Plain facts and the customer's own booking link -- no
// offer and no call to act, so Meta keeps them as utility messages. The link is a value rather
// than a button (templates here carry no buttons), followed by a closing line because a template
// cannot end on a value.
export const BOOKING_CONFIRMATION_TEMPLATE: TemplateDefinition = {
  name: "madar_booking_confirmation",
  language: "ar",
  category: "UTILITY",
  body: [
    "مرحباً {{1}}،",
    "تم تأكيد حجزك لدى {{2}}.",
    "الخدمة: {{3}}",
    "الموعد: {{4}} الساعة {{5}}",
    "تفاصيل الحجز: {{6}}",
    "نسعد بخدمتك.",
  ].join("\n"),
  bodyExamples: [
    "نورة",
    "صالون نور",
    "قص شعر",
    "الأحد 22 نوفمبر",
    "10:00 ص",
    "https://app.madar.my/bk/abc123",
  ],
  footer: "أُرسلت عبر مدار",
}

export const BOOKING_REMINDER_TEMPLATE: TemplateDefinition = {
  name: "madar_booking_reminder",
  language: "ar",
  category: "UTILITY",
  body: [
    "مرحباً {{1}}،",
    "نذكّرك بموعدك لدى {{2}}.",
    "الخدمة: {{3}}",
    "الموعد: {{4}} الساعة {{5}}",
    "تفاصيل الحجز: {{6}}",
    "بانتظارك.",
  ].join("\n"),
  bodyExamples: [
    "نورة",
    "صالون نور",
    "قص شعر",
    "الأحد 22 نوفمبر",
    "10:00 ص",
    "https://app.madar.my/bk/abc123",
  ],
  footer: "أُرسلت عبر مدار",
}

// The sign-in code a business's customer gets on a booking page (booking/accounts.ts). Meta's
// own fixed wording for codes; the code lasts as long as the server keeps it.
export const LOGIN_CODE_TEMPLATE: TemplateDefinition = {
  name: "madar_login_code",
  language: "ar",
  category: "AUTHENTICATION",
  body: "{{1}} هو رمز التحقق الخاص بك. حرصًا على أمانك، لا تشارك هذا الرمز.",
  bodyExamples: ["123456"],
  code: { expiresMinutes: 10, buttonText: "نسخ الرمز" },
}

// A gift card sent to the person it is for (booking/automation.ts), when the business asks for
// it to go out by itself: who it is from, where, how much, and where to open it. Filed as
// marketing: Meta refused it as a utility message (INCORRECT_CATEGORY, 22 November 2026), since
// the person receiving it has asked the business for nothing. A refused name cannot be submitted
// again, hence the "_notice" name. Marketing messages are capped per recipient by Meta, so one
// may be held back (error 131049); the business then sends the card by hand.
export const GIFT_CARD_TEMPLATE: TemplateDefinition = {
  name: "madar_gift_card_notice",
  language: "ar",
  category: "MARKETING",
  body: [
    "مرحباً {{1}}،",
    "وصلتك بطاقة هدية لدى {{2}}.",
    "من: {{3}}",
    "قيمة البطاقة: {{4}}",
    "بطاقتك ورمز استخدامها: {{5}}",
    "نسعد بخدمتك.",
  ].join("\n"),
  bodyExamples: ["نورة", "صالون نور", "سارة", "300 ر.س", "https://app.madar.my/bk/gift/abc123"],
  footer: "أُرسلت عبر مدار",
}

export const MADAR_TEMPLATES: TemplateDefinition[] = [
  POS_INVOICE_TEMPLATE,
  DAILY_REPORT_TEMPLATE,
  ADS_REPORT_TEMPLATE,
  LEAD_ALERT_TEMPLATE,
  SIGNUP_ALERT_TEMPLATE,
  BOOKING_CONFIRMATION_TEMPLATE,
  BOOKING_REMINDER_TEMPLATE,
  LOGIN_CODE_TEMPLATE,
  GIFT_CARD_TEMPLATE,
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
