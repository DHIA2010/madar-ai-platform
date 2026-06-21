"use client"

import { AppPageHeader } from "@/components/app"

import { IAM_PERMISSION_GROUPS } from "../services"
import { AdministrationModuleNav } from "./administration-module-nav"
import { PermissionMatrix } from "./permission-matrix"

export function AdministrationPermissionsScreen() {
  return (
    <div className="space-y-4">
      <AdministrationModuleNav />
      <AppPageHeader
        title="Permissions"
        subtitle="Govern module-level capabilities with enterprise-ready access controls."
      />
      <PermissionMatrix
        groups={IAM_PERMISSION_GROUPS}
        subtitle="Search, expand, and toggle granular actions by module."
      />
    </div>
  )
}
