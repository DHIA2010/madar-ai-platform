"use client"

import { useEffect, useState } from "react"
import { Check, Minus } from "lucide-react"
import { toast } from "sonner"

import {
  AppCard,
  AppTable,
  AppTableBody,
  AppTableCell,
  AppTableHead,
  AppTableHeader,
  AppTableRow,
} from "@/components/app"

import { PLATFORM_PERMISSION_LABEL, platformAdminService, STAFF_ROLE_LABEL } from "../services"
import type { AdminStaffRole } from "../types/platform-admin.types"

const ROLES: AdminStaffRole[] = ["super_admin", "operations", "finance", "support"]

// The fixed staff roles and exactly what each can do -- read straight from the backend's own
// permission table, so this page can never drift from what's actually enforced.
export function MadarAdminRoles() {
  const [matrix, setMatrix] = useState<Record<AdminStaffRole, string[]> | null>(null)

  useEffect(() => {
    platformAdminService
      .getRolePermissions()
      .then(setMatrix)
      .catch(() => toast.error("تعذر تحميل الأدوار."))
  }, [])

  const permissions = Object.keys(PLATFORM_PERMISSION_LABEL)

  return (
    <div dir="rtl" className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">الأدوار والصلاحيات</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          أدوار فريق مدار ثابتة، ولكل دور مجموعة صلاحيات محددة. يُعيَّن الدور من صفحة المستخدمين.
        </p>
      </div>

      <AppCard
        state={matrix === null ? "loading" : "idle"}
        className="overflow-hidden rounded-2xl border-border/60 p-0 shadow-sm"
      >
        <AppTable>
          <AppTableHeader>
            <AppTableRow>
              <AppTableHead>الصلاحية</AppTableHead>
              {ROLES.map((role) => (
                <AppTableHead key={role} className="text-center">
                  {STAFF_ROLE_LABEL[role]}
                </AppTableHead>
              ))}
            </AppTableRow>
          </AppTableHeader>
          <AppTableBody>
            {permissions.map((permission) => (
              <AppTableRow key={permission}>
                <AppTableCell className="font-medium text-foreground">
                  {PLATFORM_PERMISSION_LABEL[permission]}
                </AppTableCell>
                {ROLES.map((role) => (
                  <AppTableCell key={role} className="text-center">
                    {matrix?.[role]?.includes(permission) ? (
                      <Check className="mx-auto size-4 text-emerald-600" />
                    ) : (
                      <Minus className="mx-auto size-4 text-muted-foreground/50" />
                    )}
                  </AppTableCell>
                ))}
              </AppTableRow>
            ))}
          </AppTableBody>
        </AppTable>
      </AppCard>
    </div>
  )
}
