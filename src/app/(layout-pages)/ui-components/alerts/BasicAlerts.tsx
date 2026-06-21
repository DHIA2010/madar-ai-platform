import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  AlertTriangleIcon,
  ArchiveX,
  Bell,
  BellDot,
  CheckCircle2Icon,
  InfoIcon,
  ShieldAlert,
  XCircleIcon,
  XIcon,
} from "lucide-react"

export function AlertsBasic() {
  0
  return (
    <div className="w-full max-w-3xl items-start gap-4 mx-auto space-y-6">
      {/* Page Title */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Basic Alerts</h1>
      </div>

      <Alert className="shadow gap-4 flex-row flex py-4 px-4 rounded-xl flex-wrap">
        <div>
          <CheckCircle2Icon className="h-6 w-6" />
        </div>
        <div>
          <AlertTitle>Payment successful</AlertTitle>
          <AlertDescription>Your payment of $29.99 has been processed.</AlertDescription>
        </div>
      </Alert>

      <Alert className="shadow gap-4 flex-row flex py-4 px-4 rounded-xl flex-wrap">
        <div>
          <AlertTriangleIcon className="h-6 w-6" />
        </div>
        <div>
          <AlertTitle>Password Expiring Soon</AlertTitle>
          <AlertDescription>
            Your password will expire in 3 days. Please update it to avoid login issues.
          </AlertDescription>
        </div>
      </Alert>

      <Alert className="shadow gap-4 flex-row flex py-4 px-4 rounded-xl flex-wrap">
        <div>
          <Bell className="h-6 w-6" />
        </div>
        <div>
          <AlertTitle>New Feature Available</AlertTitle>
          <AlertDescription>
            We&apos;ve added advanced analytics to your dashboard. Check it out now.
          </AlertDescription>
        </div>
      </Alert>

      <Alert className="shadow gap-4 flex-row flex py-4 px-4 rounded-xl flex-wrap">
        <div>
          <XCircleIcon className="h-6 w-6" />
        </div>
        <div>
          <AlertTitle>Transaction Failed</AlertTitle>
          <AlertDescription>
            We couldn&apos;t process your transaction. Please verify your details and try again.
          </AlertDescription>
        </div>
      </Alert>
    </div>
  )
}
