// @vitest-environment node

// The in-memory database the other tests run on accepts an INSERT that names a column twice;
// the real one refuses it ("column specified more than once"), which once stopped every campaign
// from being published. This reads the INSERT statements of the campaigns code as text and checks
// what the in-memory database does not: no column named twice, and as many values as columns.
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

const ROOT = join(process.cwd(), "src/identity-platform/campaigns")

function sourceFiles(folder: string): string[] {
  return readdirSync(folder).flatMap((name) => {
    const path = join(folder, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return name.endsWith(".ts") ? [path] : []
  })
}

// Splits on the commas that are not inside brackets, so "now()" or "$12::jsonb" stay whole.
function topLevel(list: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ""
  for (const character of list) {
    if (character === "(") depth += 1
    if (character === ")") depth -= 1
    if (character === "," && depth === 0) {
      parts.push(current.trim())
      current = ""
    } else {
      current += character
    }
  }
  if (current.trim()) parts.push(current.trim())
  return parts
}

// The bracketed list that starts at `from`, without its outer brackets.
function bracketed(text: string, from: number): string | null {
  if (text[from] !== "(") return null
  let depth = 0
  for (let index = from; index < text.length; index += 1) {
    if (text[index] === "(") depth += 1
    if (text[index] === ")") depth -= 1
    if (depth === 0) return text.slice(from + 1, index)
  }
  return null
}

describe("the campaigns code's INSERT statements", () => {
  const statements = sourceFiles(ROOT).flatMap((path) => {
    const text = readFileSync(path, "utf8")
    const found: Array<{ where: string; columns: string[]; values: string[] }> = []
    const pattern = /INSERT INTO\s+([a-z_]+)\s*\(/gi
    for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
      const columnsAt = match.index + match[0].length - 1
      const columns = bracketed(text, columnsAt)
      if (columns === null) continue
      const rest = text.slice(columnsAt + columns.length + 2)
      const values = /^\s*VALUES\s*\(/i.exec(rest)
      if (!values) continue
      const list = bracketed(rest, values[0].length - 1)
      if (list === null) continue
      found.push({
        where: `${path.slice(ROOT.length + 1)}: ${match[1]}`,
        columns: topLevel(columns),
        values: topLevel(list),
      })
    }
    return found
  })

  it("finds the statements it is meant to check", () => {
    expect(statements.length).toBeGreaterThan(5)
    expect(statements.some((entry) => entry.where.endsWith("campaign_publications"))).toBe(true)
  })

  it("names no column twice and gives each column a value", () => {
    for (const { where, columns, values } of statements) {
      expect(new Set(columns).size, `${where} names a column twice`).toBe(columns.length)
      expect(values.length, `${where} has ${columns.length} columns`).toBe(columns.length)
    }
  })
})
