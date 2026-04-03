function copyWithExecCommand(text: string): boolean {
  if (typeof document === 'undefined') {
    return false;
  }

  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.setAttribute('readonly', '');
  textArea.style.position = 'fixed';
  textArea.style.opacity = '0';
  textArea.style.pointerEvents = 'none';
  document.body.appendChild(textArea);
  textArea.select();

  let didCopy = false;

  try {
    didCopy = document.execCommand('copy');
  } finally {
    document.body.removeChild(textArea);
  }

  return didCopy;
}

export async function copyTextToClipboard(text: string): Promise<void> {
  if (
    typeof navigator !== 'undefined'
    && navigator.clipboard
    && typeof navigator.clipboard.writeText === 'function'
  ) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall back to execCommand when the async clipboard API is blocked.
    }
  }

  if (copyWithExecCommand(text)) {
    return;
  }

  throw new Error('Clipboard access is unavailable.');
}

export function downloadTextFile(text: string, filename: string, mimeType = 'application/json'): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined') {
    throw new Error('File downloads are unavailable in this environment.');
  }

  const blob = new Blob([text], { type: mimeType });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, 0);
}
