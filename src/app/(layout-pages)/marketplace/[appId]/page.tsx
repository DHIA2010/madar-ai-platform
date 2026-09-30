"use client"

import { notFound, useParams } from "next/navigation"

import { useWorkspace } from "@/features/workspace"

import {
  ApplicationDetailScreen,
  getApplicationById,
  isMadarCompleteBundle,
  resolveApplicationStatus,
  useApplicationsCatalog,
} from "@/features/applications"

export default function Page() {
  const params = useParams<{ appId: string }>()
  const { currentOrganization } = useWorkspace()
  const { activateApplication, deactivateApplication, activateAllApplications } =
    useApplicationsCatalog()
  const entry = getApplicationById(params.appId)

  if (!entry) {
    notFound()
  }

  const liveEntry = isMadarCompleteBundle(entry)
    ? entry
    : {
        ...entry,
        subscriptionStatus: resolveApplicationStatus(entry, currentOrganization?.settings),
      }

  return (
    <ApplicationDetailScreen
      entry={liveEntry}
      onConfirmActivation={async (target) => {
        if (target.id === "madar-complete") {
          await activateAllApplications()
          return
        }
        if (target.intent === "deactivate") {
          await deactivateApplication(target.id)
          return
        }
        await activateApplication(target.id)
      }}
    />
  )
}
