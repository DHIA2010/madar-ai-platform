"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

import { ROUTES } from "@/constants/routes"

import { useAuth } from "@/features/authentication"
import { MadarAdminOverview } from "@/features/madar-admin"

// Madar Admin's home. Staff whose role can't see the overview (Sales) land on what they can use.
export function MadarAdminHome() {
  const { currentUser } = useAuth()
  const router = useRouter()
  const permissions = currentUser?.platformPermissions ?? null
  const seesOverview = permissions?.includes("customers:view") ?? true
  const seesCrm = permissions?.includes("crm:manage") ?? false

  useEffect(() => {
    if (!seesOverview && seesCrm) router.replace(ROUTES.madarAdminCrm)
  }, [seesOverview, seesCrm, router])

  if (!seesOverview) return null
  return <MadarAdminOverview />
}
