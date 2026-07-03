import {
  connectorManifestSchema,
  type ConnectorManifest,
  type ManifestValidationIssue,
  type ManifestValidationResult,
} from "./contracts"
import { isSemver, isWithinVersionRange } from "./version"

export interface ConnectorManifestValidationOptions {
  currentPlatformVersion: string
  existingConnectorIds?: string[]
}

function pushIssue(
  issues: ManifestValidationIssue[],
  code: ManifestValidationIssue["code"],
  message: string,
  path?: string
) {
  issues.push({ code, message, path })
}

function detectDuplicates(values: string[]) {
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value)
    }
    seen.add(value)
  }
  return [...duplicates.values()]
}

function validateCapabilityConsistency(manifest: ConnectorManifest, issues: ManifestValidationIssue[]) {
  const declaredCapabilities = new Set(
    manifest.capabilities.filter((entry) => entry.enabled).map((entry) => entry.capabilityKey)
  )

  for (const operation of manifest.supportedOperations) {
    for (const capabilityKey of operation.supportedCapabilityKeys) {
      if (!declaredCapabilities.has(capabilityKey)) {
        pushIssue(
          issues,
          "capability_consistency",
          `Operation '${operation.operationId}' references undeclared or disabled capability '${capabilityKey}'.`,
          `supportedOperations.${operation.operationId}.supportedCapabilityKeys`
        )
      }
    }
  }
}

function validateMetadataConsistency(manifest: ConnectorManifest, issues: ManifestValidationIssue[]) {
  const objectIds = new Set(manifest.supportedObjects.map((entry) => entry.objectId))
  const operationIds = new Set(manifest.supportedOperations.map((entry) => entry.operationId))
  const eventIds = new Set(manifest.supportedEvents)
  const commandIds = new Set(manifest.supportedCommands)
  const workflowTypes = new Set<string>()
  for (const operation of manifest.supportedOperations) {
    for (const workflowType of operation.supportedWorkflowTypes) {
      workflowTypes.add(workflowType)
    }
  }

  for (const operation of manifest.supportedOperations) {
    if (operation.objectId && !objectIds.has(operation.objectId)) {
      pushIssue(
        issues,
        "metadata_consistency",
        `Operation '${operation.operationId}' references unknown object '${operation.objectId}'.`,
        `supportedOperations.${operation.operationId}.objectId`
      )
    }
    for (const eventId of operation.supportedEvents) {
      if (!eventIds.has(eventId)) {
        pushIssue(
          issues,
          "metadata_consistency",
          `Operation '${operation.operationId}' references unknown event '${eventId}'.`,
          `supportedOperations.${operation.operationId}.supportedEvents`
        )
      }
    }
    for (const commandId of operation.supportedCommands) {
      if (!commandIds.has(commandId)) {
        pushIssue(
          issues,
          "metadata_consistency",
          `Operation '${operation.operationId}' references unknown command '${commandId}'.`,
          `supportedOperations.${operation.operationId}.supportedCommands`
        )
      }
    }
  }

  for (const template of manifest.workflowTemplates) {
    if (!workflowTypes.has(template.workflowType)) {
      pushIssue(
        issues,
        "metadata_consistency",
        `Workflow template '${template.templateId}' references unsupported workflow type '${template.workflowType}'.`,
        `workflowTemplates.${template.templateId}.workflowType`
      )
    }
    for (const operationId of template.operationIds) {
      if (!operationIds.has(operationId)) {
        pushIssue(
          issues,
          "metadata_consistency",
          `Workflow template '${template.templateId}' references unknown operation '${operationId}'.`,
          `workflowTemplates.${template.templateId}.operationIds`
        )
      }
    }
    for (const eventId of template.eventIds) {
      if (!eventIds.has(eventId)) {
        pushIssue(
          issues,
          "metadata_consistency",
          `Workflow template '${template.templateId}' references unknown event '${eventId}'.`,
          `workflowTemplates.${template.templateId}.eventIds`
        )
      }
    }
    for (const commandId of template.commandIds) {
      if (!commandIds.has(commandId)) {
        pushIssue(
          issues,
          "metadata_consistency",
          `Workflow template '${template.templateId}' references unknown command '${commandId}'.`,
          `workflowTemplates.${template.templateId}.commandIds`
        )
      }
    }
  }
}

function validateVersionCompatibility(
  manifest: ConnectorManifest,
  currentPlatformVersion: string,
  issues: ManifestValidationIssue[]
) {
  const versions = [
    manifest.connectorVersion,
    manifest.sdkVersion,
    manifest.minimumPlatformVersion,
    manifest.maximumPlatformVersion,
    currentPlatformVersion,
  ]

  for (const version of versions) {
    if (!isSemver(version)) {
      pushIssue(
        issues,
        "version_incompatibility",
        `Version '${version}' is not a valid semver value. Expected format 'x.y.z'.`
      )
      return
    }
  }

  if (!isWithinVersionRange(currentPlatformVersion, manifest.minimumPlatformVersion, manifest.maximumPlatformVersion)) {
    pushIssue(
      issues,
      "version_incompatibility",
      `Connector '${manifest.connectorId}' requires platform version ${manifest.minimumPlatformVersion} - ${manifest.maximumPlatformVersion}, current is ${currentPlatformVersion}.`,
      "platformVersion"
    )
  }
}

export function validateConnectorManifest(
  input: unknown,
  options: ConnectorManifestValidationOptions
): ManifestValidationResult {
  const parsed = connectorManifestSchema.safeParse(input)
  const issues: ManifestValidationIssue[] = []

  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      pushIssue(issues, "required_fields", issue.message, issue.path.join("."))
    }
    return {
      ok: false,
      issues,
      manifest: null,
    }
  }

  const manifest = parsed.data
  const duplicateObjectIds = detectDuplicates(manifest.supportedObjects.map((entry) => entry.objectId))
  for (const duplicateObjectId of duplicateObjectIds) {
    pushIssue(
      issues,
      "duplicate_object_id",
      `Duplicate object id '${duplicateObjectId}' was found in supportedObjects.`,
      "supportedObjects"
    )
  }

  const duplicateOperationIds = detectDuplicates(manifest.supportedOperations.map((entry) => entry.operationId))
  for (const duplicateOperationId of duplicateOperationIds) {
    pushIssue(
      issues,
      "duplicate_operation_id",
      `Duplicate operation id '${duplicateOperationId}' was found in supportedOperations.`,
      "supportedOperations"
    )
  }

  const existingConnectorIds = new Set(options.existingConnectorIds ?? [])
  if (existingConnectorIds.has(manifest.connectorId)) {
    pushIssue(
      issues,
      "duplicate_connector_id",
      `Connector id '${manifest.connectorId}' is already registered.`,
      "connectorId"
    )
  }

  validateCapabilityConsistency(manifest, issues)
  validateMetadataConsistency(manifest, issues)
  validateVersionCompatibility(manifest, options.currentPlatformVersion, issues)

  return {
    ok: issues.length === 0,
    issues,
    manifest,
  }
}
