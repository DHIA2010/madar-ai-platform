import { Link2, ShieldCheck, Sparkles } from "lucide-react"

import { AuthShowcasePanel, SignupForm } from "@/features/authentication/components"

const features = [
  {
    icon: Link2,
    title: "اربط جميع القنوات",
    description: "Google و Meta و Snapchat و TikTok وغيرها بسهولة في مكان واحد.",
  },
  {
    icon: Sparkles,
    title: "توصيات ذكية",
    description: "احصل على توصيات مبنية على الذكاء الاصطناعي لتحسين أداء حملاتك وزيادة العائد.",
  },
  {
    icon: ShieldCheck,
    title: "آمن وموثوق",
    description: "نحمي بياناتك بأعلى معايير الأمان والخصوصية.",
  },
]

export default function BasicRegisterPage() {
  return (
    <div className="grid min-h-svh w-full lg:grid-cols-2" dir="rtl">
      <div className="flex items-center justify-center p-6 md:p-10">
        <SignupForm />
      </div>

      <AuthShowcasePanel
        eyebrow="كل أدوات التحليل"
        heading="في مكان واحد"
        description="اربط قنواتك الإعلانية، حلل البيانات، واحصل على توصيات ذكية تساعدك على النمو."
        features={features}
        footer={
          <>
            <span className="font-medium text-slate-900">تحتاج مساعدة؟</span> فريق الدعم جاهز
            لمساعدتك في أي وقت.
          </>
        }
      />
    </div>
  )
}
