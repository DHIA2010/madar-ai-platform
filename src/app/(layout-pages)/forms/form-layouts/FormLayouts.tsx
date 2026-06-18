"use client"

import LayoutSignup from "./layouts/LayoutSignup"
import LayoutSignup2 from "./layouts/LayoutSignup2"
import LayoutStudent from "./layouts/LayoutStudent"
import JobPostingForm from "./layouts/JobPostingForm"
import CheckoutBillingForm from "./layouts/CheckoutBillingForm"
import LoginForm from "./layouts/LoginForm"

export default function FormLayouts() {
  return (
    <div className="min-h-screen py-10 px-4">
      
      <div className="max-w-7xl mx-auto grid grid-cols-1 xl:grid-cols-2 gap-8">
        
        {/* Left Column */}
        <div className="space-y-8">
          <LayoutStudent />
          <LayoutSignup2 />
          <LayoutSignup />
        </div>

        {/* Right Column */}
        <div className="space-y-8">
          <JobPostingForm />
          <CheckoutBillingForm />
          <LoginForm />
        </div>

      </div>

    </div>
  )
}