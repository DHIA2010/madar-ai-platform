import { redirect } from "next/navigation"

import { ROUTES } from "@/constants/routes"

// Creating a campaign is hidden until it can really publish to an ad platform (the form saves
// nothing). An old link or bookmark lands on the campaigns list instead.
export default function Page() {
  redirect(`${ROUTES.campaigns}/list`)
}
