/**
 * Model 3D (.m3d) binary parser.
 *
 * Parses M3D binary files into mesh geometry data (positions, normals, indices).
 * Handles zlib-compressed and uncompressed variants.
 *
 * File structure:
 * - 8-byte header: "3DMO" (4 bytes) + file_size (uint32 LE)
 * - After header: chunk data (may be zlib compressed if byte[8] == 0x78)
 * - Chunks: HEAD, CMAP, TMAP, VRTS, MESH, BONE, MTRL, ACTN, OMD3 (end marker)
 *
 * @see https://gitlab.com/bztsrc/model3d/blob/master/docs/m3d_format.md
 */
import { unzlibSync } from 'fflate';

export interface M3DData {
  positions: Float32Array;
  normals: Float32Array | null;
  indices: Uint32Array;
  vertexCount: number;
  faceCount: number;
}

/**
 * Parse an M3D binary buffer into mesh geometry.
 *
 * @param buffer - Raw .m3d file contents
 * @returns Parsed mesh data with positions, normals, and triangle indices
 * @throws If the file is not a valid M3D file or contains no vertex data
 *
 * @example
 * ```ts
 * const buffer = await fetch('model.m3d').then(r => r.arrayBuffer());
 * const { positions, indices, normals } = parseM3D(buffer);
 * ```
 */
export function parseM3D(buffer: ArrayBuffer): M3DData {
  const fileData = new Uint8Array(buffer);

  // Validate magic: "3DMO"
  if (
    fileData[0] !== 0x33 ||
    fileData[1] !== 0x44 ||
    fileData[2] !== 0x4d ||
    fileData[3] !== 0x4f
  ) {
    throw new Error('Not a valid M3D file (expected "3DMO" magic)');
  }

  // Decompress if needed (byte 8 == 0x78 indicates zlib)
  let chunkData: Uint8Array;
  if (fileData[8] === 0x78) {
    chunkData = unzlibSync(fileData.slice(8));
  } else {
    chunkData = fileData.slice(8);
  }

  const view = new DataView(
    chunkData.buffer,
    chunkData.byteOffset,
    chunkData.byteLength,
  );
  let offset = 0;

  let scale = 1.0;
  let flags = 0;
  const positions: number[] = [];
  const indices: number[] = [];

  // Parse chunks
  while (offset + 8 <= chunkData.length) {
    const magic = String.fromCharCode(
      chunkData[offset]!,
      chunkData[offset + 1]!,
      chunkData[offset + 2]!,
      chunkData[offset + 3]!,
    );
    const chunkLen = view.getUint32(offset + 4, true);
    const chunkStart = offset + 8;
    const chunkEnd = offset + chunkLen;

    if (magic === 'OMD3' || chunkLen === 0) break;

    switch (magic) {
      case 'HEAD': {
        scale = view.getFloat32(chunkStart, true);
        flags = view.getUint32(chunkStart + 4, true);
        break;
      }
      case 'VRTS': {
        const ci_bits = flags & 0x03;
        let p = chunkStart;

        while (p + 4 <= chunkEnd) {
          let x: number, y: number, z: number;

          if (ci_bits <= 1) {
            if (p + 8 > chunkEnd) break;
            x = view.getInt16(p, true);
            p += 2;
            y = view.getInt16(p, true);
            p += 2;
            z = view.getInt16(p, true);
            p += 2;
            p += 2;
            positions.push(x * scale, y * scale, z * scale);
          } else if (ci_bits === 2) {
            if (p + 16 > chunkEnd) break;
            x = view.getFloat32(p, true);
            p += 4;
            y = view.getFloat32(p, true);
            p += 4;
            z = view.getFloat32(p, true);
            p += 4;
            p += 4;
            positions.push(x * scale, y * scale, z * scale);
          } else {
            if (p + 32 > chunkEnd) break;
            x = view.getFloat64(p, true);
            p += 8;
            y = view.getFloat64(p, true);
            p += 8;
            z = view.getFloat64(p, true);
            p += 8;
            p += 8;
            positions.push(x * scale, y * scale, z * scale);
          }
        }
        break;
      }
      case 'MESH': {
        const si_bits = (flags >> 2) & 0x03;
        const vi_bits = (flags >> 4) & 0x03;
        const si_s = 1 << si_bits;
        const vi_s = 1 << vi_bits;

        let p = chunkStart;

        while (p < chunkEnd) {
          const faceMagic = chunkData[p]!;
          p++;

          if (faceMagic === 0 || p >= chunkEnd) break;

          const numVerts = (faceMagic >> 4) & 0x0f;
          const hasUV = (faceMagic & 0x01) !== 0;
          const hasNormal = (faceMagic & 0x02) !== 0;

          p += si_s;
          if (p > chunkEnd) break;

          const faceVerts: number[] = [];
          for (let v = 0; v < numVerts && p <= chunkEnd; v++) {
            let vertIdx: number;
            if (vi_s === 1) {
              vertIdx = chunkData[p]!;
              p += 1;
            } else if (vi_s === 2) {
              vertIdx = view.getUint16(p, true);
              p += 2;
            } else {
              vertIdx = view.getUint32(p, true);
              p += 4;
            }
            faceVerts.push(vertIdx);

            if (hasUV) p += vi_s;
            if (hasNormal) p += vi_s;
          }

          // Fan triangulation
          for (let i = 1; i < faceVerts.length - 1; i++) {
            indices.push(faceVerts[0]!, faceVerts[i]!, faceVerts[i + 1]!);
          }
        }
        break;
      }
      default:
        break;
    }

    offset = chunkEnd;
  }

  if (positions.length === 0) {
    throw new Error('No vertex data found in M3D file');
  }

  const posArray = new Float32Array(positions);
  const idxArray = new Uint32Array(indices);

  // Compute normals
  let normalArray: Float32Array | null = null;
  if (indices.length > 0) {
    normalArray = new Float32Array(positions.length);
    for (let i = 0; i < idxArray.length; i += 3) {
      const a = idxArray[i]!,
        b = idxArray[i + 1]!,
        c = idxArray[i + 2]!;
      if (
        a * 3 + 2 >= posArray.length ||
        b * 3 + 2 >= posArray.length ||
        c * 3 + 2 >= posArray.length
      )
        continue;
      const ax = posArray[a * 3]!,
        ay = posArray[a * 3 + 1]!,
        az = posArray[a * 3 + 2]!;
      const bx = posArray[b * 3]!,
        by = posArray[b * 3 + 1]!,
        bz = posArray[b * 3 + 2]!;
      const cx = posArray[c * 3]!,
        cy = posArray[c * 3 + 1]!,
        cz = posArray[c * 3 + 2]!;
      const e1x = bx - ax,
        e1y = by - ay,
        e1z = bz - az;
      const e2x = cx - ax,
        e2y = cy - ay,
        e2z = cz - az;
      const nx = e1y * e2z - e1z * e2y;
      const ny = e1z * e2x - e1x * e2z;
      const nz = e1x * e2y - e1y * e2x;
      for (const idx of [a, b, c]) {
        normalArray[idx * 3] = normalArray[idx * 3]! + nx;
        normalArray[idx * 3 + 1] = normalArray[idx * 3 + 1]! + ny;
        normalArray[idx * 3 + 2] = normalArray[idx * 3 + 2]! + nz;
      }
    }
    for (let i = 0; i < normalArray.length; i += 3) {
      const x = normalArray[i]!,
        y = normalArray[i + 1]!,
        z = normalArray[i + 2]!;
      const len = Math.sqrt(x * x + y * y + z * z) || 1;
      normalArray[i] = x / len;
      normalArray[i + 1] = y / len;
      normalArray[i + 2] = z / len;
    }
  }

  return {
    positions: posArray,
    normals: normalArray,
    indices: idxArray,
    vertexCount: positions.length / 3,
    faceCount: indices.length / 3,
  };
}
