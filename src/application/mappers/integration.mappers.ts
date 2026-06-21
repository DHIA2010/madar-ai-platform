import type {
  Connection,
  ConnectionReadModel,
  ConnectionViewModel,
  ConnectorHealth,
  ConnectorHealthReadModel,
  ConnectorHealthViewModel,
  IntegrationReadModel,
  IntegrationStatusDto,
  IntegrationViewModel,
  SyncHistoryDto,
  SyncHistoryReadModel,
  SyncHistoryViewModel,
  SyncRun,
  SyncStatusReadModel,
  SyncStatusViewModel,
} from "../contracts"
import { createReadModel } from "../read-models"

export function mapIntegrationStatusToReadModel(
  payload: IntegrationStatusDto
): IntegrationReadModel {
  return createReadModel({
    id: `integration-status:${payload.connection.connectionId}`,
    owner: "integrations",
    sourceDomains: ["integrations"],
    payload,
  })
}

export function mapIntegrationReadModelToViewModel(
  readModel: IntegrationReadModel
): IntegrationViewModel {
  return {
    id: readModel.id,
    freshness: readModel.freshness,
    payload: readModel.payload,
  }
}

export function mapConnectionToReadModel(payload: Connection): ConnectionReadModel {
  return createReadModel({
    id: `connection:${payload.connectionId}`,
    owner: "integrations",
    sourceDomains: ["integrations"],
    payload,
  })
}

export function mapConnectionReadModelToViewModel(
  readModel: ConnectionReadModel
): ConnectionViewModel {
  return {
    id: readModel.id,
    freshness: readModel.freshness,
    payload: readModel.payload,
  }
}

export function mapSyncHistoryToReadModel(payload: SyncHistoryDto): SyncHistoryReadModel {
  return createReadModel({
    id: `sync-history:${payload.connectionId}`,
    owner: "integrations",
    sourceDomains: ["integrations"],
    payload,
  })
}

export function mapSyncHistoryReadModelToViewModel(
  readModel: SyncHistoryReadModel
): SyncHistoryViewModel {
  return {
    id: readModel.id,
    freshness: readModel.freshness,
    payload: readModel.payload,
  }
}

export function mapSyncRunToReadModel(payload: SyncRun): SyncStatusReadModel {
  return createReadModel({
    id: `sync-status:${payload.syncJobId}:${payload.syncRunId}`,
    owner: "integrations",
    sourceDomains: ["integrations"],
    payload,
  })
}

export function mapSyncStatusReadModelToViewModel(
  readModel: SyncStatusReadModel
): SyncStatusViewModel {
  return {
    id: readModel.id,
    freshness: readModel.freshness,
    payload: readModel.payload,
  }
}

export function mapConnectorHealthToReadModel(payload: ConnectorHealth): ConnectorHealthReadModel {
  return createReadModel({
    id: `connector-health:${payload.connectorId}`,
    owner: "integrations",
    sourceDomains: ["integrations"],
    payload,
  })
}

export function mapConnectorHealthReadModelToViewModel(
  readModel: ConnectorHealthReadModel
): ConnectorHealthViewModel {
  return {
    id: readModel.id,
    freshness: readModel.freshness,
    payload: readModel.payload,
  }
}
