# AI_ARCHITECTURE

## Goals
Design a provider-agnostic AI platform supporting assistant chat, insights, agents, and future automation.

## Core Layers

## 1. Prompt Layer
- Prompt templates versioned by use-case.
- Prompt policy guardrails (safety, tenant scoping, token limits).
- System/user/tool prompt composition pipeline.

## 2. Context Layer
- Pulls tenant/workspace/campaign/report context slices.
- Applies data minimization and role-based visibility filtering.
- Produces deterministic context snapshots for traceability.

## 3. Memory Layer
- Short-term memory: conversation window and session cache (Redis).
- Long-term memory: vectorized documents and prior insights (Vector DB).
- Memory retrieval strategy: semantic + metadata filters (tenant, time, domain).

## 4. Tool Layer
- Tool registry with typed input/output contracts.
- Tools include: reporting queries, campaign actions (future), connector checks, knowledge retrieval.
- Tool execution policy enforces RBAC and tenant boundaries.

## 5. Agent Layer
- Agent definitions: goal, tools, constraints, max steps, timeout.
- Supports planner-executor pattern for multi-step workflows.
- Async execution with resumable checkpoints.

## Model Abstraction
Provider adapter contract:
- `generate()` for sync completion.
- `stream()` for token streaming.
- `embed()` for vector operations.
- `usage()` for token/cost reporting.

Target providers:
- OpenAI
- Anthropic
- Local/self-hosted models

## RAG Readiness
- Document ingestion pipeline to embeddings.
- Chunking policy by source type.
- Metadata index: organization_id, workspace_id, source_type, freshness.
- Retrieval reranking optional extension point.

## Job Execution and Streaming
- Online path: low-latency chat streaming via server-sent events/websocket.
- Offline path: async agent jobs with event updates.
- Progress events: AgentRunStarted, StepCompleted, AgentRunCompleted/Failed.

## Conversation Storage
- PostgreSQL as system of record for conversations/messages.
- Attachments and artifacts in S3.
- Search index for conversation discovery.

## Token Accounting and Cost Control
- Per-message/provider token accounting.
- Tenant and workspace quotas.
- Budget alerts and hard caps per plan.

## Safety and Governance
- Prompt injection mitigation in context/tool layers.
- Content safety policy hooks before output delivery.
- Full audit trail for prompts, tools, outputs, and actor context.
