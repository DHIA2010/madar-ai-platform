"use client"

import { useEffect, useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2, Lock, Mail, Play, Power, User, UserPlus, Users } from "lucide-react"
import { useForm } from "react-hook-form"
import { z } from "zod"

import {
  posAdminService,
  type PosEmployeeRecord,
  type PosRoleRecord,
} from "@/features/pos/services/pos-admin.service"

import { AppButton, AppForm, AppInput, AppPasswordInput } from "@/components/app"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

const NO_ROLE_VALUE = "__none__"

const createEmployeeSchema = z.object({
  fullName: z.string().min(2, "يجب أن يتكون الاسم الكامل من حرفين على الأقل."),
  email: z.email("يرجى إدخال بريد إلكتروني صحيح."),
  password: z.string().min(8, "يجب أن تتكون كلمة المرور من 8 أحرف على الأقل."),
  posRoleId: z.string().optional(),
})

type CreateEmployeeFormValues = z.infer<typeof createEmployeeSchema>

function formatLastLogin(value: string | null) {
  if (!value) return "لم يسجّل الدخول بعد"
  return new Date(value).toLocaleString("ar", { dateStyle: "medium", timeStyle: "short" })
}

export default function PosEmployeesPage() {
  const [employees, setEmployees] = useState<PosEmployeeRecord[]>([])
  const [roles, setRoles] = useState<PosRoleRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [togglingEmployeeId, setTogglingEmployeeId] = useState<string | null>(null)
  const [toggleError, setToggleError] = useState<string | null>(null)

  const form = useForm<CreateEmployeeFormValues>({
    resolver: zodResolver(createEmployeeSchema),
    defaultValues: { fullName: "", email: "", password: "", posRoleId: NO_ROLE_VALUE },
  })

  async function loadData() {
    setIsLoading(true)
    setLoadError(null)
    try {
      const [employeesResult, rolesResult] = await Promise.all([
        posAdminService.listEmployees(),
        posAdminService.listRoles(),
      ])
      setEmployees(employeesResult)
      setRoles(rolesResult)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "تعذّر تحميل الموظفين.")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null)
    try {
      await posAdminService.createEmployee({
        fullName: values.fullName,
        email: values.email,
        password: values.password,
        posRoleId: values.posRoleId && values.posRoleId !== NO_ROLE_VALUE ? values.posRoleId : null,
      })
      setDialogOpen(false)
      form.reset()
      await loadData()
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "تعذّر إضافة الموظف.")
    }
  })

  async function toggleStatus(employee: PosEmployeeRecord) {
    setToggleError(null)
    setTogglingEmployeeId(employee.id)
    try {
      await posAdminService.updateEmployeeStatus(
        employee.id,
        employee.status === "active" ? "inactive" : "active"
      )
      await loadData()
    } catch (error) {
      setToggleError(error instanceof Error ? error.message : "تعذّر تحديث حالة الموظف.")
    } finally {
      setTogglingEmployeeId(null)
    }
  }

  return (
    <div dir="rtl" className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">الموظفون</h1>
          <p className="text-sm text-muted-foreground">
            أضف الموظفين الذين سيسجّلون الدخول إلى نظام نقطة البيع وأدر أدوارهم.
          </p>
        </div>
        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open)
            if (!open) {
              form.reset()
              setFormError(null)
            }
          }}
        >
          <AppButton icon={<UserPlus className="size-4" />} onClick={() => setDialogOpen(true)}>
            إضافة موظف
          </AppButton>
          <DialogContent dir="rtl">
            <DialogHeader>
              <DialogTitle>إضافة موظف جديد</DialogTitle>
            </DialogHeader>
            <AppForm onSubmit={onSubmit} className="space-y-5">
              <AppInput
                label="الاسم الكامل"
                placeholder="اسم الموظف"
                startIcon={<User className="size-4" />}
                errorText={form.formState.errors.fullName?.message}
                required
                {...form.register("fullName")}
              />
              <AppInput
                type="email"
                label="البريد الإلكتروني"
                placeholder="you@example.com"
                startIcon={<Mail className="size-4" />}
                errorText={form.formState.errors.email?.message}
                required
                {...form.register("email")}
              />
              <AppPasswordInput
                label="كلمة المرور"
                placeholder="••••••••"
                startIcon={<Lock className="size-4" />}
                errorText={form.formState.errors.password?.message}
                required
                {...form.register("password")}
              />
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">الدور</label>
                <Select
                  value={form.watch("posRoleId")}
                  onValueChange={(value) => form.setValue("posRoleId", value)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="اختر دورًا" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_ROLE_VALUE}>بدون دور</SelectItem>
                    {roles.map((role) => (
                      <SelectItem key={role.id} value={role.id}>
                        {role.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {formError ? <p className="text-sm text-destructive">{formError}</p> : null}

              <div className="flex justify-end gap-2 pt-2">
                <DialogClose asChild>
                  <AppButton type="button" variant="outline">
                    إلغاء
                  </AppButton>
                </DialogClose>
                <AppButton type="submit" loading={form.formState.isSubmitting}>
                  إضافة الموظف
                </AppButton>
              </div>
            </AppForm>
          </DialogContent>
        </Dialog>
      </div>

      {toggleError ? <p className="text-sm text-destructive">{toggleError}</p> : null}

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          جاري التحميل...
        </div>
      ) : loadError ? (
        <p className="py-16 text-center text-sm text-destructive">{loadError}</p>
      ) : employees.length === 0 ? (
        <Card className="border-dashed border-border/60">
          <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl border border-border bg-muted/60 text-muted-foreground">
              <Users className="size-7" />
            </div>
            <p className="text-base font-semibold text-foreground">لا يوجد موظفون بعد</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              أضف أول موظف ليتمكن من تسجيل الدخول إلى نظام نقطة البيع.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-border/60">
          <CardContent className="p-0">
            <Table dir="rtl">
              <TableHeader>
                <TableRow>
                  <TableHead>الاسم الكامل</TableHead>
                  <TableHead>البريد الإلكتروني</TableHead>
                  <TableHead>الدور</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead>آخر تسجيل دخول</TableHead>
                  <TableHead className="text-left">إجراء</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.map((employee) => (
                  <TableRow key={employee.id}>
                    <TableCell className="font-medium text-foreground">
                      {employee.fullName}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{employee.email}</TableCell>
                    <TableCell>
                      {employee.posRoleName ? (
                        <Badge variant="secondary">{employee.posRoleName}</Badge>
                      ) : (
                        <span className="text-sm text-muted-foreground">بدون دور</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={
                          employee.status === "active"
                            ? "border-transparent bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                            : "border-transparent bg-muted text-muted-foreground hover:bg-muted"
                        }
                      >
                        {employee.status === "active" ? "نشط" : "معطّل"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatLastLogin(employee.lastLoginAt)}
                    </TableCell>
                    <TableCell className="text-left">
                      <button
                        type="button"
                        title={employee.status === "active" ? "تعطيل الموظف" : "تفعيل الموظف"}
                        disabled={togglingEmployeeId === employee.id}
                        onClick={() => toggleStatus(employee)}
                        className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
                      >
                        {employee.status === "active" ? (
                          <Power className="size-4" />
                        ) : (
                          <Play className="size-4" />
                        )}
                        {employee.status === "active" ? "تعطيل" : "تفعيل"}
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
