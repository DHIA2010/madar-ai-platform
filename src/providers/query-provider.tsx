"use client"

import { useState } from "react"
import { QueryClientProvider } from "@tanstack/react-query"

import { createAppQueryClient } from "@/lib/query/query-client"

export default function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => createAppQueryClient())

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
