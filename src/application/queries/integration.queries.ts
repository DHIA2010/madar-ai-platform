import type {
  AuthorizeConnectorRequestDto,
  Connection,
  ConnectorHealth,
  GetConnectorHealthRequestDto,
  GetIntegrationStatusRequestDto,
  GetSyncHistoryRequestDto,
  IntegrationGateway,
  IntegrationStatusDto,
  PauseSyncRequestDto,
  RefreshConnectionRequestDto,
  ResumeSyncRequestDto,
  RetrySyncRequestDto,
  RunSyncRequestDto,
  ScheduleSyncRequestDto,
  SyncHistoryDto,
  SyncJob,
  SyncRun,
  ValidateConnectionRequestDto,
  CreateConnectionRequestDto,
  DisconnectConnectionRequestDto,
  DeleteConnectionRequestDto,
  SyncSchedule,
} from "../contracts"

export class CreateConnectionQuery {
  constructor(private readonly gateway: IntegrationGateway) {}

  execute(input: CreateConnectionRequestDto): Promise<Connection> {
    return this.gateway.createConnection(input)
  }
}

export class ValidateConnectionQuery {
  constructor(private readonly gateway: IntegrationGateway) {}

  execute(input: ValidateConnectionRequestDto): Promise<Connection> {
    return this.gateway.validateConnection(input)
  }
}

export class AuthorizeConnectorQuery {
  constructor(private readonly gateway: IntegrationGateway) {}

  execute(input: AuthorizeConnectorRequestDto): Promise<Connection> {
    return this.gateway.authorizeConnector(input)
  }
}

export class RefreshConnectionQuery {
  constructor(private readonly gateway: IntegrationGateway) {}

  execute(input: RefreshConnectionRequestDto): Promise<Connection> {
    return this.gateway.refreshConnection(input)
  }
}

export class DisconnectConnectionQuery {
  constructor(private readonly gateway: IntegrationGateway) {}

  execute(input: DisconnectConnectionRequestDto): Promise<Connection> {
    return this.gateway.disconnectConnection(input)
  }
}

export class DeleteConnectionQuery {
  constructor(private readonly gateway: IntegrationGateway) {}

  execute(input: DeleteConnectionRequestDto): Promise<void> {
    return this.gateway.deleteConnection(input)
  }
}

export class RunSyncQuery {
  constructor(private readonly gateway: IntegrationGateway) {}

  execute(input: RunSyncRequestDto): Promise<SyncRun> {
    return this.gateway.runSync(input)
  }
}

export class ScheduleSyncQuery {
  constructor(private readonly gateway: IntegrationGateway) {}

  execute(input: ScheduleSyncRequestDto): Promise<SyncSchedule> {
    return this.gateway.scheduleSync(input)
  }
}

export class RetrySyncQuery {
  constructor(private readonly gateway: IntegrationGateway) {}

  execute(input: RetrySyncRequestDto): Promise<SyncRun> {
    return this.gateway.retrySync(input)
  }
}

export class PauseSyncQuery {
  constructor(private readonly gateway: IntegrationGateway) {}

  execute(input: PauseSyncRequestDto): Promise<SyncJob> {
    return this.gateway.pauseSync(input)
  }
}

export class ResumeSyncQuery {
  constructor(private readonly gateway: IntegrationGateway) {}

  execute(input: ResumeSyncRequestDto): Promise<SyncJob> {
    return this.gateway.resumeSync(input)
  }
}

export class GetIntegrationStatusQuery {
  constructor(private readonly gateway: IntegrationGateway) {}

  execute(input: GetIntegrationStatusRequestDto): Promise<IntegrationStatusDto> {
    return this.gateway.getIntegrationStatus(input)
  }
}

export class GetSyncHistoryQuery {
  constructor(private readonly gateway: IntegrationGateway) {}

  execute(input: GetSyncHistoryRequestDto): Promise<SyncHistoryDto> {
    return this.gateway.getSyncHistory(input)
  }
}

export class GetConnectorHealthQuery {
  constructor(private readonly gateway: IntegrationGateway) {}

  execute(input: GetConnectorHealthRequestDto): Promise<ConnectorHealth> {
    return this.gateway.getConnectorHealth(input)
  }
}
