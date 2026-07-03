import type { IncomingMessage, ServerResponse } from "node:http"

import type { ProblemDetails } from "./types"

export function sendJson(
  response: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {}
) {
  response.writeHead(status, {
    "content-type": "application/json",
    ...headers,
  })
  response.end(JSON.stringify(body))
}

export function sendProblem(
  response: ServerResponse,
  problem: ProblemDetails,
  headers: Record<string, string> = {}
) {
  return sendJson(response, problem.status, problem, {
    "content-type": "application/problem+json",
    ...headers,
  })
}

export async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  if (chunks.length === 0) {
    return {}
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"))
}

export function parsePositiveInt(value: string | null, fallback: number) {
  const parsed = Number(value ?? fallback)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export function parsePagination(
  query: URLSearchParams,
  defaults = { page: 1, pageSize: 20, maxPageSize: 100 }
) {
  const page = parsePositiveInt(query.get("page"), defaults.page)
  const pageSize = Math.min(
    parsePositiveInt(query.get("pageSize"), defaults.pageSize),
    defaults.maxPageSize
  )
  return { page, pageSize }
}

export function parseSort(value: string | null, allowedSorts: readonly string[]) {
  if (!value) return undefined
  return allowedSorts.includes(value) ? value : undefined
}

export function parseCsvFilter(value: string | null) {
  if (!value) return []
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
}

export function createNotFoundProblem(pathname: string): ProblemDetails {
  return {
    type: "https://madar.dev/problems/not-found",
    title: "Endpoint Not Found",
    status: 404,
    detail: `No route matched '${pathname}'.`,
  }
}
