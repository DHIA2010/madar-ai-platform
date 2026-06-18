"use client"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"

export default function FAQPage() {
  return (
    <div className="py-16 px-6">
      <div className="max-w-4xl mx-auto">

        {/* Header */}
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold mb-4">
            Frequently Asked Questions
          </h2>
          <p className="text-lg text-muted-foreground">
            Everything you need to know about purchasing, licensing, and support.
          </p>
        </div>

        {/* Accordion */}
        <Accordion type="single" collapsible className="space-y-4">

          {/* Purchasing Templates */}
          <AccordionItem value="item-1" className="border rounded-xl px-6">
            <AccordionTrigger className="text-lg font-semibold">
              Purchasing Templates
            </AccordionTrigger>
            <AccordionContent className="text-base text-muted-foreground space-y-4 pb-6">

              <div>
                <strong className="text-foreground">How do I purchase a template?</strong>
                <p>
                  Browse our collection, select your desired template, and click
                  “Buy Now.” You’ll be redirected to our secure checkout page to
                  complete the payment.
                </p>
              </div>

              <div>
                <strong className="text-foreground">What payment methods do you accept?</strong>
                <p>
                  We accept major credit/debit cards, PayPal, and other secure
                  online payment options depending on your region.
                </p>
              </div>

              <div>
                <strong className="text-foreground">Will I receive updates after purchase?</strong>
                <p>
                  Yes, once you purchase a template, you’ll receive free updates
                  whenever improvements or fixes are released.
                </p>
              </div>

            </AccordionContent>
          </AccordionItem>

          {/* Refund Policy */}
          <AccordionItem value="item-2" className="border rounded-xl px-6">
            <AccordionTrigger className="text-lg font-semibold">
              Refund Policy
            </AccordionTrigger>
            <AccordionContent className="text-base text-muted-foreground space-y-4 pb-6">

              <div>
                <strong className="text-foreground">Do you offer refunds?</strong>
                <p>
                  Yes. We provide a <b>7-day refund policy</b> if you face
                  technical issues that cannot be resolved by our support team.
                </p>
              </div>

              <div>
                <strong className="text-foreground">When am I not eligible?</strong>
                <p>
                  Refunds are not available for change of mind, third-party
                  incompatibility, or issues caused by user environment.
                </p>
              </div>

              <div>
                <strong className="text-foreground">How do I request one?</strong>
                <p>
                  Contact our support team with your order details. If the issue
                  cannot be fixed, we’ll process your refund.
                </p>
              </div>

            </AccordionContent>
          </AccordionItem>

          {/* Work Quality & Support */}
          <AccordionItem value="item-3" className="border rounded-xl px-6">
            <AccordionTrigger className="text-lg font-semibold">
              Work Quality & Support
            </AccordionTrigger>
            <AccordionContent className="text-base text-muted-foreground space-y-4 pb-6">

              <div>
                <strong className="text-foreground">Are templates tested?</strong>
                <p>
                  Yes, all templates are thoroughly tested for responsiveness,
                  cross-browser compatibility, and clean code standards.
                </p>
              </div>

              <div>
                <strong className="text-foreground">Do you provide support?</strong>
                <p>
                  Yes, we provide <b>6 months of free support</b> with every purchase.
                </p>
              </div>

              <div>
                <strong className="text-foreground">Can I customize them?</strong>
                <p>
                  Absolutely! Our templates are built with clean,
                  developer-friendly code and include documentation.
                </p>
              </div>

            </AccordionContent>
          </AccordionItem>

          {/* Licensing */}
          <AccordionItem value="item-4" className="border rounded-xl px-6">
            <AccordionTrigger className="text-lg font-semibold">
              Licensing & Usage
            </AccordionTrigger>
            <AccordionContent className="text-base text-muted-foreground space-y-4 pb-6">

              <div>
                <strong className="text-foreground">Can I use one template for multiple projects?</strong>
                <p>
                  Our standard license allows one template per project/client.
                  Additional projects require additional licenses.
                </p>
              </div>

              <div>
                <strong className="text-foreground">Do I need to give credit?</strong>
                <p>
                  No credit is required for premium templates.
                  Attribution is appreciated for free versions.
                </p>
              </div>

            </AccordionContent>
          </AccordionItem>

          {/* General */}
          <AccordionItem value="item-5" className="border rounded-xl px-6">
            <AccordionTrigger className="text-lg font-semibold">
              General Questions
            </AccordionTrigger>
            <AccordionContent className="text-base text-muted-foreground space-y-4 pb-6">

              <div>
                <strong className="text-foreground">Do you offer discounts?</strong>
                <p>
                  Yes, we offer bundle packs and special discounts.
                  Check our Everything Bundle for maximum value.
                </p>
              </div>

              <div>
                <strong className="text-foreground">Can I resell templates?</strong>
                <p>
                  No. Redistribution or reselling is strictly prohibited.
                  Templates are for your own or client projects only.
                </p>
              </div>

            </AccordionContent>
          </AccordionItem>

        </Accordion>
      </div>
    </div>
  )
}
