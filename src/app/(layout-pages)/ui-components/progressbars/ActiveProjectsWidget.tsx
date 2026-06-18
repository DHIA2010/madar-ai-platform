"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import {
  MoreVertical,
  Box,
  Figma,
  Atom,
  Layers,
  Palette,
} from "lucide-react"

const projects = [
  {
    name: "Laravel",
    subtitle: "eCommerce",
    progress: 65,
    color: "bg-red-500",
    icon: Box,
    iconBg: "bg-red-100",
    iconColor: "text-red-500",
  },
  {
    name: "Figma",
    subtitle: "App UI Kit",
    progress: 86,
    color: "bg-blue-500",
    icon: Figma,
    iconBg: "bg-blue-100",
    iconColor: "text-blue-500",
  },
  {
    name: "VueJs",
    subtitle: "Calendar App",
    progress: 90,
    color: "bg-emerald-500",
    icon: Layers,
    iconBg: "bg-emerald-100",
    iconColor: "text-emerald-500",
  },
  {
    name: "React",
    subtitle: "Dashboard",
    progress: 37,
    color: "bg-cyan-500",
    icon: Atom,
    iconBg: "bg-cyan-100",
    iconColor: "text-cyan-500",
  },
  {
    name: "Bootstrap",
    subtitle: "Website",
    progress: 22,
    color: "bg-indigo-500",
    icon: Box,
    iconBg: "bg-indigo-100",
    iconColor: "text-indigo-500",
  },
  {
    name: "Sketch",
    subtitle: "Website Design",
    progress: 29,
    color: "bg-orange-500",
    icon: Palette,
    iconBg: "bg-orange-100",
    iconColor: "text-orange-500",
  },
]

export function ActiveProjectsWidget() {
  return (
    <Card>
      <CardContent className="p-6">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold">Active Project</h3>
            <p className="text-sm text-muted-foreground">
              Average 72% Completed
            </p>
          </div>

          <MoreVertical className="h-5 w-5 text-muted-foreground cursor-pointer" />
        </div>

        {/* Projects List */}
        <div className="mt-6 space-y-6">
          {projects.map((project, index) => {
            const Icon = project.icon

            return (
              <div key={index} className="space-y-2">

                {/* Top Row */}
                <div className="flex items-center justify-between">

                  <div className="flex items-center gap-3">
                    {/* Mini Logo */}
                    <div
                      className={`h-10 w-10 rounded-lg flex items-center justify-center ${project.iconBg}`}
                    >
                      <Icon className={`h-5 w-5 ${project.iconColor}`} />
                    </div>

                    {/* Name + Subtitle */}
                    <div>
                      <p className="font-medium">{project.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {project.subtitle}
                      </p>
                    </div>
                  </div>

                  {/* Percentage */}
                  <span className="text-sm font-medium text-muted-foreground">
                    {project.progress}%
                  </span>
                </div>

                {/* Progress */}
                <Progress
                  value={project.progress}
                  className={`h-2 bg-muted [&>div]:${project.color}`}
                />
              </div>
            )
          })}
        </div>

      </CardContent>
    </Card>
  )
}
