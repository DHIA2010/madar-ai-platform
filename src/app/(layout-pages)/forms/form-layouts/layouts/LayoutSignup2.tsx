"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Eye, EyeOff, Star } from "lucide-react"

const initialState = {
  name: "",
  email: "",
  password: "",
  agree: false,
}

export default function LayoutSignup2() {
  const [form, setForm] = useState(initialState)
  const [errors, setErrors] = useState<any>({})
  const [touched, setTouched] = useState<any>({})
  const [showPassword, setShowPassword] = useState(false)

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
    } else if (form.password.length < 8) {
      newErrors.password =
        "Password must be at least 8 characters"
    }

    if (!form.agree)
      newErrors.agree = "You must agree to the terms"

    return newErrors
  }

  const handleChange = (name: string, value: any) => {
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
      agree: true,
    })

    if (Object.keys(validationErrors).length === 0) {
      alert("Signup successful!")
      setForm(initialState)
      setTouched({})
    }
  }

  const inputStyle = (name: string) =>
    touched[name] && errors[name]
      ? "border-red-500 focus-visible:ring-red-500"
      : ""

  return (
    <div className="flex items-center justify-center min-h-scree px-4">
      <Card className="w-full max-w-md rounded-2xl shadow-xl">
        <CardContent className="p-8">

          {/* Header */}
          <div className="mb-6">
            <h4 className="text-xl font-bold flex items-center gap-2">
              <Star className="h-5 w-5 text-foreground" />
              Sign Up
            </h4>
            <p className="text-muted-foreground text-sm mt-1">
              Free forever. No credit card needed.
            </p>
          </div>

          {/* Social Buttons */}
          <div className="space-y-3">
            <Button
              type="button"
              className="w-full bg-red-500 hover:bg-red-600 text-white"
            >
              Sign up with Pinterest
            </Button>

            <Button
              type="button"
              variant="outline"
              className="w-full"
            >
              Sign up with Apple
            </Button>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">
              OR
            </span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Name */}
            <div className="space-y-2">
              <Label>Your Name</Label>
              <Input
                placeholder="Your Name"
                value={form.name}
                onChange={(e) =>
                  handleChange("name", e.target.value)
                }
                onBlur={() => handleBlur("name")}
                className={inputStyle("name")}
              />
              {touched.name && errors.name && (
                <p className="text-sm text-red-500">
                  {errors.name}
                </p>
              )}
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label>Your E-mail</Label>
              <Input
                type="email"
                placeholder="Your E-mail"
                value={form.email}
                onChange={(e) =>
                  handleChange("email", e.target.value)
                }
                onBlur={() => handleBlur("email")}
                className={inputStyle("email")}
              />
              {touched.email && errors.email && (
                <p className="text-sm text-red-500">
                  {errors.email}
                </p>
              )}
            </div>

            {/* Password */}
            <div className="space-y-2">
              <Label>Password</Label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="At least 8 characters"
                  value={form.password}
                  onChange={(e) =>
                    handleChange("password", e.target.value)
                  }
                  onBlur={() => handleBlur("password")}
                  className={`pr-10 ${inputStyle("password")}`}
                />
                <button
                  type="button"
                  onClick={() =>
                    setShowPassword(!showPassword)
                  }
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                >
                  {showPassword ? (
                    <EyeOff size={16} />
                  ) : (
                    <Eye size={16} />
                  )}
                </button>
              </div>
              {touched.password && errors.password && (
                <p className="text-sm text-red-500">
                  {errors.password}
                </p>
              )}
            </div>

            {/* Checkbox */}
            <div className="flex items-start space-x-2">
              <Checkbox
                checked={form.agree}
                onCheckedChange={(value) =>
                  handleChange("agree", value)
                }
              />
              <div className="text-sm text-muted-foreground">
                I agree to all the{" "}
                <a href="#" className="text-primary hover:underline">
                  Terms
                </a>
                ,{" "}
                <a href="#" className="text-primary hover:underline">
                  Privacy Policy
                </a>{" "}
                and{" "}
                <a href="#" className="text-primary hover:underline">
                  Fees
                </a>
                .
              </div>
            </div>
            {touched.agree && errors.agree && (
              <p className="text-sm text-red-500">
                {errors.agree}
              </p>
            )}

            <Button type="submit" className="w-full font-semibold">
              Continue
            </Button>

          </form>

          <p className="text-center text-sm text-muted-foreground mt-6">
            Have an account?{" "}
            <a
              href="#"
              className="text-primary font-medium hover:underline"
            >
              Log in
            </a>
          </p>

        </CardContent>
      </Card>
    </div>
  )
}