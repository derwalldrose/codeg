"use client"

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"
import { useTranslations } from "next-intl"
import { useAcpActions } from "@/contexts/acp-connections-context"
import { useTaskContext } from "@/contexts/task-context"
import { useConnection, type UseConnectionReturn } from "@/hooks/use-connection"
import { AGENT_LABELS, type AgentType, type PromptDraft } from "@/lib/types"
import { getPromptDraftDisplayText } from "@/lib/prompt-draft"
import {
  clearActivePromptText,
  clearPendingPromptState,
  clearQueuedPrompt,
  getQueuedPrompt,
  setActivePromptText,
  setQueuedPrompt,
  setQueuedPromptIntent,
  subscribePendingPromptState,
  takeQueuedPrompt,
  type PendingPromptIntent,
  type QueuedPromptState,
} from "@/lib/pending-prompt-text"

interface UseConnectionLifecycleOptions {
  contextKey: string
  agentType: AgentType
  isActive: boolean
  workingDir?: string
  sessionId?: string
}

export type PromptDispatchIntent = "send" | PendingPromptIntent

export interface UseConnectionLifecycleReturn {
  conn: UseConnectionReturn
  modeLoading: boolean
  configOptionsLoading: boolean
  autoConnectError: string | null
  pendingPrompt: QueuedPromptState | null
  handleFocus: () => void
  handleSend: (
    draft: PromptDraft,
    modeId?: string | null,
    intent?: PromptDispatchIntent
  ) => void
  handleSendPendingPromptNow: () => void
  handleClearPendingPrompt: () => void
  handleSetConfigOption: (configId: string, valueId: string) => void
  handleCancel: () => void
  handleRespondPermission: (requestId: string, optionId: string) => void
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

function isExpectedAutoLinkError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false
  return (error as { alerted?: unknown }).alerted === true
}

export function useConnectionLifecycle({
  contextKey,
  agentType,
  isActive,
  workingDir,
  sessionId,
}: UseConnectionLifecycleOptions): UseConnectionLifecycleReturn {
  const t = useTranslations("Folder.chat.connectionLifecycle")
  const sharedT = useTranslations("Folder.chat.shared")
  const { setActiveKey, touchActivity } = useAcpActions()
  const { addTask, updateTask, removeTask } = useTaskContext()
  const conn = useConnection(contextKey)
  const pendingPrompt = useSyncExternalStore(
    subscribePendingPromptState,
    () => getQueuedPrompt(contextKey),
    () => getQueuedPrompt(contextKey)
  )

  const {
    status,
    selectorsReady,
    connect: connConnect,
    sendPrompt,
    setMode: connSetMode,
    setConfigOption: connSetConfigOption,
    cancel: connCancel,
    respondPermission: connRespondPermission,
    modes,
    configOptions,
  } = conn
  const isInteractiveStatus = status === "connected" || status === "prompting"
  const effectiveSelectorsReady =
    selectorsReady || modes !== null || configOptions !== null
  const selectorTaskIdRef = useRef<string | null>(null)
  const selectorTaskTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  )
  const selectorTaskSuppressedRef = useRef(false)
  const cancelRequestedRef = useRef(false)
  const modeLoading =
    status === "connecting" ||
    status === "downloading" ||
    (isInteractiveStatus && !effectiveSelectorsReady)
  const configOptionsLoading =
    status === "connecting" ||
    status === "downloading" ||
    (isInteractiveStatus && !effectiveSelectorsReady)
  const [lastAutoConnectError, setLastAutoConnectError] = useState<{
    contextKey: string
    agentType: AgentType
    message: string
  } | null>(null)

  const statusRef = useRef(status)
  useEffect(() => {
    statusRef.current = status
  }, [status])
  const contextKeyRef = useRef(contextKey)
  useEffect(() => {
    contextKeyRef.current = contextKey
  }, [contextKey])
  const connConnectRef = useRef(connConnect)
  useEffect(() => {
    connConnectRef.current = connConnect
  }, [connConnect])
  const agentTypeRef = useRef(agentType)
  useEffect(() => {
    agentTypeRef.current = agentType
  }, [agentType])
  const sessionIdRef = useRef(sessionId)
  useEffect(() => {
    sessionIdRef.current = sessionId
  }, [sessionId])
  const modeIdRef = useRef<string | null>(modes?.current_mode_id ?? null)
  useEffect(() => {
    modeIdRef.current = modes?.current_mode_id ?? null
  }, [modes?.current_mode_id])

  useEffect(() => {
    if (isActive && contextKey) {
      setActiveKey(contextKey)
      touchActivity(contextKey)
    }
  }, [isActive, contextKey, setActiveKey, touchActivity])

  useEffect(() => {
    if (!isActive) return
    if (!workingDir) return
    let cancelled = false
    const currentStatus = statusRef.current
    if (
      !currentStatus ||
      currentStatus === "disconnected" ||
      currentStatus === "error"
    ) {
      connConnectRef
        .current(agentTypeRef.current, workingDir, sessionIdRef.current, {
          source: "auto_link",
        })
        .then(() => {
          if (!cancelled) {
            setLastAutoConnectError(null)
          }
        })
        .catch((e: unknown) => {
          if (!cancelled) {
            setLastAutoConnectError({
              contextKey: contextKeyRef.current,
              agentType: agentTypeRef.current,
              message: normalizeErrorMessage(e),
            })
          }
          if (!isExpectedAutoLinkError(e)) {
            console.error("[ConnLifecycle] auto-connect:", e)
          }
        })
    }
    return () => {
      cancelled = true
    }
  }, [isActive, workingDir])

  const taskIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (status === "connecting" || status === "downloading") {
      if (!taskIdRef.current) {
        const id = `acp-connect-${Date.now()}`
        taskIdRef.current = id
        const agent = AGENT_LABELS[agentType]
        addTask(
          id,
          t("tasks.connectingTitle", { agent }),
          t("tasks.connectingDescription")
        )
      }
      updateTask(taskIdRef.current, { status: "running" })
    } else if (status === "connected" || status === "prompting") {
      if (taskIdRef.current) {
        updateTask(taskIdRef.current, { status: "completed" })
        taskIdRef.current = null
      }
    } else if (status === "error") {
      if (taskIdRef.current) {
        updateTask(taskIdRef.current, {
          status: "failed",
          error: t("errors.connectionFailed"),
        })
        taskIdRef.current = null
      }
    } else if (status === "disconnected" || status === null) {
      if (taskIdRef.current) {
        removeTask(taskIdRef.current)
        taskIdRef.current = null
      }
    }
  }, [status, addTask, updateTask, removeTask, agentType, t])

  useEffect(() => {
    if (status === "prompting") return
    clearActivePromptText(contextKey)
  }, [status, contextKey])

  const clearSelectorTask = useCallback(() => {
    if (selectorTaskTimeoutRef.current) {
      clearTimeout(selectorTaskTimeoutRef.current)
      selectorTaskTimeoutRef.current = null
    }
    if (selectorTaskIdRef.current) {
      removeTask(selectorTaskIdRef.current)
      selectorTaskIdRef.current = null
    }
  }, [removeTask])

  useEffect(() => {
    const isInteractive = status === "connected" || status === "prompting"
    if (!isInteractive) {
      selectorTaskSuppressedRef.current = false
      clearSelectorTask()
      return
    }

    if (selectorTaskSuppressedRef.current) {
      clearSelectorTask()
      return
    }

    const hasSelectorLoading = !effectiveSelectorsReady
    if (!hasSelectorLoading) {
      clearSelectorTask()
      return
    }

    if (!selectorTaskIdRef.current) {
      const id = `acp-selectors-${Date.now()}`
      selectorTaskIdRef.current = id
      const agent = AGENT_LABELS[agentType]
      addTask(
        id,
        t("tasks.loadingSelectorsTitle", { agent }),
        t("tasks.loadingSelectorsDescription")
      )
      updateTask(id, { status: "running" })
    }

    if (!selectorTaskTimeoutRef.current) {
      selectorTaskTimeoutRef.current = setTimeout(() => {
        selectorTaskTimeoutRef.current = null
        selectorTaskSuppressedRef.current = true
        clearSelectorTask()
      }, 5000)
    }
  }, [
    status,
    effectiveSelectorsReady,
    modes,
    configOptions,
    agentType,
    addTask,
    updateTask,
    clearSelectorTask,
    t,
  ])

  useEffect(() => {
    return () => {
      if (taskIdRef.current) {
        removeTask(taskIdRef.current)
      }
      selectorTaskSuppressedRef.current = false
      clearSelectorTask()
      clearPendingPromptState(contextKey)
    }
  }, [removeTask, clearSelectorTask, contextKey])

  const connectIfNeeded = useCallback(() => {
    if (!workingDir) return
    if (
      status === "connected" ||
      status === "prompting" ||
      status === "connecting" ||
      status === "downloading"
    ) {
      return
    }

    setLastAutoConnectError(null)
    connConnect(agentType, workingDir, sessionId, {
      source: "auto_link",
    }).catch((e: unknown) => {
      setLastAutoConnectError({
        contextKey,
        agentType,
        message: normalizeErrorMessage(e),
      })
      if (!isExpectedAutoLinkError(e)) {
        console.error("[ConnLifecycle] connect:", e)
      }
    })
  }, [agentType, connConnect, contextKey, sessionId, status, workingDir])

  const sendDraftNow = useCallback(
    (draft: PromptDraft, modeId?: string | null) => {
      const displayText = getPromptDraftDisplayText(
        draft,
        sharedT("attachedResources")
      )

      touchActivity(contextKey)
      setActivePromptText(contextKey, draft, displayText, modeId ?? null)

      void (async () => {
        const currentModeId = modeIdRef.current
        if (modeId && modeId !== currentModeId) {
          await connSetMode(modeId)
          modeIdRef.current = modeId
        }
        await sendPrompt(draft.blocks)
      })().catch((e: unknown) => {
        clearActivePromptText(contextKey)
        console.error("[ConnLifecycle] sendPrompt:", e)
      })
    },
    [connSetMode, sendPrompt, contextKey, touchActivity, sharedT]
  )

  const queueDraft = useCallback(
    (
      draft: PromptDraft,
      modeId: string | null | undefined,
      intent: PendingPromptIntent
    ) => {
      const displayText = getPromptDraftDisplayText(
        draft,
        sharedT("attachedResources")
      )

      touchActivity(contextKey)
      setQueuedPrompt(contextKey, draft, displayText, modeId ?? null, intent)
    },
    [contextKey, sharedT, touchActivity]
  )

  useEffect(() => {
    if (status !== "connected") return

    const queued = getQueuedPrompt(contextKey)
    if (!queued) {
      cancelRequestedRef.current = false
      return
    }

    if (cancelRequestedRef.current && queued.intent !== "steer") {
      cancelRequestedRef.current = false
      return
    }

    cancelRequestedRef.current = false
    const next = takeQueuedPrompt(contextKey)
    if (!next) return
    sendDraftNow(next.draft, next.modeId)
  }, [contextKey, sendDraftNow, status])

  const handleFocus = useCallback(() => {
    touchActivity(contextKey)
    if (!status || status === "disconnected" || status === "error") {
      setLastAutoConnectError(null)
      connConnect(agentType, workingDir, sessionId, {
        source: "auto_link",
      }).catch((e: unknown) => {
        if (!isExpectedAutoLinkError(e)) {
          console.error("[ConnLifecycle] connect:", e)
        }
      })
    }
  }, [
    agentType,
    workingDir,
    sessionId,
    status,
    connConnect,
    contextKey,
    touchActivity,
  ])

  const autoConnectError =
    status === "connected" || status === "prompting"
      ? null
      : lastAutoConnectError?.contextKey === contextKey &&
          lastAutoConnectError.agentType === agentType
        ? lastAutoConnectError.message
        : null

  const handleSend = useCallback(
    (
      draft: PromptDraft,
      modeId?: string | null,
      intent?: PromptDispatchIntent
    ) => {
      const resolvedIntent: PromptDispatchIntent =
        intent ?? (status === "prompting" ? "queue_next" : "send")

      if (resolvedIntent === "steer") {
        if (status === "connected") {
          sendDraftNow(draft, modeId)
          return
        }

        queueDraft(draft, modeId, "steer")
        if (status === "prompting") {
          cancelRequestedRef.current = true
          connCancel().catch((e: unknown) =>
            console.error("[ConnLifecycle] cancel for steer:", e)
          )
          return
        }

        connectIfNeeded()
        return
      }

      if (status === "prompting" || resolvedIntent === "queue_next") {
        queueDraft(draft, modeId, "queue_next")
        connectIfNeeded()
        return
      }

      if (status === "connected") {
        sendDraftNow(draft, modeId)
        return
      }

      queueDraft(draft, modeId, "queue_next")
      connectIfNeeded()
    },
    [status, sendDraftNow, queueDraft, connCancel, connectIfNeeded]
  )

  const handleSendPendingPromptNow = useCallback(() => {
    const queued = getQueuedPrompt(contextKey)
    if (!queued) return

    if (status === "prompting") {
      setQueuedPromptIntent(contextKey, "steer")
      cancelRequestedRef.current = true
      connCancel().catch((e: unknown) =>
        console.error("[ConnLifecycle] cancel pending steer:", e)
      )
      return
    }

    if (status === "connected") {
      const next = takeQueuedPrompt(contextKey)
      if (next) {
        sendDraftNow(next.draft, next.modeId)
      }
      return
    }

    connectIfNeeded()
  }, [contextKey, status, connCancel, sendDraftNow, connectIfNeeded])

  const handleClearPendingPrompt = useCallback(() => {
    clearQueuedPrompt(contextKey)
  }, [contextKey])

  const handleCancel = useCallback(() => {
    cancelRequestedRef.current = true
    connCancel().catch((e: unknown) =>
      console.error("[ConnLifecycle] cancel:", e)
    )
  }, [connCancel])

  const handleSetConfigOption = useCallback(
    (configId: string, valueId: string) => {
      touchActivity(contextKey)
      connSetConfigOption(configId, valueId).catch((e: unknown) =>
        console.error("[ConnLifecycle] setConfigOption:", e)
      )
    },
    [connSetConfigOption, contextKey, touchActivity]
  )

  const handleRespondPermission = useCallback(
    (requestId: string, optionId: string) => {
      touchActivity(contextKey)
      connRespondPermission(requestId, optionId).catch((e: unknown) =>
        console.error("[ConnLifecycle] respondPermission:", e)
      )
    },
    [connRespondPermission, contextKey, touchActivity]
  )

  return {
    conn,
    modeLoading,
    configOptionsLoading,
    autoConnectError,
    pendingPrompt,
    handleFocus,
    handleSend,
    handleSendPendingPromptNow,
    handleClearPendingPrompt,
    handleSetConfigOption,
    handleCancel,
    handleRespondPermission,
  }
}
