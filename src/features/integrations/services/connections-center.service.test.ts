import { describe, expect, it } from "vitest"

import type { ConnectionCenterRecord } from "../types"
import {
  CONNECTOR_CATALOG,
  filterConnectionRecords,
  inferHealthState,
  loadStoredConnectionReferences,
  loadStoredConnectorAccounts,
  mergeCatalogWithRegistry,
  removeStoredConnectionReference,
  removeStoredConnectorAccounts,
  storeConnectionReferences,
  storeConnectorAccounts,
} from "./connections-center.service"

describe("connections center service storage", () => {
  it("removes deleted connection references and connector account registries", () => {
    localStorage.clear()

    storeConnectionReferences([
      {
        connectorDefinitionId: "connector_def_google_ads",
        connectionId: "conn_keep",
      },
      {
        connectorDefinitionId: "connector_def_google_ads",
        connectionId: "conn_delete",
      },
    ])
    storeConnectorAccounts({
      connector_def_google_ads: ["Google Ads Account", "Backup Account"],
    })

    const remainingReferences = removeStoredConnectionReference("conn_delete")
    expect(remainingReferences).toHaveLength(1)
    expect(loadStoredConnectionReferences()).toEqual([
      {
        connectorDefinitionId: "connector_def_google_ads",
        connectionId: "conn_keep",
      },
    ])

    const remainingAccounts = removeStoredConnectorAccounts("connector_def_google_ads")
    expect(remainingAccounts).toEqual({})
    expect(loadStoredConnectorAccounts()).toEqual({})
  })
})

function createRecord(overrides: Partial<ConnectionCenterRecord> = {}): ConnectionCenterRecord {
  return {
    connectorDefinitionId: "connector_def_google_ads",
    connectorId: "google_ads",
    platformName: "Google Ads",
    platformLogo: "GO",
    version: "1.0.0",
    capabilities: ["campaigns", "ads", "traffic"],
    workspaceName: "Madar Advertising",
    connectedAccount: "Google Ads Account",
    connectedAccounts: ["Google Ads Account"],
    connection: {
      connectionId: "conn_1",
      workspaceId: "ws_1",
      connectorId: "google_ads",
      connectorDefinitionId: "connector_def_google_ads",
      status: "connected",
      metadata: {},
      createdAt: "2026-06-19T00:00:00.000Z",
      updatedAt: "2026-06-19T00:00:00.000Z",
      accessToken: {
        value: "token",
        expiresAt: "2099-01-01T00:00:00.000Z",
      },
    },
    integrationStatus: {
      connection: {
        connectionId: "conn_1",
        workspaceId: "ws_1",
        connectorId: "google_ads",
        connectorDefinitionId: "connector_def_google_ads",
        status: "connected",
        metadata: {},
        createdAt: "2026-06-19T00:00:00.000Z",
        updatedAt: "2026-06-19T00:00:00.000Z",
      },
      recentEvents: [],
    },
    healthState: "Healthy",
    retryCount: 0,
    ...overrides,
  }
}

describe("connections center service", () => {
  it("filters records by search, status, health, platform, workspace, and capability", () => {
    const records = [
      createRecord(),
      createRecord({
        connectorDefinitionId: "connector_def_meta_ads",
        connectorId: "meta_ads",
        platformName: "Meta Ads",
        connectedAccount: "Meta Account",
        connectedAccounts: ["Meta Account", "Meta Account UK"],
        workspaceName: "Madar Growth",
        healthState: "Warning",
        capabilities: ["campaigns", "conversions"],
        connection: {
          ...createRecord().connection,
          connectionId: "conn_2",
          connectorDefinitionId: "connector_def_meta_ads",
          connectorId: "meta_ads",
          status: "paused",
        },
      }),
    ]

    const filtered = filterConnectionRecords(records, {
      search: "meta",
      status: "paused",
      health: "Warning",
      platform: "Meta Ads",
      workspace: "Madar Growth",
      capability: "conversions",
    })

    expect(filtered).toHaveLength(1)
    expect(filtered[0]?.platformName).toBe("Meta Ads")
  })

  it("maps health states from connection/sync conditions", () => {
    const connected = inferHealthState({
      connectionId: "c1",
      workspaceId: "w",
      connectorId: "salla",
      connectorDefinitionId: "connector_def_salla",
      status: "connected",
      metadata: {},
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      accessToken: { value: "a", expiresAt: "2099-01-01T00:00:00.000Z" },
    })

    const expired = inferHealthState({
      connectionId: "c2",
      workspaceId: "w",
      connectorId: "salla",
      connectorDefinitionId: "connector_def_salla",
      status: "connected",
      metadata: {},
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      accessToken: { value: "a", expiresAt: "2000-01-01T00:00:00.000Z" },
    })

    expect(connected).toBe("Healthy")
    expect(expired).toBe("Expired Token")
  })

  it("keeps built-in connector catalog and auto-merges registry entries", () => {
    const merged = mergeCatalogWithRegistry([
      {
        connectorDefinitionId: "connector_def_future_channel",
        connectorId: "future_channel",
      },
    ])

    expect(merged.length).toBeGreaterThanOrEqual(CONNECTOR_CATALOG.length)
    expect(
      merged.some((entry) => entry.connectorDefinitionId === "connector_def_future_channel")
    ).toBe(true)
  })
})
