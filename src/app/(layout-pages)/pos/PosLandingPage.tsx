"use client"

import Link from "next/link"
import {
  ArrowLeft,
  Boxes,
  ChevronLeft,
  CreditCard,
  ExternalLink,
  KeyRound,
  Receipt,
  ScanBarcode,
  ShieldCheck,
  Sparkles,
  Store,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react"

import { ROUTES } from "@/constants/routes"
import { cn } from "@/lib/utils"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

const POS_PORTAL_URL = "https://pos.madar.my/pos/auth/login"

const heroPills = [
  { label: "فواتير فورية", icon: Receipt },
  { label: "مخزون موحّد", icon: Boxes },
  { label: "أدوار وصلاحيات", icon: ShieldCheck },
  { label: "تسجيل دخول مباشر", icon: KeyRound },
]

interface FeatureCardData {
  title: string
  description: string
  icon: LucideIcon
  tone: "blue" | "emerald" | "violet" | "amber"
}

const FEATURE_TONE_CLASSNAMES: Record<FeatureCardData["tone"], string> = {
  blue: "bg-blue-50 text-blue-600",
  emerald: "bg-emerald-50 text-emerald-600",
  violet: "bg-violet-50 text-violet-600",
  amber: "bg-amber-50 text-amber-600",
}

const features: FeatureCardData[] = [
  {
    title: "مخزون ومبيعات موحّدة",
    description:
      "تبقى مبيعات نقطة البيع ومخزونك متزامنَين تلقائيًا مع متجرك الإلكتروني، فلا ازدواج ولا جرد يدوي.",
    icon: Zap,
    tone: "blue",
  },
  {
    title: "تحكّم حسب الفرع",
    description: "حدّد الفروع المسموح بها لكل موظف، أو امنحه وصولًا لكل فروعك بضغطة واحدة.",
    icon: Store,
    tone: "emerald",
  },
  {
    title: "أدوار وصلاحيات دقيقة",
    description:
      "أنشئ أدوارًا مخصصة واختر ما يستطيع كل دور فعله بالضبط -- من عرض المنتجات إلى تعديل الأسعار.",
    icon: ShieldCheck,
    tone: "violet",
  },
  {
    title: "تسجيل دخول سريع وآمن",
    description:
      "كل موظف يدخل ببريده وكلمة مرور خاصة به على نفس الجهاز، فتعرف من أنجز كل عملية بيع دون حسابات مشتركة.",
    icon: KeyRound,
    tone: "amber",
  },
]

const SUMMARY_TONE_CLASSNAMES = {
  blue: "bg-sky-50 text-sky-600",
  teal: "border border-teal-200 bg-teal-50 text-teal-600",
} as const

function SummaryLinkCard({
  href,
  icon: Icon,
  title,
  countLabel,
  description,
  tone,
}: {
  href: string
  icon: LucideIcon
  title: string
  countLabel: string
  description: string
  tone: keyof typeof SUMMARY_TONE_CLASSNAMES
}) {
  return (
    <Link href={href}>
      <Card className="group h-full border-border/60 transition-colors hover:border-primary/40">
        <CardContent className="flex items-center gap-4 p-5">
          <div
            className={cn(
              "flex size-11 shrink-0 items-center justify-center rounded-xl",
              SUMMARY_TONE_CLASSNAMES[tone]
            )}
          >
            <Icon className="size-5" />
          </div>
          <div className="flex-1">
            <div className="mb-1 flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground">{title}</span>
              <Badge variant="secondary">{countLabel}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
          <ChevronLeft className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:-translate-x-1" />
        </CardContent>
      </Card>
    </Link>
  )
}

function FeatureCard({ feature }: { feature: FeatureCardData }) {
  const Icon = feature.icon

  return (
    <Card className="border-border/60">
      <CardContent className="p-5">
        <div
          className={cn(
            "mb-3 flex size-10 items-center justify-center rounded-xl",
            FEATURE_TONE_CLASSNAMES[feature.tone]
          )}
        >
          <Icon className="size-5" />
        </div>
        <p className="mb-1.5 font-semibold text-foreground">{feature.title}</p>
        <p className="text-sm leading-6 text-muted-foreground">{feature.description}</p>
      </CardContent>
    </Card>
  )
}

interface HowItWorksStep {
  number: number
  title: string
  description: string
}

const howItWorksSteps: HowItWorksStep[] = [
  {
    number: 1,
    title: "افتح نظام POS لأول مرة",
    description: "يجهّز النظام تلقائيًا أدوار متجرك وسجّل بيانات دخول المالك.",
  },
  {
    number: 2,
    title: "أنشئ الأدوار",
    description: "صمّم أدوارًا بصلاحيات مناسبة لكل وظيفة في محلّك.",
  },
  {
    number: 3,
    title: "أضف موظفيك",
    description: "أضف كل موظف، اختر دوره وفروعه، ويُنشأ له حساب دخول تلقائيًا.",
  },
  {
    number: 4,
    title: "ابدأ البيع",
    description: "يفتح الموظف تطبيق POS، يختار الفرع ويسجّل الدخول ليبدأ البيع فورًا.",
  },
]

function HowItWorksCard({ step }: { step: HowItWorksStep }) {
  return (
    <Card className="border-border/60">
      <CardContent className="p-5">
        <div className="mb-3 flex justify-start">
          <div className="flex size-9 items-center justify-center rounded-full bg-teal-600 text-sm font-semibold text-white">
            {step.number}
          </div>
        </div>
        <p className="mb-1.5 font-semibold text-foreground">{step.title}</p>
        <p className="text-sm leading-6 text-muted-foreground">{step.description}</p>
      </CardContent>
    </Card>
  )
}

export default function PosLandingPage() {
  return (
    <div dir="rtl" className="space-y-6">
      <div className="relative w-full overflow-hidden rounded-3xl border border-input bg-gradient-to-br from-teal-500/15 via-card to-teal-500/10 px-6 py-10 md:px-10 md:py-14">
        <div className="pointer-events-none absolute -top-20 end-[-60px] size-72 rounded-full bg-teal-500/20 blur-3xl" />
        <div className="pointer-events-none absolute bottom-[-80px] end-1/4 size-60 rounded-full bg-teal-500/15 blur-3xl" />
        <div className="pointer-events-none absolute inset-y-0 end-0 hidden w-1/2 items-center justify-end gap-8 pe-10 text-teal-600 opacity-[0.08] 2xl:flex">
          <ScanBarcode className="size-44 -rotate-12" />
          <CreditCard className="size-32 rotate-6" />
        </div>

        <div className="relative z-10 max-w-2xl space-y-5">
          <Badge className="gap-1.5 border-transparent bg-emerald-600 px-3.5 py-1.5 text-sm text-white hover:bg-emerald-600/80">
            <Sparkles className="size-4" />
            نظام نقاط البيع
          </Badge>

          <h1 className="text-3xl font-bold leading-tight text-foreground md:text-4xl">
            بيع داخل محلّك بنفس قوة متجرك الإلكتروني
          </h1>
          <p className="max-w-xl text-base leading-7 text-muted-foreground">
            أصدر الفاتورة من أي جهاز خلال ثوانٍ، وأدِر موظفيك وصلاحياتهم من مكان واحد، مع بقاء
            مخزونك ومبيعاتك موحّدًا ومحدّثًا تلقائيًا.
          </p>

          <div className="flex flex-wrap gap-2 pt-1">
            {heroPills.map((pill) => (
              <span
                key={pill.label}
                className="inline-flex items-center gap-1.5 rounded-full border border-input bg-background/60 px-3 py-1.5 text-xs font-medium text-foreground backdrop-blur"
              >
                <pill.icon className="size-3.5 text-teal-600" />
                {pill.label}
              </span>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button
              asChild
              className="h-11 gap-2 rounded-md bg-teal-600 px-8 text-white hover:bg-teal-600/90"
            >
              <a href={POS_PORTAL_URL} target="_blank" rel="noreferrer">
                افتح نظام POS
                <ExternalLink className="size-4" />
              </a>
            </Button>
            <Button
              asChild
              variant="outline"
              className="h-11 gap-2 rounded-md border-input bg-background/60 px-8 text-teal-600 backdrop-blur hover:bg-teal-50"
            >
              <Link href={ROUTES.posEmployees}>
                إدارة الموظفين
                <ArrowLeft className="size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <SummaryLinkCard
          href={ROUTES.posEmployees}
          icon={Users}
          title="الموظفون"
          countLabel="0 موظف"
          description="أضف الموظفين وأدر بيانات تسجيل الدخول الخاصة بهم وفروعهم."
          tone="blue"
        />
        <SummaryLinkCard
          href={ROUTES.posRoles}
          icon={ShieldCheck}
          title="الأدوار والصلاحيات"
          countLabel="0 دور"
          description="حدّد ما يستطيع كل دور فعله داخل نقطة البيع."
          tone="teal"
        />
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-foreground">لماذا نقطة بيع مدار؟</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature) => (
            <FeatureCard key={feature.title} feature={feature} />
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-foreground">كيف يعمل؟</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {howItWorksSteps.map((step) => (
            <HowItWorksCard key={step.number} step={step} />
          ))}
        </div>
      </div>

      <Card className="border-dashed border-border/60 bg-muted/30">
        <CardContent className="flex items-center gap-3 p-5 text-sm text-muted-foreground">
          <CreditCard className="size-4 shrink-0" />
          قيد الإنشاء: صفحات الموظفين والأدوار حاليًا فارغة، وسيتم ربطها ببيانات حقيقية في المرحلة
          التالية.
        </CardContent>
      </Card>
    </div>
  )
}
