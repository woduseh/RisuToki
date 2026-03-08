export function errorToMessage(error: unknown, fallback = '알 수 없는 오류'): string {
  if (error instanceof Error) {
    return error.message || fallback;
  }

  if (typeof error === 'string' && error.trim()) {
    return error;
  }

  return fallback;
}

export function reportRuntimeError({
  context,
  error,
  fallbackMessage,
  logPrefix = '[Runtime]',
  setStatus,
  statusMessage
}: {
  context: string;
  error: unknown;
  fallbackMessage?: string;
  logPrefix?: string;
  setStatus?: ((message: string) => void) | null;
  statusMessage?: string;
}): string {
  const message = errorToMessage(error, fallbackMessage);
  console.warn(`${logPrefix} ${context}:`, error);
  if (setStatus) {
    setStatus(statusMessage || `${context}: ${message}`);
  }
  return message;
}
