
import { SonnerPosition } from "./SonnerPosition"
import {SonnerTypes} from "./SonnerTypes"

export default function SoonerPage () {
    return (
        <div className="flex items-center flex-col justify-center space-y-6">
          <SonnerTypes/>
          <SonnerPosition/>
        </div>
    )
} 