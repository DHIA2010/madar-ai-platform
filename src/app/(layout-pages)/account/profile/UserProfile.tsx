"use client"

import { useTranslations } from "next-intl"

import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import {
  Phone,
  MessageCircle,
  User,
  HelpCircle,
  Code2,
  Flag,
  Clock,
  FileText,
  Users,
  Rocket,
  ShieldCheck,
  AlertTriangle,
  Send,
  Home,
  CheckCircle2,
  Briefcase,
  BarChart3,
  Facebook,
  Twitter,
  Instagram,
  Linkedin,
  Youtube,
  Music,
  Pin,
  PenTool,
  Cloud,
  Shield,
} from "lucide-react"

export default function UserProfile() {
  const t = useTranslations("account.profile")

  return (
    <div className="user-profile-page">
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 xl:col-span-12">
          <Card className="overflow-hidden">
            {/* Gradient Cover */}
            <div className="h-[150px] bg-gradient-to-r from-purple-700 to-blue-500" />

            <CardContent className="flex flex-col sm:flex-row sm:items-center gap-6 p-6">
              {/* Profile Image */}
              <div className="relative -mt-16 flex flex-shrink-0 mt-0">
                <img
                  src="https://randomuser.me/api/portraits/men/34.jpg"
                  alt="John Doe"
                  className="w-28 h-28 rounded-full border-4 border-background shadow-lg"
                />
              </div>

              {/* Profile Info */}
              <div>
                <h4 className="text-xl font-semibold">John Doe</h4>
                <p className="text-muted-foreground text-sm font-medium">
                  UX Designer • Vatican City • Joined April 2021
                </p>

                <div className="flex flex-wrap gap-2 mt-3">
                  <Badge className="bg-primary text-primary-foreground">
                    {t("header.tasksBadge")}
                  </Badge>
                  <Badge variant="secondary">{t("header.projectsBadge")}</Badge>
                  <Badge className="bg-green-600 hover:bg-green-700 text-white">
                    {t("header.connectionsBadge")}
                  </Badge>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="sm:ml-auto flex gap-3">
                <Button>
                  <Phone className="w-4 h-4 mr-2" />
                  {t("header.getInTouch")}
                </Button>
                <Button variant="outline">
                  <MessageCircle className="w-4 h-4 mr-2" />
                  {t("header.message")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="col-span-12 xl:col-span-4 space-y-6">
          <Card>
            <CardContent className="p-6">
              <h5 className="mb-4 text-lg font-semibold">{t("about.title")}</h5>

              <div className="space-y-4 text-sm">
                <div className="flex items-center gap-3">
                  <User className="w-4 h-4 text-muted-foreground" />
                  <span>
                    <span className="font-medium">{t("about.fullNameLabel")}</span> Emily Carter
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <HelpCircle className="w-4 h-4 text-muted-foreground" />
                  <span>
                    <span className="font-medium">{t("about.statusLabel")}</span>{" "}
                    {t("about.statusValue")}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <Code2 className="w-4 h-4 text-muted-foreground" />
                  <span>
                    <span className="font-medium">{t("about.roleLabel")}</span>{" "}
                    {t("about.roleValue")}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <Flag className="w-4 h-4 text-muted-foreground" />
                  <span>
                    <span className="font-medium">{t("about.locationLabel")}</span> Austin, Texas
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <MessageCircle className="w-4 h-4 text-muted-foreground" />
                  <span>
                    <span className="font-medium">{t("about.languagesLabel")}</span>{" "}
                    {t("about.languagesValue")}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <h5 className="mb-4 text-lg font-semibold">{t("contacts.title")}</h5>

              <div className="space-y-4 text-sm">
                <div className="flex items-center gap-3">
                  <Phone className="w-4 h-4 text-muted-foreground" />
                  <span>
                    <span className="font-medium">{t("contacts.phoneLabel")}</span> (415) 987-6543
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <span>
                    <span className="font-medium">{t("contacts.skypeLabel")}</span> emily.carter
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <Send className="w-4 h-4 text-muted-foreground" />
                  <span>
                    <span className="font-medium">{t("contacts.emailLabel")}</span>{" "}
                    emily.carter@techhub.com
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <h5 className="mb-4 text-lg font-semibold">{t("teams.title")}</h5>

              <div className="space-y-5 text-sm">
                {/* Backend Team */}
                <div className="flex items-center gap-4">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-full
                                      bg-red-100 text-red-500 dark:bg-red-500/20 dark:text-red-400"
                  >
                    <Code2 className="w-5 h-5" />
                  </div>

                  <div className="flex flex-col">
                    <span className="font-medium">{t("teams.backendDevelopers")}</span>
                    <span className="text-muted-foreground text-xs">
                      {t("teams.membersCount", { count: 126 })}
                    </span>
                  </div>

                  <Badge
                    variant="secondary"
                    className="ml-auto rounded-full bg-red-100 text-red-500 dark:bg-red-500/20 dark:text-red-400"
                  >
                    {t("teams.backendBadge")}
                  </Badge>
                </div>

                {/* React Team */}
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-500 dark:bg-blue-500/20 dark:text-blue-400">
                    <Home className="w-5 h-5" />
                  </div>

                  <div className="flex flex-col">
                    <span className="font-medium">{t("teams.reactDevelopers")}</span>
                    <span className="text-muted-foreground text-xs">
                      {t("teams.membersCount", { count: 98 })}
                    </span>
                  </div>

                  <Badge className="ml-auto rounded-full bg-blue-100 text-blue-500 dark:bg-blue-500/20 dark:text-blue-400">
                    {t("teams.frontendBadge")}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <h5 className="mb-4 text-lg font-semibold">{t("overview.title")}</h5>

              <div className="space-y-4 text-sm">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    <span className="font-medium">{t("overview.tasksCompletedLabel")}</span> 18,240
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <Briefcase className="w-4 h-4" />
                  <span>
                    <span className="font-medium">{t("overview.activeProjectsLabel")}</span> 12
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <BarChart3 className="w-4 h-4" />
                  <span>
                    <span className="font-medium">{t("overview.performanceScoreLabel")}</span> 92%
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <h5 className="mb-4 text-lg font-semibold">{t("skills.title")}</h5>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary" className="px-3 py-1.5 rounded-full">
                  JavaScript
                </Badge>
                <Badge variant="secondary" className="px-3 py-1.5 rounded-full">
                  React
                </Badge>
                <Badge variant="secondary" className="px-3 py-1.5 rounded-full">
                  Node.js
                </Badge>
                <Badge variant="secondary" className="px-3 py-1.5 rounded-full">
                  CSS
                </Badge>
                <Badge variant="secondary" className="px-3 py-1.5 rounded-full">
                  UI/UX Design
                </Badge>
                <Badge variant="secondary" className="px-3 py-1.5 rounded-full">
                  Project Management
                </Badge>
                <Badge variant="secondary" className="px-3 py-1.5 rounded-full">
                  Agile Methodologies
                </Badge>
                <Badge variant="secondary" className="px-3 py-1.5 rounded-full">
                  Git
                </Badge>
                <Badge variant="secondary" className="px-3 py-1.5 rounded-full">
                  Docker
                </Badge>
                <Badge variant="secondary" className="px-3 py-1.5 rounded-full">
                  Kubernetes
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="col-span-12 xl:col-span-8 space-y-6">
          <Card>
            <CardContent className="p-6">
              <h5 className="mb-6 text-lg font-semibold">{t("activityTimeline.title")}</h5>

              <div className="relative space-y-8 pl-10">
                {/* Monthly Report */}
                <div className="relative">
                  <span className="absolute -left-[40px] flex h-8 w-8 items-center justify-center rounded-full bg-primary text-white">
                    <FileText className="w-4 h-4" />
                  </span>
                  <h6 className="font-semibold">{t("activityTimeline.monthlyReport.title")}</h6>
                  <p className="text-sm text-muted-foreground">
                    {t("activityTimeline.monthlyReport.description")}
                  </p>
                  <Badge variant="secondary" className="mt-2 rounded-md">
                    report-sept.pdf
                  </Badge>
                  <p className="text-xs text-muted-foreground mt-2">
                    {t("activityTimeline.monthlyReport.time")}
                  </p>
                </div>

                {/* Standup */}
                <div className="relative">
                  <span className="absolute -left-[40px] flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 text-white shadow-md">
                    <Users className="w-4 h-4" />
                  </span>
                  <h6 className="font-semibold">{t("activityTimeline.standup.title")}</h6>
                  <p className="text-sm text-muted-foreground">
                    {t("activityTimeline.standup.description")}
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    {t("activityTimeline.standup.time")}
                  </p>
                </div>

                {/* Feature Deploy */}
                <div className="relative">
                  <span className="absolute -left-[40px] flex h-8 w-8 items-center justify-center rounded-full bg-sky-500 text-white shadow-md">
                    <Rocket className="w-4 h-4" />
                  </span>
                  <h6 className="font-semibold">{t("activityTimeline.featureDeploy.title")}</h6>
                  <p className="text-sm text-muted-foreground">
                    {t("activityTimeline.featureDeploy.description")}
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    {t("activityTimeline.featureDeploy.time")}
                  </p>
                </div>

                {/* Security Patch */}
                <div className="relative">
                  <span className="absolute -left-[40px] flex h-8 w-8 items-center justify-center rounded-full bg-amber-500 text-white shadow-md">
                    <ShieldCheck className="w-4 h-4" />
                  </span>
                  <h6 className="font-semibold">{t("activityTimeline.securityPatch.title")}</h6>
                  <p className="text-sm text-muted-foreground">
                    {t("activityTimeline.securityPatch.description")}
                  </p>
                  <Badge variant="secondary" className="mt-2 rounded-md">
                    auth-patch.log
                  </Badge>
                  <p className="text-xs text-muted-foreground mt-2">
                    {t("activityTimeline.securityPatch.time")}
                  </p>
                </div>

                {/* Suspensions */}
                <div className="relative">
                  <span className="absolute -left-[40px] flex h-8 w-8 items-center justify-center rounded-full bg-red-500 text-white shadow-md">
                    <AlertTriangle className="w-4 h-4" />
                  </span>
                  <h6 className="font-semibold">{t("activityTimeline.suspensions.title")}</h6>
                  <p className="text-sm text-muted-foreground">
                    {t("activityTimeline.suspensions.description")}
                  </p>
                  <Badge variant="secondary" className="mt-2 rounded-md">
                    suspensions.csv
                  </Badge>
                  <p className="text-xs text-muted-foreground mt-2">
                    {t("activityTimeline.suspensions.time")}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-12 gap-6">
            <div className="col-span-12 xl:col-span-6">
              <Card>
                <CardContent className="p-6">
                  <h5 className="mb-6 text-lg font-semibold">{t("connections.title")}</h5>

                  <div className="space-y-5">
                    {/* Facebook */}
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600/10 text-blue-600">
                        <Facebook className="w-5 h-5" />
                      </div>
                      <span className="font-medium">Facebook</span>
                      <Switch className="ml-auto" />
                    </div>

                    {/* Twitter */}
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 text-black dark:text-white">
                        <Twitter className="w-5 h-5" />
                      </div>
                      <span className="font-medium">Twitter</span>
                      <Switch className="ml-auto" />
                    </div>

                    {/* Instagram */}
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-pink-600/10 text-pink-600">
                        <Instagram className="w-5 h-5" />
                      </div>
                      <span className="font-medium">Instagram</span>
                      <Switch className="ml-auto" />
                    </div>

                    {/* LinkedIn */}
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-700/10 text-blue-700">
                        <Linkedin className="w-5 h-5" />
                      </div>
                      <span className="font-medium">LinkedIn</span>
                      <Switch className="ml-auto" />
                    </div>

                    {/* YouTube */}
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-600/10 text-red-600">
                        <Youtube className="w-5 h-5" />
                      </div>
                      <span className="font-medium">YouTube</span>
                      <Switch className="ml-auto" />
                    </div>

                    {/* TikTok */}
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 text-black dark:text-white">
                        <Music className="w-5 h-5" />
                      </div>
                      <span className="font-medium">TikTok</span>
                      <Switch className="ml-auto" />
                    </div>

                    {/* Pinterest */}
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/10 text-red-500">
                        <Pin className="w-5 h-5" />
                      </div>
                      <span className="font-medium">Pinterest</span>
                      <Switch className="ml-auto" />
                    </div>
                  </div>

                  <Button variant="link" className="mt-6 px-0">
                    {t("connections.viewAll")}
                  </Button>
                </CardContent>
              </Card>
            </div>

            <div className="col-span-12 xl:col-span-6">
              <Card>
                <CardContent className="p-6">
                  <h5 className="mb-6 text-lg font-semibold">{t("support.title")}</h5>

                  <div className="space-y-5">
                    {/* Data Analysts */}
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/10 text-amber-500">
                        <BarChart3 className="w-5 h-5" />
                      </div>

                      <div className="flex flex-col">
                        <span className="font-semibold">{t("support.dataAnalysts")}</span>
                        <span className="text-xs text-muted-foreground">
                          {t("teams.membersCount", { count: 54 })}
                        </span>
                      </div>

                      <Badge className="ml-auto rounded-full bg-amber-500/10 text-amber-500 hover:bg-amber-500/20">
                        {t("support.analyticsBadge")}
                      </Badge>
                    </div>

                    {/* Cybersecurity */}
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/10 text-red-500">
                        <Shield className="w-5 h-5" />
                      </div>

                      <div className="flex flex-col">
                        <span className="font-semibold">{t("support.cybersecurityTeam")}</span>
                        <span className="text-xs text-muted-foreground">
                          {t("teams.membersCount", { count: 31 })}
                        </span>
                      </div>

                      <Badge
                        variant="secondary"
                        className="ml-auto rounded-full bg-red-500/10 text-red-500 hover:bg-red-500/20"
                      >
                        {t("support.securityBadge")}
                      </Badge>
                    </div>

                    {/* DevOps */}
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-500/10 text-sky-500">
                        <Cloud className="w-5 h-5" />
                      </div>

                      <div className="flex flex-col">
                        <span className="font-semibold">{t("support.devopsEngineers")}</span>
                        <span className="text-xs text-muted-foreground">
                          {t("teams.membersCount", { count: 42 })}
                        </span>
                      </div>

                      <Badge className="ml-auto rounded-full bg-sky-500/10 text-sky-500 hover:bg-sky-500/20">
                        {t("support.infrastructureBadge")}
                      </Badge>
                    </div>

                    {/* Content Writers */}
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
                        <PenTool className="w-5 h-5" />
                      </div>

                      <div className="flex flex-col">
                        <span className="font-semibold">{t("support.contentWriters")}</span>
                        <span className="text-xs text-muted-foreground">
                          {t("teams.membersCount", { count: 25 })}
                        </span>
                      </div>

                      <Badge className="ml-auto rounded-full bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20">
                        {t("support.contentBadge")}
                      </Badge>
                    </div>

                    {/* Product Managers */}
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <Rocket className="w-5 h-5" />
                      </div>

                      <div className="flex flex-col">
                        <span className="font-semibold">{t("support.productManagers")}</span>
                        <span className="text-xs text-muted-foreground">
                          {t("teams.membersCount", { count: 17 })}
                        </span>
                      </div>

                      <Badge className="ml-auto rounded-full bg-primary/10 text-primary hover:bg-primary/20">
                        {t("support.strategyBadge")}
                      </Badge>
                    </div>
                  </div>

                  <Button variant="link" className="mt-6 px-0">
                    {t("support.viewAllTeams")}
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>{" "}
      {/* end grid */}
    </div>
  )
}
