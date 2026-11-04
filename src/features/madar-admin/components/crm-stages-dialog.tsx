"use client"

import { useState } from "react"
import { GripVertical, Lock, Pencil, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"

import {
  AppButton,
  AppDialog,
  AppInput,
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
} from "@/components/app"

import { crmService } from "../services"
import type { CrmStageDef } from "../types"
import { setCrmStages, STAGE_COLORS, StageBadge, stageColor, useCrmStages } from "./crm-ui"

const CLOSED = ["won", "lost"]

// "إدارة المراحل": the pipeline's stages. Built-in ones are fixed (the website form, a booked demo,
// a sign-up and a payment move leads through them); the team adds its own between them.
export function StageManagerDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const stages = useCrmStages()
  const [editing, setEditing] = useState<CrmStageDef | null>(null)
  const [label, setLabel] = useState("")
  const [color, setColor] = useState("teal")
  const [after, setAfter] = useState("trial")
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<CrmStageDef | null>(null)
  const [moveTo, setMoveTo] = useState("new")
  // Drag and drop: the custom stage being dragged, and where it would land among the open ones.
  const [dragKey, setDragKey] = useState<string | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const openKeys = stages.filter((stage) => !CLOSED.includes(stage.key)).map((stage) => stage.key)

  async function drop() {
    const key = dragKey
    const index = dropIndex
    setDragKey(null)
    setDropIndex(null)
    if (!key || index === null) return
    const from = openKeys.indexOf(key)
    const order = openKeys.filter((entry) => entry !== key)
    order.splice(index > from ? index - 1 : index, 0, key)
    if (order.join() === openKeys.join()) return
    const previous = stages
    // Show it in place right away.
    setCrmStages(
      [...order.map((entry) => stages.find((stage) => stage.key === entry)!)].concat(
        stages.filter((stage) => CLOSED.includes(stage.key))
      )
    )
    try {
      setCrmStages(await crmService.reorderStages(order))
    } catch {
      setCrmStages(previous)
      toast.error("تعذر تغيير الترتيب.")
    }
  }

  // The open stages a custom one can come after (never itself).
  const openStages = stages.filter(
    (stage) => !CLOSED.includes(stage.key) && stage.key !== editing?.key
  )
  // The stage a custom one currently follows.
  const previousOf = (stage: CrmStageDef) => {
    const open = stages.filter((entry) => !CLOSED.includes(entry.key))
    return open[open.findIndex((entry) => entry.key === stage.key) - 1]?.key ?? "new"
  }

  function reset() {
    setEditing(null)
    setLabel("")
    setColor("teal")
    setAfter("trial")
  }

  async function save() {
    if (!label.trim()) return
    setSaving(true)
    try {
      setCrmStages(
        await crmService.saveStage(editing?.key ?? null, { label: label.trim(), color, after })
      )
      toast.success(editing ? "حُفظت المرحلة." : "أُضيفت المرحلة.")
      reset()
    } catch {
      toast.error("تعذر حفظ المرحلة.")
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!deleting) return
    try {
      setCrmStages(await crmService.deleteStage(deleting.key, moveTo))
      toast.success("حُذفت المرحلة ونُقل عملاؤها.")
      if (editing?.key === deleting.key) reset()
      setDeleting(null)
    } catch {
      toast.error("تعذر حذف المرحلة.")
    }
  }

  return (
    <AppDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          reset()
          setDeleting(null)
          onClose()
        }
      }}
      title={<span dir="rtl">مراحل العملاء المحتملين</span>}
      contentClassName="[direction:rtl] max-w-[36rem] gap-5 p-6"
    >
      <div dir="rtl" className="flex flex-col gap-4">
        <ul className="divide-y divide-border/60 rounded-xl border border-border/60">
          {stages.map((stage) => {
            const openIndex = openKeys.indexOf(stage.key)
            const isOpen = openIndex >= 0
            return (
              <li
                key={stage.key}
                draggable={!stage.system}
                onDragStart={(event) => {
                  setDragKey(stage.key)
                  event.dataTransfer.effectAllowed = "move"
                }}
                onDragEnd={() => {
                  setDragKey(null)
                  setDropIndex(null)
                }}
                onDragOver={(event) => {
                  if (!dragKey) return
                  event.preventDefault()
                  if (!isOpen) {
                    // Over won/lost: the end of the open stages.
                    setDropIndex(openKeys.length)
                    return
                  }
                  const box = event.currentTarget.getBoundingClientRect()
                  setDropIndex(event.clientY < box.top + box.height / 2 ? openIndex : openIndex + 1)
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  void drop()
                }}
                className={cn(
                  "relative flex items-center justify-between gap-3 px-3.5 py-2.5",
                  !stage.system && "cursor-grab active:cursor-grabbing",
                  dragKey === stage.key && "opacity-40"
                )}
              >
                {dragKey && dropIndex !== null && isOpen && dropIndex === openIndex ? (
                  <span className="absolute inset-x-2 -top-px h-0.5 rounded-full bg-primary" />
                ) : null}
                {dragKey && dropIndex === openKeys.length && openIndex === openKeys.length - 1 ? (
                  <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />
                ) : null}
                <span className="flex items-center gap-2">
                  {stage.system ? (
                    <span className="w-4" />
                  ) : (
                    <GripVertical className="size-4 text-muted-foreground" />
                  )}
                  <StageBadge stage={stage.key} />
                </span>
                {stage.system ? (
                  <span className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
                    <Lock className="size-3" />
                    أساسية
                  </span>
                ) : (
                  <div className="flex gap-1">
                    <button
                      type="button"
                      aria-label="تعديل"
                      onClick={() => {
                        setEditing(stage)
                        setLabel(stage.label)
                        setColor(stage.color)
                        setAfter(previousOf(stage))
                        setDeleting(null)
                      }}
                      className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="حذف"
                      onClick={() => {
                        setDeleting(stage)
                        setMoveTo(previousOf(stage))
                      }}
                      className="rounded-lg p-1.5 text-muted-foreground hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
        <p className="-mt-2 text-xs text-muted-foreground">
          اسحب المراحل المخصصة لتغيير ترتيبها بين المراحل الأساسية.
        </p>

        {deleting ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-4">
            <p className="text-sm font-bold text-rose-700">حذف مرحلة «{deleting.label}»</p>
            <p className="mt-1 text-xs text-rose-700/80">انقل العملاء المحتملين فيها إلى:</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <AppSelect value={moveTo} onValueChange={setMoveTo}>
                <AppSelectTrigger className="h-9 w-44 rounded-lg bg-card text-sm">
                  <AppSelectValue />
                </AppSelectTrigger>
                <AppSelectContent>
                  {stages
                    .filter((stage) => stage.key !== deleting.key)
                    .map((stage) => (
                      <AppSelectItem key={stage.key} value={stage.key}>
                        {stage.label}
                      </AppSelectItem>
                    ))}
                </AppSelectContent>
              </AppSelect>
              <AppButton
                className="h-9 rounded-lg bg-rose-600 hover:bg-rose-700"
                onClick={() => void remove()}
              >
                حذف ونقل
              </AppButton>
              <AppButton
                variant="outline"
                className="h-9 rounded-lg"
                onClick={() => setDeleting(null)}
              >
                إلغاء
              </AppButton>
            </div>
          </div>
        ) : null}

        <div className="rounded-xl bg-muted/40 p-4">
          <p className="text-sm font-bold">{editing ? "تعديل المرحلة" : "مرحلة جديدة"}</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <AppInput
              value={label}
              placeholder="اسم المرحلة (مثل: تفاوض)"
              onChange={(event) => setLabel(event.target.value)}
              wrapperClassName="w-full sm:col-span-2"
              className="h-10 rounded-[10px]"
            />
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-muted-foreground">بعد مرحلة</span>
              <AppSelect value={after} onValueChange={setAfter}>
                <AppSelectTrigger className="h-10 w-full rounded-[10px]">
                  <AppSelectValue />
                </AppSelectTrigger>
                <AppSelectContent>
                  {openStages.map((stage) => (
                    <AppSelectItem key={stage.key} value={stage.key}>
                      {stage.label}
                    </AppSelectItem>
                  ))}
                </AppSelectContent>
              </AppSelect>
            </label>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-muted-foreground">اللون</span>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {Object.entries(STAGE_COLORS).map(([key, meta]) => (
                  <button
                    key={key}
                    type="button"
                    aria-label={meta.label}
                    title={meta.label}
                    onClick={() => setColor(key)}
                    className={cn(
                      "size-7 rounded-full ring-offset-2 ring-offset-background transition",
                      stageColor(key).dot,
                      color === key ? "ring-2 ring-foreground" : "hover:scale-110"
                    )}
                  />
                ))}
              </div>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <AppButton
              className="h-9 rounded-lg"
              loading={saving}
              icon={editing ? undefined : <Plus className="size-4" />}
              onClick={() => void save()}
            >
              {editing ? "حفظ" : "إضافة المرحلة"}
            </AppButton>
            {editing ? (
              <AppButton variant="outline" className="h-9 rounded-lg" onClick={reset}>
                إلغاء
              </AppButton>
            ) : null}
          </div>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          المراحل الأساسية ثابتة لأن النظام ينقل العملاء خلالها تلقائيًا: نموذج الموقع ← جديد، حجز
          اجتماع ← اجتماع محجوز، التسجيل ← تجربة، الدفع ← تم الفوز.
        </p>
      </div>
    </AppDialog>
  )
}
