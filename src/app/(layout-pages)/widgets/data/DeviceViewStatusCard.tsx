import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Smartphone,
  Tablet,
  Laptop,
  CreditCardIcon,
  EllipsisVertical,
  LogOutIcon,
  SettingsIcon,
  UserIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export default function DeviceViewStatusCard() {
  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-start justify-between gap-4 pb-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full [&_svg]:size-5">
              <EllipsisVertical />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="text-right">
            <DropdownMenuItem className="flex-row-reverse justify-start gap-2 text-right">
              <UserIcon className="h-4 w-4 shrink-0" />
              عرض التقرير التفصيلي
            </DropdownMenuItem>
            <DropdownMenuItem className="flex-row-reverse justify-start gap-2 text-right">
              <CreditCardIcon className="h-4 w-4 shrink-0" />
              تنزيل التقرير
            </DropdownMenuItem>
            <DropdownMenuItem className="flex-row-reverse justify-start gap-2 text-right">
              <SettingsIcon className="h-4 w-4 shrink-0" />
              تصدير بصيغة CSV / PDF
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="flex-row-reverse justify-start gap-2 text-right">
              <LogOutIcon className="h-4 w-4 shrink-0" />
              تحديث البيانات
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="text-right">
          <CardTitle className="text-md font-semibold">حالة عرض الأجهزة</CardTitle>
          <CardDescription>ملخص استخدام الأجهزة</CardDescription>
        </div>
      </CardHeader>

      <CardContent className="space-y-6 p-6">
        {/* Total Traffic */}
        <div className="flex items-end gap-2">
          <h2 className="text-3xl font-bold">72%</h2>
          <span className="text-sm text-muted-foreground">إجمالي الزيارات</span>
        </div>

        {/* Progress Segments */}
        <div className="space-y-2">
          <div className="flex gap-1 w-full">
            <div className="h-2 rounded-full bg-primary w-[45%]" />
            <div className="h-2 rounded-full bg-emerald-500 w-[30%]" />
            <div className="h-2 rounded-full bg-yellow-400 w-[25%]" />
          </div>

          <div className="flex justify-between text-xs text-muted-foreground">
            <span>45%</span>
            <span>30%</span>
            <span>25%</span>
          </div>
        </div>

        {/* Device Stats */}
        <div className="grid grid-cols-3 rounded-2xl bg-muted/50 py-6">
          {/* Mobile */}
          <div className="flex flex-col items-center gap-2 border-r">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Smartphone className="h-5 w-5" />
            </div>
            <h5 className="text-2xl font-semibold">450</h5>
            <span className="text-md text-muted-foreground">الجوال</span>
          </div>

          {/* Tablet */}
          <div className="flex flex-col items-center gap-2 border-r">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
              <Tablet className="h-5 w-5" />
            </div>
            <h5 className="text-2xl font-semibold">300</h5>
            <span className="text-md text-muted-foreground">الجهاز اللوحي</span>
          </div>

          {/* Laptop */}
          <div className="flex flex-col items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-yellow-400/10 text-yellow-500">
              <Laptop className="h-5 w-5" />
            </div>
            <h5 className="text-2xl font-semibold">250</h5>
            <span className="text-md text-muted-foreground">الحاسوب</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
