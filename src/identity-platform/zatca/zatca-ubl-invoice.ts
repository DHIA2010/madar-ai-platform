// Builds the unsigned UBL 2.1 XML for a ZATCA Phase 2 Simplified Tax Invoice, minified (no
// whitespace between elements) so the hash zatca-signing.ts computes matches ZATCA's own. Leaves
// two placeholders for signing: the signature block inside ext:UBLExtensions and the QR data --
// both outside what the signature covers. The layout (element order, the two TaxTotal blocks,
// PaymentMeans, the cac:Signature ID) is what ZATCA's developer-portal sandbox accepts: PASS /
// REPORTED with no warnings.
import { ZATCA_QR_PLACEHOLDER, ZATCA_SIGNATURE_PLACEHOLDER } from "./zatca-signing"

const NAMESPACES =
  `xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" ` +
  `xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" ` +
  `xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" ` +
  `xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"`

// The Saudi national address ZATCA's PostalAddress expects. plotIdentification carries the
// "additional number" (الرقم الإضافي).
export interface ZatcaUblAddress {
  streetName: string | null
  buildingNumber: string | null
  plotIdentification: string | null
  citySubdivisionName: string | null
  cityName: string | null
  postalZone: string | null
}

export interface ZatcaUblInvoiceLine {
  id: string
  productName: string
  quantity: number
  unitPrice: number
  // The line's amount before VAT (after any line discount).
  netAmount: number
  taxAmount: number
  taxRatePercent: number
}

export interface ZatcaInvoiceAdjustment {
  type: "credit" | "debit"
  originalInvoiceNumber: string
  reason: string
}

export interface ZatcaUblInvoiceInput {
  invoiceNumber: string
  uuid: string
  issuedAt: Date
  // "0200000" for a simplified (B2C) tax invoice.
  invoiceTypeName: string
  icv: number
  previousInvoiceHashBase64: string
  sellerName: string
  sellerVatNumber: string
  // Commercial registration number, when known (ZATCA warns without one).
  sellerCommercialRegistration?: string | null
  sellerAddress: ZatcaUblAddress | null
  customerName: string | null
  customerVatNumber: string | null
  subtotalAmount: number
  discountAmount: number
  taxAmount: number
  totalAmount: number
  taxRatePercent: number
  lines: ZatcaUblInvoiceLine[]
  notes: string | null
  // Set for a credit note (إشعار دائن, type 381) or a debit note (إشعار مدين, 383): the invoice
  // it corrects and why it was issued. Its amounts stay positive, like an invoice's.
  adjustment?: ZatcaInvoiceAdjustment | null
}

// The PIH of a device's very first invoice: base64 of the hex SHA-256 of "0", as ZATCA specifies.
export const ZATCA_GENESIS_PIH_BASE64 =
  "NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI0NjcyOWQ3M2EyN2ZiNTdlOQ=="

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

const round2 = (value: number) => Math.round(value * 100) / 100
const money = (value: number) => round2(value).toFixed(2)
const amount = (tag: string, value: number) =>
  `<cbc:${tag} currencyID="SAR">${money(value)}</cbc:${tag}>`

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function isoTime(date: Date): string {
  return date.toISOString().slice(11, 19)
}

const taxCategory = (tag: "TaxCategory" | "ClassifiedTaxCategory", percent: number) =>
  `<cac:${tag}><cbc:ID>S</cbc:ID><cbc:Percent>${percent.toFixed(2)}</cbc:Percent>` +
  `<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:${tag}>`

function postalAddressXml(address: ZatcaUblAddress): string {
  const field = (tag: string, value: string | null) =>
    value ? `<cbc:${tag}>${escapeXml(value)}</cbc:${tag}>` : ""
  return (
    `<cac:PostalAddress>` +
    field("StreetName", address.streetName) +
    field("BuildingNumber", address.buildingNumber) +
    field("PlotIdentification", address.plotIdentification) +
    field("CitySubdivisionName", address.citySubdivisionName) +
    field("CityName", address.cityName) +
    field("PostalZone", address.postalZone) +
    `<cac:Country><cbc:IdentificationCode>SA</cbc:IdentificationCode></cac:Country>` +
    `</cac:PostalAddress>`
  )
}

function supplierXml(input: ZatcaUblInvoiceInput): string {
  return (
    `<cac:AccountingSupplierParty><cac:Party>` +
    (input.sellerCommercialRegistration
      ? `<cac:PartyIdentification><cbc:ID schemeID="CRN">${escapeXml(input.sellerCommercialRegistration)}</cbc:ID></cac:PartyIdentification>`
      : "") +
    (input.sellerAddress ? postalAddressXml(input.sellerAddress) : "") +
    `<cac:PartyTaxScheme><cbc:CompanyID>${escapeXml(input.sellerVatNumber)}</cbc:CompanyID>` +
    `<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>` +
    `<cac:PartyLegalEntity><cbc:RegistrationName>${escapeXml(input.sellerName)}</cbc:RegistrationName></cac:PartyLegalEntity>` +
    `</cac:Party></cac:AccountingSupplierParty>`
  )
}

// A simplified invoice may leave the buyer out entirely (an empty element).
function customerXml(input: ZatcaUblInvoiceInput): string {
  if (!input.customerName) return `<cac:AccountingCustomerParty></cac:AccountingCustomerParty>`
  return (
    `<cac:AccountingCustomerParty><cac:Party>` +
    (input.customerVatNumber
      ? `<cac:PartyTaxScheme><cbc:CompanyID>${escapeXml(input.customerVatNumber)}</cbc:CompanyID>` +
        `<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>`
      : "") +
    `<cac:PartyLegalEntity><cbc:RegistrationName>${escapeXml(input.customerName)}</cbc:RegistrationName></cac:PartyLegalEntity>` +
    `</cac:Party></cac:AccountingCustomerParty>`
  )
}

function lineXml(line: ZatcaUblInvoiceLine): string {
  // Price × quantity must equal the line amount, so the price is derived from it.
  const unitPrice = line.quantity > 0 ? line.netAmount / line.quantity : line.unitPrice
  return (
    `<cac:InvoiceLine><cbc:ID>${escapeXml(line.id)}</cbc:ID>` +
    `<cbc:InvoicedQuantity unitCode="PCE">${line.quantity.toFixed(6)}</cbc:InvoicedQuantity>` +
    amount("LineExtensionAmount", line.netAmount) +
    `<cac:TaxTotal>${amount("TaxAmount", line.taxAmount)}` +
    `${amount("RoundingAmount", line.netAmount + line.taxAmount)}</cac:TaxTotal>` +
    `<cac:Item><cbc:Name>${escapeXml(line.productName)}</cbc:Name>` +
    `${taxCategory("ClassifiedTaxCategory", line.taxRatePercent)}</cac:Item>` +
    `<cac:Price><cbc:PriceAmount currencyID="SAR">${unitPrice.toFixed(6)}</cbc:PriceAmount></cac:Price>` +
    `</cac:InvoiceLine>`
  )
}

export function buildZatcaUblInvoiceXml(input: ZatcaUblInvoiceInput): string {
  const lineTotal = round2(input.lines.reduce((sum, line) => sum + line.netAmount, 0))
  const taxExclusive = round2(input.subtotalAmount - input.discountAmount)
  // A discount not already in the line amounts becomes a document-level allowance.
  const documentAllowance = round2(lineTotal - taxExclusive)
  const adjustment = input.adjustment ?? null
  const typeCode = adjustment ? (adjustment.type === "credit" ? 381 : 383) : 388

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
    customerXml(input) +
    `<cac:PaymentMeans><cbc:PaymentMeansCode>10</cbc:PaymentMeansCode>` +
    (adjustment
      ? `<cbc:InstructionNote>${escapeXml(adjustment.reason)}</cbc:InstructionNote>`
      : "") +
    `</cac:PaymentMeans>` +
    (documentAllowance > 0.004
      ? `<cac:AllowanceCharge><cbc:ChargeIndicator>false</cbc:ChargeIndicator>` +
        `<cbc:AllowanceChargeReason>discount</cbc:AllowanceChargeReason>` +
        `${amount("Amount", documentAllowance)}${taxCategory("TaxCategory", input.taxRatePercent)}</cac:AllowanceCharge>`
      : "") +
    // ZATCA wants the VAT total twice: once on its own, once with its breakdown.
    `<cac:TaxTotal>${amount("TaxAmount", input.taxAmount)}</cac:TaxTotal>` +
    `<cac:TaxTotal>${amount("TaxAmount", input.taxAmount)}<cac:TaxSubtotal>` +
    `${amount("TaxableAmount", taxExclusive)}${amount("TaxAmount", input.taxAmount)}` +
    `${taxCategory("TaxCategory", input.taxRatePercent)}</cac:TaxSubtotal></cac:TaxTotal>` +
    `<cac:LegalMonetaryTotal>` +
    amount("LineExtensionAmount", lineTotal) +
    amount("TaxExclusiveAmount", taxExclusive) +
    amount("TaxInclusiveAmount", taxExclusive + input.taxAmount) +
    amount("AllowanceTotalAmount", Math.max(0, documentAllowance)) +
    amount("PayableAmount", input.totalAmount) +
    `</cac:LegalMonetaryTotal>` +
    input.lines.map(lineXml).join("") +
    `</Invoice>`
  )
}
