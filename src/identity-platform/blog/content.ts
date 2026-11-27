import type { BlogBlock, BlogFaq } from "./types"

// Helpers for article content: checks before a person approves it, a URL-safe slug, and the
// plain-text form the Madar Admin editor uses.

const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩"

function westernDigits(text: string) {
  return text.replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit)))
}

export function blockTexts(block: BlogBlock): string[] {
  switch (block.type) {
    case "p":
    case "h2":
    case "h3":
      return [block.text]
    case "ul":
    case "ol":
      return block.items
    case "callout":
      return [block.title, block.text]
    case "formula":
      return [block.label, block.formula, block.example]
  }
}

// Every money amount the article mentions (a number next to ريال / ر.س / SAR), in riyals.
export function mentionedPrices(texts: string[]): number[] {
  const found: number[] = []
  const pattern = /(\d[\d,.]*)\s*(?:ريال|ر\.س|﷼|SAR)/g
  for (const text of texts) {
    for (const match of westernDigits(text).matchAll(pattern)) {
      const value = Number(match[1].replace(/,/g, ""))
      if (Number.isFinite(value)) found.push(value)
    }
  }
  return found
}

// What a person should check before approving. The agent is told to use only Madar's real
// prices; a price it wasn't given, or any of the things it must never promise, is flagged here
// rather than trusted.
export function contentWarnings(input: {
  title: string
  excerpt: string
  body: BlogBlock[]
  faq: BlogFaq[]
  allowedPrices: number[]
}): string[] {
  const texts = [
    input.title,
    input.excerpt,
    ...input.body.flatMap(blockTexts),
    ...input.faq.flatMap((item) => [item.question, item.answer]),
  ]
  const warnings: string[] = []
  const allowed = new Set(input.allowedPrices)
  const unknown = [...new Set(mentionedPrices(texts))].filter((price) => !allowed.has(price))
  if (unknown.length > 0) {
    warnings.push(`أسعار غير موجودة في قائمة أسعار مدار: ${unknown.join("، ")} ريال`)
  }
  const joined = texts.join(" ")
  const risky: Array<[RegExp, string]> = [
    [/الأفضل في (السعودية|المملكة)|رقم\s*(1|١|واحد) في/, "ادعاء «الأفضل/رقم 1» غير مسموح"],
    [/شريك رسمي|شراكة رسمية/, "ذكر «شريك رسمي» لمنصة أخرى غير مسموح"],
    [/خصم|كوبون|كود الخصم/, "يذكر خصماً أو كوبوناً: تأكد أنه عرض حقيقي"],
    [
      /(\d[\d,]*|آلاف|مئات)\s*(تاجر|عميل|متجر)\s*(يستخدم|يثق|اختار)/,
      "يذكر عدد عملاء: تأكد أنه صحيح",
    ],
  ]
  for (const [pattern, message] of risky) if (pattern.test(joined)) warnings.push(message)
  return warnings
}

// A latin, URL-safe slug (Google and WhatsApp handle these better than Arabic ones).
export function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80)
    .replace(/-$/, "")
  return slug || `post-${Date.now().toString(36)}`
}

// The editor in Madar Admin shows an article as plain text:
//   ## heading        ### small heading      - bullet      1. numbered
//   > tip: title | text       > note: title | text
//   = label | formula | example
// and a blank line between paragraphs.
export function blocksToText(blocks: BlogBlock[]): string {
  return blocks
    .map((block) => {
      switch (block.type) {
        case "p":
          return block.text
        case "h2":
          return `## ${block.text}`
        case "h3":
          return `### ${block.text}`
        case "ul":
          return block.items.map((item) => `- ${item}`).join("\n")
        case "ol":
          return block.items.map((item, index) => `${index + 1}. ${item}`).join("\n")
        case "callout":
          return `> ${block.tone}: ${block.title} | ${block.text}`
        case "formula":
          return `= ${block.label} | ${block.formula} | ${block.example}`
      }
    })
    .join("\n\n")
}

export function textToBlocks(text: string): BlogBlock[] {
  const blocks: BlogBlock[] = []
  let headingCount = 0
  for (const chunk of text.replace(/\r\n/g, "\n").split(/\n\s*\n/)) {
    const lines = chunk
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
    if (lines.length === 0) continue
    const first = lines[0]
    if (first.startsWith("### ")) {
      blocks.push({ type: "h3", text: first.slice(4).trim() })
    } else if (first.startsWith("## ")) {
      headingCount += 1
      blocks.push({ type: "h2", id: `section-${headingCount}`, text: first.slice(3).trim() })
    } else if (lines.every((line) => line.startsWith("- "))) {
      blocks.push({ type: "ul", items: lines.map((line) => line.slice(2).trim()) })
    } else if (lines.every((line) => /^\d+[.)]\s/.test(line))) {
      blocks.push({ type: "ol", items: lines.map((line) => line.replace(/^\d+[.)]\s/, "").trim()) })
    } else if (/^>\s*(tip|note):/.test(first)) {
      const match = /^>\s*(tip|note):\s*(.*)$/.exec(lines.join(" "))
      const [title, ...rest] = (match?.[2] ?? "").split("|")
      blocks.push({
        type: "callout",
        tone: match?.[1] === "tip" ? "tip" : "note",
        title: title.trim(),
        text: rest.join("|").trim(),
      })
    } else if (first.startsWith("= ")) {
      const [label, formula, ...example] = lines.join(" ").slice(2).split("|")
      blocks.push({
        type: "formula",
        label: (label ?? "").trim(),
        formula: (formula ?? "").trim(),
        example: example.join("|").trim(),
      })
    } else {
      blocks.push({ type: "p", text: lines.join(" ") })
    }
  }
  return blocks
}
