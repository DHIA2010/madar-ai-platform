import { redirect } from "next/navigation"

import { ROUTES } from "@/constants/routes"

// The creative library is hidden until it holds real assets (it only showed samples).
// An old link or bookmark lands on the campaigns list instead.
export default function Page() {
  redirect(`${ROUTES.campaigns}/list`)
}
