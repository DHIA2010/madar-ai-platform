import { AppsSection } from "./components/apps-section"
import { ContactSection } from "./components/contact-section"
import { FaqSection } from "./components/faq-section"
import { HeroSection } from "./components/hero-section"
import { HowItWorksSection } from "./components/how-it-works-section"
import { IntegrationsSection } from "./components/integrations-section"
import { MarketingFooter } from "./components/marketing-footer"
import { MarketingHeader } from "./components/marketing-header"
import { PricingSection } from "./components/pricing-section"
import { ShowcaseSection } from "./components/showcase-section"
import { WhyMadarSection } from "./components/why-madar-section"
import { loadPublicPricing } from "./pricing-data"

export async function MarketingHomePage() {
  const pricing = await loadPublicPricing()
  return (
    <div lang="ar" dir="rtl" className="min-h-screen bg-white text-[#0b1738] antialiased">
      <MarketingHeader />
      <main>
        <HeroSection />
        <AppsSection />
        <ShowcaseSection />
        <IntegrationsSection />
        <HowItWorksSection />
        <WhyMadarSection />
        <PricingSection pricing={pricing} />
        <FaqSection />
        <ContactSection />
      </main>
      <MarketingFooter />
    </div>
  )
}
