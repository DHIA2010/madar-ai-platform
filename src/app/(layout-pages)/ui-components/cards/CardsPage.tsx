import {BasicCards} from "./BasicCards"
import {ToolCards} from "./ToolCards"
import {GiftCards} from "./GiftCards"
import { JobCards } from "./JobCards"
import { TravelCards } from "./TravelCards"
import { FeaturedProducts } from "./FeaturedProducts"
import { BlogCards } from "./BlogCards"

export default function CardsPage() {
    return (
        <div className="buttons-page-wrapper space-y-6">
           <BasicCards/>
           <FeaturedProducts/>
           <ToolCards/>
           <BlogCards/>
           <GiftCards/>
           <JobCards/>
           <TravelCards/>
           
        </div>
    )
}