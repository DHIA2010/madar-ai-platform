// The monthly load of Madar's free directory of Saudi businesses (see
// src/identity-platform/crm/places.ts). Run by .github/workflows/saudi-places.yml.
//
// It asks Madar which release of the Overture Maps "places" open data it holds, and when a
// newer one is out (or the team asked for a fresh load) reads that release straight from
// Overture's public storage, keeps the rows whose address is in Saudi Arabia, and sends them
// to Madar in batches. It proves who it is with the identity token GitHub gives this run.
//
// DRY_RUN=1 reads and counts without sending (and writes the rows to OUT, when given).
import { createWriteStream } from "node:fs"

import { parquetMetadataAsync, parquetReadObjects } from "hyparquet"
import { compressors } from "hyparquet-compressors"

const BUCKET = "https://overturemaps-us-west-2.s3.amazonaws.com"
const API = (process.env.API_BASE ?? "https://api.madar.my").replace(/\/$/, "")
const AUDIENCE = "madar-saudi-places"
const DRY = process.env.DRY_RUN === "1"
const FORCE = process.env.FORCE === "true"
// Saudi Arabia on the map, generously: the parts of the files outside it are never read.
const BOX = { xmin: 34.4, xmax: 55.7, ymin: 16.3, ymax: 32.2 }
const COLUMNS = [
  "id",
  "names",
  "basic_category",
  "confidence",
  "phones",
  "websites",
  "emails",
  "socials",
  "addresses",
  "operating_status",
  "bbox",
]
const BATCH = 1000

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
// The network drops a request now and then over a load this long: each is tried again.
async function again(run, tries = 6) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await run()
    } catch (error) {
      if (attempt >= tries) throw error
      await wait(2000 * attempt)
    }
  }
}

async function list(prefix, folders) {
  const found = []
  let token = ""
  do {
    const url =
      `${BUCKET}/?list-type=2&prefix=${encodeURIComponent(prefix)}` +
      (folders ? "&delimiter=%2F" : "") +
      (token ? `&continuation-token=${encodeURIComponent(token)}` : "")
    const xml = await again(async () => {
      const response = await fetch(url)
      if (!response.ok) throw new Error(`listing ${response.status}`)
      return response.text()
    })
    for (const match of xml.matchAll(/<Contents><Key>([^<]+)<\/Key>.*?<Size>(\d+)<\/Size>/g)) {
      found.push({ key: match[1], size: Number(match[2]) })
    }
    for (const match of xml.matchAll(/<CommonPrefixes><Prefix>([^<]+)<\/Prefix>/g)) {
      found.push({ key: match[1], size: 0 })
    }
    token = /<NextContinuationToken>([^<]+)</.exec(xml)?.[1] ?? ""
  } while (token)
  return found
}

// A file on Overture's storage, read a piece at a time.
const remote = (url, byteLength) => ({
  byteLength,
  slice: (start, end = byteLength) =>
    again(async () => {
      const response = await fetch(url, { headers: { range: `bytes=${start}-${end - 1}` } })
      if (response.status !== 206 && response.status !== 200) {
        throw new Error(`read ${response.status}`)
      }
      return response.arrayBuffer()
    }),
})

// GitHub's identity token for this run, asked for again before it can expire.
let held = { token: "", at: 0 }
async function identity() {
  if (process.env.PLACES_TOKEN) return process.env.PLACES_TOKEN
  if (held.token && Date.now() - held.at < 120_000) return held.token
  const url = process.env.ACTIONS_ID_TOKEN_REQUEST_URL
  const bearer = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN
  if (!url || !bearer) throw new Error("No GitHub identity token is available to this run.")
  const body = await again(async () => {
    const response = await fetch(`${url}&audience=${AUDIENCE}`, {
      headers: { authorization: `Bearer ${bearer}` },
    })
    if (!response.ok) throw new Error(`identity token ${response.status}`)
    return response.json()
  })
  held = { token: body.value, at: Date.now() }
  return held.token
}

async function madar(method, path, payload) {
  return again(async () => {
    const response = await fetch(`${API}/v1/public/crm-places/${path}`, {
      method,
      headers: {
        authorization: `Bearer ${await identity()}`,
        ...(payload ? { "content-type": "application/json" } : {}),
      },
      body: payload ? JSON.stringify(payload) : undefined,
    })
    const body = await response.text()
    // A refusal is final; anything else (a restart, a timeout) is worth another try.
    if (response.status >= 400 && response.status < 500) {
      console.error(`Madar refused ${path}: ${response.status} ${body.slice(0, 300)}`)
      process.exit(1)
    }
    if (!response.ok) throw new Error(`${path}: ${response.status}`)
    return JSON.parse(body)
  })
}

const first = (value) => (Array.isArray(value) && typeof value[0] === "string" ? value[0] : null)

function toRow(place) {
  const address = place.addresses?.[0]
  if (address?.country !== "SA") return null
  const name = place.names?.primary
  const box = place.bbox
  if (typeof name !== "string" || !name.trim() || !box) return null
  const latitude = (box.ymin + box.ymax) / 2
  const longitude = (box.xmin + box.xmax) / 2
  if (!(latitude > 15 && latitude < 33 && longitude > 34 && longitude < 56)) return null
  return {
    id: String(place.id),
    name: name.trim(),
    category: place.basic_category ?? null,
    confidence:
      typeof place.confidence === "number" ? Math.min(1, Math.max(0, place.confidence)) : 0,
    phones: (place.phones ?? []).filter((phone) => typeof phone === "string").slice(0, 10),
    website: first(place.websites),
    email: first(place.emails),
    social: first(place.socials),
    address: address.freeform ?? null,
    locality: address.locality ?? null,
    latitude,
    longitude,
    closed:
      place.operating_status === "permanently_closed" ||
      place.operating_status === "temporarily_closed",
  }
}

const releases = (await list("release/", true))
  .map((entry) => entry.key.split("/")[1])
  .filter((name) => /^\d{4}-\d{2}-\d{2}\.\d+$/.test(name ?? ""))
  .sort()
const release = releases.at(-1)
if (!release) throw new Error("No Overture release was found.")

if (!DRY) {
  const state = await madar("GET", "state")
  console.log(`Madar holds ${state.release ?? "nothing"}; the newest release is ${release}.`)
  if (state.release === release && !state.refreshRequestedAt && !FORCE) {
    console.log("Up to date: nothing to do.")
    process.exit(0)
  }
}

const files = (await list(`release/${release}/theme=places/type=place/`, false)).filter((file) =>
  file.key.endsWith(".parquet")
)
if (files.length === 0) throw new Error(`Release ${release} has no places files.`)
const out = DRY && process.env.OUT ? createWriteStream(process.env.OUT) : null
let pending = []
let sent = 0
async function flush(all) {
  while (pending.length >= BATCH || (all && pending.length > 0)) {
    const rows = pending.splice(0, BATCH)
    if (out) for (const row of rows) out.write(`${JSON.stringify(row)}\n`)
    if (!DRY) await madar("POST", "batch", { release, rows })
    sent += rows.length
  }
}

for (const entry of files) {
  const file = remote(`${BUCKET}/${entry.key}`, entry.size)
  const metadata = await parquetMetadataAsync(file)
  let rowStart = 0
  for (const group of metadata.row_groups) {
    const rows = Number(group.num_rows)
    const edge = (name) =>
      group.columns.find((column) => column.meta_data?.path_in_schema.join(".") === `bbox.${name}`)
        ?.meta_data?.statistics
    const [xmin, xmax, ymin, ymax] = [edge("xmin"), edge("xmax"), edge("ymin"), edge("ymax")]
    // A part of the file wholly outside Saudi Arabia is passed over unread.
    const outside =
      xmin && xmax && ymin && ymax
        ? Number(xmax.max_value) < BOX.xmin ||
          Number(xmin.min_value) > BOX.xmax ||
          Number(ymax.max_value) < BOX.ymin ||
          Number(ymin.min_value) > BOX.ymax
        : false
    if (!outside) {
      const places = await parquetReadObjects({
        file,
        metadata,
        compressors,
        columns: COLUMNS,
        rowStart,
        rowEnd: rowStart + rows,
      })
      for (const place of places) {
        const row = toRow(place)
        if (row) pending.push(row)
      }
      await flush(false)
    }
    rowStart += rows
  }
  console.log(`${entry.key.split("/").pop()}: ${sent + pending.length} Saudi businesses so far`)
}
await flush(true)
if (out) await new Promise((resolve) => out.end(resolve))

if (sent < 20_000)
  throw new Error(`Only ${sent} Saudi businesses were found: not finishing the load.`)
if (!DRY) {
  const state = await madar("POST", "complete", { release })
  console.log(`Loaded release ${state.release}: ${state.places} businesses.`)
} else {
  console.log(`Dry run: ${sent} Saudi businesses in release ${release}.`)
}
