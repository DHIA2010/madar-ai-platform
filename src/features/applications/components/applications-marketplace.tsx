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
  } = useApplicationsCatalog()

  const [pendingActivation, setPendingActivation] = useState<ActivationTarget | null>(null)
  const [pendingRequest, setPendingRequest] = useState<ActivationRequestTarget | null>(null)

  function requestApplicationActivation(application: ApplicationDefinition) {
    if (!application.primaryCta.label) return
    setPendingRequest({
      applicationId: application.id,
      name: application.name,
      icon: application.icon,
      iconWrapperClassName: application.accent.iconWrapperClassName,
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
    <div className={cn(cairo.className, "min-h-full bg-[#f7f9fd] px-6 py-5")} dir="rtl">
      {/* Header */}
      <div className="mb-3.5 rounded-[14px] border border-[#e1e7f0] bg-white px-6 py-5">
        <h1 className="text-[26px] font-extrabold leading-tight text-[#0b1738]">التطبيقات</h1>
        <p className="mt-1.5 text-[13px] text-[#71809a]">
          اختر التطبيقات التي تناسب أعمالك وفعل ما تحتاجه.
        </p>
      </div>

      {/* Hero */}
      <div className="mb-3.5 overflow-hidden rounded-[14px] border border-[#e1e7f0] bg-gradient-to-l from-[#eef4ff] to-white px-6 py-6">
        <button
          type="button"
          className="mb-4 flex items-center gap-1.5 rounded-full border border-[#dbe6ff] bg-white px-3 py-1.5 text-[11.5px] font-semibold text-[#2878ff] transition-colors hover:border-[#c4d5f0]"
        >
          <PlayCircle className="size-3.5" />
          كيف تعمل التطبيقات؟
        </button>
        <div className="flex items-center gap-2 text-[#2878ff]">
          <Sparkles className="size-5" />
          <h2 className="text-[22px] font-extrabold text-[#0b1738]">منصة واحدة .. عدة تطبيقات</h2>
        </div>
        <p className="mt-2 max-w-2xl text-[13px] leading-[22px] text-[#4c5d79]">
          اختر التطبيقات التي تحتاجها لإدارة أعمالك وفعّلها. كل تطبيق يعمل في مساحة عمل مستقلة
          ببياناته وإعداداته الخاصة.
        </p>
      </div>

      {/* Search */}
      <div className="mb-3.5">
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
      <div className="mb-3.5">
        <ApplicationCategoryTabs
          tabs={categoryTabs}
          activeCategory={activeCategory}
          onSelect={setActiveCategory}
        />
      </div>

      {/* Application cards */}
      {visibleApplications.length === 0 ? (
        <div className="mb-3.5 rounded-[14px] border border-[#e1e7f0] bg-white px-5 py-10 text-center text-[13px] text-[#6b7b96]">
          لا يوجد تطبيق مطابق لبحثك.
        </div>
      ) : (
        <div className="mb-3.5 grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
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

      {/* مدار الكامل */}
      <MadarCompleteCard bundle={bundle} onSubscribe={requestBundleActivation} />

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
      />
    </div>
  )
}
