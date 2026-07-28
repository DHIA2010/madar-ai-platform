# MADAR Local Development - Quick Start ⚡

## One Command

```bash
docker compose up -d
```

That's it. Everything else happens automatically.

## What You Get

- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:4000
- **Admin User:** admin@madar.local / MadarAdmin123!
- **Database:** PostgreSQL on localhost:5432
- **Cache:** Redis on localhost:6379
- **Storage:** MinIO on localhost:9000
- **Email:** Mailpit on localhost:8025

## Verify It's Working

```bash
# Login
curl -X POST http://localhost:4000/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@madar.local","password":"MadarAdmin123!"}'

# Should return: JWT tokens, user profile, and session ID
```

## What Happens Automatically

1. All services start and pass health checks (~50-60 seconds on cold start)
2. PostgreSQL migrations applied
3. Development seed data created
4. Backend ready for API calls
5. Frontend ready for browser access

## Seeded Data

- Admin user with full organization/workspace/project access
- Demo organization, workspace, project, and datasource
- Ready-to-use for feature development and testing

## Services

| Service | URL | Purpose |
|---------|-----|---------|
| Frontend | http://localhost:3000 | Next.js app |
| Backend | http://localhost:4000 | Identity + API |
| pgAdmin | http://localhost:5050 | Database UI |
| Mailpit | http://localhost:8025 | Email capture |
| MinIO | http://localhost:9001 | File storage UI |
| Redis | localhost:6379 | Cache + sessions |
| PostgreSQL | localhost:5432 | Main database |

## Common Tasks

**Access Database:**
```bash
psql postgresql://madar:madar_password@localhost:5432/madar
```

**View API Logs:**
```bash
docker compose logs -f backend
```

**Rebuild After Code Changes:**
```bash
docker compose down
docker compose up -d
```

**Reset Everything:**
```bash
docker compose down -v
docker compose up -d
```

## Documentation

- [LOCAL_SETUP.md](LOCAL_SETUP.md) - Detailed setup
- [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md) - Architecture overview
- [LOCAL_VALIDATION_REPORT.md](LOCAL_VALIDATION_REPORT.md) - Full validation report
- [DOCKER_ARCHITECTURE.md](DOCKER_ARCHITECTURE.md) - Service topology

## Issues?

See [LOCAL_ENVIRONMENT_REPORT.md](LOCAL_ENVIRONMENT_REPORT.md#troubleshooting-reference) for troubleshooting.

---

**Status:** ✅ All services running, login working, seed data present. Ready for development.
