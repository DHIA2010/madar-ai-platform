"use client"

import { Fragment, useMemo, useState } from "react"
import {
  BadgeCheck,
  Banknote,
  Bot,
  Briefcase,
  ChevronDown,
  ChevronLeft,
  ClipboardList,
  CreditCard,
  Download,
  Eye,
  House,
  Megaphone,
  Package,
  Pencil,
  Percent,
  Plug,
  Plus,
  Radio,
  Send,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  Trash2,
  Upload,
  Users,
} from "lucide-react"

import { cn } from "@/lib/utils"

import { AppButton, AppCheckbox, AppInput } from "@/components/app"

import type { IamPermissionAction, IamPermissionGroup, IamPermissionModule } from "../types"

const ACTION_COLUMNS: IamPermissionAction[] = [
  "view",
  "create",
  "edit",
  "delete",
  "export",
  "import",
  "approve",
  "publish",
  "manage",
]

export const PERMISSION_ACTION_META: Record<
  IamPermissionAction,
  { label: string; icon: typeof Eye; color: string }
> = {
  view: { label: "عرض", icon: Eye, color: "#2563eb" },
  create: { label: "إنشاء", icon: Plus, color: "#16a34a" },
  edit: { label: "تعديل", icon: Pencil, color: "#d97706" },
  delete: { label: "حذف", icon: Trash2, color: "#dc2626" },
  export: { label: "تصدير", icon: Download, color: "#0891b2" },
  import: { label: "استيراد", icon: Upload, color: "#7c3aed" },
  approve: { label: "موافقة", icon: BadgeCheck, color: "#059669" },
  publish: { label: "نشر", icon: Send, color: "#db2777" },
  manage: { label: "إدارة", icon: Settings2, color: "#475569" },
}

// Presentation-only -- the real permission taxonomy (module keys, actions) lives in
// mock-iam-data.ts untouched; this gives each module an Arabic label, an icon, and the list of
// real sidebar pages it actually gates, expandable into its own sub-rows (`children`) so every
// real page gets its own visible line -- even when several of them (e.g. القنوات and منشئ الروابط
// under الحملات) ride on the exact same underlying permission and their checkboxes therefore
// always mirror each other and the parent row's. `children` whose `module` genuinely differs per
// entry (Settings/Administration below) are independently checkable instead.
// `hiddenFromTopLevel` is for a module that exists ONLY as another module's real child (workspace/
// tax under settings; roles/teams/invitations/auditLog/sessions under users) -- it still needs its
// own IAM_PERMISSION_GROUPS entry (that's where its real actions come from), but rendering it
// again as its own flat top-level row would just duplicate the exact same checkboxes already shown
// under its parent. A module that's both a real standalone page AND referenced as a child (pos, is
// both الكاشير itself and several Settings sub-pages) stays visible at the top level.
export const PERMISSION_MODULE_META: Record<
  IamPermissionModule,
  {
    label: string
    icon: typeof Package
    pages: string[]
    children?: Array<{ label: string; module: IamPermissionModule }>
    hiddenFromTopLevel?: boolean
  }
> = {
  dashboard: { label: "الرئيسية", icon: House, pages: ["الرئيسية"] },
  liveVisitors: { label: "الزوار المباشرون", icon: Radio, pages: ["الزوار المباشرون"] },
  campaigns: {
    label: "الحملات",
    icon: Megaphone,
    pages: ["الحملات"],
    children: [
      { label: "الحملات", module: "campaigns" },
      { label: "القنوات", module: "campaigns" },
      { label: "منشئ الروابط", module: "campaigns" },
    ],
  },
  connections: { label: "التكاملات", icon: Plug, pages: ["التكاملات"] },
  stores: { label: "المتاجر", icon: ShoppingBag, pages: ["المتاجر"] },
  products: { label: "المنتجات", icon: Package, pages: ["المنتجات"] },
  orders: { label: "الطلبات", icon: ClipboardList, pages: ["الطلبات"] },
  pos: {
    label: "الكاشير",
    icon: CreditCard,
    pages: ["الكاشير"],
    children: [
      { label: "الكاشير", module: "pos" },
      { label: "الفواتير", module: "pos" },
      { label: "الورديات", module: "pos" },
    ],
  },
  customers: { label: "العملاء", icon: Users, pages: ["العملاء"] },
  reports: { label: "التقارير", icon: Banknote, pages: ["التقارير"] },
  ai: { label: "الذكاء الاصطناعي", icon: Bot, pages: ["الذكاء الاصطناعي"] },
  users: {
    label: "الإدارة",
    icon: ShieldCheck,
    pages: ["المستخدمون"],
    children: [
      { label: "المستخدمون", module: "users" },
      { label: "الأدوار", module: "roles" },
      { label: "الفرق", module: "teams" },
      { label: "الدعوات", module: "invitations" },
      { label: "السجل الشامل / سجلات التدقيق", module: "auditLog" },
      { label: "الجلسات النشطة", module: "sessions" },
    ],
  },
  roles: { label: "الأدوار", icon: ShieldCheck, pages: ["الأدوار"], hiddenFromTopLevel: true },
  teams: { label: "الفرق", icon: Users, pages: ["الفرق"], hiddenFromTopLevel: true },
  invitations: { label: "الدعوات", icon: Send, pages: ["الدعوات"], hiddenFromTopLevel: true },
  auditLog: {
    label: "سجلات التدقيق",
    icon: ClipboardList,
    pages: ["السجل الشامل", "سجلات التدقيق"],
    hiddenFromTopLevel: true,
  },
  sessions: {
    label: "الجلسات النشطة",
    icon: Radio,
    pages: ["الجلسات النشطة"],
    hiddenFromTopLevel: true,
  },
  settings: {
    label: "الإعدادات",
    icon: Settings2,
    pages: ["الإعدادات العامة"],
    children: [
      { label: "الإعدادات العامة", module: "settings" },
      { label: "إعدادات الأجهزة", module: "pos" },
      { label: "إعدادات الكاشير", module: "pos" },
      { label: "طرق الدفع", module: "pos" },
      { label: "الفوترة الإلكترونية (هيئة الزكاة)", module: "pos" },
      { label: "إدارة مساحات العمل", module: "workspace" },
      { label: "الضرائب", module: "tax" },
    ],
  },
  workspace: {
    label: "مساحة العمل",
    icon: Briefcase,
    pages: ["إدارة مساحات العمل"],
    hiddenFromTopLevel: true,
  },
  tax: { label: "الضرائب", icon: Percent, pages: ["الضرائب"], hiddenFromTopLevel: true },
}

type PermissionMatrixProps = {
  groups: IamPermissionGroup[]
  value: Record<string, string[]>
  onChange: (value: Record<string, string[]>) => void
  title?: string
  subtitle?: string
}

export function PermissionMatrix({ groups, value, onChange, subtitle }: PermissionMatrixProps) {
  const [query, setQuery] = useState("")
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  function toggleExpanded(module: string) {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(module)) {
        next.delete(module)
      } else {
        next.add(module)
      }
      return next
    })
  }

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return groups
    return groups.filter((group) => {
      const label = PERMISSION_MODULE_META[group.module]?.label ?? group.label
      return (
        label.toLowerCase().includes(term) ||
        group.label.toLowerCase().includes(term) ||
        group.actions.some((action) => PERMISSION_ACTION_META[action].label.includes(term))
      )
    })
  }, [groups, query])

  // What actually renders as its own top-level row -- excludes modules that only exist as another
  // row's real expandable child (workspace/tax under settings, roles/teams/... under users), so
  // they aren't shown twice. `filtered` itself stays the full set so "تفعيل الكل"/"تعطيل الكل"
  // still reaches every real permission, not just the ones with their own row.
  const visibleRows = useMemo(
    () => filtered.filter((group) => !PERMISSION_MODULE_META[group.module]?.hiddenFromTopLevel),
    [filtered]
  )

  function toggleAction(module: string, action: string, checked: boolean) {
    const current = value[module] ?? []
    const next = checked
      ? current.includes(action)
        ? current
        : [...current, action]
      : current.filter((entry) => entry !== action)
    onChange({ ...value, [module]: next })
  }

  // Grants/revokes an action across a parent module and every real child module beneath it that
  // actually supports that action -- "for the whole section" in one click, while each child stays
  // separately toggleable afterwards for "just this sub-item."
  function toggleSection(
    parentModule: string,
    action: string,
    checked: boolean,
    children: Array<{ label: string; module: IamPermissionModule }>
  ) {
    const next = { ...value }
    const applyTo = (module: string) => {
      const current = next[module] ?? []
      next[module] = checked
        ? current.includes(action)
          ? current
          : [...current, action]
        : current.filter((entry) => entry !== action)
    }
    applyTo(parentModule)
    children.forEach((child) => {
      const childGroup = groups.find((candidate) => candidate.module === child.module)
      if (childGroup?.actions.includes(action as IamPermissionAction)) {
        applyTo(child.module)
      }
    })
    onChange(next)
  }

  function setAll(checked: boolean) {
    const next = { ...value }
    filtered.forEach((group) => {
      next[group.module] = checked ? [...group.actions] : []
    })
    onChange(next)
  }

  return (
    <div dir="rtl" className="space-y-3">
      {subtitle ? <p className="text-[12.5px] text-[#5b6b85]">{subtitle}</p> : null}

      <div className="flex items-center justify-end gap-2">
        <AppButton
          variant="outline"
          size="sm"
          className="h-8 rounded-[8px] border-[#b3dfc4] bg-[#f0faf3] text-[11.5px] text-[#1a8245] hover:bg-[#e2f5e8]"
          onClick={() => setAll(true)}
        >
          تفعيل الكل
        </AppButton>
        <AppButton
          variant="outline"
          size="sm"
          className="h-8 rounded-[8px] border-[#f3c6c6] bg-[#fdf1f1] text-[11.5px] text-[#c0342c] hover:bg-[#fbe4e4]"
          onClick={() => setAll(false)}
        >
          تعطيل الكل
        </AppButton>
      </div>

      <div className="relative">
        <svg
          className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-[#8098b4]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.35-4.35" strokeLinecap="round" />
        </svg>
        <AppInput
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="البحث في المميزات..."
          className="h-9 rounded-[10px] border-[#aab6cc] bg-white ps-9 text-[12.5px]"
        />
      </div>

      <div className="h-[620px] overflow-auto rounded-[14px] border border-[#e8edf3]">
        <table className="w-full min-w-[720px] border-collapse text-[12.5px]">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-[#eef2f8] bg-[#fafbfd]">
              <th className="w-[260px] p-3 text-start font-semibold text-[#5b6b85]">الوحدة</th>
              {ACTION_COLUMNS.map((action) => {
                const meta = PERMISSION_ACTION_META[action]
                const Icon = meta.icon
                return (
                  <th key={action} className="p-3 text-center font-semibold">
                    <div className="flex flex-col items-center gap-1" style={{ color: meta.color }}>
                      <Icon className="size-4" />
                      <span className="text-[11px]">{meta.label}</span>
                    </div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((group, index) => {
              const meta = PERMISSION_MODULE_META[group.module]
              const ModuleIcon = meta?.icon ?? Package
              const children = meta?.children ?? []
              const hasChildren = children.length > 0
              const isExpanded = expanded.has(group.module)
              const rowTint = index % 2 === 0 ? "bg-white" : "bg-[#f7f9fc]"

              return (
                <Fragment key={group.module}>
                  <tr className={cn("border-b border-[#eef2f8] last:border-b-0", rowTint)}>
                    <td className="p-3">
                      <div className="flex items-center justify-start gap-2.5 text-start">
                        {hasChildren ? (
                          <button
                            type="button"
                            onClick={() => toggleExpanded(group.module)}
                            aria-label={isExpanded ? "طي القسم" : "توسيع القسم"}
                            aria-expanded={isExpanded}
                            className="flex size-5 shrink-0 items-center justify-center rounded-md text-[#8098b4] transition-colors hover:bg-[#eef2f8] hover:text-[#0d1b3e]"
                          >
                            {isExpanded ? (
                              <ChevronDown className="size-4" />
                            ) : (
                              <ChevronLeft className="size-4" />
                            )}
                          </button>
                        ) : null}
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-[#eff6ff] text-[#2563eb]">
                          <ModuleIcon className="size-[17px]" />
                        </span>
                        <div className="min-w-0">
                          <p className="font-semibold text-[#0d1b3e]">
                            {meta?.label ?? group.label}
                          </p>
                          <p className="text-[11px] leading-4 text-[#8098b4]">
                            {hasChildren
                              ? `${children.length} صفحات فرعية -- اضغط للتوسيع`
                              : (meta?.pages.join("، ") ?? `${group.actions.length} صلاحيات فرعية`)}
                          </p>
                        </div>
                      </div>
                    </td>
                    {ACTION_COLUMNS.map((action) => {
                      const enabled = group.actions.includes(action)
                      return (
                        <td key={action} className="p-3">
                          <div className="flex items-center justify-center">
                            {enabled ? (
                              <AppCheckbox
                                checked={value[group.module]?.includes(action) ?? false}
                                onCheckedChange={(checked) =>
                                  hasChildren
                                    ? toggleSection(
                                        group.module,
                                        action,
                                        Boolean(checked),
                                        children
                                      )
                                    : toggleAction(group.module, action, Boolean(checked))
                                }
                                aria-label={`${meta?.label ?? group.label} ${PERMISSION_ACTION_META[action].label}`}
                                // The base checkbox's default border (--input, #e5e9f2) is nearly
                                // invisible against this table's white cells -- darkened and
                                // enlarged slightly just for this matrix rather than the shared
                                // primitive, which other, denser UI elsewhere may rely on staying
                                // subtle.
                                className="size-[18px] border-[#aab6cc] data-checked:border-[#2563eb]"
                              />
                            ) : (
                              <span className="text-black">—</span>
                            )}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                  {hasChildren && isExpanded
                    ? children.map((child) => {
                        const childGroup = groups.find(
                          (candidate) => candidate.module === child.module
                        )
                        if (!childGroup) return null
                        const childMeta = PERMISSION_MODULE_META[child.module]
                        const ChildIcon = childMeta?.icon ?? Package
                        return (
                          <tr
                            key={`${group.module}-${child.module}-${child.label}`}
                            className={cn("border-b border-[#eef2f8] last:border-b-0", rowTint)}
                          >
                            <td className="py-2 ps-[68px] pe-3">
                              <div className="flex items-center justify-start gap-2 text-start">
                                <ChildIcon className="size-3.5 shrink-0 text-[#8098b4]" />
                                <p className="text-[12px] text-[#5b6b85]">{child.label}</p>
                              </div>
                            </td>
                            {ACTION_COLUMNS.map((action) => {
                              const enabled = childGroup.actions.includes(action)
                              return (
                                <td key={action} className="p-3">
                                  <div className="flex items-center justify-center">
                                    {enabled ? (
                                      <AppCheckbox
                                        checked={value[child.module]?.includes(action) ?? false}
                                        onCheckedChange={(checked) =>
                                          toggleAction(child.module, action, Boolean(checked))
                                        }
                                        aria-label={`${child.label} ${PERMISSION_ACTION_META[action].label}`}
                                        className="size-[18px] border-[#aab6cc] data-checked:border-[#2563eb]"
                                      />
                                    ) : (
                                      <span className="text-black">—</span>
                                    )}
                                  </div>
                                </td>
                              )
                            })}
                          </tr>
                        )
                      })
                    : null}
                </Fragment>
              )
            })}
            {visibleRows.length === 0 ? (
              <tr>
                <td
                  colSpan={ACTION_COLUMNS.length + 1}
                  className="p-8 text-center text-[12.5px] text-[#8098b4]"
                >
                  لا توجد نتائج مطابقة.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  )
}
