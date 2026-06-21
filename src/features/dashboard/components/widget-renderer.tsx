"use client"

import { Suspense } from "react"

import { AppEmpty, AppError, AppLoading } from "@/components/app"

import { useWidget } from "../hooks"
import type { WidgetManifest } from "../types"

interface WidgetRendererProps {
  manifest: WidgetManifest
}

export function WidgetRenderer({ manifest }: WidgetRendererProps) {
  const widget = useWidget(manifest.metadata.widgetId)

  if (!widget.entry) {
    return (
      <AppError
        title="Unknown widget"
        description={`No registry entry was found for ${manifest.metadata.displayName}.`}
      />
    )
  }

  if (!widget.state) {
    return <AppLoading variant={manifest.loadingStrategy.fallbackVariant} />
  }

  if (!widget.readModel) {
    return <AppLoading variant={manifest.loadingStrategy.fallbackVariant} />
  }

  if (widget.state.status === "error") {
    return (
      <AppError
        title="Widget failed"
        description={widget.state.errorMessage ?? "The widget could not be rendered."}
      />
    )
  }

  if (widget.state.status === "empty") {
    return <AppEmpty title="No widget data" description="This widget has no content yet." />
  }

  const WidgetComponent = widget.entry.renderer

  return (
    <Suspense
      fallback={
        <div style={{ height: manifest.loadingStrategy.fallbackHeight }}>
          <AppLoading variant={manifest.loadingStrategy.fallbackVariant} />
        </div>
      }
    >
      <WidgetComponent />
    </Suspense>
  )
}
