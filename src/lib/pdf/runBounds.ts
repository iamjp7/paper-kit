import type { PdfTextRun } from './textItems'

/** Rough upper bound when pdf.js does not give a reliable width. */
export function estimateTextWidth(fontSize: number, text: string): number {
  let units = 0
  for (const ch of text) {
    if (/\s/.test(ch)) units += 0.28
    else if (/[il1.,|]/.test(ch)) units += 0.32
    else if (/[mwMW@%]/.test(ch)) units += 0.72
    else if (ch === '₹') units += 0.55
    else units += 0.52
  }
  return fontSize * Math.max(units, 0.35)
}

export function clampAdvanceWidth(fontSize: number, text: string, rawWidth: number): number {
  const estimate = estimateTextWidth(fontSize, text)
  if (rawWidth <= 0) return estimate
  // pdf.js sometimes reports a line-wide width — never trust it if far wider than the string.
  if (rawWidth > estimate * 1.35) return estimate
  return rawWidth
}

/** Width for the HTML edit overlay — tight to visible text, grows when the user types more. */
export function overlayAdvanceWidth(fontSize: number, text: string, advanceWidth: number): number {
  const estimate = estimateTextWidth(fontSize, text)
  const capped = advanceWidth > 0 ? Math.min(advanceWidth, estimate * 1.2) : estimate
  return Math.max(estimate * 1.06, capped, fontSize * 0.35)
}

/** Full width to whiteout original PDF glyphs in the editor and on export. */
export function eraseCoverWidth(
  fontSize: number,
  originalText: string,
  newText: string,
  advanceWidth: number,
): number {
  const originalEstimate = estimateTextWidth(fontSize, originalText)
  const newEstimate = estimateTextWidth(fontSize, newText || originalText)
  return Math.max(advanceWidth, originalEstimate * 1.08, newEstimate * 1.08)
}

export function coverWidthForText(
  measured: number,
  fontSize: number,
  text: string,
  advanceWidth: number,
): number {
  const estimate = estimateTextWidth(fontSize, text)
  const base = measured > 0 ? measured : Math.min(advanceWidth, estimate) || estimate
  return base + 1.5
}

export function runCoverRect(run: PdfTextRun, width: number) {
  const fs = run.fontSize
  const height = fs * 0.82
  return {
    x: run.x - 0.5,
    y: run.y - fs * 0.72,
    width,
    height,
  }
}
