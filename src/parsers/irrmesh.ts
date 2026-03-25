/**
 * Irrlicht Mesh (.irrmesh) XML parser.
 *
 * Parses IRRMESH XML files into raw vertex/index data per buffer.
 * IRRMESH is a simple XML format with space-delimited vertex data.
 *
 * Vertex types:
 * - "standard":  position(3) + normal(3) + color(1 hex) + uv(2) = 9 tokens
 * - "2tcoords": standard + uv2(2) = 11 tokens
 * - "tangents": standard + tangent(3) + bitangent(3) = 15 tokens
 *
 * @see https://www.irrlicht3d.org/index.php?t=592
 * @see https://github.com/assimp/assimp/blob/master/code/AssetLib/Irr/IRRMeshLoader.cpp
 */

export interface IrrMeshBuffer {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  vertexCount: number;
  faceCount: number;
}

export interface IrrMeshData {
  buffers: IrrMeshBuffer[];
}

function getStride(type: string): number {
  switch (type) {
    case 'tangents':
      return 15;
    case '2tcoords':
      return 11;
    default:
      return 9; // "standard"
  }
}

/**
 * Parse IRRMESH XML text into mesh buffers.
 *
 * @param xmlText - Raw .irrmesh file contents as string
 * @param domParser - Optional DOMParser instance (for Node.js environments, pass @xmldom/xmldom)
 * @returns Parsed mesh data containing one or more buffers with positions, normals, and indices
 * @throws If no valid mesh buffers are found or DOMParser is not available
 *
 * @example
 * ```ts
 * // Browser
 * const text = await fetch('model.irrmesh').then(r => r.text());
 * const { buffers } = parseIrrMesh(text);
 *
 * // Node.js
 * import { DOMParser } from '@xmldom/xmldom';
 * const { buffers } = parseIrrMesh(text, new DOMParser());
 * ```
 */
export function parseIrrMesh(
  xmlText: string,
  domParser?: { parseFromString(s: string, t: string): Document },
): IrrMeshData {
  const parser =
    domParser || (typeof DOMParser !== 'undefined' ? new DOMParser() : null);
  if (!parser) {
    throw new Error('DOMParser not available — provide one via parameter');
  }

  const doc = parser.parseFromString(xmlText, 'text/xml');
  const bufferElements = doc.getElementsByTagName('buffer');
  const buffers: IrrMeshBuffer[] = [];

  for (let bi = 0; bi < bufferElements.length; bi++) {
    const bufEl = bufferElements[bi]!;

    const verticesEls = bufEl.getElementsByTagName('vertices');
    if (verticesEls.length === 0) continue;
    const verticesEl = verticesEls[0]!;

    const type = verticesEl.getAttribute('type') || 'standard';
    const vertexCount = parseInt(
      verticesEl.getAttribute('vertexCount') || '0',
      10,
    );
    if (vertexCount === 0) continue;

    const stride = getStride(type);
    const tokens = (verticesEl.textContent || '').trim().split(/\s+/);

    const positions = new Float32Array(vertexCount * 3);
    const normals = new Float32Array(vertexCount * 3);

    for (let v = 0; v < vertexCount; v++) {
      const base = v * stride;
      positions[v * 3] = parseFloat(tokens[base]!);
      positions[v * 3 + 1] = parseFloat(tokens[base + 1]!);
      positions[v * 3 + 2] = parseFloat(tokens[base + 2]!);
      normals[v * 3] = parseFloat(tokens[base + 3]!);
      normals[v * 3 + 1] = parseFloat(tokens[base + 4]!);
      normals[v * 3 + 2] = parseFloat(tokens[base + 5]!);
    }

    const indicesEls = bufEl.getElementsByTagName('indices');
    if (indicesEls.length === 0) continue;
    const indicesEl = indicesEls[0]!;

    const indexCount = parseInt(
      indicesEl.getAttribute('indexCount') || '0',
      10,
    );
    if (indexCount === 0) continue;

    const indexTokens = (indicesEl.textContent || '').trim().split(/\s+/);
    const indices = new Uint32Array(indexCount);
    for (let i = 0; i < indexCount; i++) {
      indices[i] = parseInt(indexTokens[i]!, 10);
    }

    buffers.push({
      positions,
      normals,
      indices,
      vertexCount,
      faceCount: indexCount / 3,
    });
  }

  if (buffers.length === 0) {
    throw new Error('No valid mesh buffers found in IRRMESH file');
  }

  return { buffers };
}
