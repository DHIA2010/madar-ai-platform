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
  // Work waiting for the current outermost transaction to commit (see afterCommit).
  private readonly afterCommitStorage = new AsyncLocalStorage<Array<() => unknown>>()

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

  // A transaction started inside another one joins it: the work commits or rolls back with the
  // outer one (two documents saved as one, e.g. a cashier exchange's credit note and invoice).
  async withTransaction<T>(work: () => Promise<T>) {
    if (this.transactionStorage.getStore()) return work()
    const client = await this.pool.connect()
    const pending: Array<() => unknown> = []
    let result: T
    try {
      await client.query("BEGIN")
      result = await this.transactionStorage.run(client, () =>
        this.afterCommitStorage.run(pending, work)
      )
      await client.query("COMMIT")
    } catch (error) {
      await client.query("ROLLBACK")
      throw error
    } finally {
      client.release()
    }
    for (const task of pending) {
      try {
        await task()
      } catch (error) {
        console.error("postgres.after_commit_failed", {
          message: error instanceof Error ? error.message : String(error),
        })
      }
    }
    return result
  }

  // Runs work that must only happen once the data is saved for good (reporting to ZATCA, an
  // audit entry, pushing stock to a store): straight away outside a transaction, else once the
  // outermost transaction commits -- and never if it rolls back.
  async afterCommit(task: () => unknown): Promise<void> {
    const pending = this.transactionStorage.getStore() ? this.afterCommitStorage.getStore() : null
    if (pending) {
      pending.push(task)
      return
    }
    await task()
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
