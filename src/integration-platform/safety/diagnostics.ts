import { validateConnectorManifest } from "./contracts"

export interface PlatformRegistrySnapshot {
  connectors: Array<{
    connectorId: string
    capabilities: string[]
  }>
  executionEngines: Array<{
    engineId: string
    registered: boolean
  }>
  plugins: Array<{
    pluginId: string
    manifest: unknown
  }>
  capabilities: Array<{
    connectorId: string
    capabilityKey: string
  }>
}

export interface PlatformDiagnosticCheck {
  name: string
  status: "pass" | "warn" | "fail"
  message: string
}

export interface PlatformDiagnosticReport {
  healthy: boolean
  checks: PlatformDiagnosticCheck[]
}

function uniqueCount(values: string[]) {
  return new Set(values).size
}

function buildCheck(name: string, status: PlatformDiagnosticCheck["status"], message: string) {
  return { name, status, message }
}

export function collectPlatformDiagnostics(
  snapshot: PlatformRegistrySnapshot
): PlatformDiagnosticReport {
  const connectorIds = snapshot.connectors.map((connector) => connector.connectorId)
  const engineIds = snapshot.executionEngines.map((engine) => engine.engineId)
  const pluginIds = snapshot.plugins.map((plugin) => plugin.pluginId)
  const capabilityKeys = snapshot.capabilities.map(
    (capability) => `${capability.connectorId}:${capability.capabilityKey}`
  )

  const checks: PlatformDiagnosticCheck[] = []

  checks.push(
    uniqueCount(connectorIds) === connectorIds.length
      ? buildCheck("registry consistency", "pass", "Connector registry identifiers are unique.")
      : buildCheck("registry consistency", "fail", "Duplicate connector identifiers were detected.")
  )

  checks.push(
    snapshot.executionEngines.length > 0 &&
      snapshot.executionEngines.every((engine) => engine.registered)
      ? buildCheck(
          "execution engine registration",
          "pass",
          "All execution engines are registered and available."
        )
      : buildCheck(
          "execution engine registration",
          "fail",
          "One or more execution engines are missing or unregistered."
        )
  )

  checks.push(
    snapshot.plugins.length > 0 && uniqueCount(pluginIds) === pluginIds.length
      ? buildCheck("plugin registration", "pass", "Plugins are registered with unique identifiers.")
      : buildCheck(
          "plugin registration",
          "fail",
          "Plugin registration is incomplete or duplicated."
        )
  )

  checks.push(
    snapshot.capabilities.length > 0 && uniqueCount(capabilityKeys) === capabilityKeys.length
      ? buildCheck("capability registration", "pass", "Capabilities are registered per connector.")
      : buildCheck(
          "capability registration",
          "fail",
          "Capability registration is incomplete or duplicated."
        )
  )

  const manifestValidity = snapshot.plugins.every(
    (plugin) => validateConnectorManifest(plugin.manifest).success
  )
  checks.push(
    manifestValidity
      ? buildCheck("manifest validity", "pass", "All connector manifests are structurally valid.")
      : buildCheck(
          "manifest validity",
          "fail",
          "One or more connector manifests failed validation."
        )
  )

  return {
    healthy: checks.every((check) => check.status === "pass"),
    checks,
  }
}
