"use client"

import { useState } from "react"

import { AppPageHeader } from "@/components/app"

import { IAM_PERMISSION_GROUPS } from "../services"
import { AdministrationModuleNav } from "./administration-module-nav"
import { PermissionMatrix } from "./permission-matrix"

function defaultViewOnlyPermissions(): Record<string, string[]> {
  return Object.fromEntries(
    IAM_PERMISSION_GROUPS.map((group) => [
      group.module,
      group.actions.includes("view") ? ["view"] : [],
    ])
  )
}

export function AdministrationPermissionsScreen() {
  const [permissions, setPermissions] = useState<Record<string, string[]>>(
    defaultViewOnlyPermissions
  )

  return (
    <div className="space-y-4">
      <AdministrationModuleNav />
      <AppPageHeader
        title="Permissions"
        subtitle="Browse the full catalog of module-level capabilities. To grant these to a group of users, create or edit a role from the Roles tab."
      />
      <PermissionMatrix
        groups={IAM_PERMISSION_GROUPS}
        value={permissions}
        onChange={setPermissions}
        subtitle="Search, expand, and toggle granular actions by module."
      />
    </div>
  )
}
