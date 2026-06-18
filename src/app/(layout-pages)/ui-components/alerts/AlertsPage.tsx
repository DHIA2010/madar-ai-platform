
import { AlertsBasic } from "./BasicAlerts"
import { LightBgColorsAlerts } from "./LightBgColorAlerts"
import { SolidBgColorAlerts } from "./SolidBgColorAlerts"
import {IconCircleAlerts} from "./IconCircleAlerts"

export default function AlertsPage() {

  return (
    <div className="space-y-6">
      <AlertsBasic />
      <LightBgColorsAlerts />
      <SolidBgColorAlerts/>
      <IconCircleAlerts/>
    </div>
  )
}
