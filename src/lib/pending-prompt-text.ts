import type { PromptDraft } from "@/lib/types"

export type PendingPromptIntent = "queue_next" | "steer"

interface StoredPromptDraft {
  draft: PromptDraft
  modeId: string | null
  text: string
}

export interface QueuedPromptState extends StoredPromptDraft {
  intent: PendingPromptIntent
}

interface PendingPromptState {
  active: StoredPromptDraft | null
  queued: QueuedPromptState | null
}

const pendingPromptStateByContextKey = new Map<string, PendingPromptState>()
const pendingPromptStateListeners = new Set<() => void>()

function emitPendingPromptStateChange(): void {
  for (const listener of pendingPromptStateListeners) {
    listener()
  }
}

export function subscribePendingPromptState(listener: () => void): () => void {
  pendingPromptStateListeners.add(listener)
  return () => {
    pendingPromptStateListeners.delete(listener)
  }
}

function getOrCreatePendingPromptState(contextKey: string): PendingPromptState {
  let state = pendingPromptStateByContextKey.get(contextKey)
  if (!state) {
    state = {
      active: null,
      queued: null,
    }
    pendingPromptStateByContextKey.set(contextKey, state)
  }
  return state
}

function normalizePendingPromptText(text: string): string | null {
  const normalized = text.trim()
  return normalized.length > 0 ? normalized : null
}

function maybeCleanupPendingPromptState(contextKey: string): void {
  const state = pendingPromptStateByContextKey.get(contextKey)
  if (!state) return
  if (!state.active && !state.queued) {
    pendingPromptStateByContextKey.delete(contextKey)
  }
}

export function setActivePromptText(
  contextKey: string,
  draft: PromptDraft,
  text: string,
  modeId: string | null
): void {
  const normalized = normalizePendingPromptText(text)
  const state = getOrCreatePendingPromptState(contextKey)
  state.active =
    normalized === null
      ? null
      : {
          draft,
          modeId,
          text: normalized,
        }
  maybeCleanupPendingPromptState(contextKey)
  emitPendingPromptStateChange()
}

export function getPendingPromptText(contextKey: string): string | null {
  return pendingPromptStateByContextKey.get(contextKey)?.active?.text ?? null
}

export function clearActivePromptText(contextKey: string): void {
  const state = pendingPromptStateByContextKey.get(contextKey)
  if (!state) return
  state.active = null
  maybeCleanupPendingPromptState(contextKey)
  emitPendingPromptStateChange()
}

export function setQueuedPrompt(
  contextKey: string,
  draft: PromptDraft,
  text: string,
  modeId: string | null,
  intent: PendingPromptIntent
): void {
  const normalized = normalizePendingPromptText(text)
  const state = getOrCreatePendingPromptState(contextKey)
  state.queued =
    normalized === null
      ? null
      : {
          draft,
          modeId,
          text: normalized,
          intent,
        }
  maybeCleanupPendingPromptState(contextKey)
  emitPendingPromptStateChange()
}

export function getQueuedPrompt(contextKey: string): QueuedPromptState | null {
  return pendingPromptStateByContextKey.get(contextKey)?.queued ?? null
}

export function setQueuedPromptIntent(
  contextKey: string,
  intent: PendingPromptIntent
): void {
  const state = pendingPromptStateByContextKey.get(contextKey)
  if (!state?.queued) return
  state.queued = {
    ...state.queued,
    intent,
  }
  emitPendingPromptStateChange()
}

export function takeQueuedPrompt(contextKey: string): QueuedPromptState | null {
  const state = pendingPromptStateByContextKey.get(contextKey)
  if (!state?.queued) return null
  const queued = state.queued
  state.queued = null
  maybeCleanupPendingPromptState(contextKey)
  emitPendingPromptStateChange()
  return queued
}

export function clearQueuedPrompt(contextKey: string): void {
  const state = pendingPromptStateByContextKey.get(contextKey)
  if (!state) return
  state.queued = null
  maybeCleanupPendingPromptState(contextKey)
  emitPendingPromptStateChange()
}

export function migratePendingPromptState(
  fromContextKey: string,
  toContextKey: string
): void {
  if (fromContextKey === toContextKey) return

  const source = pendingPromptStateByContextKey.get(fromContextKey)
  if (!source) return

  const target = getOrCreatePendingPromptState(toContextKey)
  if (!target.active && source.active) {
    target.active = source.active
  }
  if (!target.queued && source.queued) {
    target.queued = source.queued
  }

  pendingPromptStateByContextKey.delete(fromContextKey)
  maybeCleanupPendingPromptState(toContextKey)
  emitPendingPromptStateChange()
}

export function clearPendingPromptState(contextKey: string): void {
  pendingPromptStateByContextKey.delete(contextKey)
  emitPendingPromptStateChange()
}
