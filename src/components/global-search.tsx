"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import { DialogTitle } from "@/components/ui/dialog"
import { ROUTES } from "@/constants/routes"
import { VisuallyHidden } from "@radix-ui/react-visually-hidden"

import { Search, LayoutDashboard, User, CreditCard, ArrowRight } from "lucide-react"

export function GlobalSearch() {
  const t = useTranslations("shared.globalSearch")
  const [open, setOpen] = React.useState(false)
  const router = useRouter()
  // Opens a page and closes the search box behind it.
  const go = (href: string) => {
    setOpen(false)
    router.push(href)
  }

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        setOpen((open) => !open)
      }
    }
    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [])

  return (
    <>
      {/* Mobile */}
      <Button
        variant="ghost"
        size="icon"
        className="rounded-full h-10 w-10 flex xl:hidden"
        onClick={() => setOpen(true)}
      >
        <Search className="size-5" />
      </Button>

      {/* Desktop */}
      <Button
        variant="ghost"
        className="rounded-full hidden xl:flex items-center w-[280px] gap-2 h-9 px-4 border border-border justify-between bg-muted/40 hover:bg-muted/80 transition"
        onClick={() => setOpen(true)}
      >
        <div className="flex items-center gap-2 text-muted-foreground">
          <Search className="size-5" />
          <span className="text-sm">{t("triggerPlaceholder")}</span>
        </div>

        {/* Shortcut */}
        <kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100 sm:flex">
          ⌘K
        </kbd>
      </Button>

      {/* Dialog */}
      <CommandDialog open={open} onOpenChange={setOpen}>
        <VisuallyHidden>
          <DialogTitle>{t("dialogTitle")}</DialogTitle>
        </VisuallyHidden>

        {/* Input */}
        <div className="border-b px-3">
          <CommandInput placeholder={t("inputPlaceholder")} className="h-11 text-sm" />
        </div>

        <CommandList className="max-h-[400px] overflow-y-auto">
          <CommandEmpty className="py-6 text-center text-sm text-muted-foreground">
            {t("noResults")}
          </CommandEmpty>

          {/* Dashboard */}
          <CommandGroup
            heading={t("groups.dashboard.heading")}
            className="px-2 text-xs font-semibold text-muted-foreground"
          >
            <CommandItem
              onSelect={() => go(ROUTES.dashboard)}
              className="flex items-center gap-2 px-2 py-2 rounded-md cursor-pointer"
            >
              <LayoutDashboard className="size-4 text-muted-foreground" />
              <span>{t("groups.dashboard.dashboard")}</span>
              <ArrowRight className="ms-auto size-3 opacity-40 rtl:rotate-180" />
            </CommandItem>
          </CommandGroup>

          <CommandSeparator />

          {/* Settings */}
          <CommandGroup
            heading={t("groups.settings.heading")}
            className="px-2 text-xs font-semibold text-muted-foreground"
          >
            <CommandItem
              onSelect={() => go("/account/edit-profile")}
              className="flex items-center gap-2 px-2 py-2 rounded-md"
            >
              <User className="size-4 text-muted-foreground" />
              <span>{t("groups.settings.profile")}</span>
              <ArrowRight className="ms-auto size-3 opacity-40 rtl:rotate-180" />
            </CommandItem>

            <CommandItem
              onSelect={() => go(ROUTES.accountBilling)}
              className="flex items-center gap-2 px-2 py-2 rounded-md"
            >
              <CreditCard className="size-4 text-muted-foreground" />
              <span>{t("groups.settings.billing")}</span>
              <ArrowRight className="ms-auto size-3 opacity-40 rtl:rotate-180" />
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  )
}
