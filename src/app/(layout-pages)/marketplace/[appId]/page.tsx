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
  const {
    catalog,
    bundle,
    statusById,
    trialAvailableByCategory,
    bundleTrialAvailable,
    submitActivationRequest,
    startTrial,
    activateFreeApplication,
  } = useApplicationsCatalog()
  const entry = getApplicationById(params.appId, catalog, bundle)

  if (!entry) {
    notFound()
  }

  const liveEntry = isMadarCompleteBundle(entry)
    ? entry
    : { ...entry, subscriptionStatus: statusById[entry.id] ?? entry.subscriptionStatus }

  return (
    <ApplicationDetailScreen
      entry={liveEntry}
      trialAvailable={
        isMadarCompleteBundle(entry)
          ? bundleTrialAvailable
          : trialAvailableByCategory[entry.category]
      }
      onSubmitActivationRequest={submitActivationRequest}
      onStartTrial={startTrial}
      onActivateFree={activateFreeApplication}
    />
  )
}
