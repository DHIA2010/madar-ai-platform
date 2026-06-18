import {SimpleProgressCard} from "./SimpleProgressCard"
import {ProgressWithLabels} from "./ProgressWithLabels"
import { ProgressCards } from "./ProgressCards"
import {RatingReviewWidget} from "./RatingReviewWidget"
import {ActiveProjectsWidget} from "./ActiveProjectsWidget"
import {ActiveProjectsWidget2} from "./ActiveProjectsWidget2"

export default function ProgressPage () {
   return (
    <div className="progress-page-wrapper space-y-6">
        <div className="grid grid-cols-12 gap-6">
            <div className="col-span-12 xl:col-span-4 space-y-6">
                <SimpleProgressCard />
                <ProgressWithLabels />
                <ActiveProjectsWidget/>
            </div>
            <div className="col-span-12 xl:col-span-4 space-y-6">
                <ActiveProjectsWidget2/>
                <RatingReviewWidget/>
            </div>
            <div className="col-span-12 xl:col-span-4 space-y-6">
                <ProgressCards />
            </div>
            
        </div>
       
    </div>
   )
}