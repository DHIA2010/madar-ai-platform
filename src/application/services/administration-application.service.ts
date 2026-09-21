import type {
  AddTeamMemberRequestDto,
  AdministrationGateway,
  AdministrationInvitationDto,
  AdministrationOrgSessionDto,
  AdministrationRoleDto,
  AdministrationSessionDto,
  AdministrationTeamDto,
  AdministrationTeamMemberDto,
  AdministrationUserDto,
  AssignMemberCustomRoleRequestDto,
  AssignMemberRoleRequestDto,
  AssignUserWorkspacesRequestDto,
  AuditLogListDto,
  CancelInvitationRequestDto,
  CreateCustomRoleRequestDto,
  CreateMemberDirectRequestDto,
  CreateTeamRequestDto,
  DeleteCustomRoleRequestDto,
  DeleteTeamRequestDto,
  GetAuditLogsRequestDto,
  GetInvitationsRequestDto,
  GetOrganizationSessionsRequestDto,
  GetRolesRequestDto,
  GetTeamMembersRequestDto,
  GetTeamsRequestDto,
  GetUsersRequestDto,
  ReactivateMemberRequestDto,
  RemoveTeamMemberRequestDto,
  ResendInvitationRequestDto,
  RevokeSessionRequestDto,
  SendInvitationRequestDto,
  SendMemberPasswordResetRequestDto,
  SetMemberModuleAccessRequestDto,
  SuspendMemberRequestDto,
  UpdateCustomRoleRequestDto,
  UpdateMemberIdentityRequestDto,
  UpdateMemberProfileRequestDto,
  UpdateTeamRequestDto,
  UploadMemberAvatarRequestDto,
} from "../contracts"

export class AdministrationApplicationService {
  constructor(private readonly gateway: AdministrationGateway) {}

  getAuditLogs(request: GetAuditLogsRequestDto): Promise<AuditLogListDto> {
    return this.gateway.getAuditLogs(request)
  }

  getUsers(request: GetUsersRequestDto): Promise<AdministrationUserDto[]> {
    return this.gateway.getUsers(request)
  }

  suspendMember(request: SuspendMemberRequestDto): Promise<void> {
    return this.gateway.suspendMember(request)
  }

  reactivateMember(request: ReactivateMemberRequestDto): Promise<void> {
    return this.gateway.reactivateMember(request)
  }

  assignMemberRole(request: AssignMemberRoleRequestDto): Promise<void> {
    return this.gateway.assignMemberRole(request)
  }

  assignMemberCustomRole(request: AssignMemberCustomRoleRequestDto): Promise<void> {
    return this.gateway.assignMemberCustomRole(request)
  }

  setMemberModuleAccess(request: SetMemberModuleAccessRequestDto): Promise<void> {
    return this.gateway.setMemberModuleAccess(request)
  }

  updateMemberProfile(request: UpdateMemberProfileRequestDto): Promise<void> {
    return this.gateway.updateMemberProfile(request)
  }

  updateMemberIdentity(request: UpdateMemberIdentityRequestDto): Promise<void> {
    return this.gateway.updateMemberIdentity(request)
  }

  uploadMemberAvatar(request: UploadMemberAvatarRequestDto): Promise<{ avatarUrl: string }> {
    return this.gateway.uploadMemberAvatar(request)
  }

  sendMemberPasswordReset(request: SendMemberPasswordResetRequestDto): Promise<void> {
    return this.gateway.sendMemberPasswordReset(request)
  }

  createMemberDirect(request: CreateMemberDirectRequestDto): Promise<{ userId: string }> {
    return this.gateway.createMemberDirect(request)
  }

  assignUserWorkspaces(request: AssignUserWorkspacesRequestDto): Promise<void> {
    return this.gateway.assignUserWorkspaces(request)
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

  getOrganizationSessions(
    request: GetOrganizationSessionsRequestDto
  ): Promise<AdministrationOrgSessionDto[]> {
    return this.gateway.getOrganizationSessions(request)
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

  getTeamMembers(request: GetTeamMembersRequestDto): Promise<AdministrationTeamMemberDto[]> {
    return this.gateway.getTeamMembers(request)
  }

  addTeamMember(request: AddTeamMemberRequestDto): Promise<void> {
    return this.gateway.addTeamMember(request)
  }

  removeTeamMember(request: RemoveTeamMemberRequestDto): Promise<void> {
    return this.gateway.removeTeamMember(request)
  }

  updateTeam(request: UpdateTeamRequestDto): Promise<AdministrationTeamDto> {
    return this.gateway.updateTeam(request)
  }

  deleteTeam(request: DeleteTeamRequestDto): Promise<void> {
    return this.gateway.deleteTeam(request)
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

  deleteCustomRole(request: DeleteCustomRoleRequestDto): Promise<void> {
    return this.gateway.deleteCustomRole(request)
  }
}
