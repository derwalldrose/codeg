"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { usePlatform } from "@/hooks/use-platform"
import { getRuntimeWindowHandle, isTauriRuntime } from "@/lib/runtime"
import { cn } from "@/lib/utils"

export function WindowControls() {
  const t = useTranslations("Folder.windowControls")
  const { isWindows } = usePlatform()
  const [isMaximized, setIsMaximized] = useState(false)
  const isNativeWindow = isWindows && isTauriRuntime()

  useEffect(() => {
    if (!isNativeWindow) return

    let disposed = false
    let unlistenResize: (() => void) | null = null
    let resizeFrame: number | null = null
    let appWindow: Awaited<ReturnType<typeof getRuntimeWindowHandle>> = null

    const syncMaximized = async () => {
      if (!appWindow) return
      try {
        const maximized = await appWindow.isMaximized()
        if (!disposed) {
          setIsMaximized(maximized)
        }
      } catch {
        if (!disposed) {
          setIsMaximized(false)
        }
      }
    }

    const scheduleSync = () => {
      if (resizeFrame !== null) return

      resizeFrame = window.requestAnimationFrame(() => {
        resizeFrame = null
        void syncMaximized()
      })
    }

    void syncMaximized()

    getRuntimeWindowHandle()
      .then((unlisten) => {
        appWindow = unlisten
        if (!appWindow) return null
        return appWindow.onResized(() => {
          scheduleSync()
        })
      })
      .then((dispose) => {
        unlistenResize = dispose ?? null
        void syncMaximized()
      })
      .catch(() => {
        unlistenResize = null
      })

    return () => {
      disposed = true
      if (resizeFrame !== null) {
        window.cancelAnimationFrame(resizeFrame)
      }
      unlistenResize?.()
    }
  }, [isNativeWindow])

  if (!isNativeWindow) return null

  return (
    <div className="flex h-8 items-stretch [-webkit-app-region:no-drag]">
      <button
        type="button"
        className={buttonClass}
        onClick={() => {
          getRuntimeWindowHandle()
            .then((appWindow) => appWindow?.minimize())
            .catch((err) => {
              console.error("[WindowControls] failed to minimize:", err)
            })
        }}
        aria-label={t("minimizeWindow")}
        title={t("minimize")}
      >
        <MinimizeIcon />
      </button>
      <button
        type="button"
        className={buttonClass}
        onClick={() => {
          getRuntimeWindowHandle()
            .then((appWindow) => appWindow?.toggleMaximize())
            .catch((err) => {
              console.error("[WindowControls] failed to toggle maximize:", err)
            })
        }}
        aria-label={t(isMaximized ? "restoreWindow" : "maximizeWindow")}
        title={t(isMaximized ? "restore" : "maximize")}
      >
        {isMaximized ? <RestoreIcon /> : <MaximizeIcon />}
      </button>
      <button
        type="button"
        className={cn(
          buttonClass,
          "hover:bg-[#e81123] hover:text-white active:bg-[#c50f1f] active:text-white"
        )}
        onClick={() => {
          getRuntimeWindowHandle()
            .then((appWindow) => appWindow?.close())
            .catch((err) => {
              console.error("[WindowControls] failed to close:", err)
            })
        }}
        aria-label={t("closeWindow")}
        title={t("close")}
      >
        <CloseIcon />
      </button>
    </div>
  )
}

const buttonClass =
  "flex h-8 w-[46px] items-center justify-center text-foreground/85 transition-colors duration-75 hover:bg-foreground/10 active:bg-foreground/15"

function MinimizeIcon() {
  return (
    <span
      aria-hidden
      className="inline-block h-px w-[10px] translate-y-[2px] bg-current"
    />
  )
}

function MaximizeIcon() {
  return (
    <span
      aria-hidden
      className="inline-block h-[10px] w-[10px] border border-current"
    />
  )
}

function RestoreIcon() {
  return (
    <span aria-hidden className="relative inline-block h-[10px] w-[10px]">
      <span className="absolute right-0 top-0 h-[7px] w-[7px] border border-current" />
      <span className="absolute bottom-0 left-0 h-[7px] w-[7px] border border-current" />
    </span>
  )
}

function CloseIcon() {
  return (
    <span aria-hidden className="relative inline-block h-[10px] w-[10px]">
      <span className="absolute left-1/2 top-0 h-[10px] w-px -translate-x-1/2 rotate-45 bg-current" />
      <span className="absolute left-1/2 top-0 h-[10px] w-px -translate-x-1/2 -rotate-45 bg-current" />
    </span>
  )
}
