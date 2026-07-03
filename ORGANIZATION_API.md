# Organization API

## Versioning
All endpoints are exposed under `v1`.

## Core Endpoints
- `GET /v1/organizations`
- `POST /v1/organizations`
- `GET /v1/organizations/{id}`
- `PATCH /v1/organizations/{id}`
- `POST /v1/organizations/{id}/archive`
- `POST /v1/organizations/{id}/restore`
- `POST /v1/organizations/{id}/delete`

## Membership Endpoints
- `GET /v1/organizations/{id}/members`
- `POST /v1/organizations/{id}/members/{memberUserId}/suspend`
- `POST /v1/organizations/{id}/members/{memberUserId}/reactivate`
- `POST /v1/organizations/{id}/members/{memberUserId}/remove`
- `POST /v1/organizations/{id}/members/{memberUserId}/transfer-ownership`
- `POST /v1/organizations/{id}/members/{memberUserId}/roles`
- `POST /v1/organizations/{id}/members/{memberUserId}/profile`

## Invitation Endpoints
- `GET /v1/organizations/{id}/invitations`
- `POST /v1/organizations/{id}/invitations`
- `POST /v1/organizations/invitations/{token}/accept`
- `POST /v1/organizations/invitations/{token}/decline`
- `POST /v1/organizations/invitations/{invitationId}/cancel`
- `POST /v1/organizations/invitations/{invitationId}/resend`

## API Behavior
- Input validation via zod schemas.
- Pagination with `page` and `pageSize`.
- Filtering by status where supported.
- Sorting for organizations by created date or name.
- Standardized error mapping from domain/application errors.
