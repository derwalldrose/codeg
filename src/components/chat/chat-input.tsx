"use client"

import { useTranslations } from "next-intl"
import type {
  ConnectionStatus,
  PromptDraft,
  SessionConfigOptionInfo,
  SessionModeInfo,
  AvailableCommandInfo,
} from "@/lib/types"
import type { QueuedPromptState } from "@/lib/pending-prompt-text"
import {
  MessageInput,
  type PromptSubmitIntent,
} from "@/components/chat/message-input"

interface ChatInputProps {
  status: ConnectionStatus | null
  defaultPath?: string
  onFocus?: () => void
  onSend: (
    draft: PromptDraft,
    modeId?: string | null,
    intent?: PromptSubmitIntent
  ) => void
  onCancel: () => void
  modes?: SessionModeInfo[]
  configOptions?: SessionConfigOptionInfo[]
  modeLoading?: boolean
  configOptionsLoading?: boolean
  selectedModeId?: string | null
  onModeChange?: (modeId: string) => void
  onConfigOptionChange?: (configId: string, valueId: string) => void
  availableCommands?: AvailableCommandInfo[] | null
  attachmentTabId?: string | null
  draftStorageKey?: string | null
  pendingPrompt?: QueuedPromptState | null
  onSendPendingPromptNow?: () => void
  onClearPendingPrompt?: () => void
}

export function ChatInput({
  status,
  defaultPath,
  onFocus,
  onSend,
  onCancel,
  modes,
  configOptions,
  modeLoading = false,
  configOptionsLoading = false,
  selectedModeId,
  onModeChange,
  onConfigOptionChange,
  availableCommands,
  attachmentTabId,
  draftStorageKey,
  pendingPrompt,
  onSendPendingPromptNow,
  onClearPendingPrompt,
}: ChatInputProps) {
  const t = useTranslations("Folder.chat.chatInput")
  const isConnected = status === "connected"
  const isPrompting = status === "prompting"
  const isConnecting = status === "connecting" || status === "downloading"

  return (
    <div className="p-4 pt-0">
      <MessageInput
        onSend={onSend}
        onFocus={onFocus}
        defaultPath={defaultPath}
        disabled={!isConnected && !isPrompting}
        isPrompting={isPrompting}
        onCancel={onCancel}
        modes={modes}
        configOptions={configOptions}
        modeLoading={modeLoading}
        configOptionsLoading={configOptionsLoading}
        selectedModeId={selectedModeId}
        onModeChange={onModeChange}
        onConfigOptionChange={onConfigOptionChange}
        availableCommands={availableCommands}
        attachmentTabId={attachmentTabId}
        draftStorageKey={draftStorageKey}
        pendingPrompt={pendingPrompt}
        onSendPendingPromptNow={onSendPendingPromptNow}
        onClearPendingPrompt={onClearPendingPrompt}
        placeholder={
          isConnecting
            ? t("connecting")
            : isPrompting
              ? t("agentResponding")
              : t("sendMessage")
        }
        className="min-h-28 max-h-60"
      />
    </div>
  )
}
