import type { TrackingEndpoint } from "./tracking-api.contracts"

export const TRACKING_ENDPOINTS: readonly TrackingEndpoint[] = [
  { method: "POST", path: "/track" },
  { method: "POST", path: "/identify" },
  { method: "POST", path: "/session/start" },
  { method: "POST", path: "/session/end" },
  { method: "POST", path: "/consent" },
  { method: "POST", path: "/batch" },
]

export function isTrackingEndpoint(path: string): path is TrackingEndpoint["path"] {
  return TRACKING_ENDPOINTS.some((endpoint) => endpoint.path === path)
}
