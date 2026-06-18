import { SelectBasic } from "./SelectBasic"
import { SelectWithAvatar } from "./SelectWithAvatar"
import { SelectTwoAvatars } from "./SelectTwoAvatars"
import {SelectWithCheckmarks} from "./SelectWithCheckmarks"
import {SelectGrouped} from "./SelectGrouped"
import { ComponentPreview } from "./ComponentPreview"
import { SelectWithDisabled } from "./SelectWithDisabled"

export default function SelectExamplesPage() {
  return (
    <div className="space-y-8">
      <ComponentPreview
        title="Basic Select"
        code={`<SelectBasic />`}
      >
        <SelectBasic />
      </ComponentPreview>

      <ComponentPreview
        title="Select with Avatar"
        code={`<SelectWithAvatar />`}
      >
        <SelectWithAvatar />
      </ComponentPreview>

      <ComponentPreview
        title="Two Avatar Select"
        code={`<SelectTwoAvatars />`}
      >
        <SelectTwoAvatars />
      </ComponentPreview>

      <ComponentPreview
        title="Select with Checkmarks"
        code={`<SelectWithCheckmarks />`}
      >
        <SelectWithCheckmarks />
      </ComponentPreview>

      <ComponentPreview
        title="Grouped Select"
        code={`<SelectGrouped />`}
      >
        <SelectGrouped />
      </ComponentPreview>

      <ComponentPreview
        title="Disabled Items"
        code={`<SelectWithDisabled />`}
      >
        <SelectWithDisabled />
      </ComponentPreview>
    </div>
  )
}