# BACKEND_RUNTIME_ENVIRONMENT

Date: 2026-06-28
Mode: Runtime-only investigation

## Runtime Process Ownership: localhost:4000

- Listener check:
  - `lsof -nP -iTCP:4000 -sTCP:LISTEN`
  - Owner: PID `64249`, executable `node`

- PID metadata:
  - `ps -fp 64249`
  - Command line: `node --import tsx src/identity-platform/server.ts`
  - Parent process: PID `64170` (`npm run identity:dev`)

- Executable path:
  - `lsof -a -p 64249 -d txt -Fn`
  - Executable: `/usr/local/Homebrew/Cellar/node@20/20.20.2/bin/node`

- Working directory:
  - `lsof -a -p 64249 -d cwd -Fn`
  - CWD: `/Users/dheyahagar/Documents/madar-platform/pulse-ui-next`

## Does this process belong to MADAR backend?

YES.

Evidence:
- Command points to `src/identity-platform/server.ts`.
- Working directory is the active MADAR repo root.
- Parent process is `npm run identity:dev` from same repo shell.

## Multiple backend processes check

Commands used:
- `pgrep -af "src/identity-platform/server.ts"`
- `lsof -nP -iTCP:4000 -sTCP:LISTEN`
- `lsof -nP -iTCP:4101 -sTCP:LISTEN`

Result:
- Active backend server process: one (`PID 64249`) on port 4000.
- Wrapper process exists (`PID 64170`, `npm run identity:dev`) but it is not a second backend listener.
- No listener on 4101.

## Which backend process the frontend is calling

Runtime capture from browser (no source inspection):
- Captured outbound login fetch URL from active frontend session:
  - `http://localhost:4000/v1/auth/login`

Port mapping:
- Frontend dev server listener:
  - `lsof -nP -iTCP:3001 -sTCP:LISTEN` -> `PID 62312` (`next-server (v16.1.6)`)
- Backend listener for that host/port target:
  - `localhost:4000` -> `PID 64249`

Conclusion:
- Frontend is calling the backend process `PID 64249` on `localhost:4000`.

## Active backend CORS origin behavior

Commands:
- `curl -i -X OPTIONS http://localhost:4000/v1/auth/login -H 'Origin: http://localhost:3001' -H 'Access-Control-Request-Method: POST' -H 'Access-Control-Request-Headers: content-type'`
- `curl -i -X OPTIONS http://localhost:4000/v1/integrations/google/oauth/start -H 'Origin: http://localhost:3001' -H 'Access-Control-Request-Method: POST' -H 'Access-Control-Request-Headers: content-type,authorization,x-workspace-id'`

Observed response (both):
- `HTTP/1.1 204 No Content`
- Header present: `content-type: application/json`
- Header missing: `Access-Control-Allow-Origin`

Interpretation:
- Active backend process on 4000 does not currently emit the required CORS allow-origin header for `http://localhost:3001` in preflight responses.

## Final

Port 4000 owner:
- node process running identity API server

PID:
- 64249

Command:
- node --import tsx src/identity-platform/server.ts

Working directory:
- /Users/dheyahagar/Documents/madar-platform/pulse-ui-next

Expected backend?
- YES

Multiple backend processes?
- NO

Frontend calls which backend?
- http://localhost:4000 -> PID 64249

Current blocker:
- Active backend on 4000 is not returning `Access-Control-Allow-Origin` for origin `http://localhost:3001` on CORS preflight, blocking browser requests.
