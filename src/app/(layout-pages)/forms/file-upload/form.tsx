import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function Form() {
  return (
    <div className="px-6 pb-4 mt-2">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="projectName" className="mb-2">
            Project name
          </Label>
          <Input
            id="projectName"
            type="text"
            defaultValue="Open Source Stripe"
          />
        </div>

        <div>
          <Label htmlFor="projectLead" className="mb-2">
            Project lead
          </Label>
          <Select defaultValue="1">
            <SelectTrigger id="projectLead" className="ps-2">
              <SelectValue placeholder="Select framework" />
            </SelectTrigger>
             <SelectContent>
                <SelectGroup>
                    <SelectItem value="1">
                        <div className="flex items-center gap-2">

                            {/* First Image */}
                            <img
                                className="size-5 rounded-full"
                                src="https://blocks.so/avatar-01.png"
                                alt="Ephraim Duncan"
                            />

                            {/* Name */}
                            <span className="truncate">Ephraim Duncan</span>
                        </div>
                    </SelectItem>
                    <SelectItem value="2">
                        <div className="flex items-center gap-2">
                            <img
                                className="size-5 rounded-full"
                                src="https://blocks.so/avatar-03.png"
                                alt="Lucas Smith"
                                width={20}
                                height={20}
                            />
                            <span className="truncate">Lucas Smith</span>
                        </div>
                    </SelectItem>
                    <SelectItem value="3">
                        <div className="flex items-center gap-2">
                            <img
                                className="size-5 rounded-full"
                                src="https://blocks.so/avatar-02.jpg"
                                alt="Timur Ercan"
                                width={20}
                                height={20}
                            />
                            <span className="truncate">Timur Ercan</span>
                        </div>
                    </SelectItem>
                </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
