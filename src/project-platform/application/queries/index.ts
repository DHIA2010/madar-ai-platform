export interface ListProjectsQuery {
  organizationId?: string
  workspaceId?: string | null
  status?: "active" | "archived" | "deleted"
  page?: number
  pageSize?: number
  sort?: "createdAt:asc" | "createdAt:desc" | "name:asc" | "name:desc"
}

export interface ListDataSourcesQuery {
  projectId: string
  status?: "draft" | "enabled" | "disabled" | "archived" | "deleted"
  type?:
    | "google_ads"
    | "meta_ads"
    | "tiktok_ads"
    | "snapchat_ads"
    | "google_analytics_4"
    | "shopify"
    | "woocommerce"
    | "salla"
    | "zid"
    | "csv_import"
    | "rest_api"
    | "webhook"
    | "manual_upload"
  page?: number
  pageSize?: number
}
