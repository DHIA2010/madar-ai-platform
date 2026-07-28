# Local Environment Report

## Container Status

- `postgres`: expected healthy
- `redis`: expected healthy
- `minio`: expected healthy
- `minio-init`: expected completed successfully
- `mailpit`: expected healthy
- `backend`: expected healthy after migrations and seed
- `frontend`: expected healthy after backend is ready
- `pgadmin`: expected healthy
- `redisinsight`: optional profile, expected healthy when enabled

## Health Checks

- PostgreSQL health: `pg_isready`
- Redis health: `redis-cli ping`
- MinIO health: `http://localhost:9000/minio/health/live`
- Backend readiness: `http://localhost:4000/ready`
- Frontend availability: `http://localhost:3000`

## URLs

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:4000`
- Backend health: `http://localhost:4000/health`
- Mailpit UI: `http://localhost:8025`
- MinIO console: `http://localhost:9001`
- pgAdmin: `http://localhost:5050`
- RedisInsight: `http://localhost:5540` when the optional profile is enabled

## Credentials

- Admin user: `admin@madar.local`
- Admin password: `MadarAdmin123!`
- pgAdmin email: `admin@madar.local`
- pgAdmin password: `admin123`
- MinIO root user: `minioadmin`
- MinIO root password: `minioadmin123`

## Known Issues

- The first backend start can take longer because `npm ci` runs inside the container.
- RedisInsight is optional and not started unless the profile is enabled.

## Startup Time

- Typical warm start: under a few minutes once images and dependencies are present.
- First cold start: longer because dependencies must be installed and the backend runs migrations plus seed data.

## Verification Targets

- Frontend reachable
- Backend reachable
- Health endpoint responding
- Login available with the seeded admin account
- Database connected
- Redis connected
- MinIO connected
- Mailpit connected
- Seed data present
