import BasicRegisterPage from "./BasicRegisterPage"

import { SignUpFunnelTagManager } from "@/features/marketing-site/components/sign-up-funnel-tag-manager"

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  return (
    <>
      <SignUpFunnelTagManager searchParams={await searchParams} />
      <BasicRegisterPage />
    </>
  )
}
