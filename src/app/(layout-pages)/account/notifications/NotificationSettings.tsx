"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"

export default function NotificationSettings() {
  return (
    <div className="flex justify-center">
      <Card className="w-full max-w-2xl">

        {/* Header */}
        <CardHeader className="border-b">
          <CardTitle className="text-xl font-semibold">
            Notification Settings
          </CardTitle>
        </CardHeader>

        <CardContent className="p-8 space-y-8">

          {/* Notification Items */}
          <div className="space-y-6">

            <div className="flex items-center justify-between">
              <span className="text-base">New for you</span>
              <Switch defaultChecked />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-base">Account activity</span>
              <Switch />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-base">
                A new browser used to sign in
              </span>
              <Switch />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-base">A new device is linked</span>
              <Switch defaultChecked />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-base">Weekly reports</span>
              <Switch />
            </div>

          </div>

          {/* Save Button */}
          <Button className="w-full h-10 rounded-xl">
            Save changes
          </Button>

        </CardContent>
      </Card>
    </div>
  )
}