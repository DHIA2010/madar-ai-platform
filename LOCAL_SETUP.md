# Local Setup

## Requirements

- Docker Desktop with Compose v2
- No manual database, cache, or object-storage setup

## Setup

1. Copy or edit `.env.local` if you need custom ports or credentials.
2. Start the platform:

```bash
docker compose up -d
```

3. Open the services:
- Frontend: `http://localhost:3000`
- Backend health: `http://localhost:4000/health`
- Mailpit: `http://localhost:8025`
- MinIO console: `http://localhost:9001`
- pgAdmin: `http://localhost:5050`

## What Happens Automatically

- PostgreSQL, Redis, and MinIO are started with health checks.
- The MinIO bucket is created.
- Backend migrations run automatically.
- Development seed data is inserted automatically.
- Frontend and backend become reachable without manual steps.

## Login

Use the seeded admin account:

- Email: `admin@madar.local`
- Password: `MadarAdmin123!`

## Troubleshooting

- If the backend is slow on first boot, wait for the bootstrap log to finish before retrying login.
- If you change credentials in `.env.local`, recreate the stack so the containers pick up the new values.
