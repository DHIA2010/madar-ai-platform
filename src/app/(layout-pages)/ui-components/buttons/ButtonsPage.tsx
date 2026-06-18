import {BasicButtons} from "./BasicButtons"
import {OutlineButtons} from "./OutlineButtons"
import {LightButtons} from "./LightButtons"
import {IconButtons} from "./IconButtons"
import {VariationsButtons} from "./VariationsButtons"
import {SocialButtonsCard} from "./SocialButtonsCard"

export default function ButtonsPage() {
    return (
        <div className="buttons-page-wrapper space-y-6">
            <BasicButtons/>
            <OutlineButtons/>
            <LightButtons/>
            <IconButtons/>
            <VariationsButtons/>
            <SocialButtonsCard/>
        </div>
    )
}