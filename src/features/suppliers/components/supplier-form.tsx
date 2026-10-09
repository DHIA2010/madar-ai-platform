"use client"

import { type FormEvent, useState } from "react"
import { useRouter } from "next/navigation"
import { Building2, Landmark, Loader2, Plus, Upload, User } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import { AppButton, AppForm, AppInput, AppSearchableSelect } from "@/components/app"

import {
  PAYMENT_TERMS_OPTIONS,
  SUPPLIER_COUNTRIES,
  supplierService,
  VAT_TYPE_OPTIONS,
} from "../services"
import {
  type BankAccountType,
  EMPTY_SUPPLIER_FORM_VALUES,
  type Supplier,
  type SupplierFormValues,
  type SupplierKind,
} from "../types"
import { FIELD_CLASS, HEADING, PANEL, SupplierField } from "./supplier-field"

function supplierToFormValues(supplier: Supplier): SupplierFormValues {
  return {
    imageUrl: supplier.imageUrl,
    name: supplier.name,
    email: supplier.email,
    phone: supplier.phone,
    kind: supplier.kind,
    country: supplier.country,
    city: supplier.city,
    paymentTerms: supplier.paymentTerms,
    address: supplier.address,
    bankDetails: supplier.bankDetails,
    companyDetails: supplier.companyDetails,
  }
}

function SectionHeading({ icon: Icon, title }: { icon: typeof User; title: string }) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <span className="flex size-8 items-center justify-center rounded-[10px] bg-[#eef4ff] text-[#2878ff]">
        <Icon className="size-4" />
      </span>
      <p className={cn("text-[14px] font-bold", HEADING)}>{title}</p>
    </div>
  )
}

// Uploads immediately on file pick (via supplierService.uploadImage) and hands the parent a real,
// already-hosted URL -- never a raw data: URL, which the backend has nowhere sane to store.
function ImageDropzone({
  imageUrl,
  onChange,
  label,
}: {
  imageUrl: string | null
  onChange: (url: string | null) => void
  label: string
}) {
  const [isUploading, setIsUploading] = useState(false)

  async function handleFile(file: File | undefined) {
    if (!file) return
    if (!file.type.startsWith("image/")) {
      toast.error("يرجى اختيار ملف صورة صالح.")
      return
    }
    if (file.size > 3 * 1024 * 1024) {
      toast.error("يجب ألا يتجاوز حجم الصورة 3 ميجابايت.")
      return
    }
    setIsUploading(true)
    try {
      const url = await supplierService.uploadImage(file)
      onChange(url)
    } catch {
      toast.error("تعذر رفع الصورة. حاول مرة أخرى.")
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <label
      className={cn(
        "flex h-32 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[12px] border-2 border-dashed text-center transition-colors",
        imageUrl
          ? "border-[#2878ff] bg-[#f7f9fd]"
          : "border-[#dbe6f8] bg-[#f7f9fd] hover:border-[#c4d5f0]"
      )}
    >
      <input
        type="file"
        accept="image/*"
        className="hidden"
        disabled={isUploading}
        onChange={(event) => void handleFile(event.target.files?.[0])}
      />
      {isUploading ? (
        <Loader2 className="size-5 animate-spin text-[#2878ff]" />
      ) : imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt={label} className="h-full rounded-[10px] object-contain p-2" />
      ) : (
        <>
          <Upload className="size-5 text-[#95a4bd]" />
          <span className="text-[11.5px] text-[#6b7b96]">{label}</span>
        </>
      )}
    </label>
  )
}

function SegmentedToggle<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (value: T) => void
}) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "h-11 rounded-[12px] border text-[12.5px] font-semibold transition-colors",
            value === option.value
              ? "border-[#2878ff] bg-[#eef4ff] text-[#2878ff]"
              : "border-[#e1e7f0] bg-white text-[#6b7b96] hover:border-[#c4d5f0]"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function SupplierForm({ initialSupplier }: { initialSupplier?: Supplier }) {
  const router = useRouter()
  const isEditing = Boolean(initialSupplier)

  const [values, setValues] = useState<SupplierFormValues>(
    initialSupplier ? supplierToFormValues(initialSupplier) : EMPTY_SUPPLIER_FORM_VALUES
  )
  const [submitting, setSubmitting] = useState(false)

  function set<K extends keyof SupplierFormValues>(key: K, value: SupplierFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }))
  }

  function setBank<K extends keyof SupplierFormValues["bankDetails"]>(
    key: K,
    value: SupplierFormValues["bankDetails"][K]
  ) {
    setValues((current) => ({ ...current, bankDetails: { ...current.bankDetails, [key]: value } }))
  }

  function setCompany<K extends keyof SupplierFormValues["companyDetails"]>(
    key: K,
    value: SupplierFormValues["companyDetails"][K]
  ) {
    setValues((current) => ({
      ...current,
      companyDetails: { ...current.companyDetails, [key]: value },
    }))
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!values.name.trim() || !values.email.trim() || !values.phone.trim()) {
      toast.error("يرجى تعبئة اسم المورد والبريد الإلكتروني والهاتف.")
      return
    }

    setSubmitting(true)
    try {
      if (initialSupplier) {
        await supplierService.update(initialSupplier.id, values)
        toast.success(`تم تحديث بيانات ${values.name}.`)
      } else {
        await supplierService.create(values)
        toast.success(`تم إضافة ${values.name} إلى قائمة الموردين.`)
      }
      router.push(ROUTES.suppliers)
    } catch {
      toast.error("تعذر حفظ بيانات المورد. حاول مرة أخرى.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AppForm dir="rtl" onSubmit={handleSubmit} className="grid gap-5 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-2">
        <section className={cn(PANEL, "p-4 md:p-5")}>
          <SectionHeading icon={User} title="بيانات المورد" />

          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <SupplierField label="اسم المورد" required>
                <AppInput
                  value={values.name}
                  onChange={(event) => set("name", event.target.value)}
                  placeholder="اسم المورد"
                  className={FIELD_CLASS}
                />
              </SupplierField>
              <SupplierField label="البريد الإلكتروني" required>
                <AppInput
                  type="email"
                  value={values.email}
                  onChange={(event) => set("email", event.target.value)}
                  placeholder="email@example.com"
                  className={FIELD_CLASS}
                />
              </SupplierField>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <SupplierField label="رقم الهاتف" required>
                <AppInput
                  value={values.phone}
                  onChange={(event) => set("phone", event.target.value)}
                  placeholder="+966 5xxxxxxxx"
                  className={FIELD_CLASS}
                />
              </SupplierField>
              <SupplierField label="نوع المورد">
                <SegmentedToggle<SupplierKind>
                  value={values.kind}
                  onChange={(kind) => set("kind", kind)}
                  options={[
                    { value: "local", label: "محلي" },
                    { value: "international", label: "دولي" },
                  ]}
                />
              </SupplierField>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <SupplierField label="الدولة">
                {/* Creatable: the starter list is just suggestions, not a closed set -- a country
                    not on it is typed here and used as-is, same pattern as AddProduct's category
                    field. */}
                <AppSearchableSelect
                  value={values.country}
                  options={SUPPLIER_COUNTRIES.map((country) => ({
                    value: country,
                    label: country,
                  }))}
                  onChange={(value) => set("country", value)}
                  onCreate={(draft) => set("country", draft)}
                  createLabel={(draft) => `إضافة دولة "${draft}"`}
                  placeholder="اختر الدولة أو اكتب دولة جديدة"
                  searchPlaceholder="ابحث أو اكتب دولة جديدة..."
                  emptyLabel="لا توجد دولة مطابقة"
                  ariaLabel="الدولة"
                />
              </SupplierField>
              <SupplierField label="المدينة">
                <AppInput
                  value={values.city}
                  onChange={(event) => set("city", event.target.value)}
                  placeholder="المدينة"
                  className={FIELD_CLASS}
                />
              </SupplierField>
              <SupplierField label="شروط الدفع">
                <AppSearchableSelect
                  value={values.paymentTerms ?? ""}
                  options={PAYMENT_TERMS_OPTIONS.map((option) => ({
                    value: option.value,
                    label: option.label,
                  }))}
                  onChange={(value) =>
                    set("paymentTerms", value as SupplierFormValues["paymentTerms"])
                  }
                  placeholder="اختر الشروط"
                  searchPlaceholder="ابحث عن شروط الدفع..."
                  emptyLabel="لا توجد نتائج"
                  ariaLabel="شروط الدفع"
                />
              </SupplierField>
            </div>
          </div>
        </section>

        <section className={cn(PANEL, "p-4 md:p-5")}>
          <SectionHeading icon={Building2} title="بيانات الشركة" />

          <div className="space-y-4">
            <SupplierField label="شعار الشركة">
              <ImageDropzone
                imageUrl={values.companyDetails.companyImageUrl}
                onChange={(url) => setCompany("companyImageUrl", url)}
                label="اسحب وأفلت صورة أو اضغط للرفع"
              />
            </SupplierField>

            <div className="grid gap-4 sm:grid-cols-2">
              <SupplierField label="اسم الشركة">
                <AppInput
                  value={values.companyDetails.companyName}
                  onChange={(event) => setCompany("companyName", event.target.value)}
                  placeholder="اسم الشركة"
                  className={FIELD_CLASS}
                />
              </SupplierField>
              <SupplierField label="بريد الشركة">
                <AppInput
                  type="email"
                  value={values.companyDetails.companyEmail}
                  onChange={(event) => setCompany("companyEmail", event.target.value)}
                  placeholder="company@example.com"
                  className={FIELD_CLASS}
                />
              </SupplierField>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <SupplierField label="هاتف الشركة">
                <AppInput
                  value={values.companyDetails.companyPhone}
                  onChange={(event) => setCompany("companyPhone", event.target.value)}
                  placeholder="+966 5xxxxxxxx"
                  className={FIELD_CLASS}
                />
              </SupplierField>
              <SupplierField label="الموقع الإلكتروني">
                <AppInput
                  value={values.companyDetails.website}
                  onChange={(event) => setCompany("website", event.target.value)}
                  placeholder="https://example.com"
                  className={FIELD_CLASS}
                />
              </SupplierField>
            </div>

            <SupplierField label="عنوان الشركة">
              <textarea
                value={values.companyDetails.address}
                onChange={(event) => setCompany("address", event.target.value)}
                placeholder="عنوان الشركة"
                rows={3}
                className={cn(
                  "w-full resize-none p-3 outline-none focus:border-[#2878ff]",
                  FIELD_CLASS,
                  "h-auto rounded-[12px] border"
                )}
              />
            </SupplierField>

            <div className="grid gap-4 sm:grid-cols-2">
              <SupplierField label="الرقم الضريبي">
                <AppInput
                  value={values.companyDetails.taxNumber}
                  onChange={(event) => setCompany("taxNumber", event.target.value)}
                  placeholder="الرقم الضريبي"
                  className={FIELD_CLASS}
                />
              </SupplierField>
              <SupplierField label="نوع الضريبة">
                <AppSearchableSelect
                  value={values.companyDetails.vatType ?? ""}
                  options={VAT_TYPE_OPTIONS.map((option) => ({
                    value: option.value,
                    label: option.label,
                  }))}
                  onChange={(value) =>
                    setCompany("vatType", value as SupplierFormValues["companyDetails"]["vatType"])
                  }
                  placeholder="اختر نوع الضريبة"
                  searchPlaceholder="ابحث..."
                  emptyLabel="لا توجد نتائج"
                  ariaLabel="نوع الضريبة"
                />
              </SupplierField>
            </div>

            <SupplierField label="نوع النشاط">
              <AppInput
                value={values.companyDetails.industryType}
                onChange={(event) => setCompany("industryType", event.target.value)}
                placeholder="مثال: تجارة التجزئة"
                className={FIELD_CLASS}
              />
            </SupplierField>
          </div>
        </section>
      </div>

      <section className={cn(PANEL, "p-4 md:p-5 lg:col-span-1")}>
        <SectionHeading icon={Landmark} title="البيانات البنكية" />

        <div className="space-y-4">
          <SupplierField label="اسم البنك">
            <AppInput
              value={values.bankDetails.bankName}
              onChange={(event) => setBank("bankName", event.target.value)}
              placeholder="اسم البنك"
              className={FIELD_CLASS}
            />
          </SupplierField>
          <SupplierField label="اسم الحساب">
            <AppInput
              value={values.bankDetails.accountName}
              onChange={(event) => setBank("accountName", event.target.value)}
              placeholder="اسم الحساب"
              className={FIELD_CLASS}
            />
          </SupplierField>
          <SupplierField label="نوع الحساب">
            <SegmentedToggle<BankAccountType>
              value={values.bankDetails.accountType}
              onChange={(accountType) => setBank("accountType", accountType)}
              options={[
                { value: "savings", label: "توفير" },
                { value: "current", label: "جاري" },
                { value: "other", label: "أخرى" },
              ]}
            />
          </SupplierField>
          <SupplierField label="رقم الحساب">
            <AppInput
              value={values.bankDetails.accountNumber}
              onChange={(event) => setBank("accountNumber", event.target.value)}
              placeholder="رقم الحساب"
              className={FIELD_CLASS}
            />
          </SupplierField>
          <SupplierField label="Swift / IBAN">
            <AppInput
              value={values.bankDetails.swiftIban}
              onChange={(event) => setBank("swiftIban", event.target.value)}
              placeholder="Swift / IBAN"
              className={FIELD_CLASS}
            />
          </SupplierField>
          <div className="grid gap-4 sm:grid-cols-2">
            <SupplierField label="رمز الفرع">
              <AppInput
                value={values.bankDetails.branchCode}
                onChange={(event) => setBank("branchCode", event.target.value)}
                placeholder="رمز الفرع"
                className={FIELD_CLASS}
              />
            </SupplierField>
            <SupplierField label="مدينة البنك">
              <AppInput
                value={values.bankDetails.bankCity}
                onChange={(event) => setBank("bankCity", event.target.value)}
                placeholder="مدينة البنك"
                className={FIELD_CLASS}
              />
            </SupplierField>
          </div>
        </div>
      </section>

      <div className="flex items-center justify-end gap-2 lg:col-span-3">
        <AppButton
          type="button"
          variant="outline"
          className="h-11 rounded-[12px] border-[#c4d5f0] px-6 text-[13.5px] font-semibold text-[#2878ff] hover:bg-[#eef4ff]"
          onClick={() => router.push(ROUTES.suppliers)}
        >
          إلغاء
        </AppButton>
        <AppButton
          type="submit"
          loading={submitting}
          icon={
            isEditing ? undefined : (
              <span className="flex size-5 items-center justify-center rounded-full bg-white/20">
                <Plus className="size-3.5" strokeWidth={2.5} />
              </span>
            )
          }
          className="h-11 gap-2 rounded-full bg-[#2878ff] px-6 text-[13.5px] font-bold text-white shadow-[0_6px_16px_rgba(40,120,255,0.28)] transition-all hover:-translate-y-px hover:bg-[#1f63d6] hover:shadow-[0_8px_20px_rgba(40,120,255,0.34)] active:translate-y-0"
        >
          {isEditing ? "حفظ التغييرات" : "إضافة المورد"}
        </AppButton>
      </div>
    </AppForm>
  )
}
