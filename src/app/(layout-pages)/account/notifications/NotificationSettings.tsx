"use client"

import { useTranslations } from "next-intl"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"

export default function NotificationSettings() {
  const t = useTranslations("account.notifications")

  return (
    <div className="flex justify-center">
      <Card className="w-full max-w-2xl">
        {/* Header */}
        <CardHeader className="border-b">
          <CardTitle className="text-xl font-semibold">{t("title")}</CardTitle>
        </CardHeader>

        <CardContent className="p-8 space-y-8">
          {/* Notification Items */}
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <span className="text-base">{t("newForYou")}</span>
              <Switch defaultChecked />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-base">{t("accountActivity")}</span>
              <Switch />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-base">{t("newBrowserSignIn")}</span>
              <Switch />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-base">{t("newDeviceLinked")}</span>
              <Switch defaultChecked />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-base">{t("weeklyReports")}</span>
              <Switch />
            </div>
          </div>

          {/* Save Button */}
          <Button className="w-full h-10 rounded-xl">{t("saveChanges")}</Button>
        </CardContent>
      </Card>
    </div>
  )
}
