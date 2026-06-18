import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertTriangleIcon, ArchiveX, Bell, BellDot, CheckCircle2Icon, InfoIcon, ShieldAlert, XCircleIcon, XIcon } from "lucide-react"

export function SolidBgColorAlerts() {
0
    return (
        <div className="w-full max-w-3xl items-start gap-4 mx-auto space-y-6">

            {/* Page Title */}
            <div>
                <h1 className="text-xl font-semibold tracking-tight">Solid Background Color Alerts</h1>
            </div>

            <Alert className="shadow gap-4 flex-row flex py-4 px-4 rounded-xl flex-wrap
             text-white bg-green-500 border-green-500">
                <div>
                    <CheckCircle2Icon className="h-6 w-6" />
                </div>
                <div>
                    <AlertTitle>Payment successful</AlertTitle>
                    <AlertDescription className="text-white">
                        Your payment of $29.99 has been processed.
                    </AlertDescription>
                </div>
            </Alert>

            <Alert className="shadow gap-4 flex-row flex py-4 px-4 rounded-xl flex-wrap
            text-white bg-orange-500 border-orange-500">
                <div>
                    <AlertTriangleIcon className="h-6 w-6" />
                </div>
                <div>
                    <AlertTitle>Password Expiring Soon</AlertTitle>
                    <AlertDescription className="text-white">
                        Your password will expire in 3 days. Please update it to avoid login issues.
                    </AlertDescription>
                </div>
            </Alert>

            <Alert className="shadow gap-4 flex-row flex py-4 px-4 rounded-xl flex-wrap
            text-white bg-blue-500 border-blue-500">
                <div>
                    <Bell className="h-6 w-6" />
                </div>
                <div>
                    <AlertTitle>New Feature Available</AlertTitle>
                    <AlertDescription className="text-white">
                        We've added advanced analytics to your dashboard. Check it out now.
                    </AlertDescription>
                </div>
            </Alert>

            <Alert className="shadow gap-4 flex-row flex py-4 px-4 rounded-xl flex-wrap
            text-white bg-red-500 border-red-500">
                <div>
                    <XCircleIcon className="h-6 w-6" />
                </div>
                <div>
                    <AlertTitle>Transaction Failed</AlertTitle>
                    <AlertDescription className="text-white">
                        We couldn't process your transaction. Please verify your details and try again.
                    </AlertDescription>
                </div>
            </Alert>

        </div>
    )
}
