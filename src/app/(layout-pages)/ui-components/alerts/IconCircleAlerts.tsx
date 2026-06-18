import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertTriangleIcon, Bell, CheckCircle2Icon, XCircleIcon } from "lucide-react"

export function IconCircleAlerts() {

    return (
        <div className="w-full max-w-3xl items-start gap-4 mx-auto space-y-6">

            {/* Page Title */}
            <div>
                <h1 className="text-xl font-semibold tracking-tight">Circle Icon Alerts</h1>
            </div>

            <Alert className="shadow gap-4 flex-row flex py-4 px-4 rounded-xl flex-wrap border border-green-300">
                <div className="h-9 w-9 rounded-full flex items-center justify-center text-white bg-green-500">
                    <CheckCircle2Icon className="h-5 w-5" />
                </div>
                <div>
                    <AlertTitle>Payment successful</AlertTitle>
                    <AlertDescription>
                        Your payment of $29.99 has been processed.
                    </AlertDescription>
                </div>
            </Alert>

            <Alert className="shadow gap-4 flex-row flex py-4 px-4 rounded-xl flex-wrap border border-orange-300">
                <div className="h-9 w-9 rounded-full flex items-center justify-center text-white bg-orange-500">
                    <AlertTriangleIcon className="h-5 w-5" />
                </div>
                <div>
                    <AlertTitle>Password Expiring Soon</AlertTitle>
                    <AlertDescription>
                        Your password will expire in 3 days. Please update it to avoid login issues.
                    </AlertDescription>
                </div>
            </Alert>

            <Alert className="shadow gap-4 flex-row flex py-4 px-4 rounded-xl flex-wrap border border-blue-300">
                <div className="h-9 w-9 rounded-full flex items-center justify-center text-white bg-blue-500">
                    <Bell className="h-5 w-5" />
                </div>
                <div>
                    <AlertTitle>New Feature Available</AlertTitle>
                    <AlertDescription>
                        We've added advanced analytics to your dashboard. Check it out now.
                    </AlertDescription>
                </div>
            </Alert>

            <Alert className="shadow gap-4 flex-row flex py-4 px-4 rounded-xl flex-wrap border border-red-300">
                <div className="h-9 w-9 rounded-full flex items-center justify-center text-white bg-red-500">
                    <XCircleIcon className="h-5 w-5" />
                </div>
                <div>
                    <AlertTitle>Transaction Failed</AlertTitle>
                    <AlertDescription>
                        We couldn't process your transaction. Please verify your details and try again.
                    </AlertDescription>
                </div>
            </Alert>

        </div>
    )
}
