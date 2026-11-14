import { type GraphAuth, graphRequest, WhatsAppApiError, whatsAppErrorMessage } from "./cloud-api"

// Sending through the Cloud API: uploading a file as WhatsApp media, sending an approved template
// (with a document header), and the message templates themselves -- their status, and submitting
// one for Meta's review.

function baseUrl(version?: string) {
  const pinned = (version || "v26.0").trim()
  return `https://graph.facebook.com/${pinned.startsWith("v") ? pinned : `v${pinned}`}`
}

async function readResponse<T>(response: Response, path: string): Promise<T> {
  const text = await response.text()
  let parsed: unknown = text
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    // Non-JSON body -- surfaced as is.
  }
  if (!response.ok) {
    throw new WhatsAppApiError(
      whatsAppErrorMessage(parsed) ?? `Meta API request to ${path} failed (${response.status})`,
      response.status,
      parsed
    )
  }
  return parsed as T
}

// Uploads a file to WhatsApp's media store for this phone number; returns the media id to send.
export async function uploadMedia(
  auth: GraphAuth,
  phoneNumberId: string,
  file: { bytes: Buffer; mimeType: string; filename: string }
): Promise<string> {
  const form = new FormData()
  form.append("messaging_product", "whatsapp")
  form.append("type", file.mimeType)
  form.append(
    "file",
    new Blob([new Uint8Array(file.bytes)], { type: file.mimeType }),
    file.filename
  )
  const path = `/${encodeURIComponent(phoneNumberId)}/media`
  const response = await fetch(`${baseUrl(auth.version)}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${auth.token}` },
    body: form,
  })
  const result = await readResponse<{ id?: string }>(response, path)
  if (!result.id) throw new WhatsAppApiError("Meta returned no media id.", 502, result)
  return result.id
}

export interface TemplateMessage {
  to: string
  templateName: string
  language: string
  document?: { mediaId: string; filename: string }
  bodyParameters: string[]
}

// Sends an approved template; returns WhatsApp's message id (wamid...).
export async function sendTemplateMessage(
  auth: GraphAuth,
  phoneNumberId: string,
  message: TemplateMessage
): Promise<string> {
  const components: unknown[] = []
  if (message.document) {
    components.push({
      type: "header",
      parameters: [
        {
          type: "document",
          document: { id: message.document.mediaId, filename: message.document.filename },
        },
      ],
    })
  }
  if (message.bodyParameters.length > 0) {
    components.push({
      type: "body",
      parameters: message.bodyParameters.map((text) => ({ type: "text", text })),
    })
  }
  const path = `/${encodeURIComponent(phoneNumberId)}/messages`
  const response = await fetch(`${baseUrl(auth.version)}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${auth.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: message.to,
      type: "template",
      template: {
        name: message.templateName,
        language: { code: message.language },
        components,
      },
    }),
  })
  const result = await readResponse<{ messages?: Array<{ id: string }> }>(response, path)
  const id = result.messages?.[0]?.id
  if (!id) throw new WhatsAppApiError("Meta returned no message id.", 502, result)
  return id
}

export interface TemplateStatus {
  name: string
  language: string
  // APPROVED, PENDING, REJECTED, PAUSED, DISABLED -- or MISSING when never submitted.
  status: string
  rejectedReason: string | null
  // How Meta itself filed it (UTILITY, MARKETING...), null when never submitted. Meta files a
  // template sent in as utility under marketing when it reads as one, and marketing messages are
  // capped per recipient (error 131049), so some of them never arrive.
  metaCategory: string | null
}

export async function getTemplateStatus(
  auth: GraphAuth,
  wabaId: string,
  name: string,
  language: string
): Promise<TemplateStatus> {
  const result = await graphRequest<{
    data: Array<{
      name: string
      language: string
      status: string
      rejected_reason?: string
      category?: string
    }>
  }>("GET", `/${encodeURIComponent(wabaId)}/message_templates`, auth, {
    name,
    fields: "name,language,status,rejected_reason,category",
  })
  const match = result.data.find((entry) => entry.name === name && entry.language === language)
  return {
    name,
    language,
    status: match?.status ?? "MISSING",
    rejectedReason:
      match?.rejected_reason && match.rejected_reason !== "NONE" ? match.rejected_reason : null,
    metaCategory: match?.category ?? null,
  }
}

// A sample file for a template's document header must be uploaded first, through Meta's
// Resumable Upload API (on the app), which returns the handle the template references.
async function uploadTemplateSample(
  auth: GraphAuth,
  appId: string,
  file: { bytes: Buffer; mimeType: string; filename: string }
): Promise<string> {
  const session = await graphRequest<{ id: string }>(
    "POST",
    `/${encodeURIComponent(appId)}/uploads?file_name=${encodeURIComponent(file.filename)}&file_length=${file.bytes.length}&file_type=${encodeURIComponent(file.mimeType)}`,
    auth
  )
  const path = `/${session.id}`
  const response = await fetch(`${baseUrl(auth.version)}${path}`, {
    method: "POST",
    headers: { Authorization: `OAuth ${auth.token}`, file_offset: "0" },
    body: new Uint8Array(file.bytes),
  })
  const result = await readResponse<{ h?: string }>(response, path)
  if (!result.h) throw new WhatsAppApiError("Meta returned no upload handle.", 502, result)
  return result.h
}

export interface TemplateDefinition {
  name: string
  language: string
  category: "UTILITY" | "MARKETING"
  // Body text with {{1}}, {{2}}... and one example value for each.
  body: string
  bodyExamples: string[]
  footer?: string
  documentHeader?: boolean
}

export async function submitTemplate(
  auth: GraphAuth,
  input: {
    wabaId: string
    appId: string
    template: TemplateDefinition
    sampleDocument?: { bytes: Buffer; filename: string }
  }
): Promise<{ id: string; status: string }> {
  const components: unknown[] = []
  if (input.template.documentHeader) {
    if (!input.sampleDocument) throw new Error("A document header template needs a sample file.")
    const handle = await uploadTemplateSample(auth, input.appId, {
      bytes: input.sampleDocument.bytes,
      mimeType: "application/pdf",
      filename: input.sampleDocument.filename,
    })
    components.push({ type: "HEADER", format: "DOCUMENT", example: { header_handle: [handle] } })
  }
  components.push({
    type: "BODY",
    text: input.template.body,
    example: { body_text: [input.template.bodyExamples] },
  })
  if (input.template.footer) components.push({ type: "FOOTER", text: input.template.footer })
  return graphRequest<{ id: string; status: string }>(
    "POST",
    `/${encodeURIComponent(input.wabaId)}/message_templates`,
    auth,
    {
      name: input.template.name,
      language: input.template.language,
      category: input.template.category,
      components,
    }
  )
}
