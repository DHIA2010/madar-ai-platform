"use client"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export function SocialButtonsCard() {
  return (
    <Card>
       <CardHeader className="border-b py-4">
                <CardTitle className="text-xl">Social Buttons</CardTitle>
            </CardHeader>

      <CardContent className="space-y-6 p-6">

        {/* ================= FULL COLOR BUTTONS ================= */}
        <div className="flex flex-wrap gap-3">

          <Button className="gap-2 bg-[#1877F2] text-white hover:opacity-90 shadow-md hover:bg-[#1877F2]">
            <i className="bi bi-facebook text-lg"></i>
            Facebook
          </Button>

          <Button className="gap-2 bg-black text-white hover:opacity-90 shadow-md hover:bg-black">
            <i className="bi bi-twitter-x text-lg"></i>
            Twitter
          </Button>

          <Button className="gap-2 bg-[#FF0000] text-white hover:opacity-90 shadow-md hover:bg-[#FF0000]">
            <i className="bi bi-youtube text-lg"></i>
            YouTube
          </Button>

          <Button className="gap-2 bg-gradient-to-r from-pink-500 via-red-500 to-yellow-500 text-white hover:opacity-90 shadow-md">
            <i className="bi bi-instagram text-lg"></i>
            Instagram
          </Button>

          <Button className="gap-2 bg-[#0A66C2] text-white hover:opacity-90 shadow-md hover:bg-[#0A66C2]">
            <i className="bi bi-linkedin text-lg"></i>
            LinkedIn
          </Button>

          <Button className="gap-2 bg-black text-white hover:opacity-90 shadow-md hover:bg-black">
            <i className="bi bi-apple text-lg"></i>
            Apple
          </Button>

          <Button className="gap-2 bg-[#E60023] text-white hover:opacity-90 shadow-md hover:bg-[#E60023]">
            <i className="bi bi-pinterest text-lg"></i>
            Pinterest
          </Button>

        </div>

        {/* ================= ICON SQUARE ================= */}
        <div className="flex flex-wrap gap-3">

          <Button size="icon" className="bg-[#1877F2] text-white shadow-md hover:scale-105 transition hover:bg-[#1877F2]">
            <i className="bi bi-facebook text-lg"></i>
          </Button>

          <Button size="icon" className="bg-[#0A66C2] text-white shadow-md hover:scale-105 transition hover:bg-[#0A66C2]">
            <i className="bi bi-linkedin text-lg"></i>
          </Button>

          <Button size="icon" className="bg-[#FF0000] text-white shadow-md hover:scale-105 transition hover:bg-[#FF0000]">
            <i className="bi bi-youtube text-lg"></i>
          </Button>

          <Button size="icon" className="bg-black text-white shadow-md hover:scale-105 transition hover:bg-black">
            <i className="bi bi-twitter-x text-lg"></i>
          </Button>

        </div>

        {/* ================= ICON ROUNDED ================= */}
        <div className="flex flex-wrap gap-3">

          <Button size="icon" className="rounded-full bg-[#1877F2] text-white shadow-md hover:scale-110 transition hover:bg-[#1877F2]">
            <i className="bi bi-facebook text-lg"></i>
          </Button>

          <Button size="icon" className="rounded-full bg-[#0A66C2] text-white shadow-md hover:scale-110 transition hover:bg-[#0A66C2]">
            <i className="bi bi-linkedin text-lg"></i>
          </Button>

          <Button size="icon" className="rounded-full bg-gradient-to-r from-pink-500 via-red-500 to-yellow-500 text-white shadow-md hover:scale-110 transition">
            <i className="bi bi-instagram text-lg"></i>
          </Button>

          <Button size="icon" className="rounded-full bg-[#FF0000] text-white shadow-md hover:scale-110 transition hover:bg-[#FF0000]">
            <i className="bi bi-youtube text-lg"></i>
          </Button>

        </div>

        {/* ================= LIGHT VERSION ================= */}
        <div className="flex flex-wrap gap-3">

          <Button className="gap-2 bg-[#1877F2]/10 text-[#1877F2] hover:bg-[#1877F2]/20 dark:bg-[#1877F2]/20 dark:hover:bg-[#1877F2]/30">
            <i className="bi bi-facebook text-lg"></i>
            Facebook
          </Button>

          <Button className="gap-2 bg-[#0A66C2]/10 text-[#0A66C2] hover:bg-[#0A66C2]/20 dark:bg-[#0A66C2]/20 dark:hover:bg-[#0A66C2]/30">
            <i className="bi bi-linkedin text-lg"></i>
            LinkedIn
          </Button>

          <Button className="gap-2 bg-[#FF0000]/10 text-[#FF0000] hover:bg-[#FF0000]/20 dark:bg-[#FF0000]/20 dark:hover:bg-[#FF0000]/30">
            <i className="bi bi-youtube text-lg"></i>
            YouTube
          </Button>

        </div>

      </CardContent>
    </Card>
  )
}
