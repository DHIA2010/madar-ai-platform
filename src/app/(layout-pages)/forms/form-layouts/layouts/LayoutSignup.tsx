"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { User, Mail, Lock, Linkedin } from "lucide-react"

const initialState = {
  name: "",
  email: "",
  password: "",
}

export default function LayoutSignup() {
  const [form, setForm] = useState(initialState)
  const [errors, setErrors] = useState<any>({})
  const [touched, setTouched] = useState<any>({})

  const validate = () => {
    const newErrors: any = {}

    if (!form.name) newErrors.name = "Name is required"

    if (!form.email) {
      newErrors.email = "Email is required"
    } else if (!/\S+@\S+\.\S+/.test(form.email)) {
      newErrors.email = "Email is invalid"
    }

    if (!form.password) {
      newErrors.password = "Password is required"
    } else if (form.password.length < 6) {
      newErrors.password =
        "Password must be at least 6 characters"
    }

    return newErrors
  }

  const handleChange = (name: string, value: string) => {
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleBlur = (name: string) => {
    setTouched((prev: any) => ({ ...prev, [name]: true }))
    setErrors(validate())
  }

  const handleSubmit = (e: any) => {
    e.preventDefault()

    const validationErrors = validate()
    setErrors(validationErrors)
    setTouched({
      name: true,
      email: true,
      password: true,
    })

    if (Object.keys(validationErrors).length === 0) {
      alert("Account created successfully!")
      setForm(initialState)
      setTouched({})
    }
  }

  const inputStyle = (name: string) =>
    touched[name] && errors[name]
      ? "border-red-500 focus-visible:ring-red-500"
      : ""

  return (
    <div className="flex items-center justify-center min-h-screen px-4">
      <Card className="w-full max-w-md rounded-2xl shadow-xl">
        <CardContent className="p-8">

          {/* Logo */}
          <div className="flex justify-center mb-4">
            <div className="bg-primary/10 p-3 rounded-full">
              <User className="h-6 w-6 text-primary" />
            </div>
          </div>

          {/* Heading */}
          <h4 className="text-xl font-bold text-center">
            Hi, Welcome to{" "}
            <span className="text-primary">Our App</span>
          </h4>
          <p className="text-muted-foreground text-center mb-6 text-sm">
            Start your 3-day free trial.
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Name */}
            <div className="space-y-2">
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Enter your name"
                  className={`pl-10 ${inputStyle("name")}`}
                  value={form.name}
                  onChange={(e) =>
                    handleChange("name", e.target.value)
                  }
                  onBlur={() => handleBlur("name")}
                />
              </div>
              {touched.name && errors.name && (
                <p className="text-sm text-red-500">
                  {errors.name}
                </p>
              )}
            </div>

            {/* Email */}
            <div className="space-y-2">
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="email"
                  placeholder="Enter your email"
                  className={`pl-10 ${inputStyle("email")}`}
                  value={form.email}
                  onChange={(e) =>
                    handleChange("email", e.target.value)
                  }
                  onBlur={() => handleBlur("email")}
                />
              </div>
              {touched.email && errors.email && (
                <p className="text-sm text-red-500">
                  {errors.email}
                </p>
              )}
            </div>

            {/* Password */}
            <div className="space-y-2">
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="password"
                  placeholder="Enter your password"
                  className={`pl-10 ${inputStyle("password")}`}
                  value={form.password}
                  onChange={(e) =>
                    handleChange("password", e.target.value)
                  }
                  onBlur={() => handleBlur("password")}
                />
              </div>
              {touched.password && errors.password && (
                <p className="text-sm text-red-500">
                  {errors.password}
                </p>
              )}
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs uppercase text-muted-foreground">
                Or get started with
              </span>
              <div className="flex-1 h-px bg-border" />
            </div>

            {/* LinkedIn Button */}
            <Button
              type="button"
              variant="outline"
              className="w-full flex items-center gap-2"
            >
              <Linkedin className="h-4 w-4" />
              Linkedin
            </Button>

            {/* Submit */}
            <Button
              type="submit"
              className="w-full font-semibold"
            >
              Create Account
            </Button>

            {/* Login Link */}
            <p className="text-center text-sm text-muted-foreground mt-4">
              Have an account?{" "}
              <a
                href="#"
                className="text-primary font-medium hover:underline"
              >
                Log in
              </a>
            </p>

          </form>
        </CardContent>
      </Card>
    </div>
  )
}