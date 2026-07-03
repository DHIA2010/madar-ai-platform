# Invitation Workflow

## States
- `pending`
- `accepted`
- `declined`
- `canceled`
- `expired`

## Workflow
1. Authorized actor creates invitation.
2. Idempotency key prevents duplicate pending invitations.
3. Invitation email is sent via configured email gateway.
4. Invitee accepts or declines using token endpoint.
5. Invitation can be canceled or resent by authorized organization actors.
6. Expired invitations are rejected and marked expired.

## Security and Reliability
- Token matching is required for accept/decline flows.
- Email identity is validated on acceptance.
- Rate limiting applied to invite and resend operations.
- Invitation actions are audited.
- Domain events emitted: `MemberInvited`, `InvitationAccepted`, `InvitationExpired`.
