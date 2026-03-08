"use client"

export interface RuntimeEvent<T> {
  payload: T
}

export type RuntimeUnlistenFn = () => void

interface RuntimeWindowHandle {
  isMaximized: () => Promise<boolean>
  onResized: (handler: () => void) => Promise<RuntimeUnlistenFn>
  minimize: () => Promise<void>
  toggleMaximize: () => Promise<void>
  close: () => Promise<void>
}

declare global {
  interface Window {
    __TAURI__?: unknown
    __TAURI_INTERNALS__?: unknown
  }
}

function hasWindowRuntime() {
  return typeof window !== "undefined"
}

export function isTauriRuntime(): boolean {
  if (!hasWindowRuntime()) return false
  return (
    window.__TAURI__ !== undefined || window.__TAURI_INTERNALS__ !== undefined
  )
}

export function isWebRuntime(): boolean {
  return hasWindowRuntime() && !isTauriRuntime()
}

export function createRuntimeUnavailableError(capability: string): Error {
  return new Error(`当前为 Web 版预览，暂不支持${capability}。`)
}

export async function listenRuntimeEvent<T>(
  eventName: string,
  handler: (event: RuntimeEvent<T>) => void
): Promise<RuntimeUnlistenFn> {
  if (!isTauriRuntime()) {
    return () => {}
  }

  const { listen } = await import("@tauri-apps/api/event")
  return listen<T>(eventName, handler)
}

export async function openRuntimeDialog(options: {
  directory?: boolean
  multiple?: boolean
  defaultPath?: string
}): Promise<string | string[] | null> {
  if (!isTauriRuntime()) {
    return null
  }

  const { open } = await import("@tauri-apps/plugin-dialog")
  return open(options)
}

export async function openExternalUrl(url: string): Promise<void> {
  if (isTauriRuntime()) {
    const { openUrl } = await import("@tauri-apps/plugin-opener")
    await openUrl(url)
    return
  }

  if (!hasWindowRuntime()) return
  window.open(url, "_blank", "noopener,noreferrer")
}

export async function revealItemInRuntimeDir(path: string): Promise<void> {
  if (!isTauriRuntime()) {
    throw createRuntimeUnavailableError("在本地文件管理器中定位文件")
  }

  const { revealItemInDir } = await import("@tauri-apps/plugin-opener")
  await revealItemInDir(path)
}

export async function getRuntimeWindowHandle(): Promise<RuntimeWindowHandle | null> {
  if (!isTauriRuntime()) {
    return null
  }

  const { getCurrentWindow } = await import("@tauri-apps/api/window")
  const appWindow = getCurrentWindow()

  return {
    isMaximized: () => appWindow.isMaximized(),
    onResized: async (handler) => {
      return appWindow.onResized(() => {
        handler()
      })
    },
    minimize: () => appWindow.minimize(),
    toggleMaximize: () => appWindow.toggleMaximize(),
    close: () => appWindow.close(),
  }
}

export async function closeRuntimeWindow(): Promise<void> {
  const runtimeWindow = await getRuntimeWindowHandle()
  if (runtimeWindow) {
    await runtimeWindow.close()
    return
  }

  if (!hasWindowRuntime()) return
  window.history.back()
}
