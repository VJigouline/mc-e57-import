# Getting started

## Install

```sh
npm install three github:VJigouline/mc-e57-import
```

## Open a file

`loadE57` takes the file's contents (`ArrayBuffer`, `Uint8Array` or string), a browser `File`, `{ name, data }`, or an iterable of files. Zip archives among them are opened. It returns a promise of the model.

```ts
import * as THREE from 'three';
import { loadE57 } from 'mc-e57-import';

const input = document.querySelector<HTMLInputElement>('input[type=file]')!;
input.addEventListener('change', async () => {
  const result = await loadE57(input.files![0]!);
  scene.add(result.group);
  for (const warning of result.warnings) console.warn(warning);
});
```

## What you get

- **`group`:** a `THREE.Group` holding the model, named after the file.
- **`stats`:** counts of what was read.
- **`warnings`:** anything that couldn't be read or was left out.

E57 is Z up, in metres; the group turns the scans Y up. They are moved near the origin; `origin` gives the point moved there.

## Options

- **`main`** (default the first .e57 file): The file to open, if several are given.
- **`colorBy`** (default 'auto'): `'rgb'`, `'intensity'`, `'classification'`, `'elevation'` or `'none'`; `'auto'` takes colours, then intensity, then height.
- **`recentre`** (default true): Moves the cloud near the origin, as scan coordinates are too large for the GPU's precision; `origin` gives the point moved there.
- **`pointSize`** (default 2): Point size in pixels.
- **`checksums`** (default true): Checks each page's checksum, and refuses damaged files.
- **`maxPoints`** (default 10 million): Reads at most this many points in each scan, taking every nth one.

See the [API](API.md) for every field of the result.
