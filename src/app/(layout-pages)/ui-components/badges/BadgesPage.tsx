import { Separator } from "@radix-ui/react-separator"
import { BadgeVariants } from "./BadgeVariants"
import { BadgeWithIconLeft } from "./BadgeWithIconLeft"
import { BadgeCustomColors } from "./BadgeCustomColors"
import {PositionedBadges} from "./PositionedBadges"
import {IconBadgeButtons} from "./IconBadgeButtons"

export default function BadgesPage() {
  return (
      <div className="flex flex-col w-full flex-wrap justify-center gap-6">
          <div>
              <h3 className="text-2xl mb-4 font-medium">Badge Variants</h3>
              <BadgeVariants/>
          </div>

          <Separator className="border border-t border-border"/>

          <div>
              <h3 className="text-2xl mb-4 font-medium">Badge With Icon</h3>
              <BadgeWithIconLeft/>
          </div>

          <Separator className="border border-t border-border"/>

          <div>
              <h3 className="text-2xl mb-4 font-medium">Badge With Icon</h3>
              <BadgeCustomColors/>
          </div>

          <Separator className="border border-t border-border"/>

          <div>
              <h3 className="text-2xl mb-4 font-medium">Badge With Button Icon</h3>
              <PositionedBadges/>
          </div>

           <Separator className="border border-t border-border"/>

           <div>
              <h3 className="text-xl mb-4 font-medium">Badge With Circle Icon</h3>
              <IconBadgeButtons/>
          </div>

      </div>
  )
}
