import type { AdminBlogBlock, AdminBlogPost } from "./blog-admin.service"

// The editor's plain-text form of an article (same rules as the backend's blog/content.ts):
//   ## heading    ### small heading    - bullet    1. numbered
//   > tip: title | text    > note: title | text    = label | formula | example
// and a blank line between paragraphs.

export function blocksToText(blocks: AdminBlogBlock[]): string {
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

export function textToBlocks(text: string): AdminBlogBlock[] {
  const blocks: AdminBlogBlock[] = []
  let headings = 0
  for (const chunk of text.replace(/\r\n/g, "\n").split(/\n\s*\n/)) {
    const lines = chunk
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
    if (lines.length === 0) continue
    const first = lines[0]
    if (first.startsWith("### ")) blocks.push({ type: "h3", text: first.slice(4).trim() })
    else if (first.startsWith("## ")) {
      headings += 1
      blocks.push({ type: "h2", id: `section-${headings}`, text: first.slice(3).trim() })
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
    } else blocks.push({ type: "p", text: lines.join(" ") })
  }
  return blocks
}

export function faqToText(faq: AdminBlogPost["faq"]) {
  return faq.map((item) => `س: ${item.question}\nج: ${item.answer}`).join("\n\n")
}

export function textToFaq(text: string): AdminBlogPost["faq"] {
  return text
    .split(/\n\s*\n/)
    .map((chunk) => {
      const question = /س:\s*(.+)/.exec(chunk)?.[1]?.trim() ?? ""
      const answer = /ج:\s*([\s\S]+)/.exec(chunk)?.[1]?.trim() ?? ""
      return { question, answer }
    })
    .filter((item) => item.question && item.answer)
}
