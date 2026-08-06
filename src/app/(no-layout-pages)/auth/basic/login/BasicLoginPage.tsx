import { Link2, LineChart, Sparkles } from "lucide-react"

import { AuthShowcasePanel, AuthTrustBadge, LoginForm } from "@/features/authentication/components"

const features = [
  {
    icon: Link2,
    title: "اربط جميع قنواتك الإعلانية",
    description: "Google و Meta و Snapchat و TikTok وغيرها بسهولة في مكان واحد.",
  },
  {
    icon: LineChart,
    title: "تقارير وتحليلات ذكية",
    description: "لوحات تحكم مصممة خصيصاً لتمنحك رؤى واضحة عن أداء حملاتك.",
  },
  {
    icon: Sparkles,
    title: "توصيات ذكية لتحسين الأداء",
    description: "احصل على توصيات مدعومة بالذكاء الاصطناعي لتحسين نتائج حملاتك وزيادة العائد.",
  },
]

export default function BasicLoginPage() {
  return (
    <div className="grid min-h-svh w-full lg:grid-cols-2" dir="rtl">
      <div className="flex items-center justify-center p-6 md:p-10">
        <LoginForm />
      </div>

      <AuthShowcasePanel
        eyebrow="منصة تحليلات تسويقية متكاملة"
        heading="اجمع بيانات حملاتك الإعلانية في مكان واحد."
        description="حلّل الأداء، واتخذ قرارات ذكية لتحقيق أفضل النتائج."
        features={features}
        footer={<AuthTrustBadge />}
      />
    </div>
  )
}
