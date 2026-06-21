"use client"

import {
  type MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Circle,
  CircleAlert,
  CircleCheckBig,
  Filter,
  Loader2,
  PlugZap,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import {
  AppBadge,
  AppButton,
  AppCard,
  AppContainer,
  AppInput,
  AppPage,
  AppSection,
} from "@/components/app"

import { useWorkspace, WorkspaceSelector } from "@/features/workspace"

import { useConnectionsCenter } from "../hooks"
import {
  appendConnectorAccount,
  CONNECTOR_CATALOG,
  getDefaultTimezone,
  loadStoredConnectionReferences,
  storeConnectionReferences,
} from "../services"

import { useApplicationServices } from "@/application/context"

type PlatformCategory = "All" | "Marketing" | "Analytics" | "Ecommerce"
type WizardStep = 0 | 1 | 2 | 3

type SyncPreset = "recommended" | "all" | "custom"
type SetupMode = "oauth" | "manual"
type FlowStatus =
  | "idle"
  | "connecting"
  | "authorizing"
  | "fetching_accounts"
  | "almost_done"
  | "finalizing"
type ErrorKind =
  | "authorization_cancelled"
  | "permission_denied"
  | "token_expired"
  | "network_timeout"
  | "generic"

interface PlatformDetails {
  category: PlatformCategory
  description: string
  connectionType: string
  authMethod: string
  permissions: string[]
  capabilities: string[]
  accountLabel: string
  accountDescription: string
  resourceTypeLabel: string
  syncFrequency: string
  estimatedDuration: string
  recommendedObjects: string[]
  allObjects: string[]
  accounts: Array<{ id: string; label: string; description: string }>
}

interface WizardErrorState {
  kind: ErrorKind
  title: string
  description: string
}

const WIZARD_STEPS: Array<{ label: string; description: string }> = [
  { label: "Platform", description: "Pick the connector." },
  { label: "Connect", description: "Authorize securely." },
  { label: "Import", description: "Select what to sync." },
  { label: "Review", description: "Review and create." },
]

const PLATFORM_CATEGORIES: PlatformCategory[] = ["All", "Marketing", "Analytics", "Ecommerce"]

const PLATFORM_DETAILS: Record<string, PlatformDetails> = {
  Salla: {
    category: "Ecommerce",
    description: "Sync products, orders, and customer records from your store.",
    connectionType: "Commerce connector",
    authMethod: "OAuth",
    permissions: ["Orders", "Products", "Customers"],
    capabilities: ["Products", "Orders", "Customers", "Catalog"],
    accountLabel: "Store",
    accountDescription: "Choose the Salla store that should connect to MADAR.",
    resourceTypeLabel: "Store",
    syncFrequency: "Every 30 minutes",
    estimatedDuration: "1-2 minutes",
    recommendedObjects: ["Products", "Orders", "Customers"],
    allObjects: ["Products", "Orders", "Customers", "Inventory", "Catalog"],
    accounts: [
      { id: "salla-store-a", label: "Store A", description: "Primary storefront" },
      { id: "salla-store-b", label: "Store B", description: "Regional store" },
      { id: "salla-store-c", label: "Store C", description: "Wholesale store" },
    ],
  },
  Zid: {
    category: "Ecommerce",
    description: "Bring store activity, product updates, and customer records together.",
    connectionType: "Commerce connector",
    authMethod: "OAuth",
    permissions: ["Orders", "Products", "Customers"],
    capabilities: ["Products", "Orders", "Customers", "Catalog"],
    accountLabel: "Store",
    accountDescription: "Choose the Zid store that should sync into MADAR.",
    resourceTypeLabel: "Store",
    syncFrequency: "Every 30 minutes",
    estimatedDuration: "1-2 minutes",
    recommendedObjects: ["Products", "Orders", "Customers"],
    allObjects: ["Products", "Orders", "Customers", "Inventory", "Catalog"],
    accounts: [
      { id: "zid-store-a", label: "Store A", description: "Primary storefront" },
      { id: "zid-store-b", label: "Store B", description: "Retail branch" },
      { id: "zid-store-c", label: "Store C", description: "B2B catalog" },
    ],
  },
  "Google Analytics 4": {
    category: "Analytics",
    description: "Capture traffic, events, and conversions for customer insight.",
    connectionType: "Read-only analytics connector",
    authMethod: "OAuth",
    permissions: ["Traffic", "Events", "Conversions"],
    capabilities: ["Traffic", "Events", "Conversions"],
    accountLabel: "Property",
    accountDescription: "Select the GA4 property that should feed your workspace.",
    resourceTypeLabel: "Property",
    syncFrequency: "Every 15 minutes",
    estimatedDuration: "Under 90 seconds",
    recommendedObjects: ["Traffic", "Events", "Conversions"],
    allObjects: ["Traffic", "Events", "Conversions", "Page Views", "Funnels"],
    accounts: [
      { id: "ga4-property-a", label: "Property A", description: "Primary analytics property" },
      { id: "ga4-property-b", label: "Property B", description: "Brand site property" },
      { id: "ga4-property-c", label: "Property C", description: "Marketplace property" },
    ],
  },
  "Meta Ads": {
    category: "Marketing",
    description: "Sync campaign, ad, and conversion data from Meta.",
    connectionType: "Marketing platform connector",
    authMethod: "OAuth",
    permissions: ["Campaigns", "Ads", "Conversions"],
    capabilities: ["Campaigns", "Ads", "Traffic", "Events", "Conversions"],
    accountLabel: "Business or Ad Account",
    accountDescription: "Choose the Meta business or ad account to import from.",
    resourceTypeLabel: "Account",
    syncFrequency: "Every 15 minutes",
    estimatedDuration: "Under 90 seconds",
    recommendedObjects: ["Campaigns", "Ads", "Conversions"],
    allObjects: ["Campaigns", "Ads", "Conversions", "Traffic", "Audience Insights"],
    accounts: [
      { id: "meta-business-a", label: "Business A", description: "Primary business manager" },
      { id: "meta-ad-account-a", label: "Ad Account A", description: "Performance ad account" },
      { id: "meta-ad-account-b", label: "Ad Account B", description: "Retargeting ad account" },
    ],
  },
  "Google Ads": {
    category: "Marketing",
    description: "Import paid media performance and conversion signals.",
    connectionType: "Marketing platform connector",
    authMethod: "OAuth",
    permissions: ["Campaigns", "Ads", "Conversions"],
    capabilities: ["Campaigns", "Ads", "Traffic", "Events", "Conversions"],
    accountLabel: "Account",
    accountDescription: "Select the Google Ads account that should connect to MADAR.",
    resourceTypeLabel: "Account",
    syncFrequency: "Every 15 minutes",
    estimatedDuration: "Under 90 seconds",
    recommendedObjects: ["Campaigns", "Ads", "Conversions"],
    allObjects: ["Campaigns", "Ads", "Conversions", "Traffic", "Search Terms"],
    accounts: [
      { id: "google-ads-1", label: "Account 1", description: "Primary search account" },
      { id: "google-ads-2", label: "Account 2", description: "Brand account" },
      { id: "google-ads-3", label: "Account 3", description: "Shopping account" },
    ],
  },
  "TikTok Ads": {
    category: "Marketing",
    description: "Connect campaign and audience performance from TikTok Ads.",
    connectionType: "Marketing platform connector",
    authMethod: "OAuth",
    permissions: ["Campaigns", "Ads", "Conversions"],
    capabilities: ["Campaigns", "Ads", "Traffic", "Events", "Conversions"],
    accountLabel: "Account",
    accountDescription: "Choose the TikTok Ads account to sync into MADAR.",
    resourceTypeLabel: "Account",
    syncFrequency: "Every 15 minutes",
    estimatedDuration: "Under 90 seconds",
    recommendedObjects: ["Campaigns", "Ads", "Conversions"],
    allObjects: ["Campaigns", "Ads", "Conversions", "Traffic", "Audience"],
    accounts: [
      { id: "tiktok-account-a", label: "Account A", description: "Primary ad account" },
      { id: "tiktok-account-b", label: "Account B", description: "Growth account" },
    ],
  },
  "Snapchat Ads": {
    category: "Marketing",
    description: "Sync ad delivery and conversion performance from Snapchat.",
    connectionType: "Marketing platform connector",
    authMethod: "OAuth",
    permissions: ["Campaigns", "Ads", "Conversions"],
    capabilities: ["Campaigns", "Ads", "Traffic", "Events", "Conversions"],
    accountLabel: "Account",
    accountDescription: "Choose the Snapchat Ads account to import from.",
    resourceTypeLabel: "Account",
    syncFrequency: "Every 15 minutes",
    estimatedDuration: "Under 90 seconds",
    recommendedObjects: ["Campaigns", "Ads", "Conversions"],
    allObjects: ["Campaigns", "Ads", "Conversions", "Traffic", "Pixel Events"],
    accounts: [
      { id: "snapchat-account-a", label: "Account A", description: "Primary account" },
      { id: "snapchat-account-b", label: "Account B", description: "Campaign account" },
    ],
  },
}

function getCategoryForConnector(displayName: string): PlatformCategory {
  return PLATFORM_DETAILS[displayName]?.category ?? "Marketing"
}

function getConnectorIcon(label: string) {
  return label
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

function ConnectorLogo({ label }: { label: string }) {
  return (
    <div className="flex size-14 items-center justify-center rounded-2xl bg-background/80 text-sm font-semibold tracking-wider shadow-sm ring-1 ring-border/70">
      {getConnectorIcon(label)}
    </div>
  )
}

function StepDot({ state }: { state: "done" | "active" | "todo" }) {
  if (state === "done") {
    return <Check className="size-3.5" />
  }

  if (state === "active") {
    return <Circle className="size-3.5 fill-current" />
  }

  return <Circle className="size-3.5" />
}

function SyncChip({
  active,
  children,
  onClick,
}: {
  active: boolean
  children: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={cn(
        "rounded-full border px-4 py-2 text-sm font-medium",
        WIZARD_INTERACTION_CLASS,
        active
          ? "border-sky-300 bg-sky-500/15 text-sky-100 shadow-[0_0_0_4px_rgba(14,165,233,0.12)] hover:border-sky-200 hover:bg-sky-500/20 hover:text-sky-50"
          : "border-border/70 bg-background/80 text-muted-foreground hover:border-sky-200 hover:bg-muted/60 hover:text-foreground"
      )}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function errorMeta(kind: ErrorKind): WizardErrorState {
  switch (kind) {
    case "authorization_cancelled":
      return {
        kind,
        title: "Authorization cancelled",
        description: "The provider closed the OAuth session before access was granted.",
      }
    case "permission_denied":
      return {
        kind,
        title: "Permission denied",
        description:
          "The connected account did not grant the permissions MADAR needs to sync data.",
      }
    case "token_expired":
      return {
        kind,
        title: "Token expired",
        description: "The OAuth token is no longer valid. Reconnect the platform to continue.",
      }
    case "network_timeout":
      return {
        kind,
        title: "Network timeout",
        description:
          "The connection took too long to respond. Try again when the network is stable.",
      }
    default:
      return {
        kind,
        title: "Connection setup failed",
        description:
          "Something interrupted the setup flow. You can retry or choose a different account.",
      }
  }
}

function inferErrorKind(message: string): ErrorKind {
  const normalized = message.toLowerCase()
  if (normalized.includes("cancel")) return "authorization_cancelled"
  if (normalized.includes("permission")) return "permission_denied"
  if (normalized.includes("token")) return "token_expired"
  if (normalized.includes("timeout") || normalized.includes("network")) return "network_timeout"
  return "generic"
}

const LOADING_STAGES: Record<Exclude<FlowStatus, "idle" | "finalizing">, string> = {
  connecting: "Connecting...",
  authorizing: "Authorizing...",
  fetching_accounts: "Fetching accounts...",
  almost_done: "Almost done...",
}

const ACCOUNT_FALLBACK = {
  id: "account-default",
  label: "Primary account",
  description: "The account selected by the provider.",
}

const WIZARD_INTERACTION_CLASS =
  "cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none"

function useDocumentDirection() {
  const subscribe = useCallback((callback: () => void) => {
    if (typeof document === "undefined") {
      return () => undefined
    }

    const observer = new MutationObserver((mutations) => {
      if (
        mutations.some(
          (mutation) => mutation.type === "attributes" && mutation.attributeName === "dir"
        )
      ) {
        callback()
      }
    })

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["dir"],
    })

    return () => observer.disconnect()
  }, [])

  const getSnapshot = useCallback(
    () => (document.documentElement.dir === "rtl" ? "rtl" : "ltr"),
    []
  )
  const getServerSnapshot = useCallback(() => "ltr" as const, [])

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

export function NewConnectionWizard() {
  const router = useRouter()
  const { refetch } = useConnectionsCenter()
  const { connectionManager } = useApplicationServices()
  const { currentWorkspace } = useWorkspace()
  const documentDirection = useDocumentDirection()

  const [stepIndex, setStepIndex] = useState<WizardStep>(0)
  const [selectedCategory, setSelectedCategory] = useState<PlatformCategory>("All")
  const [selectedConnectorDefinitionId, setSelectedConnectorDefinitionId] = useState(
    CONNECTOR_CATALOG[0]?.connectorDefinitionId ?? ""
  )
  const [flowStatus, setFlowStatus] = useState<FlowStatus>("idle")
  const [errorState, setErrorState] = useState<WizardErrorState | null>(null)
  const [retryTarget, setRetryTarget] = useState<"connect" | "finalize" | null>(null)
  const [draftConnectionId, setDraftConnectionId] = useState<string | null>(null)
  const [selectedObjects, setSelectedObjects] = useState<string[]>([])
  const [syncPreset, setSyncPreset] = useState<SyncPreset>("recommended")
  const [setupMode, setSetupMode] = useState<SetupMode>("oauth")
  const [apiKey, setApiKey] = useState("")
  const [clientSecret, setClientSecret] = useState("")
  const [manualCredentials, setManualCredentials] = useState("")
  const [connectionName, setConnectionName] = useState("")
  const [healthMonitoringEnabled, setHealthMonitoringEnabled] = useState(true)
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(true)
  const [isRunningFirstSync, setIsRunningFirstSync] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)

  const workspaceId = currentWorkspace?.id ?? null
  const workspaceLabel = currentWorkspace?.name ?? "Madar Workspace"

  const selectedConnector = useMemo(
    () =>
      CONNECTOR_CATALOG.find(
        (entry) => entry.connectorDefinitionId === selectedConnectorDefinitionId
      ),
    [selectedConnectorDefinitionId]
  )

  const selectedConnectorDetails = selectedConnector
    ? PLATFORM_DETAILS[selectedConnector.displayName]
    : undefined

  const filteredConnectors = useMemo(() => {
    if (selectedCategory === "All") {
      return CONNECTOR_CATALOG
    }

    return CONNECTOR_CATALOG.filter(
      (connector) => getCategoryForConnector(connector.displayName) === selectedCategory
    )
  }, [selectedCategory])

  const availableAccounts = useMemo(
    () => (selectedConnector ? (selectedConnectorDetails?.accounts ?? [ACCOUNT_FALLBACK]) : []),
    [selectedConnector, selectedConnectorDetails]
  )
  const selectedAccount =
    availableAccounts.find((account) => account.id === selectedAccountId) ??
    availableAccounts[0] ??
    ACCOUNT_FALLBACK
  const selectedObjectsSet = useMemo(() => new Set(selectedObjects), [selectedObjects])

  const recommendedObjects = useMemo(
    () => selectedConnectorDetails?.recommendedObjects ?? [],
    [selectedConnectorDetails]
  )
  const allObjects = useMemo(
    () => selectedConnectorDetails?.allObjects ?? [],
    [selectedConnectorDetails]
  )

  useEffect(() => {
    if (!selectedConnector) {
      setSelectedObjects([])
      setConnectionName("")
      setSyncPreset("recommended")
      return
    }

    setSelectedObjects((current) => {
      if (current.length > 0) {
        return current.filter((item) => allObjects.includes(item))
      }
      return recommendedObjects.length > 0 ? recommendedObjects : allObjects.slice(0, 3)
    })
    setSelectedAccountId((current) => current ?? availableAccounts[0]?.id ?? ACCOUNT_FALLBACK.id)
    setConnectionName((current) => current || `${selectedConnector.displayName} Connection`)
  }, [availableAccounts, allObjects, recommendedObjects, selectedConnector])

  useEffect(() => {
    if (!selectedConnectorDetails) {
      return
    }

    const nextPreset =
      syncPreset === "all"
        ? allObjects
        : syncPreset === "recommended"
          ? recommendedObjects
          : selectedObjects
    if (syncPreset !== "custom") {
      setSelectedObjects(nextPreset.length > 0 ? nextPreset : recommendedObjects)
    }
  }, [allObjects, recommendedObjects, selectedConnectorDetails, selectedObjects, syncPreset])

  const completedSteps = stepIndex
  const progressPercent = stepIndex === 3 ? 100 : Math.round((stepIndex / 3) * 100)
  const estimatedMinutesLeft = Math.max(0, 4 - stepIndex)

  const resetError = useCallback(() => {
    setErrorState(null)
    setRetryTarget(null)
  }, [])

  const initializeImportSelection = useCallback(
    (preset: SyncPreset) => {
      if (!selectedConnectorDetails) {
        return
      }

      if (preset === "all") {
        setSelectedObjects(selectedConnectorDetails.allObjects)
        return
      }

      if (preset === "recommended") {
        setSelectedObjects(selectedConnectorDetails.recommendedObjects)
        return
      }
    },
    [selectedConnectorDetails]
  )

  const beginOAuthFlow = useCallback(async () => {
    if (!selectedConnector || !selectedConnectorDetails || !workspaceId) {
      return
    }

    resetError()
    setRetryTarget("connect")
    setFlowStatus("connecting")

    try {
      const references = loadStoredConnectionReferences()
      const existingReference = references.find(
        (entry) => entry.connectorDefinitionId === selectedConnector.connectorDefinitionId
      )

      let connectionId = existingReference?.connectionId

      if (!connectionId) {
        const created = await connectionManager.createConnection({
          workspaceId,
          connectorDefinitionId: selectedConnector.connectorDefinitionId,
          connectorId: selectedConnector.connectorId,
          metadata: {
            accountName: selectedAccount.label,
            workspaceName: workspaceLabel,
            connectionName,
          },
          ...(setupMode === "manual"
            ? {
                credential: {
                  type: "api_key" as const,
                  payload: {
                    apiKey,
                    clientSecret,
                    manualCredentials,
                  },
                },
              }
            : {}),
        })

        connectionId = created.connectionId
        storeConnectionReferences([
          ...references,
          {
            connectorDefinitionId: selectedConnector.connectorDefinitionId,
            connectionId: created.connectionId,
          },
        ])
      }

      if (!connectionId) {
        throw new Error("Connection id missing after OAuth initialization")
      }

      setDraftConnectionId(connectionId)
      setFlowStatus("authorizing")
      await new Promise((resolve) => window.setTimeout(resolve, 260))

      const connected = await connectionManager.connect({
        connectionId,
        authorizationCode: `${selectedConnector.connectorId}_oauth_code`,
      })

      appendConnectorAccount(selectedConnector.connectorDefinitionId, selectedAccount.label)

      setDraftConnectionId(connected.connectionId)
      setFlowStatus("fetching_accounts")
      await new Promise((resolve) => window.setTimeout(resolve, 260))
      setFlowStatus("almost_done")
      await new Promise((resolve) => window.setTimeout(resolve, 220))

      setStepIndex(2)
      setSyncPreset("recommended")
      setIsSuccess(false)
      initializeImportSelection("recommended")
      setErrorState(null)
      setRetryTarget(null)
      setFlowStatus("idle")
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const kind = inferErrorKind(message)
      setErrorState(errorMeta(kind))
      setRetryTarget("connect")
      setFlowStatus("idle")
    }
  }, [
    apiKey,
    clientSecret,
    connectionManager,
    connectionName,
    initializeImportSelection,
    manualCredentials,
    resetError,
    selectedAccount.label,
    selectedConnector,
    selectedConnectorDetails,
    setupMode,
    workspaceId,
    workspaceLabel,
  ])

  const finalizeConnection = useCallback(async () => {
    if (!selectedConnector || !draftConnectionId) {
      return
    }

    resetError()
    setRetryTarget("finalize")
    setFlowStatus("finalizing")

    try {
      await connectionManager.scheduleSync({
        connectionId: draftConnectionId,
        cron: "*/30 * * * *",
        timezone: getDefaultTimezone(),
        enabled: true,
      })
      setAutoSyncEnabled(true)
      setHealthMonitoringEnabled(true)
      setStepIndex(3)
      setIsSuccess(true)
      setFlowStatus("idle")
      await refetch()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const kind = inferErrorKind(message)
      setErrorState(errorMeta(kind))
      setRetryTarget("finalize")
      setFlowStatus("idle")
    }
  }, [connectionManager, draftConnectionId, refetch, resetError, selectedConnector])

  const handleContinue = useCallback(async () => {
    if (errorState) {
      return
    }

    if (stepIndex === 0) {
      if (!selectedConnectorDefinitionId) {
        return
      }
      setStepIndex(1)
      return
    }

    if (stepIndex === 1) {
      await beginOAuthFlow()
      return
    }

    if (stepIndex === 2) {
      if (selectedObjects.length === 0) {
        return
      }
      setStepIndex(3)
      return
    }

    if (stepIndex === 3) {
      await finalizeConnection()
    }
  }, [
    beginOAuthFlow,
    errorState,
    finalizeConnection,
    selectedConnectorDefinitionId,
    selectedObjects.length,
    stepIndex,
  ])

  const goToPreviousStep = useCallback(() => {
    if (flowStatus !== "idle") {
      return
    }

    setErrorState(null)
    setRetryTarget(null)
    setIsSuccess(false)

    setStepIndex((current) => (current > 0 ? ((current - 1) as WizardStep) : current))
  }, [flowStatus])

  const handlePreviousClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.preventDefault()
      event.stopPropagation()
      goToPreviousStep()
    },
    [goToPreviousStep]
  )

  const exitWizard = useCallback(() => {
    router.push(ROUTES.integrations)
  }, [router])

  const handlePlatformToggle = useCallback((connectorDefinitionId: string) => {
    setErrorState(null)
    setRetryTarget(null)
    setSelectedConnectorDefinitionId((current) =>
      current === connectorDefinitionId ? "" : connectorDefinitionId
    )
    setStepIndex(0)
    setDraftConnectionId(null)
    setFlowStatus("idle")
    setSelectedObjects([])
    setSyncPreset("recommended")
    setIsSuccess(false)
  }, [])

  const handleRetry = useCallback(() => {
    if (retryTarget === "connect") {
      void beginOAuthFlow()
      return
    }

    if (retryTarget === "finalize") {
      void finalizeConnection()
    }
  }, [beginOAuthFlow, finalizeConnection, retryTarget])

  const toggleObjectSelection = useCallback((value: string) => {
    setSelectedObjects((current) => {
      if (current.includes(value)) {
        return current.filter((item) => item !== value)
      }

      return [...current, value]
    })
    setSyncPreset("custom")
  }, [])

  const selectPreset = useCallback(
    (preset: SyncPreset) => {
      setSyncPreset(preset)
      initializeImportSelection(preset)
    },
    [initializeImportSelection]
  )

  const goToImportStep = useCallback(() => {
    setErrorState(null)
    setRetryTarget(null)
    setStepIndex(2)
  }, [])

  const goToConnections = useCallback(() => {
    router.push(ROUTES.integrations)
  }, [router])

  const runFirstSync = useCallback(async () => {
    if (!draftConnectionId) {
      return
    }

    setIsRunningFirstSync(true)
    try {
      await connectionManager.runSync({ connectionId: draftConnectionId, trigger: "manual" })
    } finally {
      setIsRunningFirstSync(false)
    }
  }, [connectionManager, draftConnectionId])

  const isContinueDisabled =
    flowStatus !== "idle" ||
    (stepIndex === 0 && !selectedConnectorDefinitionId) ||
    (stepIndex === 2 && selectedObjects.length === 0)

  const currentStepState = (index: WizardStep) => {
    if (stepIndex > index) return "done"
    if (stepIndex === index) return "active"
    return "todo"
  }

  const renderTopProgress = () => (
    <div className="space-y-2 rounded-[28px] border bg-gradient-to-br from-background via-background to-muted/20 p-6 shadow-sm md:p-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border bg-background/80 px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm">
            <Sparkles className="size-3.5 text-indigo-600" />
            New Connection
          </div>
          <div className="space-y-2">
            <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">New Connection</h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
              Connect a platform in four guided steps with OAuth-first setup and streamlined
              onboarding.
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[460px]">
          <div className="rounded-2xl border bg-background/80 p-4 shadow-sm">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Current Step
            </p>
            <p className="mt-1 text-lg font-semibold">{WIZARD_STEPS[stepIndex].label}</p>
          </div>
          <div className="rounded-2xl border bg-background/80 p-4 shadow-sm">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Completed Steps
            </p>
            <p className="mt-1 text-lg font-semibold">{completedSteps}</p>
          </div>
          <div className="rounded-2xl border bg-background/80 p-4 shadow-sm">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Estimated Time Left
            </p>
            <p className="mt-1 text-lg font-semibold">
              {estimatedMinutesLeft < 1 ? "Less than 1 min" : `${estimatedMinutesLeft} min`}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>Connection Progress</span>
          <span>{progressPercent}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-sky-500 to-cyan-500 transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-5">
        {WIZARD_STEPS.map((step, index) => {
          const state = currentStepState(index as WizardStep)
          return (
            <div
              key={step.label}
              className={cn(
                "flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-medium transition-all",
                state === "done"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : state === "active"
                    ? "border-sky-200 bg-sky-50 text-sky-700 shadow-[0_0_0_4px_rgba(14,165,233,0.10)]"
                    : "border-border/70 bg-background/70 text-muted-foreground"
              )}
            >
              <StepDot state={state} />
              <div className="min-w-0">
                <div className="truncate">{step.label}</div>
                <div className="text-[11px] font-normal opacity-80">{step.description}</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )

  const renderPlatformStep = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Filter className="size-4" />
        Choose a platform
      </div>
      <div className="flex flex-wrap gap-2">
        {PLATFORM_CATEGORIES.map((category) => (
          <button
            key={category}
            type="button"
            className={cn(
              "rounded-full border px-4 py-2 text-sm font-medium",
              WIZARD_INTERACTION_CLASS,
              selectedCategory === category
                ? "border-sky-300 bg-sky-500/15 text-sky-100 shadow-[0_0_0_4px_rgba(14,165,233,0.12)] hover:border-sky-200 hover:bg-sky-500/20 hover:text-sky-50"
                : "border-border/70 bg-background/80 text-muted-foreground hover:border-sky-200 hover:bg-muted/60 hover:text-foreground"
            )}
            onClick={() => setSelectedCategory(category)}
          >
            {category}
          </button>
        ))}
      </div>

      {selectedConnector ? (
        <AppCard className="border-border/70 bg-card/95 shadow-sm">
          <div className="flex items-start gap-3 p-4">
            <ConnectorLogo label={selectedConnector.displayName} />
            <div className="min-w-0 flex-1 space-y-3">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Selected Platform
                </p>
                <h3 className="mt-1 text-base font-semibold">{selectedConnector.displayName}</h3>
                <p className="text-sm text-muted-foreground">
                  {selectedConnectorDetails?.description}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <div className="rounded-xl bg-muted/40 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Authentication
                  </p>
                  <p className="mt-1 text-sm font-medium">{selectedConnectorDetails?.authMethod}</p>
                </div>
                <div className="rounded-xl bg-muted/40 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Connection Type
                  </p>
                  <p className="mt-1 text-sm font-medium">
                    {selectedConnectorDetails?.connectionType}
                  </p>
                </div>
                <div className="rounded-xl bg-muted/40 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Permissions Preview
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {selectedConnectorDetails?.permissions.map((permission) => (
                      <span
                        key={permission}
                        className="rounded-full bg-background px-2 py-0.5 text-[11px] font-medium text-foreground/80"
                      >
                        {permission}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="sm:col-span-2 xl:col-span-3 rounded-xl bg-muted/40 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Capabilities
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {selectedConnector.capabilities.slice(0, 4).map((capability) => (
                      <span
                        key={capability}
                        className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-medium text-indigo-800"
                      >
                        {capability}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </AppCard>
      ) : null}

      <div className="grid auto-rows-fr gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {filteredConnectors.map((connector) => {
          const details = PLATFORM_DETAILS[connector.displayName]
          const selected = connector.connectorDefinitionId === selectedConnectorDefinitionId

          return (
            <button
              key={connector.connectorDefinitionId}
              type="button"
              className={cn(
                "group relative flex h-full min-h-[180px] flex-col rounded-[24px] border p-4 text-left shadow-sm",
                WIZARD_INTERACTION_CLASS,
                selected
                  ? "border-sky-400 bg-slate-950 text-slate-50 shadow-[0_0_0_1px_rgba(59,130,246,0.45),0_0_28px_rgba(59,130,246,0.18)] hover:border-sky-300 hover:bg-slate-900"
                  : "border-border/70 bg-background/80 hover:border-sky-200 hover:bg-muted/50"
              )}
              onClick={() => handlePlatformToggle(connector.connectorDefinitionId)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <ConnectorLogo label={connector.displayName} />
                  <div>
                    <div
                      className={cn(
                        "text-base font-semibold",
                        selected ? "text-slate-50" : "text-foreground"
                      )}
                    >
                      {connector.displayName}
                    </div>
                    <p
                      className={cn(
                        "text-xs",
                        selected ? "text-slate-300" : "text-muted-foreground"
                      )}
                    >
                      {details.description}
                    </p>
                  </div>
                </div>
                {selected ? (
                  <div className="flex size-7 items-center justify-center rounded-full bg-sky-500 text-white shadow-sm">
                    <Check className="size-4" />
                  </div>
                ) : null}
              </div>

              <div className="mt-4 flex flex-wrap gap-1.5">
                <AppBadge
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px]",
                    selected ? "bg-sky-500/15 text-sky-100" : "bg-sky-100 text-sky-800"
                  )}
                >
                  {details.category}
                </AppBadge>
                <AppBadge
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px]",
                    selected
                      ? "bg-emerald-500/15 text-emerald-100"
                      : "bg-emerald-100 text-emerald-800"
                  )}
                >
                  OAuth
                </AppBadge>
                <AppBadge
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px]",
                    selected ? "bg-violet-500/15 text-violet-100" : "bg-violet-100 text-violet-800"
                  )}
                >
                  {details.connectionType}
                </AppBadge>
              </div>

              <div
                className={cn(
                  "mt-4 space-y-2 text-xs",
                  selected ? "text-slate-300" : "text-muted-foreground"
                )}
              >
                <div
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-xl px-3 py-2",
                    selected ? "bg-white/5" : "bg-muted/35"
                  )}
                >
                  <span>Capabilities</span>
                  <span
                    className={cn("font-medium", selected ? "text-slate-100" : "text-foreground")}
                  >
                    {connector.capabilities.length}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {connector.capabilities.slice(0, 4).map((capability) => (
                    <span
                      key={capability}
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px] font-medium ring-1",
                        selected
                          ? "bg-white/5 text-slate-100 ring-white/10"
                          : "bg-background text-foreground/80 ring-border/70"
                      )}
                    >
                      {capability}
                    </span>
                  ))}
                </div>
                <div
                  className={cn(
                    "flex items-center justify-between gap-2 border-t pt-2",
                    selected ? "border-white/10" : ""
                  )}
                >
                  <span>Permissions</span>
                  <span
                    className={cn("font-medium", selected ? "text-slate-100" : "text-foreground")}
                  >
                    {details.permissions.join(", ")}
                  </span>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )

  const renderConnectStep = () => {
    if (!selectedConnector || !selectedConnectorDetails) {
      return (
        <AppCard className="border-border/70 bg-card/95 p-6 shadow-sm">
          <div className="space-y-3 text-center">
            <CircleAlert className="mx-auto size-10 text-muted-foreground" />
            <h3 className="text-lg font-semibold">Choose a platform first</h3>
            <p className="text-sm text-muted-foreground">
              Select a connector on the previous step to start the OAuth flow.
            </p>
          </div>
        </AppCard>
      )
    }

    return (
      <div className="space-y-4">
        {flowStatus !== "idle" ? (
          <AppCard className="border-sky-200 bg-sky-500/10 p-5 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-sky-500/15 text-sky-100">
                <Loader2 className="size-5 animate-spin" />
              </div>
              <div className="flex-1 space-y-2">
                <p className="text-[11px] uppercase tracking-wide text-sky-100/80">
                  OAuth callback
                </p>
                <h3 className="text-lg font-semibold text-slate-50">
                  {LOADING_STAGES[flowStatus as Exclude<FlowStatus, "idle" | "finalizing">]}
                </h3>
                <p className="text-sm text-sky-100/80">
                  MADAR is finishing the secure handoff for {selectedConnector.displayName}.
                </p>
              </div>
            </div>
          </AppCard>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <div className="space-y-4 rounded-[24px] border bg-gradient-to-br from-background via-background to-muted/30 p-5 shadow-sm">
            <div className="space-y-3">
              <p className="text-sm font-medium text-muted-foreground">OAuth onboarding</p>
              <div className="space-y-2">
                <h4 className="text-xl font-semibold">
                  Connect your {selectedConnector.displayName} account securely using OAuth.
                </h4>
                <p className="text-sm leading-6 text-muted-foreground">
                  You will be redirected to {selectedConnector.displayName}. Approve access. MADAR
                  returns automatically. No passwords are stored.
                </p>
              </div>
            </div>

            <div className="rounded-[20px] border bg-background/75 p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
                <span className="rounded-full border bg-background px-3 py-1 text-foreground">
                  MADAR
                </span>
                <ArrowRight className="size-4" />
                <span className="rounded-full border bg-background px-3 py-1 text-foreground">
                  Redirect
                </span>
                <ArrowRight className="size-4" />
                <span className="rounded-full border bg-background px-3 py-1 text-foreground">
                  Provider login
                </span>
                <ArrowRight className="size-4" />
                <span className="rounded-full border bg-background px-3 py-1 text-foreground">
                  Approve permissions
                </span>
                <ArrowRight className="size-4" />
                <span className="rounded-full border bg-background px-3 py-1 text-foreground">
                  Back to MADAR
                </span>
              </div>
            </div>

            <div className="rounded-[24px] border border-sky-200 bg-sky-500/8 p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 size-5 text-sky-500" />
                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-semibold text-foreground">Connection Summary</p>
                    <p className="text-sm leading-6 text-muted-foreground">
                      A structured onboarding summary with only the setup details users need.
                    </p>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="rounded-2xl bg-background/75 p-3">
                      <p className="text-[11px] text-muted-foreground">Platform</p>
                      <p className="mt-1 text-sm font-medium">{selectedConnector.displayName}</p>
                    </div>
                    <div className="rounded-2xl bg-background/75 p-3">
                      <p className="text-[11px] text-muted-foreground">Authentication</p>
                      <p className="mt-1 text-sm font-medium">OAuth 2.0</p>
                    </div>
                    <div className="rounded-2xl bg-background/75 p-3">
                      <p className="text-[11px] text-muted-foreground">Workspace</p>
                      <p className="mt-1 text-sm font-medium">{workspaceLabel}</p>
                    </div>
                    <div className="rounded-2xl bg-background/75 p-3 sm:col-span-2">
                      <p className="text-[11px] text-muted-foreground">Permissions</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {selectedConnectorDetails.permissions.map((permission) => (
                          <span
                            key={permission}
                            className="rounded-full border bg-background px-2.5 py-1 text-[11px] font-medium text-foreground/80"
                          >
                            ✓ {permission}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-2xl bg-background/75 p-3">
                      <p className="text-[11px] text-muted-foreground">Estimated setup</p>
                      <p className="mt-1 text-sm font-medium">&lt; 30 sec</p>
                    </div>
                    <div className="rounded-2xl bg-background/75 p-3">
                      <p className="text-[11px] text-muted-foreground">Estimated first sync</p>
                      <p className="mt-1 text-sm font-medium">1-2 min</p>
                    </div>
                    <div className="rounded-2xl bg-background/75 p-3 sm:col-span-2">
                      <p className="text-[11px] text-muted-foreground">Connection type</p>
                      <p className="mt-1 text-sm font-medium">
                        {selectedConnectorDetails.connectionType}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-background/75 p-3 sm:col-span-2">
                      <p className="text-[11px] text-muted-foreground">Accounts</p>
                      <div className="mt-2 space-y-2">
                        <div className="flex flex-wrap gap-2">
                          {availableAccounts.map((account) => (
                            <button
                              key={account.id}
                              type="button"
                              className={cn(
                                "rounded-full border px-2.5 py-1 text-[11px] font-medium",
                                WIZARD_INTERACTION_CLASS,
                                selectedAccount.id === account.id
                                  ? "border-sky-300 bg-sky-500/15 text-sky-100"
                                  : "border-border/70 bg-background text-foreground/80"
                              )}
                              onClick={() => setSelectedAccountId(account.id)}
                            >
                              {account.label}
                            </button>
                          ))}
                        </div>
                        <AppButton
                          size="sm"
                          variant="outline"
                          className="h-8"
                          onClick={() =>
                            setSelectedAccountId(availableAccounts[0]?.id ?? ACCOUNT_FALLBACK.id)
                          }
                        >
                          Add another account
                        </AppButton>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl bg-background/75 p-3 text-sm leading-6 text-muted-foreground">
                    No passwords are stored. OAuth keeps the connection secure and MADAR handles the
                    return flow automatically.
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3 rounded-[24px] border bg-background/60 p-5 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground/90">
              <PlugZap className="size-4 text-indigo-600" />
              Connection Details
            </div>

            <details className="group rounded-2xl border border-border/70 bg-background/85 px-4 py-3 transition-all duration-200">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium outline-none transition-all duration-200 hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background">
                <span>OAuth Information</span>
                <ChevronRight className="size-4 transition-transform group-open:rotate-90" />
              </summary>
              <div className="mt-3 text-sm leading-6 text-muted-foreground">
                Secure redirect flow with automatic return to MADAR.
              </div>
            </details>

            <details className="group rounded-2xl border border-border/70 bg-background/85 px-4 py-3 transition-all duration-200">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium outline-none transition-all duration-200 hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background">
                <span>Workspace</span>
                <ChevronRight className="size-4 transition-transform group-open:rotate-90" />
              </summary>
              <div className="mt-3 text-sm leading-6 text-muted-foreground">
                {workspaceLabel} · {workspaceId}
              </div>
            </details>

            <details className="group rounded-2xl border border-border/70 bg-background/85 px-4 py-3 transition-all duration-200">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium outline-none transition-all duration-200 hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background">
                <span>Imported Objects</span>
                <ChevronRight className="size-4 transition-transform group-open:rotate-90" />
              </summary>
              <div className="mt-3 flex flex-wrap gap-2 text-sm text-muted-foreground">
                {(selectedObjects.length > 0
                  ? selectedObjects
                  : selectedConnectorDetails.capabilities.slice(0, 3)
                ).map((item: string) => (
                  <AppBadge
                    key={item}
                    className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] text-sky-800"
                  >
                    {item}
                  </AppBadge>
                ))}
              </div>
            </details>

            <details
              className="group rounded-2xl border border-border/70 bg-background/85 px-4 py-3 transition-all duration-200"
              open={false}
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium outline-none transition-all duration-200 hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background">
                <span>Sync Frequency</span>
                <ChevronRight className="size-4 transition-transform group-open:rotate-90" />
              </summary>
              <div className="mt-3 text-sm leading-6 text-muted-foreground">
                {selectedConnectorDetails.syncFrequency}
              </div>
            </details>

            <details className="group rounded-2xl border border-border/70 bg-background/85 px-4 py-3 transition-all duration-200">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium outline-none transition-all duration-200 hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background">
                <span>Advanced setup</span>
                <ChevronRight className="size-4 transition-transform group-open:rotate-90" />
              </summary>
              <div className="mt-4 space-y-3">
                <AppInput
                  label="API Key"
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                />
                <AppInput
                  label="Client Secret"
                  value={clientSecret}
                  onChange={(event) => setClientSecret(event.target.value)}
                />
                <AppInput
                  label="Manual credentials"
                  value={manualCredentials}
                  onChange={(event) => setManualCredentials(event.target.value)}
                />
                <button
                  type="button"
                  className={cn(
                    "rounded-full border px-3 py-2 text-xs font-medium",
                    WIZARD_INTERACTION_CLASS,
                    setupMode === "manual"
                      ? "border-sky-300 bg-sky-500/15 text-sky-100 hover:border-sky-200 hover:bg-sky-500/20 hover:text-sky-50"
                      : "border-border/70 bg-background text-muted-foreground hover:border-sky-200 hover:bg-muted/60 hover:text-foreground"
                  )}
                  onClick={() =>
                    setSetupMode((current) => (current === "oauth" ? "manual" : "oauth"))
                  }
                >
                  {setupMode === "oauth" ? "Switch to manual setup" : "Use OAuth only"}
                </button>
              </div>
            </details>
          </div>
        </div>
      </div>
    )
  }

  const renderImportStep = () => {
    if (!selectedConnectorDetails) {
      return null
    }

    return (
      <div className="space-y-4">
        <div className="rounded-[24px] border bg-card/95 p-5 shadow-sm">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Import configuration
          </p>
          <h3 className="mt-1 text-2xl font-semibold">Choose what MADAR should import</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Use a recommended set, import everything, or build a custom selection.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <SyncChip
            active={syncPreset === "recommended"}
            onClick={() => selectPreset("recommended")}
          >
            Recommended
          </SyncChip>
          <SyncChip active={syncPreset === "all"} onClick={() => selectPreset("all")}>
            Select All
          </SyncChip>
          <SyncChip active={syncPreset === "custom"} onClick={() => setSyncPreset("custom")}>
            Custom
          </SyncChip>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {allObjects.map((object) => {
            const selected = selectedObjectsSet.has(object)
            return (
              <button
                key={object}
                type="button"
                className={cn(
                  "rounded-[18px] border px-4 py-3 text-left text-sm font-medium",
                  WIZARD_INTERACTION_CLASS,
                  selected
                    ? "border-sky-400 bg-sky-500/12 text-sky-100 shadow-[0_0_0_4px_rgba(14,165,233,0.12)] hover:border-sky-300 hover:bg-sky-500/18 hover:text-sky-50"
                    : "border-border/70 bg-background/80 text-foreground/80 hover:border-sky-200 hover:bg-muted/50"
                )}
                onClick={() => toggleObjectSelection(object)}
              >
                <div className="flex items-center justify-between gap-3">
                  <span>{object}</span>
                  {selected ? <Check className="size-4 text-sky-300" /> : null}
                </div>
              </button>
            )
          })}
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border bg-background/70 p-4">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Estimated sync frequency
            </p>
            <p className="mt-1 text-lg font-semibold">{selectedConnectorDetails.syncFrequency}</p>
          </div>
          <div className="rounded-2xl border bg-background/70 p-4">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Estimated duration
            </p>
            <p className="mt-1 text-lg font-semibold">
              {selectedConnectorDetails.estimatedDuration}
            </p>
          </div>
          <div className="rounded-2xl border bg-background/70 p-4">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Preset</p>
            <p className="mt-1 text-lg font-semibold">
              {syncPreset === "custom"
                ? "Custom"
                : syncPreset === "all"
                  ? "All objects"
                  : "Recommended"}
            </p>
          </div>
        </div>
      </div>
    )
  }

  const renderReviewStep = () => {
    if (!selectedConnector || !selectedConnectorDetails) {
      return null
    }

    return (
      <div className="space-y-4">
        <div className="rounded-[24px] border bg-card/95 p-5 shadow-sm">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Review
          </p>
          <h3 className="mt-1 text-2xl font-semibold">Review your connection before creating it</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Everything here stays within the existing connection manager and OAuth lifecycle.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[
            { label: "Platform", value: selectedConnector.displayName },
            { label: "Workspace", value: workspaceLabel },
            { label: "Account", value: selectedAccount.label },
            { label: "Connection name", value: connectionName },
            { label: "Authentication", value: selectedConnectorDetails.authMethod },
            { label: "Sync frequency", value: selectedConnectorDetails.syncFrequency },
            { label: "Health monitoring", value: healthMonitoringEnabled ? "Enabled" : "Disabled" },
            { label: "Automatic sync", value: autoSyncEnabled ? "Enabled" : "Disabled" },
          ].map((item) => (
            <div key={item.label} className="rounded-2xl border bg-background/70 p-4">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {item.label}
              </p>
              <p className="mt-1 text-sm font-medium">{item.value}</p>
            </div>
          ))}
        </div>

        <div className="rounded-[24px] border bg-background/70 p-5">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Objects</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {selectedObjects.map((object) => (
              <AppBadge
                key={object}
                className="rounded-full bg-indigo-100 px-3 py-1 text-[11px] text-indigo-800"
              >
                {object}
              </AppBadge>
            ))}
          </div>
        </div>
      </div>
    )
  }

  const renderSuccessStep = () => {
    if (!selectedConnector) {
      return null
    }

    return (
      <div className="space-y-5 rounded-[28px] border bg-card/95 p-6 text-center shadow-sm md:p-8">
        <div className="mx-auto flex size-24 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400 shadow-[0_0_0_10px_rgba(16,185,129,0.08)]">
          <CircleCheckBig className="size-12 animate-pulse" />
        </div>
        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">Success</p>
          <h3 className="text-3xl font-semibold">{selectedConnector.displayName} Connected</h3>
          <p className="mx-auto max-w-2xl text-sm leading-6 text-muted-foreground">
            Health monitoring {healthMonitoringEnabled ? "enabled" : "disabled"}. Automatic sync{" "}
            {autoSyncEnabled ? "enabled" : "disabled"}.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border bg-background/70 p-4 text-left">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Health Monitoring
            </p>
            <p className="mt-1 text-lg font-semibold">
              {healthMonitoringEnabled ? "Enabled" : "Disabled"}
            </p>
          </div>
          <div className="rounded-2xl border bg-background/70 p-4 text-left">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Automatic Sync
            </p>
            <p className="mt-1 text-lg font-semibold">{autoSyncEnabled ? "Enabled" : "Disabled"}</p>
          </div>
          <div className="rounded-2xl border bg-background/70 p-4 text-left">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Estimated First Sync
            </p>
            <p className="mt-1 text-lg font-semibold">1-2 minutes</p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <Link href={ROUTES.integrations}>
            <AppButton
              variant="outline"
              className={cn("h-11 w-full rounded-2xl px-5", WIZARD_INTERACTION_CLASS)}
            >
              Go to Connections
            </AppButton>
          </Link>
          <AppButton
            className={cn(
              "h-11 rounded-2xl px-5",
              WIZARD_INTERACTION_CLASS,
              "hover:border-primary/40 hover:bg-primary/90 hover:shadow-lg"
            )}
            disabled={isRunningFirstSync}
            onClick={() => void runFirstSync()}
          >
            {isRunningFirstSync ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCcw className="size-4" />
            )}
            Run First Sync
          </AppButton>
          <AppButton
            variant="outline"
            className={cn("h-11 rounded-2xl px-5", WIZARD_INTERACTION_CLASS)}
            onClick={goToConnections}
          >
            Finish
          </AppButton>
        </div>
      </div>
    )
  }

  const renderErrorCard = () => {
    if (!errorState) {
      return null
    }

    return (
      <AppCard className="border border-rose-200 bg-rose-500/10 p-5 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-rose-500/15 text-rose-200">
            <CircleAlert className="size-5" />
          </div>
          <div className="flex-1 space-y-4">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-rose-100/80">
                Connection error
              </p>
              <h3 className="mt-1 text-lg font-semibold text-rose-50">{errorState.title}</h3>
              <p className="mt-1 text-sm text-rose-100/80">{errorState.description}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <AppButton
                className={cn(
                  "h-10 rounded-xl px-4",
                  WIZARD_INTERACTION_CLASS,
                  "hover:border-primary/40 hover:bg-primary/90 hover:shadow-lg"
                )}
                onClick={handleRetry}
              >
                Retry
              </AppButton>
              <AppButton
                variant="outline"
                className={cn("h-10 rounded-xl px-4", WIZARD_INTERACTION_CLASS)}
                onClick={goToImportStep}
              >
                Back to import setup
              </AppButton>
              <AppButton
                variant="outline"
                className={cn("h-10 rounded-xl px-4", WIZARD_INTERACTION_CLASS)}
                onClick={handlePreviousClick}
              >
                Back
              </AppButton>
            </div>
          </div>
        </div>
      </AppCard>
    )
  }

  const renderStepContent = () => {
    if (errorState) {
      return renderErrorCard()
    }

    if (stepIndex === 0) return renderPlatformStep()
    if (stepIndex === 1) return renderConnectStep()
    if (stepIndex === 2) return renderImportStep()
    if (stepIndex === 3) return isSuccess ? renderSuccessStep() : renderReviewStep()
    return renderSuccessStep()
  }

  const footerPrimaryLabel =
    stepIndex === 0
      ? `Continue to ${selectedConnector?.displayName ?? "platform"}`
      : stepIndex === 1
        ? "Continue to OAuth"
        : stepIndex === 2
          ? "Review Configuration"
          : stepIndex === 3
            ? "Create Connection"
            : "Continue"

  const footerPrimaryAction =
    stepIndex === 1 ? beginOAuthFlow : stepIndex === 3 ? finalizeConnection : handleContinue

  const footerPrimaryDisabled =
    flowStatus !== "idle" ||
    isContinueDisabled ||
    isSuccess ||
    (stepIndex === 1 && !selectedConnector) ||
    (stepIndex === 3 && !draftConnectionId)

  if (!currentWorkspace) {
    return (
      <AppPage>
        <AppContainer>
          <AppSection>
            <AppCard
              title="Create your first workspace before adding connections."
              subtitle="Connection onboarding now requires an active workspace context."
              state="empty"
              className="border-border/70 bg-card/95"
            >
              <div className="pt-2">
                <WorkspaceSelector
                  managerMode
                  triggerLabel="Create Workspace"
                  triggerAriaLabel="Create workspace from workspace manager"
                />
              </div>
            </AppCard>
          </AppSection>
        </AppContainer>
      </AppPage>
    )
  }

  return (
    <AppPage>
      <AppContainer>
        <AppSection>{renderTopProgress()}</AppSection>

        <AppSection>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-6">
              <AppCard className="overflow-hidden border-border/70 bg-card/95 shadow-sm">
                <div className="border-b bg-muted/20 px-5 py-4 md:px-6">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        Step {stepIndex + 1} of {WIZARD_STEPS.length}
                      </p>
                      <h2 className="mt-1 text-xl font-semibold">
                        {WIZARD_STEPS[stepIndex].label}
                      </h2>
                    </div>

                    <div className="flex items-center gap-2">
                      {WIZARD_STEPS.map((step, index) => {
                        const state =
                          index < stepIndex ? "done" : index === stepIndex ? "active" : "todo"
                        return (
                          <div
                            key={step.label}
                            className={cn(
                              "flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-medium transition-all",
                              state === "done"
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : state === "active"
                                  ? "border-sky-200 bg-sky-50 text-sky-700 shadow-[0_0_0_4px_rgba(99,102,241,0.10)]"
                                  : "border-border/70 bg-background text-muted-foreground"
                            )}
                          >
                            <StepDot state={state} />
                            <span>{step.label}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>

                <div className="space-y-6 p-5 md:p-6">{renderStepContent()}</div>

                <div className="sticky bottom-0 border-t bg-background/95 px-4 py-3 backdrop-blur md:px-5">
                  <div className="flex items-center gap-3">
                    <AppButton
                      className={cn(
                        "h-10 min-w-[190px] rounded-xl px-4 text-sm shadow-sm",
                        WIZARD_INTERACTION_CLASS,
                        "hover:border-primary/40 hover:bg-primary/90 hover:shadow-lg"
                      )}
                      disabled={footerPrimaryDisabled}
                      onClick={() => void footerPrimaryAction()}
                    >
                      <span
                        className={cn(
                          "flex w-full items-center justify-center gap-2",
                          documentDirection === "rtl" && "flex-row-reverse"
                        )}
                      >
                        <span className="truncate">{footerPrimaryLabel}</span>
                        {documentDirection === "rtl" ? (
                          <ArrowLeft className="size-4 shrink-0" />
                        ) : (
                          <ArrowRight className="size-4 shrink-0" />
                        )}
                      </span>
                    </AppButton>

                    <div className="flex-1" />

                    <div className="flex items-center gap-3">
                      <AppButton
                        variant="outline"
                        className={cn(
                          "h-10 min-w-[190px] rounded-xl border-border/60 bg-background/70 px-4 text-sm text-muted-foreground",
                          WIZARD_INTERACTION_CLASS,
                          "hover:bg-muted/60 hover:text-foreground"
                        )}
                        disabled={stepIndex === 0 || flowStatus !== "idle"}
                        onClick={handlePreviousClick}
                      >
                        <span
                          className={cn(
                            "flex items-center justify-center gap-2",
                            documentDirection === "rtl" && "flex-row-reverse"
                          )}
                        >
                          {documentDirection === "rtl" ? (
                            <ArrowRight className="size-4 shrink-0" />
                          ) : (
                            <ArrowLeft className="size-4 shrink-0" />
                          )}
                          <span>Previous</span>
                        </span>
                      </AppButton>
                      <AppButton
                        variant="ghost"
                        className={cn(
                          "h-10 rounded-xl px-4 text-sm text-muted-foreground",
                          WIZARD_INTERACTION_CLASS,
                          "hover:bg-muted/60 hover:text-foreground"
                        )}
                        onClick={exitWizard}
                      >
                        Cancel
                      </AppButton>
                    </div>
                  </div>
                </div>
              </AppCard>
            </div>

            <div className="space-y-4">
              <AppCard className="border-border/70 bg-card/90 shadow-sm lg:sticky lg:top-6">
                <div className="flex items-center gap-2 border-b px-5 py-4">
                  <ShieldCheck className="size-4 text-indigo-600" />
                  <h3 className="text-sm font-semibold text-foreground/80">Setup Checklist</h3>
                </div>
                <div className="space-y-3 p-5 text-sm">
                  {[
                    "Select a platform",
                    "Authorize OAuth access",
                    "Choose import objects",
                    "Review and create",
                  ].map((item, index) => (
                    <div
                      key={item}
                      className="flex items-center gap-3 rounded-2xl border bg-background/70 px-4 py-3 transition-all duration-200 hover:-translate-y-0.5"
                    >
                      <div
                        className={cn(
                          "flex size-7 items-center justify-center rounded-full transition-colors",
                          index <= stepIndex
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        {index <= stepIndex ? <Check className="size-3.5" /> : index + 1}
                      </div>
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </AppCard>

              <AppCard className="border-border/70 bg-card/90 shadow-sm">
                <div className="flex items-center gap-2 border-b px-5 py-4">
                  <PlugZap className="size-4 text-indigo-600" />
                  <h3 className="text-sm font-semibold text-foreground/80">Connection Details</h3>
                </div>
                <div className="space-y-2 p-4 text-sm">
                  {[
                    {
                      title: "OAuth Information",
                      body: "OAuth authorization is used for the selected platform.",
                    },
                    {
                      title: "Workspace context",
                      body: workspaceLabel,
                    },
                    {
                      title: "Import Objects",
                      body: (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {(selectedObjects.length > 0
                            ? selectedObjects
                            : (selectedConnectorDetails?.recommendedObjects ?? [])
                          ).map((item) => (
                            <AppBadge
                              key={item}
                              className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] text-sky-800"
                            >
                              {item}
                            </AppBadge>
                          ))}
                        </div>
                      ),
                    },
                    {
                      title: "Expected Sync Frequency",
                      body: selectedConnectorDetails?.syncFrequency ?? "Every 30 minutes",
                    },
                  ].map((section, index) => (
                    <details
                      key={section.title}
                      className="group rounded-2xl border bg-background/75 px-4 py-3 transition-all duration-200 open:bg-background/90"
                      open={index === 0}
                    >
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium outline-none">
                        <span>{section.title}</span>
                        <ChevronRight className="size-4 transition-transform group-open:rotate-90" />
                      </summary>
                      <div className="mt-3 text-sm leading-6 text-muted-foreground">
                        {section.body}
                      </div>
                    </details>
                  ))}
                </div>
              </AppCard>
            </div>
          </div>
        </AppSection>
      </AppContainer>
    </AppPage>
  )
}
