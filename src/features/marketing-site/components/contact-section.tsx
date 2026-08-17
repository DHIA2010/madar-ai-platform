import { Mail } from "lucide-react"

import { AppButton } from "@/components/app"

import { MADAR_CONTACT_EMAIL } from "../marketing-constants"

export function ContactSection() {
  return (
    <section id="contact" className="bg-white py-20 sm:py-28">
      <div className="mx-auto w-full max-w-3xl px-4 text-center sm:px-6 lg:px-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">Contact</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
          Let&rsquo;s talk.
        </h2>
        <p className="mt-6 text-lg leading-8 text-slate-600">
          Have questions about MADAR or want to learn more about the platform? Get in touch with our
          team.
        </p>

        <div className="mt-8 inline-flex flex-col items-center gap-4 sm:flex-row">
          <AppButton size="lg" asChild className="px-8">
            <a href={`mailto:${MADAR_CONTACT_EMAIL}`}>
              <Mail className="size-4" />
              {MADAR_CONTACT_EMAIL}
            </a>
          </AppButton>
        </div>
      </div>
    </section>
  )
}
