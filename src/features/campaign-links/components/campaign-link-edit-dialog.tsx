"use client"

import { useEffect, useState } from "react"
import { Link2, Loader2, Plus, Trash2, X } from "lucide-react"
import { toast } from "sonner"

import { AppButton, AppDialog, AppForm, AppFormField } from "@/components/app"

import {
  type CampaignLinkRecord,
  type CampaignLinkSummaryRecord,
  linkListService,
} from "../services/link-list.service"
import { DialogInput } from "./design/dialog-input"
import { tajawal } from "./design/fonts"

interface CustomParamRow {
  key: string
  value: string
}

interface CampaignLinkEditDialogProps {
  link: CampaignLinkSummaryRecord | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}

function recordToRows(customParams: Record<string, string>): CustomParamRow[] {
  return Object.entries(customParams).map(([key, value]) => ({ key, value }))
}

export function CampaignLinkEditDialog({
  link,
  open,
  onOpenChange,
  onSaved,
}: CampaignLinkEditDialogProps) {
  const [detail, setDetail] = useState<CampaignLinkRecord | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const [name, setName] = useState("")
  const [customParamRows, setCustomParamRows] = useState<CustomParamRow[]>([])

  useEffect(() => {
    if (!open || !link) {
      return
    }

    let cancelled = false

    async function loadDetail(linkId: string) {
      setIsLoading(true)
      setDetail(null)
      try {
        const result = await linkListService.getCampaignLinkDetail(linkId)
        if (!cancelled) {
          setDetail(result)
          setName(result.name)
          setCustomParamRows(recordToRows(result.customParams))
        }
      } catch {
        if (!cancelled) {
          toast.error("تعذّر تحميل بيانات الرابط")
          onOpenChange(false)
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void loadDetail(link.id)

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, link])

  function updateRow(index: number, field: keyof CustomParamRow, value: string) {
    setCustomParamRows((rows) =>
      rows.map((row, rowIndex) => (rowIndex === index ? { ...row, [field]: value } : row))
    )
  }

  function removeRow(index: number) {
    setCustomParamRows((rows) => rows.filter((_, rowIndex) => rowIndex !== index))
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!detail || !name.trim()) {
      toast.error("اسم الرابط مطلوب")
      return
    }

    const customParams = customParamRows.reduce<Record<string, string>>((acc, row) => {
      if (row.key.trim()) {
        acc[row.key.trim()] = row.value
      }
      return acc
    }, {})

    setIsSaving(true)
    try {
      await linkListService.updateCampaignLink(detail.id, {
        name: name.trim(),
        customParams,
      })
      toast.success("تم تحديث رابط الحملة")
      onSaved()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذّر تحديث رابط الحملة")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      showCloseButton={false}
      contentClassName="w-[560px] max-w-[95vw] max-h-[90vh] rounded-[20px] border border-[#E2E8F0] bg-white p-0 shadow-xl"
    >
      <div
        dir="rtl"
        className={`${tajawal.variable} flex h-full flex-col font-[family-name:var(--font-tajawal)]`}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[#E2E8F0] px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#EEF2FF] text-[#4F46E5]">
              <Link2 className="size-4" />
            </span>
            <div>
              <h2 className="text-[18px] font-bold leading-6 text-[#172033]">تعديل رابط الحملة</h2>
              {link ? <p className="text-xs text-[#64748B]">{link.displayId}</p> : null}
            </div>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="إغلاق"
            className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-[#E2E8F0] text-[#64748B] transition-colors hover:bg-[#F8FAFC] hover:text-[#172033]"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {isLoading || !detail ? (
            <div className="flex items-center justify-center py-12 text-[#64748B]">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : (
            <AppForm onSubmit={handleSubmit} className="space-y-5">
              <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3 text-xs text-[#64748B]">
                <p className="break-all">
                  <span className="font-medium text-[#172033]">الوجهة:</span>{" "}
                  {detail.destinationBaseUrl}
                </p>
                <p className="mt-1">
                  <span className="font-medium text-[#172033]">UTM:</span> {detail.utmSource} /{" "}
                  {detail.utmMedium} / {detail.utmCampaign}
                </p>
                <p className="mt-1">
                  <span className="font-medium text-[#172033]">Ad group / Ad name:</span>{" "}
                  {detail.adGroupName ?? "—"} / {detail.adName ?? "—"}
                </p>
                <p className="mt-1">
                  لا يمكن تغيير معلمات UTM أو نوع التتبع أو الحملة أو Ad group/Ad name بعد إنشاء
                  الرابط.
                </p>
              </div>

              <DialogInput
                id="edit-link-name"
                label="اسم الرابط"
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
              />

              <AppFormField label="معلومات إضافية">
                <div className="space-y-2">
                  {customParamRows.map((row, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <DialogInput
                        value={row.key}
                        onChange={(event) => updateRow(index, "key", event.target.value)}
                        placeholder="المفتاح"
                        wrapperClassName="w-1/3"
                      />
                      <DialogInput
                        value={row.value}
                        onChange={(event) => updateRow(index, "value", event.target.value)}
                        placeholder="القيمة"
                        wrapperClassName="flex-1"
                      />
                      <AppButton
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeRow(index)}
                        aria-label="حذف"
                        className="mt-6"
                      >
                        <Trash2 className="size-4" />
                      </AppButton>
                    </div>
                  ))}
                  <AppButton
                    type="button"
                    variant="outline"
                    size="sm"
                    icon={<Plus className="size-4" />}
                    onClick={() => setCustomParamRows((rows) => [...rows, { key: "", value: "" }])}
                    className="rounded-xl border-[#E2E8F0]"
                  >
                    إضافة حقل
                  </AppButton>
                </div>
              </AppFormField>

              <div className="sticky bottom-0 flex justify-end gap-2 border-t border-[#E2E8F0] bg-white py-4">
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="flex h-11 cursor-pointer items-center rounded-xl border border-[#E2E8F0] bg-white px-4 text-sm font-medium text-[#334155] transition-colors hover:bg-[#F8FAFC]"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex h-11 cursor-pointer items-center gap-2 rounded-xl bg-[#4F46E5] px-4 text-sm font-medium text-white transition-colors hover:bg-[#4338CA] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSaving ? <Loader2 className="size-4 animate-spin" /> : null}
                  حفظ التغييرات
                </button>
              </div>
            </AppForm>
          )}
        </div>
      </div>
    </AppDialog>
  )
}
