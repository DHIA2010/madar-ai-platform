import { redirect } from "next/navigation"

import { ROUTES } from "@/constants/routes"

// Campaign templates are hidden until they exist (the page only showed placeholders).
// An old link or bookmark lands on the campaigns list instead.
export default function Page() {
  redirect(`${ROUTES.campaigns}/list`)
}
