"use client"

import { useMemo } from "react"

import { useConnectionsCenter } from "./use-connections-center"

export function useConnectionDetails(connectionId: string) {
  const center = useConnectionsCenter()

  const record = useMemo(() => center.getConnectionById(connectionId), [center, connectionId])

  return {
    ...center,
    record,
  }
}
