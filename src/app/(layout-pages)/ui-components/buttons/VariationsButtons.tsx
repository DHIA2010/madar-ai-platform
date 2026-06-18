import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Home,
  CheckCircle,
  Info,
  AlertTriangle,
  Heart,
  Sparkles,
} from "lucide-react"
export function VariationsButtons() {
  return (
    <Card>
      <CardHeader className="border-b py-4">
        <CardTitle className="text-xl">
          Buttons With Different Variations
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-8 p-6">

              {/* Light Version */}
              <div>
                  <p className="mb-3 text-lg font-medium text-muted-foreground">
                      Light Buttons
                  </p>

                  <div className="flex flex-wrap gap-3">

                      {/* Primary */}
                      <Button
                          className="gap-2 px-6 transition-all duration-300
      bg-primary/10 text-primary hover:bg-primary/20
      dark:bg-primary/20 dark:text-primary dark:hover:bg-primary/30"
                      >
                          <Home className="h-4 w-4" />
                          Primary
                      </Button>

                      {/* Success */}
                      <Button
                          className="gap-2 px-6 transition-all duration-300
      bg-green-100 text-green-700 hover:bg-green-200
      dark:bg-green-500/20 dark:text-green-400 dark:hover:bg-green-500/30"
                      >
                          <CheckCircle className="h-4 w-4" />
                          Success
                      </Button>

                      {/* Info */}
                      <Button
                          className="gap-2 px-6 transition-all duration-300
      bg-blue-100 text-blue-700 hover:bg-blue-200
      dark:bg-blue-500/20 dark:text-blue-400 dark:hover:bg-blue-500/30"
                      >
                          <Info className="h-4 w-4" />
                          Info
                      </Button>

                      {/* Warning */}
                      <Button
                          className="gap-2 px-6 transition-all duration-300
      bg-orange-100 text-orange-700 hover:bg-orange-200
      dark:bg-orange-500/20 dark:text-orange-400 dark:hover:bg-orange-500/30"
                      >
                          <AlertTriangle className="h-4 w-4" />
                          Warning
                      </Button>

                      {/* Pink */}
                      <Button
                          className="gap-2 px-6 transition-all duration-300
      bg-pink-100 text-pink-700 hover:bg-pink-200
      dark:bg-pink-500/20 dark:text-pink-400 dark:hover:bg-pink-500/30"
                      >
                          <Heart className="h-4 w-4" />
                          Pink
                      </Button>

                      {/* Purple Rounded */}
                      <Button
                          className="gap-2 px-6 rounded-full transition-all duration-300
      bg-purple-100 text-purple-700 hover:bg-purple-200
      dark:bg-purple-500/20 dark:text-purple-400 dark:hover:bg-purple-500/30"
                      >
                          <Sparkles className="h-4 w-4" />
                          Rounded
                      </Button>

                  </div>
              </div>


              {/* Outline Version */}
              <div>
                  <p className="mb-3 text-lg font-medium text-muted-foreground">
                      Outline Buttons
                  </p>

                  <div className="flex flex-wrap gap-3">

                      {/* Primary */}
                      <Button
                          variant="outline"
                          className="gap-2 px-6 
      hover:bg-primary hover:text-primary-foreground
      dark:border-primary/40 dark:text-primary
      dark:hover:bg-primary dark:hover:text-primary-foreground"
                      >
                          <Home className="h-4 w-4" />
                          Primary
                      </Button>

                      {/* Success */}
                      <Button
                          variant="outline"
                          className="gap-2 px-6
      text-green-600 border-green-500 hover:bg-green-50
      dark:text-green-400 dark:border-green-500/40 dark:hover:bg-green-500/20"
                      >
                          <CheckCircle className="h-4 w-4" />
                          Success
                      </Button>

                      {/* Info */}
                      <Button
                          variant="outline"
                          className="gap-2 px-6
      text-blue-600 border-blue-500 hover:bg-blue-50
      dark:text-blue-400 dark:border-blue-500/40 dark:hover:bg-blue-500/20"
                      >
                          <Info className="h-4 w-4" />
                          Info
                      </Button>

                      {/* Warning */}
                      <Button
                          variant="outline"
                          className="gap-2 px-6
      text-orange-600 border-orange-500 hover:bg-orange-50
      dark:text-orange-400 dark:border-orange-500/40 dark:hover:bg-orange-500/20"
                      >
                          <AlertTriangle className="h-4 w-4" />
                          Warning
                      </Button>

                      {/* Pink Rounded */}
                      <Button
                          variant="outline"
                          className="gap-2 px-6 rounded-full
      text-pink-600 border-pink-500 hover:bg-pink-50
      dark:text-pink-400 dark:border-pink-500/40 dark:hover:bg-pink-500/20"
                      >
                          <Heart className="h-4 w-4" />
                          Rounded
                      </Button>

                  </div>
              </div>


        {/* Icon Only Light */}
        <div>
          <p className="mb-3 text-lg font-medium text-muted-foreground">
            Icon Only (Light & Outline)
          </p>

          <div className="flex flex-wrap gap-4">

            <Button
              size="icon"
              className="bg-green-100 text-green-700 hover:bg-green-200"
            >
              <CheckCircle className="h-4 w-4" />
            </Button>

            <Button
              size="icon"
              variant="outline"
              className="text-blue-600 border-blue-500 hover:bg-blue-50"
            >
              <Info className="h-4 w-4" />
            </Button>

            <Button
              size="icon"
              className="rounded-full bg-orange-100 text-orange-700 hover:bg-orange-200"
            >
              <AlertTriangle className="h-4 w-4" />
            </Button>

            <Button
              size="icon"
              variant="outline"
              className="rounded-full text-pink-600 border-pink-500 hover:bg-pink-50"
            >
              <Heart className="h-4 w-4" />
            </Button>

            {/* Gradient Icon Buttons */}

<Button
  size="icon"
  className="rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 text-white hover:opacity-90"
>
  <Sparkles className="h-4 w-4" />
</Button>

<Button
  size="icon"
  className="rounded-full bg-gradient-to-r from-green-400 to-emerald-600 text-white hover:opacity-90"
>
  <CheckCircle className="h-4 w-4" />
</Button>

<Button
  size="icon"
  className="rounded-full bg-gradient-to-r from-sky-400 to-blue-600 text-white hover:opacity-90"
>
  <Info className="h-4 w-4" />
</Button>

<Button
  size="icon"
  className="rounded-full bg-gradient-to-r from-orange-400 to-red-500 text-white hover:opacity-90"
>
  <AlertTriangle className="h-4 w-4" />
</Button>

<Button
  size="icon"
  className="rounded-full bg-gradient-to-r from-pink-500 to-rose-500 text-white hover:opacity-90"
>
  <Heart className="h-4 w-4" />
</Button>

<Button
  size="icon"
  className="rounded-full bg-gradient-to-r from-cyan-400 to-teal-500 text-white hover:opacity-90 shadow-lg shadow-teal-500/30"
>
  <Home className="h-4 w-4" />
</Button>


          </div>
        </div>

        {/* Gradient Buttons */}
<div>
  <p className="mb-3 text-lg font-medium text-muted-foreground">
    Gradient Buttons
  </p>

  <div className="flex flex-wrap gap-3">

    <Button className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white hover:opacity-90 gap-2 px-6">
      <Sparkles className="h-4 w-4" />
      Gradient
    </Button>

    <Button className="bg-gradient-to-r from-green-400 to-emerald-600 text-white hover:opacity-90 gap-2 px-6 rounded-full">
      <CheckCircle className="h-4 w-4" />
      Success
    </Button>

    <Button className="bg-gradient-to-r from-orange-400 to-red-500 text-white hover:opacity-90 gap-2 px-6">
      <AlertTriangle className="h-4 w-4" />
      Warning
    </Button>

    <Button className="bg-gradient-to-r from-pink-500 to-rose-500 text-white hover:opacity-90 gap-2 px-6">
  <Heart className="h-4 w-4" />
  Pink
</Button>

<Button className="bg-gradient-to-r from-sky-400 to-blue-600 text-white hover:opacity-90 gap-2 px-6">
  <Info className="h-4 w-4" />
  Info
</Button>

<Button className="bg-gradient-to-r from-cyan-400 to-teal-500 text-white hover:opacity-90 gap-2 px-6 rounded-full">
  <Home className="h-4 w-4" />
  Teal
</Button>

<Button className="bg-gradient-to-r from-yellow-400 via-orange-500 to-red-600 text-white hover:opacity-90 gap-2 px-6 shadow-lg shadow-orange-500/30">
  <Sparkles className="h-4 w-4" />
  Sunset
</Button>


  </div>
</div>
{/* Soft Shadow Buttons */}
<div>
  <p className="mb-3 text-lg font-medium text-muted-foreground">
    Soft Shadow Buttons
  </p>

  <div className="flex flex-wrap gap-3">

    <Button className="shadow-lg shadow-primary/20 gap-2 px-6">
      <Home className="h-4 w-4" />
      Elevated
    </Button>

    <Button className="bg-blue-600 text-white shadow-lg shadow-blue-500/30 hover:bg-blue-600 hover:shadow-blue-500/50 gap-2 px-6">
      <Info className="h-4 w-4" />
      Blue Shadow
    </Button>

    {/* Green Shadow */}
<Button className="bg-green-600 text-white shadow-lg shadow-green-500/30 hover:bg-green-600 hover:shadow-green-500/50 gap-2 px-6">
  <CheckCircle className="h-4 w-4" />
  Green Shadow
</Button>

{/* Red Shadow */}
<Button className="bg-red-600 text-white shadow-lg shadow-red-500/30 hover:bg-red-600 hover:shadow-red-500/50 gap-2 px-6">
  <AlertTriangle className="h-4 w-4" />
  Red Shadow
</Button>

{/* Purple Shadow */}
<Button className="bg-purple-600 text-white shadow-lg shadow-purple-500/30 hover:bg-purple-600 hover:shadow-purple-500/50 gap-2 px-6">
  <Sparkles className="h-4 w-4" />
  Purple Shadow
</Button>

{/* Pink Shadow */}
<Button className="bg-pink-600 text-white shadow-lg shadow-pink-500/30 hover:bg-pink-600 hover:shadow-pink-500/50 gap-2 px-6">
  <Heart className="h-4 w-4" />
  Pink Shadow
</Button>

{/* Indigo Shadow */}
<Button className="bg-indigo-600 text-white shadow-lg shadow-indigo-500/30 hover:bg-indigo-600 hover:shadow-indigo-500/50 gap-2 px-6">
  <Home className="h-4 w-4" />
  Indigo Shadow
</Button>

{/* Teal Shadow */}
<Button className="bg-teal-600 text-white shadow-lg shadow-teal-500/30 hover:bg-teal-600 hover:shadow-teal-500/50 gap-2 px-6">
  <Info className="h-4 w-4" />
  Teal Shadow
</Button>

{/* Amber Shadow */}
<Button className="bg-amber-500 text-white shadow-lg shadow-amber-400/30 hover:bg-amber-500 hover:shadow-amber-400/50 gap-2 px-6">
  <AlertTriangle className="h-4 w-4" />
  Amber Shadow
</Button>

{/* Cyan Shadow */}
<Button className="bg-cyan-600 text-white shadow-lg shadow-cyan-500/30 hover:bg-cyan-600 hover:shadow-cyan-500/50 gap-2 px-6">
  <Sparkles className="h-4 w-4" />
  Cyan Shadow
</Button>


  </div>
</div>
{/* Ghost Buttons */}
<div>
  <p className="mb-3 text-lg font-medium text-muted-foreground">
    Ghost Buttons
  </p>

  <div className="flex flex-wrap gap-3">

    <Button variant="ghost" className="gap-2 px-6">
      <Home className="h-4 w-4" />
      Ghost
    </Button>

    <Button variant="ghost" className="text-red-500 hover:bg-red-50 gap-2 px-6">
      <AlertTriangle className="h-4 w-4" />
      Danger
    </Button>

  </div>
</div>
{/* Loading Buttons */}
<div>
  <p className="mb-3 text-lg font-medium text-muted-foreground">
    Loading State
  </p>

  <div className="flex flex-wrap gap-3">

    <Button disabled className="gap-2 px-6">
      <svg
        className="h-4 w-4 animate-spin"
        viewBox="0 0 24 24"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
          fill="none"
        />
      </svg>
      Loading
    </Button>

    <Button disabled variant="outline" className="gap-2 px-6">
      Please Wait...
    </Button>

  </div>
</div>
{/* Icon Right */}
<div>
  <p className="mb-3 text-lg font-medium text-muted-foreground">
    Icon Right
  </p>

  <div className="flex flex-wrap gap-3">

    <Button className="gap-2 px-6">
      Continue
      <Sparkles className="h-4 w-4" />
    </Button>

    <Button variant="outline" className="gap-2 px-6">
      Learn More
      <Info className="h-4 w-4" />
    </Button>

  </div>
</div>
{/* Animated Hover */}
<div>
  <p className="mb-3 text-lg font-medium text-muted-foreground">
    Animated Hover
  </p>

  <div className="flex flex-wrap gap-3">

    <Button className="gap-2 px-6 transition-all duration-300 hover:scale-105 hover:shadow-xl">
      <Heart className="h-4 w-4" />
      Hover Me
    </Button>

    <Button className="gap-2 px-6 transition-all duration-300 hover:-translate-y-1">
      <Sparkles className="h-4 w-4" />
      Lift Effect
    </Button>

  </div>
</div>
{/* Glass Buttons */}
<div>
  <p className="mb-3 text-lg font-medium text-muted-foreground">
    Glass Style
  </p>

  <div className="flex flex-wrap gap-3">

    <Button className="backdrop-blur-md bg-white/30 border border-white/40 text-foreground gap-2 px-6">
      <Sparkles className="h-4 w-4" />
      Glass
    </Button>

    <Button className="rounded-full backdrop-blur-md bg-primary/20 border border-primary/30 gap-2 px-6">
      <CheckCircle className="h-4 w-4" />
      Pill Glass
    </Button>

  </div>
</div>


        

      </CardContent>
    </Card>
  )
}
