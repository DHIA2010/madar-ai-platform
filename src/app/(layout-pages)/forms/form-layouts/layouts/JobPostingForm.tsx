"use client"

import { useState, type FormEvent } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const initialState = {
  jobTitle: "",
  companyName: "",
  location: "",
  jobType: "",
  experience: "",
  salaryMin: "",
  salaryMax: "",
  description: "",
  skills: "",
  deadline: "",
  confirm: false,
}

type FormState = typeof initialState

export default function JobPostingForm() {
  const [form, setForm] = useState(initialState)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [touched, setTouched] = useState<Record<string, boolean>>({})

  const validate = () => {
    const newErrors: Record<string, string> = {}

    if (!form.jobTitle) newErrors.jobTitle = "Job title is required"
    if (!form.companyName) newErrors.companyName = "Company name is required"
    if (!form.location) newErrors.location = "Location is required"
    if (!form.jobType) newErrors.jobType = "Job type is required"
    if (!form.experience) newErrors.experience = "Experience level is required"
    if (!form.salaryMin) newErrors.salaryMin = "Minimum salary is required"
    if (!form.salaryMax) newErrors.salaryMax = "Maximum salary is required"

    if (form.salaryMin && form.salaryMax && Number(form.salaryMin) > Number(form.salaryMax)) {
      newErrors.salaryMax = "Max salary must be greater than min salary"
    }

    if (!form.description) newErrors.description = "Job description is required"

    if (!form.skills) newErrors.skills = "Skills are required"
    if (!form.deadline) newErrors.deadline = "Application deadline is required"

    if (!form.confirm) newErrors.confirm = "Please confirm job details"

    return newErrors
  }

  const handleChange = (name: keyof FormState, value: FormState[keyof FormState]) => {
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleBlur = (name: keyof FormState) => {
    setTouched((prev) => ({ ...prev, [name]: true }))
    setErrors(validate())
  }

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const validationErrors = validate()
    setErrors(validationErrors)

    if (Object.keys(validationErrors).length === 0) {
      alert("Job posted successfully!")
      setForm(initialState)
      setTouched({})
    }
  }

  const inputStyle = (name: string) =>
    touched[name] && errors[name] ? "border-red-500 focus-visible:ring-red-500" : ""

  return (
    <div className="flex justify-center py-10 px-4">
      <Card className="w-full max-w-4xl rounded-2xl shadow-lg">
        <CardHeader className="border-b">
          <CardTitle className="text-xl font-bold text-center">💼 Post a Job</CardTitle>
        </CardHeader>

        <CardContent className="p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Job Title */}
            <div className="space-y-2">
              <Label>Job Title</Label>
              <Input
                placeholder="Enter job title"
                value={form.jobTitle}
                onChange={(e) => handleChange("jobTitle", e.target.value)}
                onBlur={() => handleBlur("jobTitle")}
                className={inputStyle("jobTitle")}
              />
              {touched.jobTitle && errors.jobTitle && (
                <p className="text-sm text-red-500">{errors.jobTitle}</p>
              )}
            </div>

            {/* Company + Location */}
            <div className="grid md:grid-cols-2 gap-6">
              {["companyName", "location"].map((field) => {
                const key = field as keyof FormState
                return (
                  <div key={field} className="space-y-2">
                    <Label className="capitalize">
                      {field === "companyName" ? "Company Name" : "Location"}
                    </Label>
                    <Input
                      placeholder={`Enter ${field}`}
                      value={String(form[key] ?? "")}
                      onChange={(e) => handleChange(key, e.target.value)}
                      onBlur={() => handleBlur(key)}
                      className={inputStyle(field)}
                    />
                    {touched[key] && errors[key] && (
                      <p className="text-sm text-red-500">{errors[key]}</p>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Job Type + Experience */}
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label>Job Type</Label>
                <Select onValueChange={(value) => handleChange("jobType", value)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select job type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Full-Time">Full-Time</SelectItem>
                    <SelectItem value="Part-Time">Part-Time</SelectItem>
                    <SelectItem value="Contract">Contract</SelectItem>
                    <SelectItem value="Internship">Internship</SelectItem>
                    <SelectItem value="Remote">Remote</SelectItem>
                  </SelectContent>
                </Select>
                {touched.jobType && errors.jobType && (
                  <p className="text-sm text-red-500">{errors.jobType}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Experience Level</Label>
                <Select onValueChange={(value) => handleChange("experience", value)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select experience" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Entry Level">Entry Level</SelectItem>
                    <SelectItem value="Mid Level">Mid Level</SelectItem>
                    <SelectItem value="Senior Level">Senior Level</SelectItem>
                  </SelectContent>
                </Select>
                {touched.experience && errors.experience && (
                  <p className="text-sm text-red-500">{errors.experience}</p>
                )}
              </div>
            </div>

            {/* Salary */}
            <div className="grid md:grid-cols-2 gap-6">
              {["salaryMin", "salaryMax"].map((field) => {
                const key = field as keyof FormState
                return (
                  <div key={field} className="space-y-2">
                    <Label>
                      {field === "salaryMin" ? "Salary Range (Min)" : "Salary Range (Max)"}
                    </Label>
                    <Input
                      type="number"
                      placeholder="Enter amount"
                      value={String(form[key] ?? "")}
                      onChange={(e) => handleChange(key, e.target.value)}
                      onBlur={() => handleBlur(key)}
                      className={inputStyle(field)}
                    />
                    {touched[key] && errors[key] && (
                      <p className="text-sm text-red-500">{errors[key]}</p>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label>Job Description</Label>
              <Textarea
                rows={4}
                placeholder="Enter detailed job description"
                value={form.description}
                onChange={(e) => handleChange("description", e.target.value)}
                onBlur={() => handleBlur("description")}
                className={inputStyle("description")}
              />
              {touched.description && errors.description && (
                <p className="text-sm text-red-500">{errors.description}</p>
              )}
            </div>

            {/* Skills */}
            <div className="space-y-2">
              <Label>Skills Required</Label>
              <Input
                placeholder="React, Node.js, SQL"
                value={form.skills}
                onChange={(e) => handleChange("skills", e.target.value)}
                onBlur={() => handleBlur("skills")}
                className={inputStyle("skills")}
              />
              {touched.skills && errors.skills && (
                <p className="text-sm text-red-500">{errors.skills}</p>
              )}
            </div>

            {/* Deadline */}
            <div className="space-y-2">
              <Label>Application Deadline</Label>
              <Input
                type="date"
                value={form.deadline}
                onChange={(e) => handleChange("deadline", e.target.value)}
                onBlur={() => handleBlur("deadline")}
                className={inputStyle("deadline")}
              />
              {touched.deadline && errors.deadline && (
                <p className="text-sm text-red-500">{errors.deadline}</p>
              )}
            </div>

            {/* Confirm Checkbox */}
            <div className="flex items-center space-x-2">
              <Checkbox
                checked={form.confirm}
                onCheckedChange={(value) => handleChange("confirm", value)}
              />
              <Label>I confirm the job details are accurate before posting</Label>
            </div>
            {touched.confirm && errors.confirm && (
              <p className="text-sm text-red-500">{errors.confirm}</p>
            )}

            <Button type="submit" className="w-full font-semibold">
              Post Job
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
