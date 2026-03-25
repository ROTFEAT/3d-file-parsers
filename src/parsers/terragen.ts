/**
 * Terragen (.ter) binary terrain parser.
 *
 * Parses Terragen heightmap terrain files into raw vertex/index/normal data.
 * Generates a triangulated mesh from the heightmap grid.
 *
 * Format: 16-byte header ("TERRAGEN" + "TERRAIN ") followed by chunk sequence.
 * All integers are little-endian. Chunks are 4-byte aligned.
 *
 * @see https://planetside.co.uk/wiki/index.php?title=Terragen_.TER_Format
 * @see https://github.com/assimp/assimp/blob/master/code/AssetLib/Terragen/TerragenLoader.cpp
 */

export interface TerragenData {
  positions: Float32Array;
  indices: Uint32Array;
  normals: Float32Array;
  /** Number of points along the X axis */
  xpts: number;
  /** Number of points along the Y axis */
  ypts: number;
}

/**
 * Parse a Terragen .ter binary buffer into terrain mesh geometry.
 *
 * @param buffer - Raw .ter file contents
 * @returns Triangulated terrain mesh with positions, normals, indices, and grid dimensions
 * @throws If the file is not a valid Terragen file or is missing heightmap data
 *
 * @example
 * ```ts
 * const buffer = await fetch('terrain.ter').then(r => r.arrayBuffer());
 * const { positions, indices, normals, xpts, ypts } = parseTerragen(buffer);
 * console.log(`Terrain grid: ${xpts}x${ypts}`);
 * ```
 */
export function parseTerragen(buffer: ArrayBuffer): TerragenData {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  const header = String.fromCharCode(...bytes.slice(0, 16));
  if (
    !header.startsWith('TERRAGEN') ||
    !header.substring(8).startsWith('TERRAIN ')
  ) {
    throw new Error('Not a valid Terragen .ter file');
  }

  let offset = 16;
  let xpts = 0;
  let ypts = 0;
  let scaleX = 30;
  let scaleZ = 30;
  let heightScale = 0;
  let baseHeight = 0;
  let elevations: Int16Array | null = null;

  while (offset + 4 <= buffer.byteLength) {
    const tag = String.fromCharCode(...bytes.slice(offset, offset + 4));
    offset += 4;

    if (tag === 'EOF ') break;

    switch (tag) {
      case 'SIZE':
        xpts = ypts = view.getInt16(offset, true) + 1;
        offset += 4;
        break;
      case 'XPTS':
        xpts = view.getInt16(offset, true);
        offset += 4;
        break;
      case 'YPTS':
        ypts = view.getInt16(offset, true);
        offset += 4;
        break;
      case 'SCAL':
        scaleX = view.getFloat32(offset, true);
        scaleZ = view.getFloat32(offset + 8, true);
        offset += 12;
        break;
      case 'CRAD':
        offset += 4;
        break;
      case 'CRVM':
        offset += 4;
        break;
      case 'ALTW':
        heightScale = view.getInt16(offset, true) / 65536;
        baseHeight = view.getInt16(offset + 2, true);
        offset += 4;
        elevations = new Int16Array(
          buffer.slice(offset, offset + xpts * ypts * 2),
        );
        offset += xpts * ypts * 2;
        break;
      default:
        break;
    }
    offset = (offset + 3) & ~3;
  }

  if (!elevations || xpts === 0 || ypts === 0) {
    throw new Error('Terragen file missing ALTW heightmap data');
  }

  const vertexCount = xpts * ypts;
  const positions = new Float32Array(vertexCount * 3);

  for (let y = 0; y < ypts; y++) {
    for (let x = 0; x < xpts; x++) {
      const idx = y * xpts + x;
      const h = elevations[idx]! * heightScale + baseHeight;
      positions[idx * 3] = x * scaleX;
      positions[idx * 3 + 1] = h * scaleZ;
      positions[idx * 3 + 2] = y * scaleX;
    }
  }

  const quadCount = (xpts - 1) * (ypts - 1);
  const indices = new Uint32Array(quadCount * 6);
  let ii = 0;

  for (let y = 0; y < ypts - 1; y++) {
    for (let x = 0; x < xpts - 1; x++) {
      const tl = y * xpts + x;
      const tr = tl + 1;
      const bl = (y + 1) * xpts + x;
      const br = bl + 1;
      indices[ii++] = tl;
      indices[ii++] = bl;
      indices[ii++] = tr;
      indices[ii++] = tr;
      indices[ii++] = bl;
      indices[ii++] = br;
    }
  }

  const normals = new Float32Array(vertexCount * 3);
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i]!;
    const b = indices[i + 1]!;
    const c = indices[i + 2]!;

    const ax = positions[a * 3]!,
      ay = positions[a * 3 + 1]!,
      az = positions[a * 3 + 2]!;
    const bx = positions[b * 3]!,
      by = positions[b * 3 + 1]!,
      bz = positions[b * 3 + 2]!;
    const cx = positions[c * 3]!,
      cy = positions[c * 3 + 1]!,
      cz = positions[c * 3 + 2]!;

    const e1x = bx - ax,
      e1y = by - ay,
      e1z = bz - az;
    const e2x = cx - ax,
      e2y = cy - ay,
      e2z = cz - az;
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;

    normals[a * 3] = normals[a * 3]! + nx;
    normals[a * 3 + 1] = normals[a * 3 + 1]! + ny;
    normals[a * 3 + 2] = normals[a * 3 + 2]! + nz;
    normals[b * 3] = normals[b * 3]! + nx;
    normals[b * 3 + 1] = normals[b * 3 + 1]! + ny;
    normals[b * 3 + 2] = normals[b * 3 + 2]! + nz;
    normals[c * 3] = normals[c * 3]! + nx;
    normals[c * 3 + 1] = normals[c * 3 + 1]! + ny;
    normals[c * 3 + 2] = normals[c * 3 + 2]! + nz;
  }

  for (let i = 0; i < vertexCount; i++) {
    const x = normals[i * 3]!,
      y = normals[i * 3 + 1]!,
      z = normals[i * 3 + 2]!;
    const len = Math.sqrt(x * x + y * y + z * z) || 1;
    normals[i * 3] = x / len;
    normals[i * 3 + 1] = y / len;
    normals[i * 3 + 2] = z / len;
  }

  return { positions, indices, normals, xpts, ypts };
}
