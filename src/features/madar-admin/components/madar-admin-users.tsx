"use client"

import { useCallback, useEffect, useState } from "react"
import { Lock, MoreHorizontal, UserPlus } from "lucide-react"
import { toast } from "sonner"

import {
  AppButton,
  AppCard,
  AppDialog,
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuItem,
  AppDropdownMenuTrigger,
  AppInput,
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
  AppStatusBadge,
  AppTable,
  AppTableBody,
  AppTableCell,
  AppTableHead,
  AppTableHeader,
  AppTableRow,
} from "@/components/app"

import { formatDate, platformAdminService, STAFF_ROLE_LABEL } from "../services"
import type { AdminStaffMember, AdminStaffRole } from "../types/platform-admin.types"

const ROLES: AdminStaffRole[] = ["super_admin", "operations", "finance", "support"]

// Madar's own team with access to this console. A staff member is an existing Madar account
// given one of the fixed roles; the PLATFORM_ADMIN_EMAILS owners are permanent and locked here.
export function MadarAdminUsers() {
  const [staff, setStaff] = useState<AdminStaffMember[] | null>(null)
  const [adding, setAdding] = useState(false)
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<AdminStaffRole>("support")
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setStaff(await platformAdminService.listStaff())
    } catch {
      toast.error("تعذر تحميل فريق مدار.")
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true)
    try {
      await action()
      toast.success(success)
      await load()
      return true
    } catch (error) {
      const code = (error as { code?: string })?.code
      toast.error(
        code === "STAFF_USER_NOT_FOUND"
          ? "لا يوجد حساب مدار بهذا البريد -- اطلب منه التسجيل أولاً."
          : code === "STAFF_SELF_LOCKOUT"
            ? "لا يمكنك إزالة صلاحياتك بنفسك."
            : code === "STAFF_IS_OWNER"
              ? "هذا الشخص مدير عام دائم بالفعل."
              : "تعذر حفظ التغيير."
      )
      return false
    } finally {
      setBusy(false)
    }
  }

  return (
    <div dir="rtl" className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">المستخدمون</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            فريق مدار الداخلي وصلاحيات كل عضو في لوحة الإدارة.
          </p>
        </div>
        <AppButton
          className="h-11 rounded-[10px] px-5 font-semibold"
          icon={<UserPlus className="size-4" />}
          onClick={() => setAdding(true)}
        >
          إضافة عضو
        </AppButton>
      </div>

      <AppCard
        state={staff === null ? "loading" : "idle"}
        className="overflow-hidden rounded-2xl border-border/60 p-0 shadow-sm"
      >
        <AppTable>
          <AppTableHeader>
            <AppTableRow>
              <AppTableHead>العضو</AppTableHead>
              <AppTableHead>الدور</AppTableHead>
              <AppTableHead>الحالة</AppTableHead>
              <AppTableHead>تاريخ الإضافة</AppTableHead>
              <AppTableHead className="w-10" />
            </AppTableRow>
          </AppTableHeader>
          <AppTableBody>
            {(staff ?? []).map((member) => (
              <AppTableRow key={member.userId ?? member.email}>
                <AppTableCell>
                  <p className="font-medium text-foreground">{member.name ?? "—"}</p>
                  <p className="text-xs text-muted-foreground" dir="ltr">
                    {member.email}
                  </p>
                </AppTableCell>
                <AppTableCell>
                  <span className="font-medium">{STAFF_ROLE_LABEL[member.role]}</span>
                  {member.isOwner ? (
                    <span className="ms-2 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10.5px] font-semibold text-amber-700">
                      <Lock className="size-3" /> مالك المنصة
                    </span>
                  ) : null}
                </AppTableCell>
                <AppTableCell>
                  <AppStatusBadge
                    status="neutral"
                    label={member.status === "active" ? "نشط" : "معطل"}
                    className={
                      member.status === "active"
                        ? "bg-emerald-50 text-emerald-600"
                        : "bg-slate-100 text-slate-600"
                    }
                  />
                </AppTableCell>
                <AppTableCell className="text-muted-foreground">
                  {member.addedAt ? formatDate(member.addedAt) : "—"}
                </AppTableCell>
                <AppTableCell>
                  {member.isOwner || !member.userId ? null : (
                    <AppDropdownMenu modal={false}>
                      <AppDropdownMenuTrigger asChild>
                        <AppButton
                          variant="ghost"
                          size="icon-sm"
                          aria-label="إجراءات"
                          disabled={busy}
                        >
                          <MoreHorizontal className="size-4" />
                        </AppButton>
                      </AppDropdownMenuTrigger>
                      <AppDropdownMenuContent align="end">
                        {ROLES.filter((option) => option !== member.role).map((option) => (
                          <AppDropdownMenuItem
                            key={option}
                            onSelect={() =>
                              void run(
                                () =>
                                  platformAdminService.updateStaff(member.userId!, {
                                    role: option,
                                  }),
                                `أصبح الدور ${STAFF_ROLE_LABEL[option]}.`
                              )
                            }
                          >
                            تغيير إلى {STAFF_ROLE_LABEL[option]}
                          </AppDropdownMenuItem>
                        ))}
                        <AppDropdownMenuItem
                          className={
                            member.status === "active"
                              ? "text-destructive focus:text-destructive"
                              : ""
                          }
                          onSelect={() =>
                            void run(
                              () =>
                                platformAdminService.updateStaff(member.userId!, {
                                  status: member.status === "active" ? "disabled" : "active",
                                }),
                              member.status === "active" ? "تم تعطيل العضو." : "تم تفعيل العضو."
                            )
                          }
                        >
                          {member.status === "active" ? "تعطيل الوصول" : "تفعيل الوصول"}
                        </AppDropdownMenuItem>
                      </AppDropdownMenuContent>
                    </AppDropdownMenu>
                  )}
                </AppTableCell>
              </AppTableRow>
            ))}
          </AppTableBody>
        </AppTable>
      </AppCard>

      <AppDialog
        open={adding}
        onOpenChange={setAdding}
        title={<span dir="rtl">إضافة عضو لفريق مدار</span>}
        description={
          <span dir="rtl">
            يجب أن يكون لديه حساب في مدار. سيحصل على الوصول للوحة الإدارة حسب الدور المختار.
          </span>
        }
        contentClassName="[direction:rtl] max-w-[30rem] gap-5 p-6"
        footer={
          <div className="flex w-full gap-2">
            <AppButton
              variant="outline"
              className="h-12 flex-1 rounded-[10px] font-semibold"
              onClick={() => setAdding(false)}
            >
              إلغاء
            </AppButton>
            <AppButton
              className="h-12 flex-1 rounded-[10px] font-bold"
              loading={busy}
              onClick={async () => {
                if (!email.includes("@")) {
                  toast.error("أدخل بريداً إلكترونياً صحيحاً.")
                  return
                }
                const ok = await run(
                  () => platformAdminService.addStaff(email.trim(), role),
                  "تمت إضافة العضو."
                )
                if (ok) {
                  setAdding(false)
                  setEmail("")
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
            <label className="mb-1.5 block text-sm font-medium">البريد الإلكتروني</label>
            <AppInput
              type="email"
              dir="ltr"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@madar.my"
              className="h-11 rounded-[10px] text-right"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">الدور</label>
            <AppSelect value={role} onValueChange={(value) => setRole(value as AdminStaffRole)}>
              <AppSelectTrigger className="h-11 w-full rounded-[10px]">
                <AppSelectValue />
              </AppSelectTrigger>
              <AppSelectContent>
                {ROLES.map((option) => (
                  <AppSelectItem key={option} value={option}>
                    {STAFF_ROLE_LABEL[option]}
                  </AppSelectItem>
                ))}
              </AppSelectContent>
            </AppSelect>
          </div>
        </div>
      </AppDialog>
    </div>
  )
}
