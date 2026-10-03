-- Phase 9/19 of the Madar AI intelligence layer: a deterministic, structured envelope
-- (facts/insights/recommendations/KPI cards/chart specs) persisted alongside the existing prose
-- `content`, built entirely from this turn's tool results (never LLM-authored -- see
-- ai-chat/response-formatter.ts). Purely additive: a message with no analytics tool calls simply
-- has structured = null, so existing rendering of `content` is completely unaffected.

alter table chat_messages add column if not exists structured jsonb;
