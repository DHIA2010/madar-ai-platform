import type {
  AuthorizeConnectorRequestDto,
  ConnectionViewModel,
  ConnectorHealthViewModel,
  CreateConnectionRequestDto,
  DisconnectConnectionRequestDto,
  DeleteConnectionRequestDto,
  GetConnectorHealthRequestDto,
  GetIntegrationStatusRequestDto,
  GetSyncHistoryRequestDto,
  IntegrationGateway,
  IntegrationViewModel,
  PauseSyncRequestDto,
  RefreshConnectionRequestDto,
  ResumeSyncRequestDto,
  RetrySyncRequestDto,
  RunSyncRequestDto,
  ScheduleSyncRequestDto,
  SyncHistoryViewModel,
  SyncStatusViewModel,
  ValidateConnectionRequestDto,
} from "../contracts"
import {
  AuthorizeConnectorUseCase,
  CreateConnectionUseCase,
  DisconnectConnectionUseCase,
  DeleteConnectionUseCase,
  GetConnectorHealthUseCase,
  GetIntegrationStatusUseCase,
  GetSyncHistoryUseCase,
  PauseSyncUseCase,
  RefreshConnectionUseCase,
  ResumeSyncUseCase,
  RetrySyncUseCase,
  RunSyncUseCase,
  ScheduleSyncUseCase,
  ValidateConnectionUseCase,
} from "../use-cases"
import { mapConnectionReadModelToViewModel, mapConnectionToReadModel } from "../mappers"

export class IntegrationApplicationService {
  private readonly gateway: IntegrationGateway
  private readonly createConnectionUseCase: CreateConnectionUseCase
  private readonly validateConnectionUseCase: ValidateConnectionUseCase
  private readonly authorizeConnectorUseCase: AuthorizeConnectorUseCase
  private readonly refreshConnectionUseCase: RefreshConnectionUseCase
  private readonly disconnectConnectionUseCase: DisconnectConnectionUseCase
  private readonly deleteConnectionUseCase: DeleteConnectionUseCase
  private readonly runSyncUseCase: RunSyncUseCase
  private readonly scheduleSyncUseCase: ScheduleSyncUseCase
  private readonly retrySyncUseCase: RetrySyncUseCase
  private readonly pauseSyncUseCase: PauseSyncUseCase
  private readonly resumeSyncUseCase: ResumeSyncUseCase
  private readonly getIntegrationStatusUseCase: GetIntegrationStatusUseCase
  private readonly getSyncHistoryUseCase: GetSyncHistoryUseCase
  private readonly getConnectorHealthUseCase: GetConnectorHealthUseCase

  constructor(gateway: IntegrationGateway) {
    this.gateway = gateway
    this.createConnectionUseCase = new CreateConnectionUseCase(gateway)
    this.validateConnectionUseCase = new ValidateConnectionUseCase(gateway)
    this.authorizeConnectorUseCase = new AuthorizeConnectorUseCase(gateway)
    this.refreshConnectionUseCase = new RefreshConnectionUseCase(gateway)
    this.disconnectConnectionUseCase = new DisconnectConnectionUseCase(gateway)
    this.deleteConnectionUseCase = new DeleteConnectionUseCase(gateway)
    this.runSyncUseCase = new RunSyncUseCase(gateway)
    this.scheduleSyncUseCase = new ScheduleSyncUseCase(gateway)
    this.retrySyncUseCase = new RetrySyncUseCase(gateway)
    this.pauseSyncUseCase = new PauseSyncUseCase(gateway)
    this.resumeSyncUseCase = new ResumeSyncUseCase(gateway)
    this.getIntegrationStatusUseCase = new GetIntegrationStatusUseCase(gateway)
    this.getSyncHistoryUseCase = new GetSyncHistoryUseCase(gateway)
    this.getConnectorHealthUseCase = new GetConnectorHealthUseCase(gateway)
  }

  createConnection(input: CreateConnectionRequestDto): Promise<ConnectionViewModel> {
    return this.createConnectionUseCase.execute(input)
  }

  async recoverConnections(): Promise<ConnectionViewModel[]> {
    const recovered = await this.gateway.recoverConnections?.()
    if (!recovered || recovered.length === 0) {
      return []
    }

    return recovered.map((connection) =>
      mapConnectionReadModelToViewModel(mapConnectionToReadModel(connection))
    )
  }

  validateConnection(input: ValidateConnectionRequestDto): Promise<ConnectionViewModel> {
    return this.validateConnectionUseCase.execute(input)
  }

  authorizeConnector(input: AuthorizeConnectorRequestDto): Promise<ConnectionViewModel> {
    return this.authorizeConnectorUseCase.execute(input)
  }

  refreshConnection(input: RefreshConnectionRequestDto): Promise<ConnectionViewModel> {
    return this.refreshConnectionUseCase.execute(input)
  }

  disconnectConnection(input: DisconnectConnectionRequestDto): Promise<ConnectionViewModel> {
    return this.disconnectConnectionUseCase.execute(input)
  }

  deleteConnection(input: DeleteConnectionRequestDto): Promise<void> {
    return this.deleteConnectionUseCase.execute(input)
  }

  runSync(input: RunSyncRequestDto): Promise<SyncStatusViewModel> {
    return this.runSyncUseCase.execute(input)
  }

  scheduleSync(input: ScheduleSyncRequestDto) {
    return this.scheduleSyncUseCase.execute(input)
  }

  retrySync(input: RetrySyncRequestDto): Promise<SyncStatusViewModel> {
    return this.retrySyncUseCase.execute(input)
  }

  pauseSync(input: PauseSyncRequestDto) {
    return this.pauseSyncUseCase.execute(input)
  }

  resumeSync(input: ResumeSyncRequestDto) {
    return this.resumeSyncUseCase.execute(input)
  }

  getIntegrationStatus(input: GetIntegrationStatusRequestDto): Promise<IntegrationViewModel> {
    return this.getIntegrationStatusUseCase.execute(input)
  }

  getSyncHistory(input: GetSyncHistoryRequestDto): Promise<SyncHistoryViewModel> {
    return this.getSyncHistoryUseCase.execute(input)
  }

  getConnectorHealth(input: GetConnectorHealthRequestDto): Promise<ConnectorHealthViewModel> {
    return this.getConnectorHealthUseCase.execute(input)
  }
}
