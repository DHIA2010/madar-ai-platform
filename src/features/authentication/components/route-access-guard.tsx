"use client"

import { AppEmpty } from "@/components/app"

import { Can } from "./can"

export function RouteAccessGuard({
  permission,
  children,
}: {
  permission: string
  children: React.ReactNode
}) {
  return (
    <Can
      permission={permission}
      fallback={
        <AppEmpty
          title="الوصول مقيّد"
          description="ليست لديك صلاحية لعرض هذا القسم. تواصل مع مسؤول النظام إذا كنت تعتقد أن هذا خطأ."
        />
      }
    >
      {children}
    </Can>
  )
}
