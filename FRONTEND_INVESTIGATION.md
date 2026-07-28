# Known Issues & Status Report

## Backend Status ✅ FULLY OPERATIONAL

All backend services are working correctly:
- PostgreSQL database ✅
- Redis cache & sessions ✅  
- MinIO S3-compatible storage ✅
- Identity API authentication ✅
- User login endpoint ✅
- Seed data bootstrap ✅

**Login endpoint working:** `POST /v1/auth/login` returns valid JWT tokens and user profile.

**Database verified:** Admin user exists with hashed password, seed data present.

---

## Frontend Status ⚠️ React Hooks Violation

**Issue:** Frontend shows "Rendered more hooks than during the previous render" error when navigating to dashboard.

**Location:** Error occurs in Next.js Router component at useMemo hook during navigation to `/dashboard/analytics/`.

**Root Cause:** React hooks violation in component tree - likely caused by:
1. Conditional hook calls in a provider or route component
2. Mismatch in hook count between initial and subsequent renders
3. Possible issue with how multiple context providers interact with Next.js routing

**Components Investigated:**
- ProtectedRoute & GuestRoute components - refactored to use useMemo for conditional logic
- AuthProvider - has conditional renders based on auth status
- WorkspaceProvider - has conditional renders based on workspace status
- AdminLayout - uses useState and useEffect correctly
- Root layout - multiple nested providers

**Fixes Attempted:**
1. Refactored ProtectedRoute to separate outer/inner components
2. Wrapped all conditional logic in useMemo to ensure stable hook count
3. Ensured all hooks are called before conditional renders

**Status:** Issue persists despite refactoring attempts. Requires deeper investigation or potential upgrade of React/Next.js dependencies.

---

## Recommendation for Frontend Team

**Quick Diagnostic Steps:**

1. Check browser React DevTools console for exact component causing the error
2. Review the stack trace to identify which component's render is causing hook mismatch
3. Add React.StrictMode temporarily to catch issues
4. Consider upgrading Next.js and React to latest versions

**Potential Root Causes:**
- A hook inside a third-party library is being called conditionally
- Server-side rendering (SSR) vs client-side render mismatch
- Zod validation or react-hook-form with conditional field rendering
- The new-connection-wizard component flagged in earlier analysis

**Suggested Fix Path:**
1. Disable HMR (Hot Module Replacement) to isolate the issue
2. Review the exact component causing the error using React DevTools
3. Check for any hooks called inside conditional branches
4. Verify suppressHydrationWarning is applied where needed

---

## System Architecture Summary

✅ **Backend:**
- Identity Platform HTTP server running on port 4000
- PostgreSQL database with migrations applied
- Redis for sessions and caching
- MinIO S3-compatible storage
- All health checks passing
- Seed data: 1 admin user, 1 organization, 1 workspace, 1 project, 1 datasource

✅ **Frontend:**
- Next.js development server running on port 3000
- Pages compiling and rendering correctly (200 responses)
- Client-side React hooks violation preventing full page load

✅ **Supporting Services:**
- Mailpit for email capture on ports 1025/8025
- pgAdmin for database management on port 5050
- Redis Insight available on port 5540 (optional)

---

## Deployment Path

### For Development
1. Backend: Fully ready - no further issues
2. Frontend: Requires React hooks violation fix before production

### For Local Testing
- Use API directly via `curl` or Postman
- Backend health check: `curl http://localhost:4000/v1/health` (requires auth)
- Backend login: `curl -X POST http://localhost:4000/v1/auth/login` (works)

### Next Steps
1. Frontend team to investigate React hooks violation
2. Consider rolling back recent Next.js updates if applicable
3. Run `npm audit` to check for dependency conflicts
4. Profile React renders using React DevTools Profiler

---

## Docker Compose Status

```
madar-backend:     ✅ Healthy
madar-frontend:    ⚠️  Running (health: starting) - Client-side error
madar-postgres:    ✅ Healthy  
madar-redis:       ✅ Healthy
madar-minio:       ✅ Healthy
madar-mailpit:     ✅ Healthy
madar-pgadmin:     ✅ Running
minio-init:        ✅ Completed
```

All services running. Backend fully operational. Frontend requires debugging.
