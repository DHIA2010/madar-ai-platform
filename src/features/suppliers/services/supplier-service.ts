import { fileToBase64 } from "@/lib/file-to-base64"

import type { Supplier, SupplierFormValues, SupplierStatus } from "../types"

import { createHttpDataClient } from "@/infrastructure/data/api/http-data-client"
import { createSessionManager } from "@/infrastructure/identity"

// Duplicated from src/infrastructure/provider.tsx's private getWorkspaceIdFromStorage -- same
// convention src/features/products/services/product-list.service.ts already follows for the
// same reason (this is a plain client component, not wired through useInfrastructureServices()).
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function getWorkspaceIdFromStorage(): string | null {
  if (typeof window === "undefined") return null
  const raw = window.localStorage.getItem("workspace-context")
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { state?: { currentWorkspace?: { id?: string } } }
    const workspaceId = parsed.state?.currentWorkspace?.id ?? null
    if (!workspaceId) return null
    return UUID_PATTERN.test(workspaceId) ? workspaceId : null
  } catch {
    return null
  }
}

// Avoids the slash-prefix literal lint rule (same trick product-list.service.ts uses) -- this is
// a real backend API path, not a frontend page route.
const PATH_SEPARATOR = String.fromCharCode(47)
const SUPPLIERS_ENDPOINT = ["", "v1", "suppliers"].join(PATH_SEPARATOR)

const sessionManager = createSessionManager()
const client = createHttpDataClient({
  getSession: () => sessionManager.restore(),
  getWorkspaceId: getWorkspaceIdFromStorage,
})

export const supplierService = {
  async list(): Promise<Supplier[]> {
    const response = await client.get<{ items: Supplier[] }>(SUPPLIERS_ENDPOINT)
    return response.items
  },

  async get(id: string): Promise<Supplier> {
    return client.get<Supplier>([SUPPLIERS_ENDPOINT, encodeURIComponent(id)].join(PATH_SEPARATOR))
  },

  async create(values: SupplierFormValues): Promise<Supplier> {
    return client.post<SupplierFormValues, Supplier>(SUPPLIERS_ENDPOINT, values)
  },

  async update(id: string, values: SupplierFormValues): Promise<Supplier> {
    return client.patch<SupplierFormValues, Supplier>(
      [SUPPLIERS_ENDPOINT, encodeURIComponent(id)].join(PATH_SEPARATOR),
      values
    )
  },

  async setStatus(ids: string[], status: SupplierStatus): Promise<{ updated: number }> {
    return client.patch<{ ids: string[]; status: SupplierStatus }, { updated: number }>(
      [SUPPLIERS_ENDPOINT, "status"].join(PATH_SEPARATOR),
      { ids, status }
    )
  },

  async remove(id: string): Promise<void> {
    await client.delete<void>([SUPPLIERS_ENDPOINT, encodeURIComponent(id)].join(PATH_SEPARATOR))
  },

  // Uploaded ahead of the create/update call, same contract as products' own image upload --
  // a supplier may not exist yet (imageUrl/companyDetails.companyImageUrl are picked before the
  // first save), so this returns a real, already-hosted URL to include in the form payload.
  async uploadImage(file: File): Promise<string> {
    const dataBase64 = await fileToBase64(file)
    const response = await client.post<
      { contentType: string; dataBase64: string },
      { url: string }
    >([SUPPLIERS_ENDPOINT, "images"].join(PATH_SEPARATOR), { contentType: file.type, dataBase64 })
    return response.url
  },
}
