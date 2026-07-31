/**
 * Signature geometry, shared by the pad, the on-screen preview, and the PDF.
 *
 * A signature is the path the finger travelled: an array of strokes, each an
 * array of [x, y] points. Both coordinates are divided by the PAD'S WIDTH, not
 * by each axis separately, so the handwriting keeps its proportions wherever it
 * is drawn again. x therefore runs 0..1 and y runs 0..1/SIGNATURE_ASPECT.
 *
 * The same numbers are stored in the database and rendered by the Edge Function
 * (migration 0015), which is the point: the preview on the phone and the ink on
 * the PDF are the same data, so they cannot drift.
 */

export type SignatureStroke = [number, number][];
export type SignatureStrokes = SignatureStroke[];

/** Width ÷ height of the capture area. Wide, because signatures are wide. */
export const SIGNATURE_ASPECT = 2.6;

/**
 * The database rejects anything shorter (migration 0015). Checking it here too
 * is not duplication — it is the difference between a disabled button and a
 * round trip that comes back with an error.
 */
export const MIN_SIGNATURE_POINTS = 12;

/**
 * Points closer together than this (in normalised units) are dropped as the
 * stroke is drawn. A finger held still emits dozens of near-identical samples
 * per second; keeping them would triple the payload and change nothing that is
 * visible.
 */
export const MIN_POINT_DISTANCE = 0.004;

export function signaturePointCount(strokes: SignatureStrokes): number {
  return strokes.reduce((total, stroke) => total + stroke.length, 0);
}

export function isSignatureUsable(strokes: SignatureStrokes): boolean {
  return signaturePointCount(strokes) >= MIN_SIGNATURE_POINTS;
}

/**
 * One SVG path per stroke, scaled to a given pixel width.
 *
 * A single-point stroke — a dot on an "i", or a full stop — becomes a
 * zero-length line, which with a round line cap renders as a dot. Skipping it
 * instead would silently drop part of the signature.
 */
/**
 * Fits a signature into a box, keeping its proportions and sitting it on the
 * bottom edge — the same fit the Edge Function performs for the PDF, so the
 * preview shows what will print.
 *
 * Fitted to its own bounding box rather than to the pad it was drawn on: a
 * small signature in the corner of the pad still needs to be legible on the
 * document.
 */
export function fitSignaturePaths(
  strokes: SignatureStrokes,
  boxWidth: number,
  boxHeight: number,
): string[] {
  const points = strokes.flat();
  if (points.length === 0 || boxWidth <= 0 || boxHeight <= 0) return [];

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  // A signature that is a single horizontal line has zero height; the epsilon
  // keeps the scale finite rather than producing NaN coordinates.
  const width = Math.max(maxX - minX, 1e-4);
  const height = Math.max(maxY - minY, 1e-4);
  const scale = Math.min(boxWidth / width, boxHeight / height);
  const left = (boxWidth - width * scale) / 2;
  const top = boxHeight - height * scale;

  return strokes
    .filter((stroke) => stroke.length > 0)
    .map((stroke) => {
      const at = ([x, y]: [number, number]) =>
        `${(left + (x - minX) * scale).toFixed(2)} ${(top + (y - minY) * scale).toFixed(2)}`;
      const head = `M ${at(stroke[0]!)}`;
      if (stroke.length === 1) return `${head} L ${at(stroke[0]!)}`;
      return (
        head +
        stroke
          .slice(1)
          .map((point) => ` L ${at(point)}`)
          .join('')
      );
    });
}

export function signaturePaths(strokes: SignatureStrokes, width: number): string[] {
  return strokes
    .filter((stroke) => stroke.length > 0)
    .map((stroke) => {
      const [x0, y0] = stroke[0]!;
      const head = `M ${(x0 * width).toFixed(2)} ${(y0 * width).toFixed(2)}`;
      if (stroke.length === 1)
        return `${head} L ${(x0 * width).toFixed(2)} ${(y0 * width).toFixed(2)}`;
      return (
        head +
        stroke
          .slice(1)
          .map(([x, y]) => ` L ${(x * width).toFixed(2)} ${(y * width).toFixed(2)}`)
          .join('')
      );
    });
}
