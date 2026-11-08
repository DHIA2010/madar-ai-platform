import { createHmac, timingSafeEqual } from "node:crypto"

import type { InvoiceView } from "../pos/invoices-service"
import { toWhatsAppNumber } from "./invoice-sender"

// A POS invoice shared on WhatsApp from the merchant's own WhatsApp (Web or app): Madar opens the
// customer's chat with a ready message, and the message carries a link to the invoice PDF -- a
// WhatsApp link can carry text only, not a file. The link is the invoice id plus a signature, so it
// can't be guessed or changed to reach another invoice, and needs no table of its own.

function secret(): string {
  const value = process.env.IDENTITY_PLATFORM_TOKEN_HASH_SECRET
  if (!value) throw new Error("IDENTITY_PLATFORM_TOKEN_HASH_SECRET is not set.")
  return value
}

function sign(invoiceId: string): string {
  return createHmac("sha256", secret())
    .update(`pos-invoice-link:${invoiceId}`)
    .digest("base64url")
    .slice(0, 32)
}

export function invoiceLinkToken(invoiceId: string): string {
  return `${invoiceId}.${sign(invoiceId)}`
}

// The invoice id a link token stands for, or null when the signature doesn't match.
export function invoiceIdFromLinkToken(token: string): string | null {
  const [invoiceId, signature] = token.split(".")
  if (!invoiceId || !signature || !/^[0-9a-f-]{36}$/i.test(invoiceId)) return null
  const expected = Buffer.from(sign(invoiceId))
  const given = Buffer.from(signature)
  return expected.length === given.length && timingSafeEqual(expected, given) ? invoiceId : null
}

export interface InvoiceWhatsAppLink {
  // The customer's number in WhatsApp's form (digits, country code first), or null when the sale
  // has none or it isn't a valid mobile -- the cashier then types it.
  phone: string | null
  // The invoice PDF.
  url: string
  // The ready message, ending with the link.
  message: string
}

export function invoiceWhatsAppLink(invoice: InvoiceView, appUrl: string): InvoiceWhatsAppLink {
  const url = `${appUrl}/i/${invoiceLinkToken(invoice.id)}`
  const customer = invoice.customerName?.trim() || "عميلنا العزيز"
  const store = invoice.sellerName?.trim() || "متجرنا"
  const message =
    `مرحباً ${customer}،\n` +
    `شكراً لتسوقك من ${store}.\n` +
    `فاتورتك رقم ${invoice.invoiceNumber} بإجمالي ${invoice.totalAmount.toFixed(2)} ر.س:\n` +
    url
  return {
    phone: invoice.customerPhone ? toWhatsAppNumber(invoice.customerPhone) : null,
    url,
    message,
  }
}
