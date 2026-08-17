import { AboutSection } from "./components/about-section"
import { AiIntelligenceSection } from "./components/ai-intelligence-section"
import { AudienceSection } from "./components/audience-section"
import { CapabilitiesSection } from "./components/capabilities-section"
import { ContactSection } from "./components/contact-section"
import { HeroSection } from "./components/hero-section"
import { HowItWorksSection } from "./components/how-it-works-section"
import { IntegrationsSection } from "./components/integrations-section"
import { MarketingFooter } from "./components/marketing-footer"
import { MarketingHeader } from "./components/marketing-header"
import { ProductPreviewSection } from "./components/product-preview-section"
import { SecuritySection } from "./components/security-section"
import { WhatIsMadarSection } from "./components/what-is-madar-section"
import { WhyMadarSection } from "./components/why-madar-section"

export function MarketingHomePage() {
  return (
    <div lang="en" dir="ltr" className="min-h-screen bg-white text-slate-900 antialiased">
      <MarketingHeader />
      <main>
        <HeroSection />
        <WhatIsMadarSection />
        <HowItWorksSection />
        <IntegrationsSection />
        <CapabilitiesSection />
        <AudienceSection />
        <WhyMadarSection />
        <ProductPreviewSection />
        <AiIntelligenceSection />
        <SecuritySection />
        <AboutSection />
        <ContactSection />
      </main>
      <MarketingFooter />
    </div>
  )
}
