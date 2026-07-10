import { createContext, useContext, useEffect } from 'react'
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

export type Brokerage = {
  id: number
  name: string
  slug: string
  status?: string
  phone?: string
  website_url?: string
  logo_url?: string
  brand_primary_color?: string
  brand_accent_color?: string
  app_display_name?: string
  demo_data?: boolean
  compliance_disclaimer?: string
  settings?: Record<string, unknown>
}

type BrokerageContextValue = {
  brokerage: Brokerage | null
  isLoading: boolean
}

const BrokerageContext = createContext<BrokerageContextValue>({ brokerage: null, isLoading: true })

async function fetchBrokerageContext(): Promise<{ brokerage: Brokerage }> {
  const response = await fetch(`${API_URL}/api/v1/context`, {
    headers: { 'X-Brokerage-Host': window.location.hostname },
  })
  if (!response.ok) throw new Error('Unable to resolve brokerage context')
  return response.json()
}

export function BrokerageProvider({ children }: { children: ReactNode }) {
  const { data, isLoading } = useQuery({
    queryKey: ['brokerage-context', window.location.hostname],
    queryFn: fetchBrokerageContext,
    staleTime: 15 * 60 * 1000,
    retry: 1,
  })
  const brokerage = data?.brokerage ?? null

  useEffect(() => {
    const root = document.documentElement
    if (brokerage?.brand_primary_color) root.style.setProperty('--brand-primary', brokerage.brand_primary_color)
    if (brokerage?.brand_accent_color) root.style.setProperty('--brand-accent', brokerage.brand_accent_color)
    const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    if (themeColor && brokerage?.brand_primary_color) themeColor.content = brokerage.brand_primary_color
    if (brokerage?.app_display_name) document.title = `${brokerage.app_display_name} · Guam real estate`
  }, [brokerage])

  return <BrokerageContext.Provider value={{ brokerage, isLoading }}>{children}</BrokerageContext.Provider>
}

export function useBrokerageContext() {
  return useContext(BrokerageContext)
}
