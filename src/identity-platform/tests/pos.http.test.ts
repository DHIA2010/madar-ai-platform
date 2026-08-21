// @vitest-environment node

import type { AddressInfo } from "node:net"

import { newDb } from "pg-mem"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { createIdentityPlatform } from "../bootstrap/create-identity-platform"
import { runIdentityMigrations, runSqlFile } from "../infrastructure/postgres/migration-runner"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import { createIdentityApiServer } from "../interfaces/rest/server"

let database: PostgresDatabase
let server: ReturnType<typeof createIdentityApiServer>
let baseUrl = ""
let container: ReturnType<typeof createIdentityPlatform>

beforeEach(async () => {
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000"
  process.env.IDENTITY_PLATFORM_TOKEN_HASH_SECRET = "12345678901234567890123456789012"

  const mem = newDb({ autoCreateForeignKeyIndices: true })
  const adapter = mem.adapters.createPg()
  database = new PostgresDatabase(new adapter.Pool())

  await runIdentityMigrations(database, process.cwd())
  await runSqlFile(
    database,
    `${process.cwd()}/src/project-platform/migrations/001_project_core.sql`
  )

  container = createIdentityPlatform({ mode: "memory" })
  ;(container.infrastructure as { database?: PostgresDatabase }).database = database

  server = createIdentityApiServer(container)
  await new Promise<void>((resolve) => server.listen(0, resolve))
  const address = server.address() as AddressInfo
  baseUrl = `http://127.0.0.1:${address.port}`
})

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error)
          return
        }
        resolve()
      })
    })
  }

  await database.end()
})

async function registerAndProvisionOrg(email: string, orgName: string) {
  const registerResponse = await fetch(`${baseUrl}/v1/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email,
      password: "VeryStrongPassword123!",
      fullName: "POS Test Owner",
      organizationName: orgName,
    }),
  })
  const registration = (await registerResponse.json()) as { verificationToken: string }

  await fetch(`${baseUrl}/v1/auth/verify-email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: registration.verificationToken }),
  })

  const loginResponse = await fetch(`${baseUrl}/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "VeryStrongPassword123!" }),
  })
  const login = (await loginResponse.json()) as { session: { accessToken: string } }
  const actor = await container.commands.resolveActorFromAccessToken(login.session.accessToken)

  await database.query(
    `insert into users (id, email, password_hash, full_name, email_verified_at)
     values ($1, $2, 'hash', 'POS Test Owner', now()) on conflict (id) do nothing`,
    [actor.userId, email]
  )
  await database.query(
    `insert into organizations (id, name, owner_user_id, status)
     values ($1, $2, $3, 'active') on conflict (id) do nothing`,
    [actor.organizationId, orgName, actor.userId]
  )

  return { accessToken: login.session.accessToken, organizationId: actor.organizationId }
}

function authHeaders(accessToken: string) {
  return { "content-type": "application/json", authorization: `Bearer ${accessToken}` }
}

describe("POS employees and roles", () => {
  it("lets an owner create a role, assign it to a new employee, and the employee logs in", async () => {
    const { accessToken } = await registerAndProvisionOrg("owner@pos-test.madar", "POS Test Org")

    const createRoleResponse = await fetch(`${baseUrl}/v1/pos/roles`, {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify({ name: "Cashier", permissions: ["sales:create", "reports:view"] }),
    })
    expect(createRoleResponse.status).toBe(201)
    const role = (await createRoleResponse.json()) as { id: string; employeeCount: number }
    expect(role.employeeCount).toBe(0)

    const createEmployeeResponse = await fetch(`${baseUrl}/v1/pos/employees`, {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify({
        fullName: "Sara Cashier",
        email: "sara@pos-test.madar",
        password: "EmployeePass123!",
        posRoleId: role.id,
      }),
    })
    expect(createEmployeeResponse.status).toBe(201)
    const employee = (await createEmployeeResponse.json()) as { id: string; posRoleName: string }
    expect(employee.posRoleName).toBe("Cashier")

    const rolesAfter = (await (
      await fetch(`${baseUrl}/v1/pos/roles`, { headers: authHeaders(accessToken) })
    ).json()) as { items: Array<{ id: string; employeeCount: number }> }
    expect(rolesAfter.items.find((item) => item.id === role.id)?.employeeCount).toBe(1)

    const loginResponse = await fetch(`${baseUrl}/v1/pos/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "sara@pos-test.madar", password: "EmployeePass123!" }),
    })
    expect(loginResponse.status).toBe(200)
    const login = (await loginResponse.json()) as {
      accessToken: string
      employee: { fullName: string; posRoleName: string }
    }
    expect(login.employee.fullName).toBe("Sara Cashier")
    expect(login.employee.posRoleName).toBe("Cashier")

    const sessionResponse = await fetch(`${baseUrl}/v1/pos/auth/session`, {
      headers: { authorization: `Bearer ${login.accessToken}` },
    })
    expect(sessionResponse.status).toBe(200)

    const logoutResponse = await fetch(`${baseUrl}/v1/pos/auth/logout`, {
      method: "POST",
      headers: { authorization: `Bearer ${login.accessToken}` },
    })
    expect(logoutResponse.status).toBe(200)

    const sessionAfterLogout = await fetch(`${baseUrl}/v1/pos/auth/session`, {
      headers: { authorization: `Bearer ${login.accessToken}` },
    })
    expect(sessionAfterLogout.status).toBe(401)
  })

  it("rejects an employee login with the wrong password", async () => {
    const { accessToken } = await registerAndProvisionOrg("owner2@pos-test.madar", "POS Test Org 2")

    await fetch(`${baseUrl}/v1/pos/employees`, {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify({
        fullName: "Bad Login",
        email: "badlogin@pos-test.madar",
        password: "EmployeePass123!",
        posRoleId: null,
      }),
    })

    const loginResponse = await fetch(`${baseUrl}/v1/pos/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "badlogin@pos-test.madar", password: "WrongPassword!" }),
    })
    expect(loginResponse.status).toBe(401)
  })

  it("revokes an employee's session as soon as an admin deactivates them", async () => {
    const { accessToken } = await registerAndProvisionOrg("owner3@pos-test.madar", "POS Test Org 3")

    const createEmployeeResponse = await fetch(`${baseUrl}/v1/pos/employees`, {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify({
        fullName: "Soon Deactivated",
        email: "deactivated@pos-test.madar",
        password: "EmployeePass123!",
        posRoleId: null,
      }),
    })
    const employee = (await createEmployeeResponse.json()) as { id: string }

    const loginResponse = await fetch(`${baseUrl}/v1/pos/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "deactivated@pos-test.madar", password: "EmployeePass123!" }),
    })
    const login = (await loginResponse.json()) as { accessToken: string }

    const deactivateResponse = await fetch(`${baseUrl}/v1/pos/employees/${employee.id}`, {
      method: "PATCH",
      headers: authHeaders(accessToken),
      body: JSON.stringify({ status: "inactive" }),
    })
    expect(deactivateResponse.status).toBe(200)

    const sessionResponse = await fetch(`${baseUrl}/v1/pos/auth/session`, {
      headers: { authorization: `Bearer ${login.accessToken}` },
    })
    expect(sessionResponse.status).toBe(401)

    const reLoginResponse = await fetch(`${baseUrl}/v1/pos/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "deactivated@pos-test.madar", password: "EmployeePass123!" }),
    })
    expect(reLoginResponse.status).toBe(403)
  })

  it("rejects a duplicate role name and blocks deleting a role that's still assigned", async () => {
    const { accessToken } = await registerAndProvisionOrg("owner4@pos-test.madar", "POS Test Org 4")

    const firstRole = await fetch(`${baseUrl}/v1/pos/roles`, {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify({ name: "Manager", permissions: [] }),
    })
    expect(firstRole.status).toBe(201)
    const role = (await firstRole.json()) as { id: string }

    const duplicateRole = await fetch(`${baseUrl}/v1/pos/roles`, {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify({ name: "manager", permissions: [] }),
    })
    expect(duplicateRole.status).toBe(409)

    await fetch(`${baseUrl}/v1/pos/employees`, {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify({
        fullName: "Assigned Employee",
        email: "assigned@pos-test.madar",
        password: "EmployeePass123!",
        posRoleId: role.id,
      }),
    })

    const deleteResponse = await fetch(`${baseUrl}/v1/pos/roles/${role.id}`, {
      method: "DELETE",
      headers: authHeaders(accessToken),
    })
    expect(deleteResponse.status).toBe(409)
  })

  it("rejects a role with an unknown permission and an employee with a duplicate email", async () => {
    const { accessToken } = await registerAndProvisionOrg("owner5@pos-test.madar", "POS Test Org 5")

    const invalidPermissionResponse = await fetch(`${baseUrl}/v1/pos/roles`, {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify({ name: "Ghost", permissions: ["not:a:real:permission"] }),
    })
    expect(invalidPermissionResponse.status).toBe(422)

    const first = await fetch(`${baseUrl}/v1/pos/employees`, {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify({
        fullName: "First",
        email: "dupe@pos-test.madar",
        password: "EmployeePass123!",
        posRoleId: null,
      }),
    })
    expect(first.status).toBe(201)

    const second = await fetch(`${baseUrl}/v1/pos/employees`, {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify({
        fullName: "Second",
        email: "dupe@pos-test.madar",
        password: "EmployeePass123!",
        posRoleId: null,
      }),
    })
    expect(second.status).toBe(409)
  })
})
