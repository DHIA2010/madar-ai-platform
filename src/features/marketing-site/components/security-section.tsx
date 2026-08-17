import Link from "next/link"
import { KeyRound, Lock, ShieldCheck } from "lucide-react"

import { ROUTES } from "@/constants/routes"

const SECURITY_POINTS = [
  {
    icon: KeyRound,
    title: "Explicit authorization",
    description:
      "MADAR only accesses data that users explicitly authorize through supported integrations, using each platform's official OAuth flow.",
  },
  {
    icon: Lock,
    title: "Purposeful data use",
    description:
      "Connected data is used to provide the analytics and reporting functionality of the MADAR platform, and nothing beyond that scope.",
  },
  {
    icon: ShieldCheck,
    title: "Responsible handling",
    description:
      "MADAR is designed with security and responsible data handling in mind, including encrypted storage of connection credentials.",
  },
]

export function SecuritySection() {
  return (
    <section className="bg-white py-20 sm:py-28">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">
            Security &amp; data
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Your data, handled responsibly.
          </h2>
        </div>

        <div className="mt-14 grid gap-6 sm:grid-cols-3">
          {SECURITY_POINTS.map((point) => (
            <div
              key={point.title}
              className="rounded-2xl border border-slate-200 bg-slate-50/60 p-6"
            >
              <point.icon className="size-6 text-blue-600" aria-hidden="true" />
              <h3 className="mt-4 text-base font-semibold text-slate-900">{point.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{point.description}</p>
            </div>
          ))}
        </div>

        <p className="mx-auto mt-10 max-w-3xl text-center text-sm leading-7 text-slate-500">
          For full detail on what MADAR collects, how it is used, and how it is protected, see our{" "}
          <Link
            href={ROUTES.privacy}
            className="font-medium text-blue-600 underline underline-offset-2"
          >
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </section>
  )
}
