"use client"

import { useEffect, useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2, ShieldCheck, ShieldPlus, Trash2, Users } from "lucide-react"
import { useForm } from "react-hook-form"
import { z } from "zod"

import {
  POS_PERMISSIONS,
  posAdminService,
  type PosPermission,
  type PosRoleRecord,
} from "@/features/pos/services/pos-admin.service"

import { AppButton, AppForm, AppInput } from "@/components/app"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

const PERMISSION_LABELS: Record<PosPermission, string> = {
  "sales:create": "إنشاء عمليات بيع",
  "sales:refund": "معالجة المرتجعات",
  "sales:discount": "تطبيق الخصومات",
  "inventory:view": "عرض المخزون",
  "inventory:manage": "إدارة المخزون",
  "reports:view": "عرض التقارير",
}

const createRoleSchema = z.object({
  name: z.string().min(2, "يجب أن يتكون اسم الدور من حرفين على الأقل."),
})

type CreateRoleFormValues = z.infer<typeof createRoleSchema>

export default function PosRolesPage() {
  const [roles, setRoles] = useState<PosRoleRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedPermissions, setSelectedPermissions] = useState<PosPermission[]>([])
  const [formError, setFormError] = useState<string | null>(null)
  const [deletingRoleId, setDeletingRoleId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const form = useForm<CreateRoleFormValues>({
    resolver: zodResolver(createRoleSchema),
    defaultValues: { name: "" },
  })

  async function loadRoles() {
    setIsLoading(true)
    setLoadError(null)
    try {
      setRoles(await posAdminService.listRoles())
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "تعذّر تحميل الأدوار.")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadRoles()
  }, [])

  function togglePermission(permission: PosPermission) {
    setSelectedPermissions((current) =>
      current.includes(permission)
        ? current.filter((item) => item !== permission)
        : [...current, permission]
    )
  }

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null)
    try {
      await posAdminService.createRole({ name: values.name, permissions: selectedPermissions })
      setDialogOpen(false)
      form.reset()
      setSelectedPermissions([])
      await loadRoles()
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "تعذّر إنشاء الدور.")
    }
  })

  async function handleDelete(roleId: string) {
    setDeleteError(null)
    setDeletingRoleId(roleId)
    try {
      await posAdminService.deleteRole(roleId)
      await loadRoles()
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "تعذّر حذف الدور.")
    } finally {
      setDeletingRoleId(null)
    }
  }

  return (
    <div dir="rtl" className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            الأدوار والصلاحيات
          </h1>
          <p className="text-sm text-muted-foreground">
            حدّد ما يستطيع كل دور فعله داخل نظام نقطة البيع، ثم أسنِد الدور لكل موظف.
          </p>
        </div>
        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open)
            if (!open) {
              form.reset()
              setSelectedPermissions([])
              setFormError(null)
            }
          }}
        >
          <AppButton icon={<ShieldPlus className="size-4" />} onClick={() => setDialogOpen(true)}>
            إضافة دور
          </AppButton>
          <DialogContent dir="rtl">
            <DialogHeader>
              <DialogTitle>إضافة دور جديد</DialogTitle>
            </DialogHeader>
            <AppForm onSubmit={onSubmit} className="space-y-5">
              <AppInput
                label="اسم الدور"
                placeholder="مثال: كاشير"
                errorText={form.formState.errors.name?.message}
                required
                {...form.register("name")}
              />

              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">الصلاحيات</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {POS_PERMISSIONS.map((permission) => (
                    <label
                      key={permission}
                      className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-foreground"
                    >
                      <Checkbox
                        checked={selectedPermissions.includes(permission)}
                        onCheckedChange={() => togglePermission(permission)}
                      />
                      {PERMISSION_LABELS[permission]}
                    </label>
                  ))}
                </div>
              </div>

              {formError ? <p className="text-sm text-destructive">{formError}</p> : null}

              <div className="flex justify-end gap-2 pt-2">
                <DialogClose asChild>
                  <AppButton type="button" variant="outline">
                    إلغاء
                  </AppButton>
                </DialogClose>
                <AppButton type="submit" loading={form.formState.isSubmitting}>
                  إنشاء الدور
                </AppButton>
              </div>
            </AppForm>
          </DialogContent>
        </Dialog>
      </div>

      {deleteError ? <p className="text-sm text-destructive">{deleteError}</p> : null}

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          جاري التحميل...
        </div>
      ) : loadError ? (
        <p className="py-16 text-center text-sm text-destructive">{loadError}</p>
      ) : roles.length === 0 ? (
        <Card className="border-dashed border-border/60">
          <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl border border-border bg-muted/60 text-muted-foreground">
              <ShieldCheck className="size-7" />
            </div>
            <p className="text-base font-semibold text-foreground">لا توجد أدوار بعد</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              أضف أول دور لتحديد ما يستطيع الموظفون فعله داخل نقطة البيع.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {roles.map((role) => (
            <Card key={role.id} className="border-border/60">
              <CardContent className="space-y-3 p-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-foreground">{role.name}</p>
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Users className="size-3.5" />
                      {role.employeeCount} موظف
                    </p>
                  </div>
                  <button
                    type="button"
                    title="حذف الدور"
                    disabled={deletingRoleId === role.id}
                    onClick={() => handleDelete(role.id)}
                    className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {role.permissions.length === 0 ? (
                    <span className="text-xs text-muted-foreground">بدون صلاحيات محددة</span>
                  ) : (
                    role.permissions.map((permission) => (
                      <Badge key={permission} variant="secondary" className="font-normal">
                        {PERMISSION_LABELS[permission as PosPermission] ?? permission}
                      </Badge>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
