export function logInfo(message: string, data?: Record<string, unknown>) {
  console.log(`[INFO] ${message}`, data ?? "");
}

export function logError(message: string, data?: Record<string, unknown>) {
  console.error(`[ERROR] ${message}`, data ?? "");
}
