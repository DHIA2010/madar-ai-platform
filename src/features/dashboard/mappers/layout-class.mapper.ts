import type { WidgetResponsiveBehavior } from "../types"

export function mapResponsiveBehaviorToClassName(responsive: WidgetResponsiveBehavior) {
  const classes = [`col-span-${responsive.mobile}`]

  if (responsive.tablet) {
    classes.push(`${responsive.tabletBreakpoint ?? "md"}:col-span-${responsive.tablet}`)
  }

  if (responsive.desktop) {
    classes.push(`${responsive.desktopBreakpoint ?? "xl"}:col-span-${responsive.desktop}`)
  }

  if (responsive.utilityClassName) {
    classes.push(responsive.utilityClassName)
  }

  return classes.join(" ")
}
