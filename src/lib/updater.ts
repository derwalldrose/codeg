import type { Update } from "@tauri-apps/plugin-updater"
import { createRuntimeUnavailableError, isTauriRuntime } from "./runtime"

export interface AppUpdateCheckResult {
  currentVersion: string
  update: Update | null
}

export async function getCurrentAppVersion(): Promise<string> {
  if (!isTauriRuntime()) {
    return "web-preview"
  }

  const { getVersion } = await import("@tauri-apps/api/app")
  return getVersion()
}

export async function checkAppUpdate(): Promise<AppUpdateCheckResult> {
  if (!isTauriRuntime()) {
    return {
      currentVersion: "web-preview",
      update: null,
    }
  }

  const { getVersion } = await import("@tauri-apps/api/app")
  const { check } = await import("@tauri-apps/plugin-updater")
  const [currentVersion, update] = await Promise.all([getVersion(), check()])
  return { currentVersion, update }
}

export async function installAppUpdate(update: Update): Promise<void> {
  if (!isTauriRuntime()) {
    throw createRuntimeUnavailableError("应用更新安装")
  }

  await update.downloadAndInstall()
}

export async function relaunchApp(): Promise<void> {
  if (!isTauriRuntime()) {
    throw createRuntimeUnavailableError("应用重启")
  }

  const { relaunch } = await import("@tauri-apps/plugin-process")
  await relaunch()
}

export async function closeAppUpdate(update: Update): Promise<void> {
  await update.close()
}
