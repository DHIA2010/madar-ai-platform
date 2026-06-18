import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
export function BasicButtons() {
  return (
    <Card>
      <CardHeader className="border-b py-4">
        <CardTitle className="text-xl">Basic Buttons</CardTitle>
      </CardHeader>

      <CardContent className="space-y-6 p-6">

        {/* Default Buttons */}
        <div>
          <p className="mb-3 text-lg font-medium text-muted-foreground">
            Default
          </p>

          <div className="flex items-center gap-3 flex-wrap">
            <Button className="px-6">Primary</Button>
            <Button className="bg-red-500 hover:bg-red-600 text-white px-6">
              Error
            </Button>
            <Button className="bg-green-500 hover:bg-green-600 text-white px-6">
              Success
            </Button>
            <Button className="bg-blue-500 hover:bg-blue-600 text-white px-6">
              Info
            </Button>
            <Button className="bg-orange-500 hover:bg-orange-600 text-white px-6">
              Warning
            </Button>
             <Button className="bg-purple-600 hover:bg-purple-700 text-white px-6">
              Purple
            </Button>
             <Button className="bg-amber-500 hover:bg-amber-600 text-white px-6">
              Amber
            </Button>
             <Button className="bg-pink-500 hover:bg-pink-600 text-white px-6">
              Pink
            </Button>
             <Button className="bg-yellow-400 hover:bg-yellow-500 text-black px-6">
              Yellow
            </Button>
            <Button variant="secondary" className="px-6">
              Secondary
            </Button>
            <Button variant="ghost" className="px-6">
              Text Button
            </Button>
          </div>
        </div>

        {/* Rounded Buttons */}
        <div>
          <p className="mb-3 text-lg font-medium text-muted-foreground">
            Rounded
          </p>

          <div className="flex items-center gap-3 flex-wrap">
            <Button className="px-6 rounded-full">Primary</Button>
            <Button className="bg-red-500 hover:bg-red-600 text-white px-6 rounded-full">
              Error
            </Button>
            <Button className="bg-green-500 hover:bg-green-600 text-white px-6 rounded-full">
              Success
            </Button>
            <Button className="bg-blue-500 hover:bg-blue-600 text-white px-6 rounded-full">
              Info
            </Button>
            <Button className="bg-orange-500 hover:bg-orange-600 text-white px-6 rounded-full">
              Warning
            </Button>
             <Button className="bg-purple-600 hover:bg-purple-700 text-white px-6 rounded-full">
              Purple
            </Button>
             <Button className="bg-amber-500 hover:bg-amber-600 text-white px-6 rounded-full">
              Amber
            </Button>
             <Button className="bg-pink-500 hover:bg-pink-600 text-white px-6 rounded-full">
              Pink
            </Button>
             <Button className="bg-yellow-400 hover:bg-yellow-500 text-black px-6 rounded-full">
              Yellow
            </Button>
            <Button variant="secondary" className="px-6 rounded-full">
              Secondary
            </Button>
            <Button variant="ghost" className="px-6 rounded-full">
              Text Button
            </Button>
          </div>
        </div>
       
      </CardContent>
    </Card>
  )
}
