
import {BasicAccordion} from "./BasicAccordion"
import {BordersAccordion} from "./BorderAccordion"
import {AccordionCard} from "./AccordionCard"

export default function AccordionPage () {
    return (
       <div className="accordion-page mx-auto max-w-4xl">
           <div className="space-y-6">
              <BasicAccordion/>
              <BordersAccordion/>
              <AccordionCard/>
           </div>
       </div>
    )
} 