"use client"

import { useCallback, useEffect, useState } from "react"
import { Flag, Plus, Trash2, X } from "lucide-react"
import { toast } from "sonner"

import {
  AppButton,
  AppCard,
  AppDialog,
  AppInput,
  AppSearchableSelect,
  AppSwitch,
} from "@/components/app"

import { platformAdminService } from "../services"
import type { AdminCustomer, AdminFeatureFlag } from "../types/platform-admin.types"

// Switch features on for everyone, a percentage of customers, or specific customers. Each
// customer's app reads its flags from /v1/feature-flags.
export function MadarAdminFeatureFlags() {
  const [flags, setFlags] = useState<AdminFeatureFlag[] | null>(null)
  const [customers, setCustomers] = useState<AdminCustomer[]>([])
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState({ key: "", description: "" })
  const [overrideTarget, setOverrideTarget] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setFlags(await platformAdminService.listFeatureFlags())
    } catch {
      toast.error("تعذر تحميل Feature Flags.")
    }
  }, [])

  useEffect(() => {
    void load()
    platformAdminService
      .listCustomers({}, 1, 100)
      .then((page) => setCustomers(page.items))
      .catch(() => {})
  }, [load])

  async function run(action: () => Promise<unknown>, success?: string) {
    setBusy(true)
    try {
      await action()
      if (success) toast.success(success)
      await load()
      return true
    } catch (error) {
      toast.error(
        (error as { code?: string })?.code === "FLAG_KEY_TAKEN"
          ? "يوجد Flag بنفس المفتاح."
          : "تعذر حفظ التغيير."
      )
      return false
    } finally {
      setBusy(false)
    }
  }

  function update(
    flag: AdminFeatureFlag,
    patch: Partial<Pick<AdminFeatureFlag, "enabled" | "rolloutPercentage">>
  ) {
    void run(() =>
      platformAdminService.updateFeatureFlag(flag.key, {
        description: flag.description,
        enabled: patch.enabled ?? flag.enabled,
        rolloutPercentage:
          patch.rolloutPercentage !== undefined ? patch.rolloutPercentage : flag.rolloutPercentage,
      })
    )
  }

  return (
    <div dir="rtl" className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Feature Flags</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            تفعيل الميزات التجريبية للجميع، أو لنسبة من العملاء، أو لعملاء محددين.
          </p>
        </div>
        <AppButton
          className="h-11 rounded-[10px] px-5 font-semibold"
          icon={<Plus className="size-4" />}
          onClick={() => setCreating(true)}
        >
          إضافة Flag
        </AppButton>
      </div>

      {flags !== null && flags.length === 0 ? (
        <AppCard className="rounded-2xl border-border/60 p-10 text-center shadow-sm">
          <Flag className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">لا توجد Feature Flags بعد.</p>
        </AppCard>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {(flags ?? []).map((flag) => (
          <AppCard key={flag.key} className="rounded-2xl border-border/60 p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-sm font-bold text-foreground" dir="ltr">
                  {flag.key}
                </p>
                {flag.description ? (
                  <p className="mt-1 text-xs text-muted-foreground">{flag.description}</p>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <AppSwitch
                  checked={flag.enabled}
                  disabled={busy}
                  onCheckedChange={(enabled) => update(flag, { enabled })}
                />
                <AppButton
                  variant="ghost"
                  size="icon-sm"
                  aria-label="حذف"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () => platformAdminService.deleteFeatureFlag(flag.key),
                      "تم حذف الـ Flag."
                    )
                  }
                >
                  <Trash2 className="size-4 text-destructive" />
                </AppButton>
              </div>
            </div>

            <div className="mt-4 rounded-xl bg-muted/40 p-3.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-foreground">نسبة الطرح للعملاء</span>
                <span className="font-semibold">
                  {flag.enabled ? `${flag.rolloutPercentage ?? 100}%` : "متوقف"}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                disabled={!flag.enabled || busy}
                defaultValue={flag.rolloutPercentage ?? 100}
                onMouseUp={(event) =>
                  update(flag, {
                    rolloutPercentage:
                      Number((event.target as HTMLInputElement).value) === 100
                        ? null
                        : Number((event.target as HTMLInputElement).value),
                  })
                }
                onTouchEnd={(event) =>
                  update(flag, {
                    rolloutPercentage:
                      Number((event.target as HTMLInputElement).value) === 100
                        ? null
                        : Number((event.target as HTMLInputElement).value),
                  })
                }
                className="mt-2 w-full accent-primary"
              />
            </div>

            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold text-muted-foreground">
                استثناءات لعملاء محددين
              </p>
              {flag.overrides.length === 0 ? (
                <p className="text-xs text-muted-foreground">لا توجد استثناءات.</p>
              ) : (
                <ul className="space-y-1.5">
                  {flag.overrides.map((override) => (
                    <li
                      key={override.organizationId}
                      className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-1.5 text-xs"
                    >
                      <span className="text-foreground">{override.organizationName}</span>
                      <span className="flex items-center gap-2">
                        <span className={override.enabled ? "text-emerald-600" : "text-rose-600"}>
                          {override.enabled ? "مفعل" : "معطل"}
                        </span>
                        <button
                          type="button"
                          aria-label="إزالة"
                          onClick={() =>
                            void run(() =>
                              platformAdminService.setFeatureFlagOverride(
                                flag.key,
                                override.organizationId,
                                null
                              )
                            )
                          }
                        >
                          <X className="size-3.5 text-muted-foreground hover:text-foreground" />
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-2.5 flex gap-2">
                <div className="flex-1">
                  <AppSearchableSelect
                    value={overrideTarget[flag.key] ?? ""}
                    onChange={(value: string) =>
                      setOverrideTarget((current) => ({ ...current, [flag.key]: value }))
                    }
                    options={customers.map((customer) => ({
                      value: customer.id,
                      label: customer.name,
                    }))}
                    placeholder="اختر عميلاً..."
                  />
                </div>
                {[true, false].map((enabled) => (
                  <AppButton
                    key={String(enabled)}
                    variant="outline"
                    size="sm"
                    className="h-9 rounded-[8px]"
                    disabled={!overrideTarget[flag.key] || busy}
                    onClick={() =>
                      void run(
                        () =>
                          platformAdminService.setFeatureFlagOverride(
                            flag.key,
                            overrideTarget[flag.key],
                            enabled
                          ),
                        "تم حفظ الاستثناء."
                      )
                    }
                  >
                    {enabled ? "تفعيل له" : "تعطيل له"}
                  </AppButton>
                ))}
              </div>
            </div>
          </AppCard>
        ))}
      </div>

      <AppDialog
        open={creating}
        onOpenChange={setCreating}
        title={<span dir="rtl">إضافة Feature Flag</span>}
        description={<span dir="rtl">يبدأ متوقفاً للجميع حتى تفعّله.</span>}
        contentClassName="[direction:rtl] max-w-[30rem] gap-5 p-6"
        footer={
          <div className="flex w-full gap-2">
            <AppButton
              variant="outline"
              className="h-12 flex-1 rounded-[10px] font-semibold"
              onClick={() => setCreating(false)}
            >
              إلغاء
            </AppButton>
            <AppButton
              className="h-12 flex-1 rounded-[10px] font-bold"
              loading={busy}
              onClick={async () => {
                const key = draft.key.trim().toLowerCase()
                if (!/^[a-z0-9][a-z0-9_.-]{1,80}$/.test(key)) {
                  toast.error("المفتاح: حروف إنجليزية صغيرة وأرقام و . _ - فقط.")
                  return
                }
                const ok = await run(
                  () =>
                    platformAdminService.createFeatureFlag({
                      key,
                      description: draft.description.trim() || null,
                      enabled: false,
                      rolloutPercentage: null,
                    }),
                  "تمت إضافة الـ Flag."
                )
                if (ok) {
                  setCreating(false)
                  setDraft({ key: "", description: "" })
                }
              }}
            >
              إضافة
            </AppButton>
          </div>
        }
      >
        <div dir="rtl" className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium">المفتاح</label>
            <AppInput
              dir="ltr"
              value={draft.key}
              onChange={(event) => setDraft((current) => ({ ...current, key: event.target.value }))}
              placeholder="new-dashboard"
              className="h-11 rounded-[10px] text-right font-mono"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">الوصف (اختياري)</label>
            <AppInput
              value={draft.description}
              onChange={(event) =>
                setDraft((current) => ({ ...current, description: event.target.value }))
              }
              className="h-11 rounded-[10px]"
            />
          </div>
        </div>
      </AppDialog>
    </div>
  )
}
