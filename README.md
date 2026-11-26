# mc-e57-import

An E57 importer for [three.js](https://threejs.org/), written in TypeScript. It reads ASTM E57 3D scan files: each scan a point cloud, placed by its pose, with colours and intensity, moved near the origin, in metres and Y up. It was made for [SceneEditor](https://github.com/VJigouline/SceneEditor), and works in any three.js application.

```ts
import { loadE57 } from 'mc-e57-import';

const result = await loadE57(await file.arrayBuffer());
scene.add(result.group);
console.log(result.warnings);       // anything that couldn't be read
```

## What it reads

- The paged file, with every page's CRC-32C checksum checked.
- The XML description of the scans: names, poses, colour and intensity limits, and the coordinate metadata.
- Point records packed with the bit-pack codec: Cartesian or spherical coordinates as floats, integers or scaled integers, colours, intensity, and invalid-point flags.
- Several scans, each a point cloud, registered by their poses around one origin.

The 2D images are not read, and point fields that are not coordinates, colour or intensity (such as row and column indices and time stamps) are not kept. See [Formats and support](Documentation/Support.md) for the details.

## Install

The package is not on the npm registry. Install it from GitHub:

```sh
npm install github:VJigouline/mc-e57-import
```

`three` (r160 or later) is a peer dependency. The package builds itself on install.

## Documentation

- [Getting started](Documentation/GettingStarted.md)
- [API](Documentation/API.md)
- [Formats and support](Documentation/Support.md)
- [Using it in SceneEditor](Documentation/SceneEditor.md)

## Development

```sh
npm install
npm test           # unit tests, with Vitest
npm run typecheck
npm run build      # dist/
```

The tests load real E57 files, kept in [`tests/samples`](tests/samples/README.md) with their licences. It needs Node.js 22 or later.

## Licence

[MIT](LICENSE)
