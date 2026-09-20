import { DOMParser, XMLSerializer } from "@xmldom/xmldom"
import type { Node as XmldomNode } from "@xmldom/xmldom"
import * as xpath from "xpath"

// Same xmldom/lib.dom.d.ts type-interop boundary as zatca-signing.ts -- see its module comment.
function asDomDocument(value: unknown): Document {
  return value as Document
}

// Builds the unsigned UBL 2.1 XML for a ZATCA Phase 2 Simplified Tax Invoice from an already-
// completed sale (InvoiceView). Leaves three things empty for zatca-signing.ts / the QR step to
// fill in afterward: the ext:UBLExtensions signature container, the business-level cac:Signature
// reference, and the QR AdditionalDocumentReference's own value -- all three are exactly what the
// signature's own XPath-Filtering transforms exclude from what gets hashed (see
// zatca-signing.ts), so filling them in after signing can never invalidate the signature.
//
// General UBL 2.1 shape + ZATCA's InvoiceTypeCode/AdditionalDocumentReference(ICV/PIH/QR)
// conventions, cross-checked against this session's own research rather than assumed from
// memory alone. Byte-level acceptance can only be confirmed via ZATCA's own Compliance Checks API
// (see zatca-signing.ts's module comment for the same caveat).

const NAMESPACES =
  `xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" ` +
  `xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" ` +
  `xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" ` +
  `xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"`

// The Saudi "national address" ZATCA's PostalAddress block expects, broken into its real
// structured fields (not one free-text line) -- element names/mapping cross-checked against
// ZATCA's own published sample Simplified Tax Invoice XML and the same structure real-world
// integrations (including the WooCommerce plugin found during this feature's research) use.
// plotIdentification carries the Saudi "additional/secondary number" (الرقم الإضافي).
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
  netAmount: number
  taxAmount: number
  taxRatePercent: number
}

export interface ZatcaUblInvoiceInput {
  invoiceNumber: string
  uuid: string
  issuedAt: Date
  // 4-digit 0/1 bitmask mapped to "TSCZ" -- "0100" for a Simplified-only device, matching the
  // CSR's own invoiceTypeBitmask (see zatca-crypto.ts).
  invoiceTypeName: string
  icv: number
  // Base64 SHA-256 hash of the previous invoice on this same device's chain -- the well-known
  // 44-character all-zero-equivalent base64 of 32 zero bytes for the very first invoice on a
  // freshly onboarded device (see invoices-service.ts).
  previousInvoiceHashBase64: string
  sellerName: string
  sellerVatNumber: string
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
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function money(value: number): string {
  return (Math.round(value * 100) / 100).toFixed(2)
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function isoTime(date: Date): string {
  return date.toISOString().slice(11, 19) + "Z"
}

// Emits only the sub-elements this address actually has data for -- an organization mid-way
// through completing its tax profile (Settings -> الإعدادات العامة) still gets a real
// PostalAddress with a real Country, just missing whichever specific line(s) aren't filled in yet
// (same "never fabricate a value" rule the rest of this file's seller snapshot already follows).
function buildPostalAddressXml(address: ZatcaUblAddress): string {
  return (
    `<cac:PostalAddress>` +
    (address.streetName
      ? `<cbc:StreetName>${escapeXml(address.streetName)}</cbc:StreetName>`
      : "") +
    (address.buildingNumber
      ? `<cbc:BuildingNumber>${escapeXml(address.buildingNumber)}</cbc:BuildingNumber>`
      : "") +
    (address.plotIdentification
      ? `<cbc:PlotIdentification>${escapeXml(address.plotIdentification)}</cbc:PlotIdentification>`
      : "") +
    (address.citySubdivisionName
      ? `<cbc:CitySubdivisionName>${escapeXml(address.citySubdivisionName)}</cbc:CitySubdivisionName>`
      : "") +
    (address.cityName ? `<cbc:CityName>${escapeXml(address.cityName)}</cbc:CityName>` : "") +
    (address.postalZone
      ? `<cbc:PostalZone>${escapeXml(address.postalZone)}</cbc:PostalZone>`
      : "") +
    `<cac:Country><cbc:IdentificationCode>SA</cbc:IdentificationCode></cac:Country>` +
    `</cac:PostalAddress>`
  )
}

function buildPartyXml(
  tag: "cac:AccountingSupplierParty" | "cac:AccountingCustomerParty",
  input: {
    name: string
    vatNumber: string | null
    address: ZatcaUblAddress | null
  }
): string {
  const vatSchemeId = tag === "cac:AccountingSupplierParty" ? "VAT" : "VAT"
  return (
    `<${tag}><cac:Party>` +
    (input.address ? buildPostalAddressXml(input.address) : "") +
    (input.vatNumber
      ? `<cac:PartyTaxScheme><cbc:CompanyID>${escapeXml(input.vatNumber)}</cbc:CompanyID><cac:TaxScheme><cbc:ID>${vatSchemeId}</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>`
      : "") +
    `<cac:PartyLegalEntity><cbc:RegistrationName>${escapeXml(input.name)}</cbc:RegistrationName></cac:PartyLegalEntity>` +
    `</cac:Party></${tag}>`
  )
}

function buildLineXml(line: ZatcaUblInvoiceLine): string {
  return (
    `<cac:InvoiceLine>` +
    `<cbc:ID>${escapeXml(line.id)}</cbc:ID>` +
    `<cbc:InvoicedQuantity unitCode="PCE">${line.quantity}</cbc:InvoicedQuantity>` +
    `<cbc:LineExtensionAmount currencyID="SAR">${money(line.netAmount)}</cbc:LineExtensionAmount>` +
    `<cac:TaxTotal>` +
    `<cbc:TaxAmount currencyID="SAR">${money(line.taxAmount)}</cbc:TaxAmount>` +
    `<cbc:RoundingAmount currencyID="SAR">${money(line.netAmount + line.taxAmount)}</cbc:RoundingAmount>` +
    `</cac:TaxTotal>` +
    `<cac:Item><cbc:Name>${escapeXml(line.productName)}</cbc:Name>` +
    `<cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>${line.taxRatePercent}</cbc:Percent>` +
    `<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item>` +
    `<cac:Price><cbc:PriceAmount currencyID="SAR">${money(line.unitPrice)}</cbc:PriceAmount></cac:Price>` +
    `</cac:InvoiceLine>`
  )
}

// The unsigned invoice -- ext:ExtensionContent, cac:Signature/cbc:ID reference, and the QR
// AdditionalDocumentReference's own value are deliberately left empty; see the module comment.
export function buildZatcaUblInvoiceXml(input: ZatcaUblInvoiceInput): string {
  const taxExclusive = input.subtotalAmount - input.discountAmount

  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Invoice ${NAMESPACES}>` +
    `<ext:UBLExtensions><ext:UBLExtension>` +
    `<ext:ExtensionURI>urn:oasis:names:specification:ubl:dsig:enveloped:xades</ext:ExtensionURI>` +
    `<ext:ExtensionContent></ext:ExtensionContent>` +
    `</ext:UBLExtension></ext:UBLExtensions>` +
    `<cbc:ProfileID>reporting:1.0</cbc:ProfileID>` +
    `<cbc:ID>${escapeXml(input.invoiceNumber)}</cbc:ID>` +
    `<cbc:UUID>${escapeXml(input.uuid)}</cbc:UUID>` +
    `<cbc:IssueDate>${isoDate(input.issuedAt)}</cbc:IssueDate>` +
    `<cbc:IssueTime>${isoTime(input.issuedAt)}</cbc:IssueTime>` +
    `<cbc:InvoiceTypeCode name="${escapeXml(input.invoiceTypeName)}">388</cbc:InvoiceTypeCode>` +
    (input.notes ? `<cbc:Note>${escapeXml(input.notes)}</cbc:Note>` : "") +
    `<cbc:DocumentCurrencyCode>SAR</cbc:DocumentCurrencyCode>` +
    `<cbc:TaxCurrencyCode>SAR</cbc:TaxCurrencyCode>` +
    `<cac:AdditionalDocumentReference><cbc:ID>ICV</cbc:ID><cbc:UUID>${input.icv}</cbc:UUID></cac:AdditionalDocumentReference>` +
    `<cac:AdditionalDocumentReference><cbc:ID>PIH</cbc:ID><cac:Attachment>` +
    `<cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">${escapeXml(input.previousInvoiceHashBase64)}</cbc:EmbeddedDocumentBinaryObject>` +
    `</cac:Attachment></cac:AdditionalDocumentReference>` +
    `<cac:AdditionalDocumentReference><cbc:ID>QR</cbc:ID><cac:Attachment>` +
    `<cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain"></cbc:EmbeddedDocumentBinaryObject>` +
    `</cac:Attachment></cac:AdditionalDocumentReference>` +
    `<cac:Signature><cbc:ID>urn:oasis:names:specification:ubl:signature:1</cbc:ID>` +
    `<cbc:SignatureMethod>urn:oasis:names:specification:ubl:dsig:enveloped:xades</cbc:SignatureMethod></cac:Signature>` +
    buildPartyXml("cac:AccountingSupplierParty", {
      name: input.sellerName,
      vatNumber: input.sellerVatNumber || null,
      address: input.sellerAddress,
    }) +
    (input.customerName
      ? buildPartyXml("cac:AccountingCustomerParty", {
          name: input.customerName,
          vatNumber: input.customerVatNumber,
          address: null,
        })
      : "") +
    `<cac:TaxTotal>` +
    `<cbc:TaxAmount currencyID="SAR">${money(input.taxAmount)}</cbc:TaxAmount>` +
    `<cac:TaxSubtotal>` +
    `<cbc:TaxableAmount currencyID="SAR">${money(taxExclusive)}</cbc:TaxableAmount>` +
    `<cbc:TaxAmount currencyID="SAR">${money(input.taxAmount)}</cbc:TaxAmount>` +
    `<cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>${input.taxRatePercent}</cbc:Percent>` +
    `<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory>` +
    `</cac:TaxSubtotal></cac:TaxTotal>` +
    `<cac:LegalMonetaryTotal>` +
    `<cbc:LineExtensionAmount currencyID="SAR">${money(input.subtotalAmount)}</cbc:LineExtensionAmount>` +
    `<cbc:TaxExclusiveAmount currencyID="SAR">${money(taxExclusive)}</cbc:TaxExclusiveAmount>` +
    `<cbc:TaxInclusiveAmount currencyID="SAR">${money(taxExclusive + input.taxAmount)}</cbc:TaxInclusiveAmount>` +
    `<cbc:AllowanceTotalAmount currencyID="SAR">${money(input.discountAmount)}</cbc:AllowanceTotalAmount>` +
    `<cbc:PayableAmount currencyID="SAR">${money(input.totalAmount)}</cbc:PayableAmount>` +
    `</cac:LegalMonetaryTotal>` +
    input.lines.map(buildLineXml).join("") +
    `</Invoice>`
  )
}

// Fills in the QR AdditionalDocumentReference placeholder left empty by
// buildZatcaUblInvoiceXml() -- called after signing, since the QR's own tags 6-8 depend on the
// signature that was itself computed excluding this exact element. DOM-based (not a string
// replace) because the signed XML has already been round-tripped through an XML
// parser/serializer by zatca-signing.ts, which can reformat empty-element syntax
// (`<tag></tag>` vs `<tag/>`) in ways a literal string match can't rely on.
export function embedZatcaQrCode(signedXml: string, qrCodeBase64: string): string {
  const doc = asDomDocument(new DOMParser().parseFromString(signedXml, "text/xml"))
  const nodes = xpath.select(
    '//*[local-name()="AdditionalDocumentReference"]' +
      '[*[local-name()="ID" and text()="QR"]]' +
      '//*[local-name()="EmbeddedDocumentBinaryObject"]',
    doc
  ) as Node[]
  const binaryObject = nodes[0] as Element | undefined
  if (!binaryObject) {
    throw new Error("ZATCA_UBL_MISSING_QR_PLACEHOLDER")
  }
  binaryObject.textContent = qrCodeBase64
  return new XMLSerializer().serializeToString(doc as unknown as XmldomNode)
}

// The well-known PIH value for the very first invoice on a freshly onboarded device -- base64 of
// 32 zero bytes, per common ZATCA implementation convention for chain genesis.
export const ZATCA_GENESIS_PIH_BASE64 = Buffer.alloc(32).toString("base64")
