# ERROR_HANDLING_GUIDE

## Unified Error Model
Application errors now use `IdentityError` with:
- `code`
- `status`
- `category`
- `message`
- `details`

## Categories
- `business`
- `validation`
- `security`
- `infrastructure`
- `external`

## Mapping Strategy
- Validation errors from Zod map to HTTP 400.
- Application security and business errors map through middleware error mapping.
- Unknown failures map to HTTP 500 with infrastructure category.

## Logging Strategy
- Application handlers can log through the logger port.
- REST layer should not decide long-term logging policy.

## Result
Transport mapping is now consistent and replaceable, instead of being embedded across multiple implementations.
