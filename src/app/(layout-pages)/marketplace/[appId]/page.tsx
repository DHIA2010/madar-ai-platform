"use client"

import { notFound, useParams } from "next/navigation"

import {
  ApplicationDetailScreen,
  getApplicationById,
  isMadarCompleteBundle,
  useApplicationsCatalog,
} from "@/features/applications"

export default function Page() {
  const params = useParams<{ appId: string }>()
  const { statusById, submitActivationRequest, deactivateApplication, activateAllApplications } =
    useApplicationsCatalog()
  const entry = getApplicationById(params.appId)

  if (!entry) {
    notFound()
  }

  const liveEntry = isMadarCompleteBundle(entry)
    ? entry
    : { ...entry, subscriptionStatus: statusById[entry.id] ?? entry.subscriptionStatus }

  return (
    <ApplicationDetailScreen
      entry={liveEntry}
      onConfirmActivation={async (target) => {
        if (target.id === "madar-complete") {
          await activateAllApplications()
          return
        }
        await deactivateApplication(target.id)
      }}
      onSubmitActivationRequest={submitActivationRequest}
    />
  )
}
