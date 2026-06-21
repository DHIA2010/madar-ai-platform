"use client"

import {
  AppAvatar,
  AppAvatarFallback,
  AppBadge,
  AppButton,
  AppCard,
  AppDrawer,
} from "@/components/app"

import type { IamRole, IamUser } from "../types"

type AdministrationUserProfileDrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  user?: IamUser
  role?: IamRole
}

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

export function AdministrationUserProfileDrawer({
  open,
  onOpenChange,
  user,
  role,
}: AdministrationUserProfileDrawerProps) {
  return (
    <AppDrawer
      open={open}
      onOpenChange={onOpenChange}
      side="right"
      title={user ? user.fullName : "User profile"}
      description="Identity, access scope, and session posture"
      contentClassName="w-full sm:max-w-xl"
    >
      {!user ? null : (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-card p-3">
            <AppAvatar size="lg">
              <AppAvatarFallback>{initials(user.fullName)}</AppAvatarFallback>
            </AppAvatar>
            <div>
              <p className="font-semibold">{user.fullName}</p>
              <p className="text-sm text-muted-foreground">{user.email}</p>
              <div className="mt-1 flex items-center gap-2">
                <AppBadge variant="outline">{user.department}</AppBadge>
                <AppBadge variant="outline">{user.status}</AppBadge>
              </div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <AppCard title="Access" contentClassName="space-y-2" className="shadow-none">
              <p className="text-sm">
                <span className="text-muted-foreground">Role:</span> {role?.name ?? "N/A"}
              </p>
              <p className="text-sm">
                <span className="text-muted-foreground">Workspaces:</span>{" "}
                {user.workspaces.join(", ")}
              </p>
              <p className="text-sm">
                <span className="text-muted-foreground">Teams:</span> {user.teams.join(", ")}
              </p>
              <p className="text-sm">
                <span className="text-muted-foreground">MFA:</span>{" "}
                {user.mfaEnabled ? "Enabled" : "Not enabled"}
              </p>
            </AppCard>
            <AppCard title="Security" contentClassName="space-y-2" className="shadow-none">
              <p className="text-sm text-muted-foreground">Password: Managed by secure policy</p>
              <p className="text-sm text-muted-foreground">MFA: Placeholder for enforce/reset</p>
              <p className="text-sm text-muted-foreground">Recovery codes: Placeholder</p>
              <p className="text-sm text-muted-foreground">API tokens: Placeholder</p>
              <p className="text-sm text-muted-foreground">SSO/SCIM: Future integration-ready</p>
            </AppCard>
          </div>

          <AppCard title="Recent Activity" contentClassName="space-y-2" className="shadow-none">
            {user.recentActivity.map((entry) => (
              <div
                key={entry}
                className="rounded-lg border border-border/60 bg-muted/20 p-2 text-sm"
              >
                {entry}
              </div>
            ))}
          </AppCard>

          <AppCard
            title="Active Sessions & Devices"
            contentClassName="space-y-2"
            className="shadow-none"
          >
            {user.devices.map((device) => (
              <div
                key={`${device.name}-${device.browser}`}
                className="rounded-lg border border-border/60 bg-muted/20 p-2 text-sm"
              >
                <p className="font-medium">{device.name}</p>
                <p className="text-muted-foreground">
                  {device.browser} • Last active {device.lastActive}
                </p>
              </div>
            ))}
          </AppCard>

          <div className="flex justify-end">
            <AppButton variant="outline" onClick={() => onOpenChange(false)}>
              Close profile
            </AppButton>
          </div>
        </div>
      )}
    </AppDrawer>
  )
}
