"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Check,
  ShoppingCart,
  BarChart3,
  LayoutDashboard,
  Zap,
  Code2,
  Moon,
} from "lucide-react"

export default function LandingPage() {
  return (
    <div className="flex flex-col">

      {/* ================= HERO SECTION ================= */}
      <section className="relative py-24 px-6 lg:px-20 text-center bg-gradient-to-b from-background to-muted">
        <Badge className="mb-6 px-4 py-1 text-sm">
          Built with ShadCN + Tailwind
        </Badge>

        <h1 className="text-4xl md:text-6xl font-bold tracking-tight max-w-4xl mx-auto">
          Pulse UI – Modern ShadCN eCommerce Admin Template
        </h1>

        <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
          Production-ready React admin dashboard built with ShadCN UI,
          Tailwind CSS and modern architecture. Perfect for SaaS,
          eCommerce and startup dashboards.
        </p>

        <div className="mt-8 flex justify-center gap-4 flex-wrap">
          <Button size="lg">Live Preview</Button>
          <Button size="lg" variant="outline">
            Buy Now
          </Button>
        </div>
      </section>

      {/* ================= FEATURES ================= */}
      <section className="py-20 px-6 lg:px-20">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold">Why Choose Pulse UI?</h2>
          <p className="text-muted-foreground mt-4">
            Designed for developers who want clean architecture and scalability.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <Card key={index} className="rounded-2xl shadow-sm">
              <CardContent className="p-6 space-y-4">
                <feature.icon className="w-8 h-8 text-primary" />
                <h3 className="text-xl font-semibold">{feature.title}</h3>
                <p className="text-muted-foreground text-sm">
                  {feature.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* ================= ECOMMERCE SECTION ================= */}
      <section className="py-20 bg-muted px-6 lg:px-20">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="text-3xl font-bold mb-6">
              Complete eCommerce Module
            </h2>

            <ul className="space-y-4">
              {ecommerceFeatures.map((item, i) => (
                <li key={i} className="flex items-center gap-3">
                  <Check className="w-5 h-5 text-green-500" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-background rounded-2xl shadow p-10 text-center">
            <LayoutDashboard className="w-16 h-16 mx-auto text-primary" />
            <p className="mt-6 text-muted-foreground">
              Production-ready pages for products, orders,
              customers and analytics.
            </p>
          </div>
        </div>
      </section>

      {/* ================= ANALYTICS SECTION ================= */}
      <section className="py-20 px-6 lg:px-20">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold">
            Powerful Analytics Dashboard
          </h2>
          <p className="text-muted-foreground mt-4">
            Interactive charts and KPI cards built for real SaaS products.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {analytics.map((item, index) => (
            <Card key={index} className="rounded-2xl">
              <CardContent className="p-6 space-y-3">
                <BarChart3 className="w-8 h-8 text-primary" />
                <h3 className="font-semibold">{item}</h3>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* ================= TECH STACK ================= */}
      <section className="py-20 bg-muted px-6 lg:px-20 text-center">
        <h2 className="text-3xl font-bold mb-8">Modern Tech Stack</h2>

        <div className="flex flex-wrap justify-center gap-4">
          {[
            "React 18+",
            "ShadCN UI",
            "Tailwind CSS",
            "Radix UI",
            "TypeScript",
            "Lucide Icons",
          ].map((tech, i) => (
            <Badge key={i} variant="secondary" className="px-4 py-2 text-sm">
              {tech}
            </Badge>
          ))}
        </div>
      </section>

      {/* ================= CTA SECTION ================= */}
      <section className="py-24 px-6 lg:px-20 text-center">
        <Zap className="w-12 h-12 mx-auto text-primary mb-6" />
        <h2 className="text-4xl font-bold">
          Build Your Next SaaS Dashboard 5x Faster
        </h2>
        <p className="mt-6 text-muted-foreground max-w-2xl mx-auto">
          Stop designing dashboards from scratch. Pulse UI gives you a
          scalable, modern ShadCN foundation ready for production.
        </p>

        <div className="mt-8 flex justify-center gap-4 flex-wrap">
          <Button size="lg">Live Preview</Button>
          <Button size="lg" variant="outline">
            Buy on ThemeForest
          </Button>
        </div>
      </section>

    </div>
  )
}

/* ================= DATA ================= */

const features = [
  {
    icon: Code2,
    title: "Developer First Architecture",
    description:
      "Clean folder structure, reusable components and scalable React setup.",
  },
  {
    icon: Moon,
    title: "Light & Dark Mode",
    description:
      "Fully optimized dark mode powered by Tailwind and ShadCN.",
  },
  {
    icon: ShoppingCart,
    title: "eCommerce Ready",
    description:
      "Complete product, order and customer management system included.",
  },
]

const ecommerceFeatures = [
  "Products Listing & Management",
  "Orders Management",
  "Customers Management",
  "Sales Reports & Analytics",
  "Invoice Page",
  "Inventory Tracking",
]

const analytics = [
  "Revenue Analytics",
  "Interactive Charts",
  "KPI Summary Cards",
  "Performance Metrics",
  "Sales Reports",
]