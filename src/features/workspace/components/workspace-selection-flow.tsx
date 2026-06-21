"use client"

import { useRouter } from "next/navigation"

import { ROUTES } from "@/constants/routes"

import { AppCard } from "@/components/app"

import { WorkspaceSelectorContent } from "./workspace-selector-content"

export function WorkspaceSelectionFlow() {
  const router = useRouter()

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center px-4 py-10">
      <AppCard
        className="w-full"
        title="Select your workspace"
        subtitle="Choose the organization and workspace context required to access the application shell."
      >
        <WorkspaceSelectorContent onComplete={() => router.replace(ROUTES.dashboard)} />
      </AppCard>
    </div>
  )
}
