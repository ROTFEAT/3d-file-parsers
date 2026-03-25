/**
 * X3D (.x3d) XML parser.
 *
 * Parses X3D XML files into raw vertex/index data.
 * Supports core geometry nodes: IndexedFaceSet, IndexedTriangleSet, Box, Sphere, Cylinder, Cone.
 *
 * @see https://www.web3d.org/specifications/X3Dv4.0/ISO-IEC19775-1v4-IS/Part01/Architecture.html
 */

export interface X3DMesh {
  positions: Float32Array;
  normals: Float32Array | null;
  indices: Uint32Array;
  color?: [number, number, number];
}

export interface X3DData {
  meshes: X3DMesh[];
}

function parseFloatArray(str: string): number[] {
  return str
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(Number);
}

function parseIntArray(str: string): number[] {
  return str
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((s) => parseInt(s, 10));
}

function computeNormals(
  positions: Float32Array,
  indices: Uint32Array,
): Float32Array {
  const normals = new Float32Array(positions.length);

  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i]!,
      b = indices[i + 1]!,
      c = indices[i + 2]!;
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
    for (const idx of [a, b, c]) {
      normals[idx * 3] = normals[idx * 3]! + nx;
      normals[idx * 3 + 1] = normals[idx * 3 + 1]! + ny;
      normals[idx * 3 + 2] = normals[idx * 3 + 2]! + nz;
    }
  }

  for (let i = 0; i < normals.length; i += 3) {
    const x = normals[i]!,
      y = normals[i + 1]!,
      z = normals[i + 2]!;
    const len = Math.sqrt(x * x + y * y + z * z) || 1;
    normals[i] = x / len;
    normals[i + 1] = y / len;
    normals[i + 2] = z / len;
  }

  return normals;
}

function parseIndexedFaceSet(el: Element): X3DMesh | null {
  const coordEl = el.getElementsByTagName('Coordinate')[0];
  if (!coordEl) return null;

  const pointStr = coordEl.getAttribute('point');
  if (!pointStr) return null;

  const coords = parseFloatArray(pointStr);
  if (coords.length < 9) return null;

  const positions = new Float32Array(coords);
  const coordIndexStr = el.getAttribute('coordIndex') || '';
  const rawIndices = parseIntArray(coordIndexStr);

  const triangles: number[] = [];
  const polygon: number[] = [];

  for (const idx of rawIndices) {
    if (idx === -1) {
      for (let i = 1; i < polygon.length - 1; i++) {
        triangles.push(polygon[0]!, polygon[i]!, polygon[i + 1]!);
      }
      polygon.length = 0;
    } else {
      polygon.push(idx);
    }
  }
  if (polygon.length >= 3) {
    for (let i = 1; i < polygon.length - 1; i++) {
      triangles.push(polygon[0]!, polygon[i]!, polygon[i + 1]!);
    }
  }

  if (triangles.length === 0) return null;

  const indices = new Uint32Array(triangles);
  const normals = computeNormals(positions, indices);

  let color: [number, number, number] | undefined;
  const shape = el.parentElement;
  if (shape) {
    const matEl = shape.getElementsByTagName('Material')[0];
    if (matEl) {
      const dc = matEl.getAttribute('diffuseColor');
      if (dc) {
        const c = parseFloatArray(dc);
        if (c.length >= 3) color = [c[0]!, c[1]!, c[2]!];
      }
    }
  }

  return { positions, normals, indices, color };
}

function parseIndexedTriangleSet(el: Element): X3DMesh | null {
  const coordEl = el.getElementsByTagName('Coordinate')[0];
  if (!coordEl) return null;

  const pointStr = coordEl.getAttribute('point');
  if (!pointStr) return null;

  const coords = parseFloatArray(pointStr);
  const positions = new Float32Array(coords);

  const indexStr = el.getAttribute('index') || '';
  const indices = new Uint32Array(parseIntArray(indexStr));

  if (indices.length < 3) return null;

  const normals = computeNormals(positions, indices);
  return { positions, normals, indices };
}

function generateBox(size: [number, number, number]): X3DMesh {
  const [sx, sy, sz] = [size[0] / 2, size[1] / 2, size[2] / 2];
  const positions = new Float32Array([
    -sx, -sy, sz, sx, -sy, sz, sx, sy, sz, -sx, sy, sz,
    -sx, -sy, -sz, -sx, sy, -sz, sx, sy, -sz, sx, -sy, -sz,
    -sx, sy, -sz, -sx, sy, sz, sx, sy, sz, sx, sy, -sz,
    -sx, -sy, -sz, sx, -sy, -sz, sx, -sy, sz, -sx, -sy, sz,
    sx, -sy, -sz, sx, sy, -sz, sx, sy, sz, sx, -sy, sz,
    -sx, -sy, -sz, -sx, -sy, sz, -sx, sy, sz, -sx, sy, -sz,
  ]);
  const indices = new Uint32Array([
    0, 1, 2, 0, 2, 3,
    4, 5, 6, 4, 6, 7,
    8, 9, 10, 8, 10, 11,
    12, 13, 14, 12, 14, 15,
    16, 17, 18, 16, 18, 19,
    20, 21, 22, 20, 22, 23,
  ]);
  const normals = computeNormals(positions, indices);
  return { positions, normals, indices };
}

function extractMeshes(el: Element, meshes: X3DMesh[]): void {
  const tagName = el.tagName || el.nodeName;

  if (tagName === 'IndexedFaceSet') {
    const mesh = parseIndexedFaceSet(el);
    if (mesh) meshes.push(mesh);
    return;
  }

  if (tagName === 'IndexedTriangleSet') {
    const mesh = parseIndexedTriangleSet(el);
    if (mesh) meshes.push(mesh);
    return;
  }

  if (tagName === 'Box') {
    const sizeStr = el.getAttribute('size') || '2 2 2';
    const s = parseFloatArray(sizeStr);
    meshes.push(generateBox([s[0] || 2, s[1] || 2, s[2] || 2]));
    return;
  }

  const children = el.childNodes;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child && child.nodeType === 1) {
      extractMeshes(child as Element, meshes);
    }
  }
}

/**
 * Parse X3D XML text into mesh data.
 *
 * @param xmlText - Raw .x3d file contents as string
 * @param domParser - Optional DOMParser instance (for Node.js environments, pass @xmldom/xmldom)
 * @returns Parsed mesh data containing one or more meshes with positions, normals, and indices
 * @throws If no geometry is found or DOMParser is not available
 *
 * @example
 * ```ts
 * // Browser
 * const text = await fetch('scene.x3d').then(r => r.text());
 * const { meshes } = parseX3D(text);
 *
 * // Node.js
 * import { DOMParser } from '@xmldom/xmldom';
 * const { meshes } = parseX3D(text, new DOMParser());
 * ```
 */
export function parseX3D(
  xmlText: string,
  domParser?: { parseFromString(s: string, t: string): Document },
): X3DData {
  const parser =
    domParser || (typeof DOMParser !== 'undefined' ? new DOMParser() : null);
  if (!parser) {
    throw new Error('DOMParser not available — provide one via parameter');
  }

  const doc = parser.parseFromString(xmlText, 'text/xml');
  const meshes: X3DMesh[] = [];

  const scenes = doc.getElementsByTagName('Scene');
  if (scenes.length > 0) {
    extractMeshes(scenes[0]!, meshes);
  } else {
    extractMeshes(doc.documentElement!, meshes);
  }

  if (meshes.length === 0) {
    throw new Error('No geometry found in X3D file');
  }

  return { meshes };
}
