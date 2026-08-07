import type {
  AdministrationGateway,
  AdministrationInvitationDto,
  AdministrationRoleDto,
  AdministrationSessionDto,
  AdministrationTeamDto,
  AdministrationUserDto,
  AuditLogListDto,
  CancelInvitationRequestDto,
  CreateCustomRoleRequestDto,
  CreateTeamRequestDto,
  GetAuditLogsRequestDto,
  GetInvitationsRequestDto,
  GetRolesRequestDto,
  GetTeamsRequestDto,
  GetUsersRequestDto,
  ResendInvitationRequestDto,
  RevokeSessionRequestDto,
  SendInvitationRequestDto,
  UpdateCustomRoleRequestDto,
} from "../contracts"

export class AdministrationApplicationService {
  constructor(private readonly gateway: AdministrationGateway) {}

  getAuditLogs(request: GetAuditLogsRequestDto): Promise<AuditLogListDto> {
    return this.gateway.getAuditLogs(request)
  }

  getUsers(request: GetUsersRequestDto): Promise<AdministrationUserDto[]> {
    return this.gateway.getUsers(request)
  }

  getInvitations(request: GetInvitationsRequestDto): Promise<AdministrationInvitationDto[]> {
    return this.gateway.getInvitations(request)
  }

  sendInvitation(request: SendInvitationRequestDto): Promise<AdministrationInvitationDto> {
    return this.gateway.sendInvitation(request)
  }

  cancelInvitation(request: CancelInvitationRequestDto): Promise<void> {
    return this.gateway.cancelInvitation(request)
  }

  resendInvitation(request: ResendInvitationRequestDto): Promise<AdministrationInvitationDto> {
    return this.gateway.resendInvitation(request)
  }

  getSessions(): Promise<AdministrationSessionDto[]> {
    return this.gateway.getSessions()
  }

  revokeSession(request: RevokeSessionRequestDto): Promise<void> {
    return this.gateway.revokeSession(request)
  }

  getTeams(request: GetTeamsRequestDto): Promise<AdministrationTeamDto[]> {
    return this.gateway.getTeams(request)
  }

  createTeam(request: CreateTeamRequestDto): Promise<AdministrationTeamDto> {
    return this.gateway.createTeam(request)
  }

  getRoles(request: GetRolesRequestDto): Promise<AdministrationRoleDto[]> {
    return this.gateway.getRoles(request)
  }

  createCustomRole(request: CreateCustomRoleRequestDto): Promise<AdministrationRoleDto> {
    return this.gateway.createCustomRole(request)
  }

  updateCustomRole(request: UpdateCustomRoleRequestDto): Promise<AdministrationRoleDto> {
    return this.gateway.updateCustomRole(request)
  }
}
