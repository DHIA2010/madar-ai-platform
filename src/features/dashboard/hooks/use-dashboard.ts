"use client"

import { useContext } from "react"

import { DashboardContext } from "../state"

export function useDashboard() {
  const context = useContext(DashboardContext)

  if (!context) {
    throw new Error("useDashboard must be used inside DashboardProvider")
  }

  return context
}
