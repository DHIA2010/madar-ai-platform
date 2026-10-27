// JSON.parse with one difference: an integer too large for a JS number to hold exactly (beyond
// Number.MAX_SAFE_INTEGER) is returned as its exact decimal string instead of a rounded number.
//
// Confirmed on stage: some Salla order ids are 19 digits (e.g. 3444675684372967xxx). Plain
// JSON.parse rounds them (to ...7400), and re-fetching GET /orders/{rounded id} 404s, so those
// orders never synced. Only bare numeric tokens outside string literals are touched, so string
// content is never altered.
export function parseJsonPreservingBigInts(text: string): unknown {
  let result = ""
  let inString = false
  let escaped = false
  let index = 0

  while (index < text.length) {
    const char = text[index]

    if (inString) {
      result += char
      if (escaped) escaped = false
      else if (char === "\\") escaped = true
      else if (char === '"') inString = false
      index += 1
      continue
    }

    if (char === '"') {
      inString = true
      result += char
      index += 1
      continue
    }

    if (char === "-" || (char >= "0" && char <= "9")) {
      let end = index + 1
      while (end < text.length && /[0-9.eE+-]/.test(text[end])) end += 1
      const token = text.slice(index, end)
      const isUnsafeInteger = /^-?\d+$/.test(token) && !Number.isSafeInteger(Number(token))
      result += isUnsafeInteger ? `"${token}"` : token
      index = end
      continue
    }

    result += char
    index += 1
  }

  return JSON.parse(result)
}
