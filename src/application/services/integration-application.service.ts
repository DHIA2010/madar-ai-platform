import type {
  AuthorizeConnectorRequestDto,
  ConnectionViewModel,
  ConnectorHealthViewModel,
  CreateConnectionRequestDto,
  DisconnectConnectionRequestDto,
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

export class IntegrationApplicationService {
  private readonly createConnectionUseCase: CreateConnectionUseCase
  private readonly validateConnectionUseCase: ValidateConnectionUseCase
  private readonly authorizeConnectorUseCase: AuthorizeConnectorUseCase
  private readonly refreshConnectionUseCase: RefreshConnectionUseCase
  private readonly disconnectConnectionUseCase: DisconnectConnectionUseCase
  private readonly runSyncUseCase: RunSyncUseCase
  private readonly scheduleSyncUseCase: ScheduleSyncUseCase
  private readonly retrySyncUseCase: RetrySyncUseCase
  private readonly pauseSyncUseCase: PauseSyncUseCase
  private readonly resumeSyncUseCase: ResumeSyncUseCase
  private readonly getIntegrationStatusUseCase: GetIntegrationStatusUseCase
  private readonly getSyncHistoryUseCase: GetSyncHistoryUseCase
  private readonly getConnectorHealthUseCase: GetConnectorHealthUseCase

  constructor(gateway: IntegrationGateway) {
    this.createConnectionUseCase = new CreateConnectionUseCase(gateway)
    this.validateConnectionUseCase = new ValidateConnectionUseCase(gateway)
    this.authorizeConnectorUseCase = new AuthorizeConnectorUseCase(gateway)
    this.refreshConnectionUseCase = new RefreshConnectionUseCase(gateway)
    this.disconnectConnectionUseCase = new DisconnectConnectionUseCase(gateway)
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
