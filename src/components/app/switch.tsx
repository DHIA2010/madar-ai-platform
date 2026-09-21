import * as React from "react"

import { Switch } from "@/components/ui/switch"

export type AppSwitchProps = React.ComponentProps<typeof Switch>

// Thin re-export so feature code (restricted from importing @/components/ui/* directly) has an
// app-layer toggle to reach for -- same shape as the underlying Switch, no extra behavior.
export const AppSwitch = Switch
