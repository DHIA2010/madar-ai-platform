"use client"

import { useContext } from "react"

import { PermissionContextStore } from "../state/permission.context"

export function usePermissions() {
  const context = useContext(PermissionContextStore)

  if (!context) {
    throw new Error("usePermissions must be used inside PermissionProvider")
  }

  return context
}
