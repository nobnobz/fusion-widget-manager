export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    const message = error.message.trim();
    return message || fallback;
  }

  if (typeof error === 'string') {
    const message = error.trim();
    return message || fallback;
  }

  return fallback;
}
