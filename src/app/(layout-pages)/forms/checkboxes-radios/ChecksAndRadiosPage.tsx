"use client"

import { useState } from "react"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Switch } from "@/components/ui/switch"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"

import ServiceSelectorCard from "./ServiceSelectorCard"
import CheckboxCardList from "./CheckboxCardList"
import TeamMemberList from "./TeamMemberList"
import FilterCard from "./FilterCard"
import DeliveryCards from "./DeliveryCards"
import DesignerType from "./DesignerType"

export default function ChecksAndRadiosPage() {
  const [gender, setGender] = useState("male")
  const [plan, setPlan] = useState("free")

  return (
    <div className="space-y-10">

      {/* ================= BASIC EXAMPLES ================= */}
      <div>
        <h5 className="text-xl font-bold mb-6">
          Basic Examples
        </h5>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Checkboxes */}
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="font-semibold">
                Checkboxes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center space-x-2">
                <Checkbox id="check1" />
                <Label htmlFor="check1">Check me out</Label>
              </div>

              <div className="flex flex-wrap gap-6">
                <div className="flex items-center space-x-2">
                  <Checkbox id="opt1" />
                  <Label htmlFor="opt1">Option 1</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox id="opt2" />
                  <Label htmlFor="opt2">Option 2</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox id="opt3" disabled />
                  <Label htmlFor="opt3">Option 3</Label>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Switches */}
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="font-semibold">
                Switches
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center space-x-2">
                <Switch id="switch1" />
                <Label htmlFor="switch1">
                  Check this switch
                </Label>
              </div>

              <div className="flex items-center space-x-2">
                <Switch id="switch2" disabled />
                <Label htmlFor="switch2">
                  Disabled switch
                </Label>
              </div>
            </CardContent>
          </Card>

          {/* Radios */}
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="font-semibold">
                Radios
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">

              {/* Gender */}
              <RadioGroup
                value={gender}
                onValueChange={setGender}
                className="flex flex-wrap gap-6"
              >
                {["male", "female", "other"].map((item) => (
                  <div
                    key={item}
                    className="flex items-center space-x-2"
                  >
                    <RadioGroupItem value={item} id={`gender-${item}`} />
                    <Label htmlFor={`gender-${item}`}>
                      {item.charAt(0).toUpperCase() + item.slice(1)}
                    </Label>
                  </div>
                ))}
              </RadioGroup>

              {/* Plan */}
              <RadioGroup
                value={plan}
                onValueChange={setPlan}
                className="flex flex-wrap gap-6"
              >
                {["free", "premium", "enterprise"].map((item) => (
                  <div
                    key={item}
                    className="flex items-center space-x-2"
                  >
                    <RadioGroupItem value={item} id={`plan-${item}`} />
                    <Label htmlFor={`plan-${item}`}>
                      {item.charAt(0).toUpperCase() + item.slice(1)}
                    </Label>
                  </div>
                ))}
              </RadioGroup>

            </CardContent>
          </Card>

        </div>
      </div>

      {/* ================= CHECKBOX EXAMPLES ================= */}
      <div>
        <h5 className="text-xl font-bold mb-6">
          Checkbox Examples
        </h5>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-6">
            <ServiceSelectorCard />
            <TeamMemberList />
          </div>

          <CheckboxCardList />
        </div>
      </div>

      {/* ================= RADIO BOX EXAMPLES ================= */}
      <div>
        <h5 className="text-xl font-bold mb-6">
          Radio Box Examples
        </h5>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          <div className="lg:col-span-4">
            <FilterCard />
          </div>

          <div className="lg:col-span-8">
            <Card className="p-6 rounded-2xl space-y-6">
              <DeliveryCards />
              <DesignerType />
            </Card>
          </div>

        </div>
      </div>

    </div>
  )
}