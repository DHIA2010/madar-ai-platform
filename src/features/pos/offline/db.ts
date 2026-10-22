import { type DBSchema, type IDBPDatabase, openDB } from "idb"

import type { CreateInvoiceInput } from "../services/pos-invoices.service"

export type PendingInvoiceStatus = "pending" | "syncing" | "failed"

export interface PendingInvoiceRecord {
  // Client-generated uuid, reused directly as the idempotencyKey sent to the backend -- see
  // PosInvoicesService.create()'s idempotency check.
  localId: string
  workspaceId: string
  payload: CreateInvoiceInput
  createdAt: number
  attempts: number
  status: PendingInvoiceStatus
  lastError: string | null
}

export interface CachedDataRecord {
  workspaceId: string
  key: string
  value: unknown
  cachedAt: number
}

// Written solely so the service worker's own background-sync handler (which, unlike the main
// thread, cannot read localStorage) can build the authorization/x-workspace-id headers itself
// when flushing pendingInvoices in the background. Same same-origin exposure as the access token
// already sitting in localStorage today -- not a new risk category, just duplicated storage for a
// context that can't reach localStorage.
export interface AuthMirrorRecord {
  id: "current"
  accessToken: string
  tokenType: string
  workspaceId: string
}

interface MadarPosOfflineDB extends DBSchema {
  pendingInvoices: {
    key: string
    value: PendingInvoiceRecord
    indexes: { byWorkspace: string }
  }
  cachedData: {
    key: [string, string]
    value: CachedDataRecord
  }
  authMirror: {
    key: string
    value: AuthMirrorRecord
  }
}

const DB_NAME = "madar-pos-offline"
const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase<MadarPosOfflineDB>> | null = null

export function getOfflineDb(): Promise<IDBPDatabase<MadarPosOfflineDB>> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is not available in this environment."))
  }
  if (!dbPromise) {
    dbPromise = openDB<MadarPosOfflineDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const pendingInvoices = db.createObjectStore("pendingInvoices", { keyPath: "localId" })
        pendingInvoices.createIndex("byWorkspace", "workspaceId")

        db.createObjectStore("cachedData", { keyPath: ["workspaceId", "key"] })
        db.createObjectStore("authMirror", { keyPath: "id" })
      },
    })
  }
  return dbPromise
}
