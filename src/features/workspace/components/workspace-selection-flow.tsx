"use client"

import { useRouter } from "next/navigation"

import { ROUTES } from "@/constants/routes"

import { AppCard } from "@/components/app"

import { WorkspaceSelectorContent } from "./workspace-selector-content"

export function WorkspaceSelectionFlow() {
  const router = useRouter()

  return (
    <div
      dir="rtl"
      className="mx-auto flex min-h-screen w-full max-w-3xl items-center justify-center px-4 py-10"
    >
      <AppCard
        className="w-full"
        title="اختر مساحة العمل"
        subtitle="حدد المنظمة ومساحة العمل التي تريد الدخول إليها."
      >
        <WorkspaceSelectorContent onComplete={() => router.replace(ROUTES.dashboard)} />
      </AppCard>
    </div>
  )
}
