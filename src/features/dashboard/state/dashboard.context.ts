"use client"

import { createContext } from "react"

import type { DashboardContextValue } from "../types"

export const DashboardContext = createContext<DashboardContextValue | null>(null)
