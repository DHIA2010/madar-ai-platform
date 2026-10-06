"use client"

import { useState } from "react"
import { Crown, PlayCircle, Search, Sparkles } from "lucide-react"

import { cn } from "@/lib/utils"

import { AppInput } from "@/components/app"

import { useApplicationsCatalog } from "../hooks"
import type { ApplicationDefinition } from "../types"
import { ActivationConfirmDialog, type ActivationTarget } from "./activation-confirm-dialog"
import { ActivationRequestDialog, type ActivationRequestTarget } from "./activation-request-dialog"
import { ApplicationCard } from "./application-card"
import { ApplicationCategoryTabs } from "./application-category-tabs"
import { MadarCompleteCard } from "./madar-complete-card"

import { cairo } from "@/components/design/fonts"

export function ApplicationsMarketplace() {
  const {
    searchQuery,
    setSearchQuery,
    activeCategory,
    setActiveCategory,
    categoryTabs,
    visibleApplications,
    bundle,
    submitActivationRequest,
    deactivateApplication,
    activateAllApplications,
    activatingId,
    trialAvailableByCategory,
    startTrial,
  } = useApplicationsCatalog()

  const [pendingActivation, setPendingActivation] = useState<ActivationTarget | null>(null)
  const [pendingRequest, setPendingRequest] = useState<ActivationRequestTarget | null>(null)

  function requestApplicationActivation(application: ApplicationDefinition) {
    if (!application.primaryCta.label) return
    setPendingRequest({
      applicationId: application.id,
      category: application.category,
      name: application.name,
      icon: application.icon,
      iconWrapperClassName: application.accent.iconWrapperClassName,
      trialAvailable: trialAvailableByCategory[application.category],
    })
  }

  function requestApplicationDeactivation(application: ApplicationDefinition) {
    setPendingActivation({
      id: application.id,
      name: application.name,
      confirmLabel: "إلغاء التفعيل",
      icon: application.icon,
      iconWrapperClassName: application.accent.iconWrapperClassName,
      intent: "deactivate",
    })
  }

  function requestBundleActivation() {
    setPendingActivation({
      id: bundle.id,
      name: bundle.name,
      confirmLabel: bundle.primaryCtaLabel,
      icon: Crown,
      iconWrapperClassName: "bg-[#fff3d6] text-[#c2900c]",
      confirmButtonClassName: "bg-[#c2900c] text-white hover:bg-[#a97b0a]",
    })
  }

  return (
    <div
      className={cn(cairo.className, "flex h-full min-h-0 flex-col bg-[#f7f9fd] px-6 py-5")}
      dir="rtl"
    >
      {/* Header */}
      <div className="mb-3.5 shrink-0 overflow-hidden rounded-[14px] border border-[#e1e7f0] bg-gradient-to-l from-[#eef4ff] to-white px-6 py-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-1.5 text-[#2878ff]">
              <Sparkles className="size-4" />
              <span className="text-[12.5px] font-semibold">منصة واحدة .. عدة تطبيقات</span>
            </div>
            <h1 className="mt-1.5 text-[26px] font-extrabold leading-tight text-[#0b1738]">
              التطبيقات
            </h1>
            <p className="mt-2 max-w-2xl text-[13px] leading-[22px] text-[#4c5d79]">
              اختر التطبيقات التي تحتاجها لإدارة أعمالك وفعّلها. كل تطبيق يعمل في مساحة عمل مستقلة
              ببياناته وإعداداته الخاصة.
            </p>
          </div>
          <button
            type="button"
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-[#dbe6ff] bg-white px-3 py-1.5 text-[11.5px] font-semibold text-[#2878ff] transition-colors hover:border-[#c4d5f0]"
          >
            <PlayCircle className="size-3.5" />
            كيف تعمل التطبيقات؟
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="mb-3.5 shrink-0">
        <AppInput
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="ابحث عن تطبيق..."
          aria-label="ابحث عن تطبيق"
          startIcon={<Search className="size-4 text-[#95a4bd]" />}
          className="h-11 rounded-[10px] border-[#e1e7f0] bg-white text-[12.5px] text-[#0b1738] placeholder:text-[#95a4bd]"
        />
      </div>

      {/* Category tabs */}
      <div className="mb-3.5 shrink-0">
        <ApplicationCategoryTabs
          tabs={categoryTabs}
          activeCategory={activeCategory}
          onSelect={setActiveCategory}
        />
      </div>

      {/* Application cards -- the only flexible child, so it's the only thing that ever
          scrolls; header/search/tabs above and مدار الكامل below are shrink-0 and always
          fully visible. The panel border + visible (not hover-only) scrollbar make it read
          as a distinct scroll area instead of looking like clipped/broken content. */}
      <div className="mb-3.5 min-h-0 flex-1 overflow-hidden rounded-[14px] border border-[#e1e7f0] bg-white/60">
        <div
          className={cn(
            "h-full overflow-y-auto p-3.5",
            "[&::-webkit-scrollbar]:w-1.5",
            "[&::-webkit-scrollbar-track]:bg-transparent",
            "[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#d8e0ee]"
          )}
        >
          {visibleApplications.length === 0 ? (
            <div className="rounded-[14px] border border-[#e1e7f0] bg-white px-5 py-10 text-center text-[13px] text-[#6b7b96]">
              لا يوجد تطبيق مطابق لبحثك.
            </div>
          ) : (
            <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
              {visibleApplications.map((application) => (
                <ApplicationCard
                  key={application.id}
                  application={application}
                  activating={activatingId === application.id}
                  onActivate={requestApplicationActivation}
                  onDeactivate={requestApplicationDeactivation}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* مدار الكامل */}
      <div className="shrink-0">
        <MadarCompleteCard bundle={bundle} onSubscribe={requestBundleActivation} />
      </div>

      <ActivationConfirmDialog
        target={pendingActivation}
        onOpenChange={(open) => {
          if (!open) setPendingActivation(null)
        }}
        onConfirm={async (target) => {
          if (target.id === bundle.id) {
            await activateAllApplications()
            return
          }
          await deactivateApplication(target.id)
        }}
      />

      <ActivationRequestDialog
        target={pendingRequest}
        onOpenChange={(open) => {
          if (!open) setPendingRequest(null)
        }}
        onSubmit={submitActivationRequest}
        onStartTrial={startTrial}
      />
    </div>
  )
}
