import { randomUUID } from "node:crypto"

import type { PostgresDatabase } from "../infrastructure/postgres/database"

import type { ApplicationCategoryId, ChatMessageDto, ChatSessionDto, ToolCallTrace } from "./types"

function mapSession(row: Record<string, unknown>): ChatSessionDto {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    workspaceId: (row.workspace_id as string | null) ?? null,
    userId: String(row.user_id),
    applicationCategory: row.application_category as ApplicationCategoryId,
    title: (row.title as string | null) ?? null,
    status: row.status as ChatSessionDto["status"],
    createdAt: new Date(row.created_at as string).toISOString(),
    updatedAt: new Date(row.updated_at as string).toISOString(),
  }
}

function mapMessage(row: Record<string, unknown>): ChatMessageDto {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    role: row.role as ChatMessageDto["role"],
    content: String(row.content),
    toolCalls: (row.tool_calls as ToolCallTrace[] | null) ?? null,
    model: (row.model as string | null) ?? null,
    createdAt: new Date(row.created_at as string).toISOString(),
  }
}

export class AiChatRepository {
  constructor(private readonly db: PostgresDatabase) {}

  async createSession(input: {
    organizationId: string
    workspaceId: string | null
    userId: string
    applicationCategory: ApplicationCategoryId
  }): Promise<ChatSessionDto> {
    const result = await this.db.query<Record<string, unknown>>(
      `insert into chat_sessions (
         id, organization_id, workspace_id, user_id, application_category, status,
         created_at, updated_at
       ) values ($1,$2,$3,$4,$5,'active',now(),now())
       returning *`,
      [
        randomUUID(),
        input.organizationId,
        input.workspaceId,
        input.userId,
        input.applicationCategory,
      ]
    )
    return mapSession(result.rows[0])
  }

  async findSessionById(sessionId: string): Promise<ChatSessionDto | null> {
    const result = await this.db.query<Record<string, unknown>>(
      "select * from chat_sessions where id = $1 and deleted_at is null",
      [sessionId]
    )
    const row = result.rows[0]
    return row ? mapSession(row) : null
  }

  async listSessionsByUser(organizationId: string, userId: string): Promise<ChatSessionDto[]> {
    const result = await this.db.query<Record<string, unknown>>(
      `select * from chat_sessions
       where organization_id = $1 and user_id = $2 and deleted_at is null
       order by updated_at desc`,
      [organizationId, userId]
    )
    return result.rows.map(mapSession)
  }

  async updateSessionTitle(sessionId: string, title: string): Promise<void> {
    await this.db.query("update chat_sessions set title = $2, updated_at = now() where id = $1", [
      sessionId,
      title,
    ])
  }

  async touchSession(sessionId: string): Promise<void> {
    await this.db.query("update chat_sessions set updated_at = now() where id = $1", [sessionId])
  }

  async appendMessage(input: {
    sessionId: string
    role: ChatMessageDto["role"]
    content: string
    toolCalls?: ToolCallTrace[] | null
    model?: string | null
  }): Promise<ChatMessageDto> {
    const result = await this.db.query<Record<string, unknown>>(
      `insert into chat_messages (id, session_id, role, content, tool_calls, model, created_at)
       values ($1,$2,$3,$4,$5::jsonb,$6,now())
       returning *`,
      [
        randomUUID(),
        input.sessionId,
        input.role,
        input.content,
        input.toolCalls ? JSON.stringify(input.toolCalls) : null,
        input.model ?? null,
      ]
    )
    return mapMessage(result.rows[0])
  }

  async listMessages(sessionId: string, limit = 50): Promise<ChatMessageDto[]> {
    const result = await this.db.query<Record<string, unknown>>(
      `select * from (
         select * from chat_messages where session_id = $1 order by created_at desc limit $2
       ) recent
       order by created_at asc`,
      [sessionId, limit]
    )
    return result.rows.map(mapMessage)
  }
}
