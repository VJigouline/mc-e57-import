# API

## `loadE57(input, options?)`

Reads `.e57` and returns a promise of a `E57LoadResult`.

`input` is the file's contents (`ArrayBuffer`, `Uint8Array` or string), a browser `File`, `{ name, data }`, or an iterable of files. Zip archives among them are opened.

It throws a `E57ImportError` for input that isn't E57.

### Options

| Option | Default | Meaning |
| --- | --- | --- |
| `main` | the first .e57 file | The file to open, if several are given. |
| `colorBy` | 'auto' | `'rgb'`, `'intensity'`, `'classification'`, `'elevation'` or `'none'`; `'auto'` takes colours, then intensity, then height. |
| `recentre` | true | Moves the cloud near the origin, as scan coordinates are too large for the GPU's precision; `origin` gives the point moved there. |
| `pointSize` | 2 | Point size in pixels. |
| `checksums` | true | Checks each page's checksum, and refuses damaged files. |
| `maxPoints` | 10 million | Reads at most this many points in each scan, taking every nth one. |

### `E57LoadResult`

| Field | Type | Meaning |
| --- | --- | --- |
| `group` | `THREE.Group` | The model. |
| `header` | `E57Header` | The file header. |
| `scans` | `E57Scan[]` | Each scan: name, description, point counts, fields and pose. |
| `coordinateMetadata` | `string` | The coordinate reference system, if stated. |
| `origin` | `[x, y, z]` | The file's point at the cloud's origin, in file units. |
| `colorBy` | `ColorMode` | How the points are coloured. |
| `images` | `number` | The number of 2D images, not read. |
| `warnings` | `string[]` | Problems that didn't stop the import. |
| `stats` | object | Counts of meshes, triangles, lines and points. |

See the package's `index.d.ts` for every exported type and helper.
