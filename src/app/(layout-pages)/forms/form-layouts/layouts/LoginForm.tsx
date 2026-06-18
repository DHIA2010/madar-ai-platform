"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Mail, User, Lock, LogIn, Linkedin, Facebook, Eye, EyeOff } from "lucide-react"

const initialState = {
  email: "",
  password: "",
}

export default function LoginForm() {
  const [form, setForm] = useState(initialState)
  const [errors, setErrors] = useState<any>({})
  const [touched, setTouched] = useState<any>({})
  const [showPassword, setShowPassword] = useState(false)

  const validate = () => {
    const newErrors: any = {}

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
    setTouched({ email: true, password: true })

    if (Object.keys(validationErrors).length === 0) {
      alert("Login successful!")
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
        <CardHeader>
            {/* Logo */}
        <div className="flex justify-center mb-4">
            <div className="bg-primary/10 p-3 rounded-full">
                <User className="h-6 w-6 text-primary" />
            </div>
        </div>
          <CardTitle className="text-xl font-bold text-center flex items-center justify-center gap-2">
            <LogIn className="h-5 w-5 text-primary" />
            Login
          </CardTitle>
        </CardHeader>

        <CardContent className="p-8">
        
          <form onSubmit={handleSubmit} className="space-y-5">

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
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  className={`pl-10 pr-10 ${inputStyle("password")}`}
                  value={form.password}
                  onChange={(e) =>
                    handleChange("password", e.target.value)
                  }
                  onBlur={() => handleBlur("password")}
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

            {/* Submit */}
            <Button type="submit" className="w-full font-semibold">
              Login
            </Button>

            {/* Divider */}
            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs uppercase text-muted-foreground">
                Or get started with
              </span>
              <div className="flex-1 h-px bg-border" />
            </div>

            {/* Social Buttons */}
            <Button
              type="button"
              variant="outline"
              className="w-full flex items-center gap-2"
            >
              <Linkedin size={16} />
              Linkedin
            </Button>

            <Button
              type="button"
              variant="outline"
              className="w-full flex items-center gap-2"
            >
              <Facebook size={16} />
              Facebook
            </Button>

          </form>

          <p className="text-center text-sm text-muted-foreground mt-6">
            Don’t have an account?{" "}
            <a
              href="#"
              className="text-primary font-medium hover:underline"
            >
              Sign up
            </a>
          </p>

        </CardContent>
      </Card>
    </div>
  )
}