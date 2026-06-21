"use client"

import { DEFAULT_THEME, THEME_KEYS } from "@/constants/theme"
import { useUIThemeStore } from "@/store/ui-theme.store"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Settings } from "lucide-react"

export default function ThemeCustomizer() {
  const { theme, setTheme } = useTheme()
  const { isCustomizerOpen, setCustomizerOpen, previewTheme, setPreviewTheme } = useUIThemeStore()
  const activeTheme = theme ?? DEFAULT_THEME

  const themes = [
    {
      id: THEME_KEYS.darkBlue,
      label: "Dark Blue",
      preview: "dark-blue-preview",
    },
    {
      id: THEME_KEYS.gaussianBlack,
      label: "Gaussian Black",
      preview: "gaussian-black-preview",
    },
    {
      id: THEME_KEYS.semiDark,
      label: "Semi Dark",
      preview: "bg-gradient-to-r from-gray-300 to-gray-900",
    },
  ]

  return (
    <Sheet open={isCustomizerOpen} onOpenChange={setCustomizerOpen}>
      {/* Trigger */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <SheetTrigger asChild>
              <Button
                size="icon"
                className="
                  rounded-full h-10 w-10 fixed bottom-4 right-4 z-50 
                  shadow-lg cursor-pointer 
                  hover:bg-primary/90 transition
                "
              >
                <Settings className="size-5 animate-spin" />
              </Button>
            </SheetTrigger>
          </TooltipTrigger>

          <TooltipContent side="left">Theme Customizer</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Panel */}
      <SheetContent side="right" className="w-80">
        <SheetHeader>
          <SheetTitle>Theme Customizer</SheetTitle>
        </SheetHeader>

        <div className="mt-6 grid grid-cols-3 gap-3">
          {themes.map((t) => (
            <div
              key={t.id}
              onClick={() => {
                setTheme(t.id)
                setPreviewTheme(null)
              }}
              onMouseEnter={() => setPreviewTheme(t.id)}
              onMouseLeave={() => setPreviewTheme(null)}
              className={`relative h-16 rounded-lg cursor-pointer transition hover:scale-105 overflow-hidden
                  ${activeTheme === t.id || previewTheme === t.id ? "ring-2 ring-blue-500 scale-105" : ""}
                  ${t.preview}
                `}
            >
              {/* Overlay */}
              <div className="absolute inset-0 bg-black/20" />

              {/* Theme Name */}
              <span className="absolute bottom-1 left-2 text-[11px] font-medium text-white bg-black/40 px-2 py-0.5 rounded">
                {t.label}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-6">
          <button
            onClick={() => {
              setTheme(DEFAULT_THEME)
              setPreviewTheme(null)
            }}
            className="w-full py-2 rounded-md bg-gray-800 text-white hover:bg-gray-700 transition"
          >
            Reset Theme
          </button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
