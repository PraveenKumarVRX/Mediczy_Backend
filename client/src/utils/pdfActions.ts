/**
 * Preview/download/share for a PDF already fetched as a Blob (the fetch itself stays with each
 * page's own authenticated client — these are pure browser-side actions on the resulting file).
 */

export function downloadPdfBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Opens the PDF in a new tab. `win` must be a window handle opened synchronously inside the
 * click handler (`window.open("", "_blank")`) *before* the blob fetch — assigning `location.href`
 * after an await loses the "opened in direct response to a user gesture" context in Safari and the
 * popup gets blocked. Falls back to a download if the window could not be opened at all.
 */
export function previewPdfBlob(blob: Blob, win: Window | null, filename: string) {
  const url = URL.createObjectURL(blob);
  if (win) {
    win.location.href = url;
  } else {
    downloadPdfBlob(blob, filename);
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export type ShareOutcome = "shared" | "downloaded" | "cancelled";

/** Shares the actual PDF file via the OS share sheet when available; otherwise falls back to a download. */
export async function sharePdfBlob(blob: Blob, filename: string, title: string): Promise<ShareOutcome> {
  const file = new File([blob], filename, { type: "application/pdf" });
  const nav = navigator as Navigator & { canShare?: (data: { files?: File[] }) => boolean };
  if (nav.canShare?.({ files: [file] }) && nav.share) {
    try {
      await nav.share({ files: [file], title });
      return "shared";
    } catch (err) {
      if ((err as DOMException)?.name === "AbortError") return "cancelled";
      throw err;
    }
  }
  downloadPdfBlob(blob, filename);
  return "downloaded";
}
