import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

import {
  Home,
  XCircle,
  CheckCircle,
  Info,
  AlertTriangle,
  Sparkles,
  Flame,
  Heart,
  Sun,
  Layers,
  Type,
} from "lucide-react"

export function IconButtons() {
  return (
    <Card>
  <CardHeader className="border-b py-4">
    <CardTitle className="text-xl">Icon Buttons</CardTitle>
  </CardHeader>

  <CardContent className="space-y-6 p-6">

    {/* Default Buttons */}
    <div>
      <p className="mb-3 text-lg font-medium text-muted-foreground">
        Default
      </p>

      <div className="flex items-center gap-3 flex-wrap">
        <Button className="px-6 gap-2">
          <Home className="h-4 w-4" />
          Primary
        </Button>

        <Button className="bg-red-500 hover:bg-red-600 text-white px-6 gap-2">
          <XCircle className="h-4 w-4" />
          Error
        </Button>

        <Button className="bg-green-500 hover:bg-green-600 text-white px-6 gap-2">
          <CheckCircle className="h-4 w-4" />
          Success
        </Button>

        <Button className="bg-blue-500 hover:bg-blue-600 text-white px-6 gap-2">
          <Info className="h-4 w-4" />
          Info
        </Button>

        <Button className="bg-orange-500 hover:bg-orange-600 text-white px-6 gap-2">
          <AlertTriangle className="h-4 w-4" />
          Warning
        </Button>

        <Button className="bg-purple-600 hover:bg-purple-700 text-white px-6 gap-2">
          <Sparkles className="h-4 w-4" />
          Purple
        </Button>

        <Button className="bg-amber-500 hover:bg-amber-600 text-white px-6 gap-2">
          <Flame className="h-4 w-4" />
          Amber
        </Button>

        <Button className="bg-pink-500 hover:bg-pink-600 text-white px-6 gap-2">
          <Heart className="h-4 w-4" />
          Pink
        </Button>

        <Button className="bg-yellow-400 hover:bg-yellow-500 text-black px-6 gap-2">
          <Sun className="h-4 w-4" />
          Yellow
        </Button>

        <Button variant="secondary" className="px-6 gap-2">
          <Layers className="h-4 w-4" />
          Secondary
        </Button>

        <Button variant="ghost" className="px-6 gap-2">
          <Type className="h-4 w-4" />
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
        <Button className="px-6 rounded-full gap-2">
          <Home className="h-4 w-4" />
          Primary
        </Button>

        <Button className="bg-red-500 hover:bg-red-600 text-white px-6 rounded-full gap-2">
          <XCircle className="h-4 w-4" />
          Error
        </Button>

        <Button className="bg-green-500 hover:bg-green-600 text-white px-6 rounded-full gap-2">
          <CheckCircle className="h-4 w-4" />
          Success
        </Button>

        <Button className="bg-blue-500 hover:bg-blue-600 text-white px-6 rounded-full gap-2">
          <Info className="h-4 w-4" />
          Info
        </Button>

        <Button className="bg-orange-500 hover:bg-orange-600 text-white px-6 rounded-full gap-2">
          <AlertTriangle className="h-4 w-4" />
          Warning
        </Button>

        <Button className="bg-purple-600 hover:bg-purple-700 text-white px-6 rounded-full gap-2">
          <Sparkles className="h-4 w-4" />
          Purple
        </Button>

        <Button className="bg-amber-500 hover:bg-amber-600 text-white px-6 rounded-full gap-2">
          <Flame className="h-4 w-4" />
          Amber
        </Button>

        <Button className="bg-pink-500 hover:bg-pink-600 text-white px-6 rounded-full gap-2">
          <Heart className="h-4 w-4" />
          Pink
        </Button>

        <Button className="bg-yellow-400 hover:bg-yellow-500 text-black px-6 rounded-full gap-2">
          <Sun className="h-4 w-4" />
          Yellow
        </Button>

        <Button variant="secondary" className="px-6 rounded-full gap-2">
          <Layers className="h-4 w-4" />
          Secondary
        </Button>

        <Button variant="ghost" className="px-6 rounded-full gap-2">
          <Type className="h-4 w-4" />
          Text Button
        </Button>
      </div>
    </div>

    <div className="space-y-8">

  {/* Default Icon Buttons */}
  <div>
    <p className="mb-3 text-lg font-medium text-muted-foreground">
      Without Text
    </p>

    <div className="flex items-center gap-4 flex-wrap">

      <Button size="icon">
        <Home className="h-4 w-4" />
      </Button>

      <Button size="icon" className="bg-red-500 hover:bg-red-600 text-white">
        <XCircle className="h-4 w-4" />
      </Button>

      <Button size="icon" className="bg-green-500 hover:bg-green-600 text-white">
        <CheckCircle className="h-4 w-4" />
      </Button>

      <Button size="icon" className="bg-blue-500 hover:bg-blue-600 text-white">
        <Info className="h-4 w-4" />
      </Button>

      <Button size="icon" className="bg-orange-500 hover:bg-orange-600 text-white">
        <AlertTriangle className="h-4 w-4" />
      </Button>

      <Button size="icon" className="bg-purple-600 hover:bg-purple-700 text-white">
        <Sparkles className="h-4 w-4" />
      </Button>

      <Button size="icon" className="bg-amber-500 hover:bg-amber-600 text-white">
        <Flame className="h-4 w-4" />
      </Button>

      <Button size="icon" className="bg-pink-500 hover:bg-pink-600 text-white">
        <Heart className="h-4 w-4" />
      </Button>

      <Button size="icon" className="bg-yellow-400 hover:bg-yellow-500 text-black">
        <Sun className="h-4 w-4" />
      </Button>

      <Button size="icon" variant="secondary">
        <Layers className="h-4 w-4" />
      </Button>

      <Button size="icon" variant="ghost">
        <Type className="h-4 w-4" />
      </Button>

    </div>
  </div>

  {/* Full Rounded (Circle) Icon Buttons */}
  <div>
    <p className="mb-3 text-lg font-medium text-muted-foreground">
      Full Rounded
    </p>

    <div className="flex items-center gap-4 flex-wrap">

      <Button size="icon" className="w-10 h-10 rounded-full">
        <Home className="h-4 w-4" />
      </Button>

      <Button size="icon" className="w-10 h-10 rounded-full bg-red-500 hover:bg-red-600 text-white">
        <XCircle className="h-4 w-4" />
      </Button>

      <Button size="icon" className="w-10 h-10 rounded-full bg-green-500 hover:bg-green-600 text-white">
        <CheckCircle className="h-4 w-4" />
      </Button>

      <Button size="icon" className="w-10 h-10 rounded-full bg-blue-500 hover:bg-blue-600 text-white">
        <Info className="h-4 w-4" />
      </Button>

      <Button size="icon" className="w-10 h-10 rounded-full bg-orange-500 hover:bg-orange-600 text-white">
        <AlertTriangle className="h-4 w-4" />
      </Button>

      <Button size="icon" className="w-10 h-10 rounded-full bg-purple-600 hover:bg-purple-700 text-white">
        <Sparkles className="h-4 w-4" />
      </Button>

      <Button size="icon" className="w-10 h-10 rounded-full bg-amber-500 hover:bg-amber-600 text-white">
        <Flame className="h-4 w-4" />
      </Button>

      <Button size="icon" className="w-10 h-10 rounded-full bg-pink-500 hover:bg-pink-600 text-white">
        <Heart className="h-4 w-4" />
      </Button>

      <Button size="icon" className="w-10 h-10 rounded-full bg-yellow-400 hover:bg-yellow-500 text-black">
        <Sun className="h-4 w-4" />
      </Button>

      <Button size="icon" variant="secondary" className="w-10 h-10 rounded-full">
        <Layers className="h-4 w-4" />
      </Button>

      <Button size="icon" variant="ghost" className="w-10 h-10 rounded-full">
        <Type className="h-4 w-4" />
      </Button>

    </div>
  </div>

</div>


  </CardContent>
</Card>

  )
}
