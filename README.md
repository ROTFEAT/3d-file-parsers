# 3d-file-parsers

Lightweight, framework-agnostic parsers for niche 3D file formats that **Three.js, Babylon.js, and Assimp.js don't natively support**.

All parsers return raw `Float32Array` / `Uint32Array` data — plug them into any WebGL/WebGPU renderer with zero adapter code.

> **Used in production** at [3D Tools by FabRapid](https://3d-tools.fabrapid.com) — a free, browser-based 3D file converter supporting 70+ input formats and 23 output formats with zero server uploads.

## Supported Formats

| Parser | Format | Extension | Description |
|--------|--------|-----------|-------------|
| `parseM3D` | [Model3D](https://gitlab.com/bztsrc/model3d) | `.m3d` | Binary mesh format with optional zlib compression. Supports int16/float32/float64 vertex precision and polygon meshes. |
| `parseX3D` | [X3D](https://www.web3d.org/specifications/) | `.x3d` | XML-based 3D scene format (ISO standard). Handles `IndexedFaceSet`, `IndexedTriangleSet`, and `Box` primitives with material colors. |
| `parseIrrMesh` | [Irrlicht Mesh](https://irrlicht.sourceforge.io/) | `.irrmesh` | XML mesh format from the Irrlicht Engine. Supports `standard`, `2tcoords`, and `tangents` vertex types. |
| `parseTerragen` | [Terragen](https://planetside.co.uk/) | `.ter` | Binary heightmap terrain format. Automatically triangulates the elevation grid into a renderable mesh. |
| `parsePTS` | [Leica PTS](https://en.wikipedia.org/wiki/Point_cloud) | `.pts` | ASCII point cloud format used by Leica laser scanners. Supports XYZ, XYZ+intensity, and XYZ+intensity+RGB columns. |

## Why This Exists

When building [3d-tools.fabrapid.com](https://3d-tools.fabrapid.com), we needed to support dozens of 3D formats in the browser. Most common formats (GLTF, OBJ, STL, FBX) are well-covered by Three.js loaders and Assimp WASM. But several formats — M3D, X3D, IrrMesh, Terragen, and PTS — had no JavaScript parser available, or the existing implementations were tightly coupled to a specific rendering engine.

We wrote these parsers from scratch based on the official format specifications, tested them against real-world files, and extracted them into this standalone package so others don't have to.

**Design principles:**
- **Zero framework dependency** — returns plain typed arrays, not Three.js objects
- **Isomorphic** — works in browsers and Node.js (XML parsers accept a custom `DOMParser`)
- **Tiny footprint** — only `fflate` (3KB gzipped) for M3D's zlib decompression; everything else is zero-dep
- **TypeScript-first** — full type definitions with documented interfaces

## Installation

```bash
# pnpm
pnpm add 3d-file-parsers

# npm
npm install 3d-file-parsers

# yarn
yarn add 3d-file-parsers
```

## Quick Start

### Import everything

```ts
import { parseM3D, parseX3D, parseIrrMesh, parseTerragen, parsePTS } from '3d-file-parsers';
```

### Or import individual parsers (tree-shakeable)

```ts
import { parseM3D } from '3d-file-parsers/m3d';
import { parseX3D } from '3d-file-parsers/x3d';
import { parseIrrMesh } from '3d-file-parsers/irrmesh';
import { parseTerragen } from '3d-file-parsers/terragen';
import { parsePTS } from '3d-file-parsers/pts';
```

## Usage

### Parse M3D (Model3D)

```ts
import { parseM3D } from '3d-file-parsers';

const response = await fetch('model.m3d');
const buffer = await response.arrayBuffer();

const { positions, normals, indices, vertexCount, faceCount } = parseM3D(buffer);

console.log(`Vertices: ${vertexCount}, Faces: ${faceCount}`);
// positions: Float32Array — flat xyz array (length = vertexCount * 3)
// normals:   Float32Array | null — auto-computed face normals
// indices:   Uint32Array — triangle indices
```

### Parse X3D

```ts
import { parseX3D } from '3d-file-parsers';

const response = await fetch('scene.x3d');
const text = await response.text();

const { meshes } = parseX3D(text);

for (const mesh of meshes) {
  console.log(`Mesh: ${mesh.indices.length / 3} triangles`);
  // mesh.positions: Float32Array
  // mesh.normals:   Float32Array | null
  // mesh.indices:   Uint32Array
  // mesh.color?:    [r, g, b] — diffuse material color (0-1)
}
```

#### Node.js usage (X3D / IrrMesh)

XML-based parsers need a `DOMParser`. In Node.js, pass one from `@xmldom/xmldom`:

```ts
import { DOMParser } from '@xmldom/xmldom';
import { parseX3D } from '3d-file-parsers';

const { meshes } = parseX3D(xmlString, new DOMParser());
```

### Parse IrrMesh (Irrlicht)

```ts
import { parseIrrMesh } from '3d-file-parsers';

const response = await fetch('model.irrmesh');
const text = await response.text();

const { buffers } = parseIrrMesh(text);

for (const buf of buffers) {
  console.log(`Buffer: ${buf.vertexCount} vertices, ${buf.faceCount} faces`);
  // buf.positions: Float32Array
  // buf.normals:   Float32Array
  // buf.indices:   Uint32Array
}
```

### Parse Terragen Terrain

```ts
import { parseTerragen } from '3d-file-parsers';

const response = await fetch('terrain.ter');
const buffer = await response.arrayBuffer();

const { positions, indices, normals, xpts, ypts } = parseTerragen(buffer);

console.log(`Terrain grid: ${xpts} x ${ypts} (${xpts * ypts} vertices)`);
// Automatically triangulated — ready to render as a mesh
```

### Parse PTS Point Cloud

```ts
import { parsePTS } from '3d-file-parsers';

const response = await fetch('scan.pts');
const buffer = await response.arrayBuffer();

const { positions, colors, pointCount, hasColor } = parsePTS(buffer);

console.log(`Points: ${pointCount}, Has color: ${hasColor}`);
// positions: Float32Array — flat xyz (length = pointCount * 3)
// colors:    Float32Array | null — flat rgb normalized to 0-1
```

## Using with Three.js

The parsers return raw typed arrays. Here's how to create Three.js geometry:

```ts
import * as THREE from 'three';
import { parseM3D } from '3d-file-parsers';

const data = parseM3D(buffer);
const geometry = new THREE.BufferGeometry();

geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));

if (data.normals) {
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(data.normals, 3));
}

if (data.indices.length > 0) {
  geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
}

const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
scene.add(mesh);
```

### Point cloud with Three.js

```ts
import * as THREE from 'three';
import { parsePTS } from '3d-file-parsers';

const data = parsePTS(buffer);
const geometry = new THREE.BufferGeometry();

geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));

if (data.colors) {
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(data.colors, 3));
}

const material = new THREE.PointsMaterial({
  size: 0.01,
  vertexColors: data.hasColor,
});

const points = new THREE.Points(geometry, material);
scene.add(points);
```

## Using with Babylon.js

```ts
import * as BABYLON from '@babylonjs/core';
import { parseM3D } from '3d-file-parsers';

const data = parseM3D(buffer);
const mesh = new BABYLON.Mesh('model', scene);
const vertexData = new BABYLON.VertexData();

vertexData.positions = Array.from(data.positions);
vertexData.indices = Array.from(data.indices);

if (data.normals) {
  vertexData.normals = Array.from(data.normals);
}

vertexData.applyToMesh(mesh);
```

## Using with Raw WebGL

```ts
import { parseM3D } from '3d-file-parsers';

const data = parseM3D(buffer);

const positionBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
gl.bufferData(gl.ARRAY_BUFFER, data.positions, gl.STATIC_DRAW);

const indexBuffer = gl.createBuffer();
gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data.indices, gl.STATIC_DRAW);

gl.drawElements(gl.TRIANGLES, data.indices.length, gl.UNSIGNED_INT, 0);
```

## API Reference

### `parseM3D(buffer: ArrayBuffer): M3DData`

| Property | Type | Description |
|----------|------|-------------|
| `positions` | `Float32Array` | Flat xyz vertex positions |
| `normals` | `Float32Array \| null` | Auto-computed vertex normals |
| `indices` | `Uint32Array` | Triangle indices |
| `vertexCount` | `number` | Number of vertices |
| `faceCount` | `number` | Number of triangles |

### `parseX3D(xmlText: string, domParser?): X3DData`

| Property | Type | Description |
|----------|------|-------------|
| `meshes` | `X3DMesh[]` | Array of parsed meshes |
| `meshes[].positions` | `Float32Array` | Flat xyz vertex positions |
| `meshes[].normals` | `Float32Array \| null` | Computed vertex normals |
| `meshes[].indices` | `Uint32Array` | Triangle indices |
| `meshes[].color` | `[r, g, b]?` | Diffuse material color (0-1) |

### `parseIrrMesh(xmlText: string, domParser?): IrrMeshData`

| Property | Type | Description |
|----------|------|-------------|
| `buffers` | `IrrMeshBuffer[]` | Array of mesh buffers |
| `buffers[].positions` | `Float32Array` | Flat xyz vertex positions |
| `buffers[].normals` | `Float32Array` | Vertex normals from file |
| `buffers[].indices` | `Uint32Array` | Triangle indices |
| `buffers[].vertexCount` | `number` | Vertices in this buffer |
| `buffers[].faceCount` | `number` | Triangles in this buffer |

### `parseTerragen(buffer: ArrayBuffer): TerragenData`

| Property | Type | Description |
|----------|------|-------------|
| `positions` | `Float32Array` | Flat xyz vertex positions |
| `indices` | `Uint32Array` | Triangle indices (2 per grid quad) |
| `normals` | `Float32Array` | Computed vertex normals |
| `xpts` | `number` | Grid points along X axis |
| `ypts` | `number` | Grid points along Y axis |

### `parsePTS(buffer: ArrayBuffer): PTSData`

| Property | Type | Description |
|----------|------|-------------|
| `positions` | `Float32Array` | Flat xyz point positions |
| `colors` | `Float32Array \| null` | RGB colors normalized 0-1 (null if no color data) |
| `pointCount` | `number` | Number of points |
| `hasColor` | `boolean` | Whether the file contained color data |

## Browser Support

Works in all modern browsers with `ArrayBuffer` and `DataView` support (Chrome 49+, Firefox 42+, Safari 10+, Edge 14+).

For Node.js, XML-based parsers (X3D, IrrMesh) require a DOM parser like [`@xmldom/xmldom`](https://www.npmjs.com/package/@xmldom/xmldom).

## Related Projects

- [3D Tools by FabRapid](https://3d-tools.fabrapid.com) — Free online 3D file converter (70+ formats, zero uploads, browser-only)
- [3D File Viewer](https://3d-tools.fabrapid.com/viewer) — Online 3D model viewer with support for all major formats
- [3D Model Compressor](https://3d-tools.fabrapid.com/compress) — Browser-based GLB compression with before/after comparison
- [Assimp](https://github.com/assimp/assimp) — The industry-standard C++ import library (covers most common formats)
- [Three.js](https://github.com/mrdoob/three.js) — WebGL rendering library with many built-in loaders
- [fflate](https://github.com/101arrowz/fflate) — Fast JavaScript compression library (used for M3D zlib decompression)

## Contributing

Contributions are welcome! If you need support for additional niche 3D formats, please [open an issue](https://github.com/ROTFEAT/3d-file-parsers/issues).

## License

MIT
