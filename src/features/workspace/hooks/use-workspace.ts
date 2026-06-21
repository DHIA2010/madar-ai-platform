"use client"

import { useContext } from "react"

import { WorkspaceContextStore } from "../state"

export function useWorkspace() {
  const context = useContext(WorkspaceContextStore)

  if (!context) {
    throw new Error("useWorkspace must be used inside WorkspaceProvider")
  }

  return context
}
