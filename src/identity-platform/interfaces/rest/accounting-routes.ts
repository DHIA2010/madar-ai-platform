import type { AccountingService } from "../../accounting/service"
import {
  accountInputSchema,
  asOfQuerySchema,
  entryInputSchema,
  entryListQuerySchema,
  ledgerQuerySchema,
  lockInputSchema,
  partyQuerySchema,
  rangeQuerySchema,
  syncInputSchema,
} from "../../accounting/schemas"
import type { AuthenticatedActor } from "../../application/dto/identity-dtos"
import { ERRORS } from "../../application/errors/IdentityError"

type Send = (status: number, body: unknown) => void

const query = (url: URL) => Object.fromEntries(url.searchParams.entries())

// Every /v1/accounting/* route (the Accounting app). The subscription itself is checked before
// this is reached (subscriptions/app-access.ts); here it is the person's own permission:
// accounting:view to read the books, accounting:manage to change them.
export async function handleAccountingRoute(input: {
  method: string
  url: URL
  actor: AuthenticatedActor
  service: AccountingService | null
  send: Send
  readJsonBody: () => Promise<unknown>
}): Promise<boolean> {
  const { method, url, actor, service } = input
  if (!url.pathname.startsWith("/v1/accounting/")) return false
  const send = (status: number, body: unknown) => {
    input.send(status, body)
    return true
  }
  if (!service) {
    return send(503, { code: "ACCOUNTING_UNAVAILABLE", message: "Accounting is unavailable." })
  }
  const requireView = () => {
    if (!actor.modulePermissions.includes("accounting:view")) throw ERRORS.forbidden()
  }
  const requireManage = () => {
    if (!actor.modulePermissions.includes("accounting:manage")) throw ERRORS.forbidden()
  }
  const org = actor.organizationId
  const path = url.pathname.slice("/v1/accounting".length)

  if (method === "GET" && path === "/overview") {
    requireView()
    return send(200, await service.overview(org, rangeQuerySchema.parse(query(url))))
  }

  // Bring the books up to date now; `full` re-reads every document.
  if (method === "POST" && path === "/sync") {
    requireManage()
    const { full } = syncInputSchema.parse(await input.readJsonBody())
    return send(200, await service.sync(org, full))
  }

  if (path === "/settings") {
    if (method === "GET") {
      requireView()
      return send(200, await service.getSettings(org))
    }
    if (method === "PUT") {
      requireManage()
      const { lockedThrough } = lockInputSchema.parse(await input.readJsonBody())
      return send(200, await service.setLockedThrough(org, lockedThrough))
    }
  }

  if (path === "/accounts") {
    if (method === "GET") {
      requireView()
      return send(200, { items: await service.listAccounts(org) })
    }
    if (method === "POST") {
      requireManage()
      const body = accountInputSchema.parse(await input.readJsonBody())
      return send(201, await service.createAccount(org, body))
    }
  }
  const account = path.match(/^\/accounts\/([^/]+)$/)
  if (account) {
    requireManage()
    if (method === "PUT") {
      const body = accountInputSchema.parse(await input.readJsonBody())
      return send(200, await service.updateAccount(org, account[1], body))
    }
    if (method === "DELETE") {
      await service.deleteAccount(org, account[1])
      return send(200, { ok: true })
    }
  }

  if (path === "/entries") {
    if (method === "GET") {
      requireView()
      return send(200, await service.listEntries(org, entryListQuerySchema.parse(query(url))))
    }
    if (method === "POST") {
      requireManage()
      const body = entryInputSchema.parse(await input.readJsonBody())
      return send(201, await service.createEntry(org, actor.userId, body))
    }
  }
  const entry = path.match(/^\/entries\/([^/]+)$/)
  if (entry) {
    if (method === "GET") {
      requireView()
      return send(200, await service.getEntry(org, entry[1]))
    }
    requireManage()
    if (method === "PUT") {
      const body = entryInputSchema.parse(await input.readJsonBody())
      return send(200, await service.updateEntry(org, entry[1], body))
    }
    if (method === "DELETE") {
      await service.deleteEntry(org, entry[1])
      return send(200, { ok: true })
    }
  }

  if (method === "GET" && path.startsWith("/reports/")) {
    requireView()
    const report = path.slice("/reports/".length)
    if (report === "trial-balance") {
      return send(200, await service.trialBalance(org, rangeQuerySchema.parse(query(url))))
    }
    if (report === "income-statement") {
      return send(200, await service.incomeStatement(org, rangeQuerySchema.parse(query(url))))
    }
    if (report === "balance-sheet") {
      const { asOf, workspaceId } = asOfQuerySchema.parse(query(url))
      return send(200, await service.balanceSheet(org, asOf, workspaceId))
    }
    if (report === "ledger") {
      const { accountId, ...range } = ledgerQuerySchema.parse(query(url))
      return send(200, await service.ledger(org, accountId, range))
    }
    if (report === "parties") {
      const { type, asOf } = partyQuerySchema.parse(query(url))
      return send(200, await service.partyBalances(org, type, asOf))
    }
    if (report === "vat") {
      return send(200, await service.vatSummary(org, rangeQuerySchema.parse(query(url))))
    }
  }

  return false
}
