import { AsyncLocalStorage } from "node:async_hooks"

import { Pool } from "pg"

import type { IdentityPlatformConfig } from "../../configuration"

export interface QueryResultRow {
  [key: string]: unknown
}

export interface QueryResult<T extends QueryResultRow = QueryResultRow> {
  rows: T[]
  rowCount: number
}

export interface QueryInput {
  text: string
  values?: readonly unknown[]
  name?: string
}

interface PgExecutor {
  query<T extends QueryResultRow = QueryResultRow>(
    query: string | QueryInput,
    values?: readonly unknown[]
  ): Promise<{ rows: T[]; rowCount: number | null }>
}

interface PgClient extends PgExecutor {
  release(): void
}

interface PgPoolLike extends PgExecutor {
  connect(): Promise<PgClient>
  end(): Promise<void>
}

export class PostgresDatabase {
  private readonly transactionStorage = new AsyncLocalStorage<PgClient>()

  constructor(private readonly pool: PgPoolLike) {}

  static fromConfig(config: IdentityPlatformConfig) {
    const pool = new Pool({
      connectionString: config.postgresUrl,
      max: config.postgresMaxConnections,
      // A request waits this long for a free connection, then fails -- instead of hanging forever
      // when the pool is exhausted.
      connectionTimeoutMillis: 30_000,
    })
    // An idle connection the database closed (a restart, a failover) is reported here; with no
    // listener it would be an unhandled "error" event and take the whole process down. The pool
    // drops that connection and opens a new one on the next query.
    pool.on("error", (error) => {
      console.error("postgres.idle_connection_error", { message: error.message })
    })
    return new PostgresDatabase(pool)
  }

  private getExecutor() {
    return this.transactionStorage.getStore() ?? this.pool
  }

  async query<T extends QueryResultRow = QueryResultRow>(
    query: string | QueryInput,
    values?: readonly unknown[]
  ): Promise<QueryResult<T>> {
    const executor = this.getExecutor()
    const result = await executor.query<T>(query, values)
    return {
      rows: result.rows,
      rowCount: result.rowCount ?? 0,
    }
  }

  async withTransaction<T>(work: () => Promise<T>) {
    const client = await this.pool.connect()
    try {
      await client.query("BEGIN")
      const result = await this.transactionStorage.run(client, work)
      await client.query("COMMIT")
      return result
    } catch (error) {
      await client.query("ROLLBACK")
      throw error
    } finally {
      client.release()
    }
  }

  async healthCheck() {
    try {
      await this.query("SELECT 1 AS ok")
      return { ok: true, message: "postgres reachable" }
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "postgres unreachable" }
    }
  }

  async end() {
    await this.pool.end()
  }
}
