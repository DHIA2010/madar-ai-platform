"use client"

import { motion } from "framer-motion"
import  Link from "next/link"
import { Button } from "@/components/ui/button"
import { useTheme } from "next-themes"
import { Sun, Moon } from "lucide-react"

export default function Error500() {
    const { theme, setTheme } = useTheme()
  return (
    <div className="relative min-h-screen flex items-center justify-center px-6 overflow-hidden bg-gradient-to-br from-indigo-500/20 via-purple-500/10 to-blue-500/20">
      
       {/* Theme Toggle */}
      <div className="absolute top-6 right-6">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="bg-background/60 border-border supports-[backdrop-filter]:backdrop-blur-md"
        >
          {theme === "dark" ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
        </Button>
      </div>
      
      {/* Background Glow Blobs */}
      <div className="absolute top-0 left-0 w-96 h-96 bg-purple-500/30 blur-3xl rounded-full -z-10"></div>
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-indigo-500/30 blur-3xl rounded-full -z-10"></div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center"
      >
        {/* Glass Panel */}
        <div
          className="
             relative
            rounded-3xl
            p-12
            bg-background/60
            dark:bg-background/40
            border border-border/60
            shadow-[0_10px_40px_rgba(0,0,0,0.06)]
            dark:shadow-[0_10px_40px_rgba(0,0,0,0.5)]
            supports-[backdrop-filter]:backdrop-blur-xl
            transition-all duration-300
          "
        >
          <h1 className="text-[110px] md:text-[160px] font-semibold tracking-tight text-foreground">
            500
          </h1>
        </div>

        {/* Title */}
        <h2 className="mt-10 text-2xl font-semibold text-foreground">
          Internal server error
        </h2>

        {/* Description */}
        <p className="mt-3 text-muted-foreground max-w-sm mx-auto text-sm leading-relaxed">
          Something went wrong on our end. Please try again later or return to the homepage.
        </p>

        {/* Action Buttons */}
        <div className="mt-8 flex items-center justify-center gap-4">
          <Button
            variant="outline"
            size="lg"
            onClick={() => window.location.reload()}
            className="
              backdrop-blur-md
              bg-white/50
              border-border
              hover:bg-white/70
              transition
              rounded-xl
              px-8
            "
          >
            Retry
          </Button>

          <Link href="/">
            <Button
              size="lg"
              className="rounded-xl px-8"
            >
              Back to home
            </Button>
          </Link>
        </div>
      </motion.div>
    </div>
  )
}
