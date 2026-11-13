// Builds the unsigned UBL 2.1 XML for the Invoicing app's documents: standard tax invoices
// (B2B, cleared by ZATCA), simplified ones (B2C, reported), advance payment invoices (386) and
// credit/debit notes -- with the buyer's identification and national address, the supply date,
// several VAT categories (standard, zero-rated, exempt, out of scope), document discounts per
// category and deducted advance payments. Minified like zatca-ubl-invoice.ts (the POS builder),
// with the same two signing placeholders.
import { ZATCA_QR_PLACEHOLDER, ZATCA_SIGNATURE_PLACEHOLDER } from "./zatca-signing"
import type { ZatcaInvoiceAdjustment, ZatcaUblAddress } from "./zatca-ubl-invoice"

const NAMESPACES =
  `xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" ` +
  `xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" ` +
  `xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" ` +
  `xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"`

export type ZatcaTaxCategory = "S" | "Z" | "E" | "O"

// The buyer's identification when it has no VAT number (BT-46 scheme ids).
export type ZatcaBuyerIdScheme =
  | "TIN"
  | "CRN"
  | "MOM"
  | "MLS"
  | "700"
  | "SAG"
  | "NAT"
  | "GCC"
  | "IQA"
  | "PAS"
  | "OTH"

export interface ZatcaBuyer {
  name: string
  vatNumber: string | null
  otherId: { scheme: ZatcaBuyerIdScheme; value: string } | null
  address: (ZatcaUblAddress & { countryCode: string }) | null
}

export interface ZatcaDocumentLine {
  id: string
  name: string
  quantity: number
  // The line's amount before VAT, after its own discount.
  netAmount: number
  taxAmount: number
  taxCategory: ZatcaTaxCategory
  taxRatePercent: number
  exemptionCode: string | null
  exemptionReason: string | null
}

// A document-level discount, per VAT category it reduces.
export interface ZatcaDocumentAllowance {
  amount: number
  taxCategory: ZatcaTaxCategory
  taxRatePercent: number
  exemptionCode: string | null
  exemptionReason: string | null
}

// An advance payment invoice deducted from this one.
export interface ZatcaPrepayment {
  invoiceNumber: string
  uuid: string
  issuedAt: Date
  netAmount: number
  taxAmount: number
  taxRatePercent: number
}

export interface ZatcaDocumentInput {
  invoiceNumber: string
  uuid: string
  issuedAt: Date
  // "0100000" standard, "0200000" simplified.
  invoiceTypeName: string
  // 388 invoice, 386 advance payment; notes come from `adjustment`.
  isPrepayment: boolean
  icv: number
  previousInvoiceHashBase64: string
  sellerName: string
  sellerVatNumber: string
  sellerCommercialRegistration: string | null
  sellerAddress: ZatcaUblAddress | null
  buyer: ZatcaBuyer | null
  supplyDate: Date | null
  supplyEndDate: Date | null
  paymentMeansCode: string
  lines: ZatcaDocumentLine[]
  allowances: ZatcaDocumentAllowance[]
  prepayments: ZatcaPrepayment[]
  notes: string | null
  adjustment: ZatcaInvoiceAdjustment | null
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100
const money = (value: number) => round2(value).toFixed(2)
const amount = (tag: string, value: number) =>
  `<cbc:${tag} currencyID="SAR">${money(value)}</cbc:${tag}>`
const isoDate = (date: Date) => date.toISOString().slice(0, 10)
const isoTime = (date: Date) => date.toISOString().slice(11, 19)
const field = (tag: string, value: string | null | undefined) =>
  value ? `<cbc:${tag}>${escapeXml(value)}</cbc:${tag}>` : ""

interface CategoryKey {
  taxCategory: ZatcaTaxCategory
  taxRatePercent: number
  exemptionCode: string | null
  exemptionReason: string | null
}

// The VAT category block; a document-level one names why a non-standard category applies.
function taxCategoryXml(
  tag: "TaxCategory" | "ClassifiedTaxCategory",
  key: CategoryKey,
  withReason: boolean
): string {
  const percent = key.taxCategory === "S" ? key.taxRatePercent : 0
  return (
    `<cac:${tag}><cbc:ID>${key.taxCategory}</cbc:ID><cbc:Percent>${percent.toFixed(2)}</cbc:Percent>` +
    (withReason && key.taxCategory !== "S"
      ? field("TaxExemptionReasonCode", key.exemptionCode) +
        field("TaxExemptionReason", key.exemptionReason)
      : "") +
    `<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:${tag}>`
  )
}

const categoryId = (key: CategoryKey) =>
  `${key.taxCategory}|${key.taxCategory === "S" ? key.taxRatePercent : 0}|${key.exemptionCode ?? ""}`

function postalAddressXml(address: ZatcaUblAddress, countryCode: string): string {
  return (
    `<cac:PostalAddress>` +
    field("StreetName", address.streetName) +
    field("BuildingNumber", address.buildingNumber) +
    field("PlotIdentification", address.plotIdentification) +
    field("CitySubdivisionName", address.citySubdivisionName) +
    field("CityName", address.cityName) +
    field("PostalZone", address.postalZone) +
    `<cac:Country><cbc:IdentificationCode>${escapeXml(countryCode)}</cbc:IdentificationCode></cac:Country>` +
    `</cac:PostalAddress>`
  )
}

function supplierXml(input: ZatcaDocumentInput): string {
  return (
    `<cac:AccountingSupplierParty><cac:Party>` +
    (input.sellerCommercialRegistration
      ? `<cac:PartyIdentification><cbc:ID schemeID="CRN">${escapeXml(input.sellerCommercialRegistration)}</cbc:ID></cac:PartyIdentification>`
      : "") +
    (input.sellerAddress ? postalAddressXml(input.sellerAddress, "SA") : "") +
    `<cac:PartyTaxScheme><cbc:CompanyID>${escapeXml(input.sellerVatNumber)}</cbc:CompanyID>` +
    `<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>` +
    `<cac:PartyLegalEntity><cbc:RegistrationName>${escapeXml(input.sellerName)}</cbc:RegistrationName></cac:PartyLegalEntity>` +
    `</cac:Party></cac:AccountingSupplierParty>`
  )
}

function customerXml(buyer: ZatcaBuyer | null): string {
  if (!buyer) return `<cac:AccountingCustomerParty></cac:AccountingCustomerParty>`
  return (
    `<cac:AccountingCustomerParty><cac:Party>` +
    (!buyer.vatNumber && buyer.otherId
      ? `<cac:PartyIdentification><cbc:ID schemeID="${buyer.otherId.scheme}">${escapeXml(buyer.otherId.value)}</cbc:ID></cac:PartyIdentification>`
      : "") +
    (buyer.address ? postalAddressXml(buyer.address, buyer.address.countryCode || "SA") : "") +
    `<cac:PartyTaxScheme>` +
    (buyer.vatNumber ? `<cbc:CompanyID>${escapeXml(buyer.vatNumber)}</cbc:CompanyID>` : "") +
    `<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>` +
    `<cac:PartyLegalEntity><cbc:RegistrationName>${escapeXml(buyer.name)}</cbc:RegistrationName></cac:PartyLegalEntity>` +
    `</cac:Party></cac:AccountingCustomerParty>`
  )
}

function lineXml(line: ZatcaDocumentLine): string {
  // Price × quantity must equal the line amount, so the price is derived from it.
  const unitPrice = line.quantity > 0 ? line.netAmount / line.quantity : 0
  return (
    `<cac:InvoiceLine><cbc:ID>${escapeXml(line.id)}</cbc:ID>` +
    `<cbc:InvoicedQuantity unitCode="PCE">${line.quantity.toFixed(6)}</cbc:InvoicedQuantity>` +
    amount("LineExtensionAmount", line.netAmount) +
    `<cac:TaxTotal>${amount("TaxAmount", line.taxAmount)}` +
    `${amount("RoundingAmount", line.netAmount + line.taxAmount)}</cac:TaxTotal>` +
    `<cac:Item><cbc:Name>${escapeXml(line.name)}</cbc:Name>` +
    `${taxCategoryXml("ClassifiedTaxCategory", line, false)}</cac:Item>` +
    `<cac:Price><cbc:PriceAmount currencyID="SAR">${unitPrice.toFixed(6)}</cbc:PriceAmount></cac:Price>` +
    `</cac:InvoiceLine>`
  )
}

// The zero-amount line that names a deducted advance payment invoice (KSA-26..KSA-32). Its VAT
// breakdown stays on the line: repeated in the document's TaxTotal, ZATCA refuses the invoice
// (BR-CO-14/15) -- the sandbox clears it this way.
function prepaymentLineXml(id: string, prepayment: ZatcaPrepayment): string {
  const key: CategoryKey = {
    taxCategory: "S",
    taxRatePercent: prepayment.taxRatePercent,
    exemptionCode: null,
    exemptionReason: null,
  }
  return (
    `<cac:InvoiceLine><cbc:ID>${escapeXml(id)}</cbc:ID>` +
    `<cbc:InvoicedQuantity unitCode="PCE">0.000000</cbc:InvoicedQuantity>` +
    amount("LineExtensionAmount", 0) +
    `<cac:DocumentReference><cbc:ID>${escapeXml(prepayment.invoiceNumber)}</cbc:ID>` +
    `<cbc:UUID>${escapeXml(prepayment.uuid)}</cbc:UUID>` +
    `<cbc:IssueDate>${isoDate(prepayment.issuedAt)}</cbc:IssueDate>` +
    `<cbc:IssueTime>${isoTime(prepayment.issuedAt)}</cbc:IssueTime>` +
    `<cbc:DocumentTypeCode>386</cbc:DocumentTypeCode></cac:DocumentReference>` +
    `<cac:TaxTotal>${amount("TaxAmount", 0)}${amount("RoundingAmount", 0)}` +
    `<cac:TaxSubtotal>${amount("TaxableAmount", prepayment.netAmount)}${amount("TaxAmount", prepayment.taxAmount)}` +
    `${taxCategoryXml("TaxCategory", key, false)}</cac:TaxSubtotal></cac:TaxTotal>` +
    `<cac:Item><cbc:Name>Prepayment adjustment</cbc:Name>` +
    `${taxCategoryXml("ClassifiedTaxCategory", key, false)}</cac:Item>` +
    `<cac:Price><cbc:PriceAmount currencyID="SAR">0.00</cbc:PriceAmount></cac:Price>` +
    `</cac:InvoiceLine>`
  )
}

export interface ZatcaDocumentTotals {
  lineTotal: number
  allowanceTotal: number
  taxExclusive: number
  taxAmount: number
  taxInclusive: number
  prepaidAmount: number
  payableAmount: number
}

// The VAT breakdown per category: lines less that category's document discount, and the VAT on it.
export function zatcaTaxSubtotals(
  lines: ZatcaDocumentLine[],
  allowances: ZatcaDocumentAllowance[]
): Array<CategoryKey & { taxableAmount: number; taxAmount: number }> {
  const groups = new Map<string, CategoryKey & { taxableAmount: number; taxAmount: number }>()
  const group = (key: CategoryKey) => {
    const id = categoryId(key)
    let entry = groups.get(id)
    if (!entry) {
      entry = {
        taxCategory: key.taxCategory,
        taxRatePercent: key.taxCategory === "S" ? key.taxRatePercent : 0,
        exemptionCode: key.exemptionCode,
        exemptionReason: key.exemptionReason,
        taxableAmount: 0,
        taxAmount: 0,
      }
      groups.set(id, entry)
    }
    return entry
  }
  for (const line of lines) group(line).taxableAmount += line.netAmount
  for (const allowance of allowances) group(allowance).taxableAmount -= allowance.amount
  for (const entry of groups.values()) {
    entry.taxableAmount = round2(entry.taxableAmount)
    entry.taxAmount = round2((entry.taxableAmount * entry.taxRatePercent) / 100)
  }
  return [...groups.values()]
}

export function zatcaDocumentTotals(
  input: Pick<ZatcaDocumentInput, "lines" | "allowances" | "prepayments">
): ZatcaDocumentTotals {
  const lineTotal = round2(input.lines.reduce((sum, line) => sum + line.netAmount, 0))
  const allowanceTotal = round2(input.allowances.reduce((sum, entry) => sum + entry.amount, 0))
  const taxExclusive = round2(lineTotal - allowanceTotal)
  const taxAmount = round2(
    zatcaTaxSubtotals(input.lines, input.allowances).reduce(
      (sum, entry) => sum + entry.taxAmount,
      0
    )
  )
  const taxInclusive = round2(taxExclusive + taxAmount)
  const prepaidAmount = round2(
    input.prepayments.reduce((sum, entry) => sum + entry.netAmount + entry.taxAmount, 0)
  )
  return {
    lineTotal,
    allowanceTotal,
    taxExclusive,
    taxAmount,
    taxInclusive,
    prepaidAmount,
    payableAmount: round2(taxInclusive - prepaidAmount),
  }
}

export function buildZatcaDocumentXml(input: ZatcaDocumentInput): string {
  const totals = zatcaDocumentTotals(input)
  const subtotals = zatcaTaxSubtotals(input.lines, input.allowances)
  const adjustment = input.adjustment
  const typeCode = adjustment
    ? adjustment.type === "credit"
      ? 381
      : 383
    : input.isPrepayment
      ? 386
      : 388
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Invoice ${NAMESPACES}>` +
    `<ext:UBLExtensions>${ZATCA_SIGNATURE_PLACEHOLDER}</ext:UBLExtensions>` +
    `<cbc:ProfileID>reporting:1.0</cbc:ProfileID>` +
    `<cbc:ID>${escapeXml(input.invoiceNumber)}</cbc:ID>` +
    `<cbc:UUID>${escapeXml(input.uuid)}</cbc:UUID>` +
    `<cbc:IssueDate>${isoDate(input.issuedAt)}</cbc:IssueDate>` +
    `<cbc:IssueTime>${isoTime(input.issuedAt)}</cbc:IssueTime>` +
    `<cbc:InvoiceTypeCode name="${escapeXml(input.invoiceTypeName)}">${typeCode}</cbc:InvoiceTypeCode>` +
    (input.notes ? `<cbc:Note>${escapeXml(input.notes)}</cbc:Note>` : "") +
    `<cbc:DocumentCurrencyCode>SAR</cbc:DocumentCurrencyCode>` +
    `<cbc:TaxCurrencyCode>SAR</cbc:TaxCurrencyCode>` +
    (adjustment
      ? `<cac:BillingReference><cac:InvoiceDocumentReference><cbc:ID>${escapeXml(adjustment.originalInvoiceNumber)}</cbc:ID></cac:InvoiceDocumentReference></cac:BillingReference>`
      : "") +
    `<cac:AdditionalDocumentReference><cbc:ID>ICV</cbc:ID><cbc:UUID>${input.icv}</cbc:UUID></cac:AdditionalDocumentReference>` +
    `<cac:AdditionalDocumentReference><cbc:ID>PIH</cbc:ID><cac:Attachment>` +
    `<cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">${escapeXml(input.previousInvoiceHashBase64)}</cbc:EmbeddedDocumentBinaryObject>` +
    `</cac:Attachment></cac:AdditionalDocumentReference>` +
    `<cac:AdditionalDocumentReference><cbc:ID>QR</cbc:ID><cac:Attachment>` +
    `<cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">${ZATCA_QR_PLACEHOLDER}</cbc:EmbeddedDocumentBinaryObject>` +
    `</cac:Attachment></cac:AdditionalDocumentReference>` +
    `<cac:Signature><cbc:ID>urn:oasis:names:specification:ubl:signature:Invoice</cbc:ID>` +
    `<cbc:SignatureMethod>urn:oasis:names:specification:ubl:dsig:enveloped:xades</cbc:SignatureMethod></cac:Signature>` +
    supplierXml(input) +
    customerXml(input.buyer) +
    (input.supplyDate
      ? `<cac:Delivery><cbc:ActualDeliveryDate>${isoDate(input.supplyDate)}</cbc:ActualDeliveryDate>` +
        (input.supplyEndDate
          ? `<cbc:LatestDeliveryDate>${isoDate(input.supplyEndDate)}</cbc:LatestDeliveryDate>`
          : "") +
        `</cac:Delivery>`
      : "") +
    `<cac:PaymentMeans><cbc:PaymentMeansCode>${escapeXml(input.paymentMeansCode)}</cbc:PaymentMeansCode>` +
    (adjustment
      ? `<cbc:InstructionNote>${escapeXml(adjustment.reason)}</cbc:InstructionNote>`
      : "") +
    `</cac:PaymentMeans>` +
    input.allowances
      .filter((allowance) => allowance.amount > 0.004)
      .map(
        (allowance) =>
          `<cac:AllowanceCharge><cbc:ChargeIndicator>false</cbc:ChargeIndicator>` +
          `<cbc:AllowanceChargeReason>discount</cbc:AllowanceChargeReason>` +
          `${amount("Amount", allowance.amount)}${taxCategoryXml("TaxCategory", allowance, true)}</cac:AllowanceCharge>`
      )
      .join("") +
    // ZATCA wants the VAT total twice: once on its own, once with its breakdown.
    `<cac:TaxTotal>${amount("TaxAmount", totals.taxAmount)}</cac:TaxTotal>` +
    `<cac:TaxTotal>${amount("TaxAmount", totals.taxAmount)}` +
    subtotals
      .map(
        (entry) =>
          `<cac:TaxSubtotal>${amount("TaxableAmount", entry.taxableAmount)}${amount("TaxAmount", entry.taxAmount)}` +
          `${taxCategoryXml("TaxCategory", entry, true)}</cac:TaxSubtotal>`
      )
      .join("") +
    `</cac:TaxTotal>` +
    `<cac:LegalMonetaryTotal>` +
    amount("LineExtensionAmount", totals.lineTotal) +
    amount("TaxExclusiveAmount", totals.taxExclusive) +
    amount("TaxInclusiveAmount", totals.taxInclusive) +
    amount("AllowanceTotalAmount", totals.allowanceTotal) +
    (totals.prepaidAmount > 0 ? amount("PrepaidAmount", totals.prepaidAmount) : "") +
    amount("PayableAmount", totals.payableAmount) +
    `</cac:LegalMonetaryTotal>` +
    input.lines.map(lineXml).join("") +
    input.prepayments
      .map((prepayment, index) =>
        prepaymentLineXml(String(input.lines.length + index + 1), prepayment)
      )
      .join("") +
    `</Invoice>`
  )
}
