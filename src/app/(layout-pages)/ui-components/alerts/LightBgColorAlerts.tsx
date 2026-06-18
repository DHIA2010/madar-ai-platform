import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertTriangleIcon, ArchiveX, Bell, BellDot, CheckCircle2Icon, InfoIcon, ShieldAlert, XCircleIcon, XIcon } from "lucide-react"

export function LightBgColorsAlerts() {
0
    return (
        <div className="w-full max-w-3xl items-start gap-4 mx-auto space-y-6">

            {/* Page Title */}
            <div>
                <h1 className="text-xl font-semibold tracking-tight">Light Background Color Alerts</h1>
            </div>

            <Alert className="shadow gap-4 flex-row flex py-4 px-4 rounded-xl flex-wrap bg-green-100 
            text-green-800 border-green-500/30 dark:bg-green-500/20 dark:text-green-400">
                <div>
                    <CheckCircle2Icon className="h-6 w-6" />
                </div>
                <div>
                    <AlertTitle>Payment successful</AlertTitle>
                    <AlertDescription>
                        Your payment of $29.99 has been processed.
                    </AlertDescription>
                </div>
            </Alert>

            <Alert className="shadow gap-4 flex-row flex py-4 px-4 rounded-xl flex-wrap 
            bg-yellow-100 
            text-yellow-800 border-yellow-500/30 dark:bg-yellow-500/20 dark:text-yellow-400">
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

            <Alert className="shadow gap-4 flex-row flex py-4 px-4 rounded-xl flex-wrap 
            bg-blue-100 
            text-blue-800 border-blue-500/30 dark:bg-blue-500/20 dark:text-blue-400">
                <div>
                    <Bell className="h-6 w-6" />
                </div>
                <div>
                    <AlertTitle>New Feature Available</AlertTitle>
                    <AlertDescription>
                        We've added advanced analytics to your dashboard. Check it out now.
                    </AlertDescription>
                </div>
            </Alert>

            <Alert className="shadow gap-4 flex-row flex py-4 px-4 rounded-xl flex-wrap 
            bg-red-100 
            text-red-800 border-red-500/30 dark:bg-red-500/20 dark:text-red-400">
                <div>
                    <XCircleIcon className="h-6 w-6" />
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
