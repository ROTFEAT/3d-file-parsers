/**
 * PTS point cloud parser.
 *
 * Parses Leica PTS files into raw position and color arrays.
 * Framework-agnostic — returns plain typed arrays that work with any WebGL framework.
 *
 * Format:
 *   Line 1: point count (integer)
 *   Remaining lines: x y z [intensity] [r g b]
 *
 * Supports 3-column (xyz), 4-column (xyz+intensity), and 7-column (xyz+intensity+rgb).
 * Color values in PTS are integers 0-255, converted to normalized floats (0-1).
 */

export interface PTSData {
  /** Flat Float32Array of xyz positions (length = pointCount * 3) */
  positions: Float32Array;
  /** Flat Float32Array of rgb colors normalized to 0-1 (length = pointCount * 3), or null if no color data */
  colors: Float32Array | null;
  /** Number of parsed points */
  pointCount: number;
  /** Whether the file contained per-point color data */
  hasColor: boolean;
}

/**
 * Parse a PTS point cloud buffer into raw geometry data.
 *
 * @param buffer - Raw .pts file contents
 * @returns Parsed point cloud data with positions and optional colors
 *
 * @example
 * ```ts
 * const buffer = await fetch('scan.pts').then(r => r.arrayBuffer());
 * const { positions, colors, pointCount, hasColor } = parsePTS(buffer);
 * console.log(`Loaded ${pointCount} points`);
 * ```
 */
export function parsePTS(buffer: ArrayBuffer): PTSData {
  const text = new TextDecoder().decode(buffer);
  const lines = text.split('\n');

  // First non-empty line is the point count — skip it
  let startLine = 0;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i]!.trim();
    if (trimmed.length === 0) continue;
    if (/^\d+$/.test(trimmed)) {
      startLine = i + 1;
    } else {
      startLine = i;
    }
    break;
  }

  const positions: number[] = [];
  const colors: number[] = [];
  let hasColor = false;

  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (line.length === 0) continue;

    const parts = line.split(/\s+/);
    if (parts.length < 3) continue;

    positions.push(
      parseFloat(parts[0]!),
      parseFloat(parts[1]!),
      parseFloat(parts[2]!),
    );

    // 7 columns: x y z intensity r g b
    if (parts.length >= 7) {
      hasColor = true;
      colors.push(
        parseInt(parts[4]!, 10) / 255,
        parseInt(parts[5]!, 10) / 255,
        parseInt(parts[6]!, 10) / 255,
      );
    } else {
      colors.push(0.5, 0.5, 0.5);
    }
  }

  const pointCount = positions.length / 3;

  return {
    positions: new Float32Array(positions),
    colors: hasColor ? new Float32Array(colors) : null,
    pointCount,
    hasColor,
  };
}
