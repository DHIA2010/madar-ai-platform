# Local Development Platform

This repository runs locally as a full MADAR platform through Docker Compose. The local stack mirrors the production-shaped architecture instead of simplifying it.

## Services

- Frontend: Next.js app on `http://localhost:3000`
- Backend: Identity/API service on `http://localhost:4000`
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`
- MinIO: S3-compatible storage on `http://localhost:9000` and console on `http://localhost:9001`
- Mailpit: SMTP on `localhost:1025` and UI on `http://localhost:8025`
- pgAdmin: `http://localhost:5050`
- RedisInsight: optional profile on `http://localhost:5540`

All services use the same Docker network: `madar-local`.

## One Command

Start everything with:

```bash
docker compose up -d
```

Verify local stack health:

```bash
docker compose config -q
docker compose ps
```

The backend bootstrap waits for PostgreSQL, Redis, and MinIO health checks, applies migrations, and seeds the development dataset automatically.

## Seeded Data

- Admin user: `admin@madar.local`
- Password: `MadarAdmin123!`
- Demo organization: `Demo Organization`
- Demo workspace: `Demo Workspace`
- Demo project: `Demo Project`
- Demo datasource: `Demo Datasource`

## Notes

- S3-compatible storage is provided by MinIO using the same S3-style environment variables.
- Email delivery uses Mailpit, so every email is visible in the Mailpit UI.
- The local stack keeps Terraform and AWS deployment intact.
- Frontend health checks are expected on `http://127.0.0.1:3000` inside the container network.

## Backend Foundation Local Verification

Run these after the stack is healthy:

```bash
npm run identity:migrations:validate
npm run project:migrations:validate
npm run identity:openapi
npm run project:openapi
```

These checks validate shared backend-foundation integration without introducing new feature scope.
