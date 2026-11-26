// Reads ASTM E57 3D scan files into three.js: each scan a point cloud, placed by its pose, with
// colours and intensity, moved near the origin, in metres and Y up.

import * as THREE from 'three';
import { countModel, ImportFiles, orient, type ImportInput, type ImportStats } from './common.js';
import { E57Error, E57File, prototypeFields, readCompressedVector, type E57Header } from './e57.js';
import { baseName, buildPoints, type ColorMode, type PointCloudOptions } from './points.js';
import type { XmlElement } from './xml.js';

export { ImportFiles, countModel } from './common.js';
export type { ImportInput, ImportFile, ImportData, ImportStats } from './common.js';
export type { ColorMode, PointCloudOptions } from './points.js';
export { E57File, E57Error, crc32c, prototypeFields, readCompressedVector, type E57Field, type E57Header } from './e57.js';

export interface E57Options extends PointCloudOptions {
  /** The .e57 file to open, if several are given. By default, the first. */
  main?: string;
  /** Checks every page's checksum, and refuses damaged files. Default true. */
  checksums?: boolean;
  /** Reads at most this many points in each scan, taking every nth one. Default 10 million. */
  maxPoints?: number;
}

export interface E57Scan {
  name: string;
  description: string;
  /** Points in the file, and points shown. */
  recordCount: number;
  points: number;
  /** The point fields, such as cartesianX, colorRed and intensity. */
  fields: string[];
  /** The scanner's pose: a rotation quaternion (w, x, y, z) and a translation, in metres. */
  rotation: [number, number, number, number];
  translation: [number, number, number];
}

export interface E57LoadResult {
  /** The scans, each a point cloud, in metres and Y up, in a group named after the file. */
  group: THREE.Group;
  header: E57Header;
  scans: E57Scan[];
  /** The coordinate reference system, if the file states one. */
  coordinateMetadata: string;
  /** The point at the group's origin, in the file's coordinates. */
  origin: [number, number, number];
  colorBy: ColorMode;
  /** The number of 2D images in the file, which are not read. */
  images: number;
  warnings: string[];
  stats: ImportStats & { scans: number };
}

export class E57ImportError extends Error {
  override name = 'E57ImportError';
}

const child = (e: XmlElement | undefined, name: string) => e?.children.find((c) => c.name === name);
const value = (e: XmlElement | undefined, name: string, fallback = 0) => {
  const c = child(e, name);
  return c && c.text.trim() ? Number(c.text.trim()) : fallback;
};
const text = (e: XmlElement | undefined, name: string) => child(e, name)?.text.trim() ?? '';

/** Reads an E57 file. */
export async function loadE57(input: ImportInput, options: E57Options = {}): Promise<E57LoadResult> {
  const files = await ImportFiles.from(input, 'scan.e57', ['e57']);
  const main = files.main(['e57'], options.main) ?? files.files[0];
  if (!main) throw new E57ImportError('There is no .e57 file to open');
  let file: E57File;
  let root: XmlElement;
  try {
    file = new E57File(main.bytes, options.checksums !== false);
    root = file.xml();
  } catch (error) {
    throw new E57ImportError(`${main.name}: ${(error as Error).message}`);
  }
  if (root.name !== 'e57Root') throw new E57ImportError(`${main.name}: the description's root is <${root.name}>, not <e57Root>`);
  const warnings: string[] = [];
  const scansXml = child(root, 'data3D')?.children ?? [];
  const images = child(root, 'images2D')?.children.length ?? 0;
  if (images) warnings.push(`The file has ${images} images, which are not read`);

  // Points of every scan, posed, in double precision.
  const scans: E57Scan[] = [];
  const data: { positions: Float64Array; colors?: Float32Array; intensity?: Float32Array }[] = [];
  for (const [i, s] of scansXml.entries()) {
    const points = child(s, 'points');
    const prototype = child(points, 'prototype');
    if (!points || !prototype) continue;
    const recordCount = Number(points.attributes.recordCount ?? 0);
    const name = text(s, 'name') || `Scan ${i + 1}`;
    let fields;
    let values: Map<string, Float64Array>;
    try {
      fields = prototypeFields(prototype);
      if (child(points, 'codecs')?.children.length) throw new E57Error('it uses codecs other than bit packing');
      values = readCompressedVector(file, Number(points.attributes.fileOffset), recordCount, fields);
    } catch (error) {
      if (error instanceof E57Error && /damaged/.test(error.message)) throw new E57ImportError(`${main.name}: ${error.message}`);
      warnings.push(`${name} could not be read: ${(error as Error).message}`);
      continue;
    }
    const get = (n: string) => values.get(n);
    const [x, y, z] = [get('cartesianX'), get('cartesianY'), get('cartesianZ')];
    const [range, azimuth, elevation] = [get('sphericalRange'), get('sphericalAzimuth'), get('sphericalElevation')];
    const cartesian = !!(x && y && z);
    if (!cartesian && !(range && azimuth && elevation)) {
      warnings.push(`${name} has no coordinates`);
      continue;
    }
    const invalid = get(cartesian ? 'cartesianInvalidState' : 'sphericalInvalidState');
    const [r, g, b] = [get('colorRed'), get('colorGreen'), get('colorBlue')];
    const colorInvalid = get('isColorInvalid');
    const inten = get('intensity');
    const intensityInvalid = get('isIntensityInvalid');

    // Colour and intensity limits come from the scan, or else from the fields' ranges.
    const limits = (group: string, field: string, fallback: [number, number]) => {
      const l = child(s, group);
      const lo = value(l, `${field}Minimum`, NaN);
      const hi = value(l, `${field}Maximum`, NaN);
      return Number.isFinite(lo) && Number.isFinite(hi) && hi > lo ? [lo, hi] : fallback;
    };
    const fieldRange = (n: string): [number, number] => {
      const p = prototype.children.find((c) => c.name === n)?.attributes;
      const lo = Number(p?.minimum ?? 0);
      const hi = Number(p?.maximum ?? 1);
      return p?.type === 'ScaledInteger' ? [lo * Number(p.scale ?? 1), hi * Number(p.scale ?? 1)] : [lo, hi];
    };
    const [cLo, cHi] = limits('colorLimits', 'colorRed', fieldRange('colorRed'));
    const [iLo, iHi] = limits('intensityLimits', 'intensity', fieldRange('intensity'));

    // The pose turns scanner coordinates into the file's.
    const pose = child(s, 'pose');
    const rot = child(pose, 'rotation');
    const tr = child(pose, 'translation');
    const q = new THREE.Quaternion(value(rot, 'x'), value(rot, 'y'), value(rot, 'z'), value(rot, 'w', 1)).normalize();
    const t = [value(tr, 'x'), value(tr, 'y'), value(tr, 'z')] as [number, number, number];
    const m = new THREE.Matrix4().makeRotationFromQuaternion(q).elements;

    const stride = Math.max(1, Math.ceil(recordCount / (options.maxPoints ?? 10_000_000)));
    const pos: number[] = [];
    const col: number[] = [];
    const its: number[] = [];
    const c = new THREE.Color();
    for (let k = 0; k < recordCount; k += stride) {
      if (invalid && invalid[k] !== 0) continue;
      let px: number;
      let py: number;
      let pz: number;
      if (cartesian) {
        px = x![k]!;
        py = y![k]!;
        pz = z![k]!;
      } else {
        const ce = Math.cos(elevation![k]!);
        px = range![k]! * ce * Math.cos(azimuth![k]!);
        py = range![k]! * ce * Math.sin(azimuth![k]!);
        pz = range![k]! * Math.sin(elevation![k]!);
      }
      pos.push(m[0]! * px + m[4]! * py + m[8]! * pz + t[0], m[1]! * px + m[5]! * py + m[9]! * pz + t[1], m[2]! * px + m[6]! * py + m[10]! * pz + t[2]);
      if (r && g && b) {
        if (colorInvalid && colorInvalid[k]) col.push(0.5, 0.5, 0.5);
        else {
          const span = cHi - cLo || 1;
          c.setRGB((r[k]! - cLo) / span, (g[k]! - cLo) / span, (b[k]! - cLo) / span, THREE.SRGBColorSpace);
          col.push(c.r, c.g, c.b);
        }
      }
      if (inten) its.push(intensityInvalid && intensityInvalid[k] ? 0 : (inten[k]! - iLo) / (iHi - iLo || 1));
    }
    if (stride > 1) warnings.push(`${name} has ${recordCount} points; every ${stride}th point is shown`);
    scans.push({ name, description: text(s, 'description'), recordCount, points: pos.length / 3, fields: fields.map((f) => f.name), rotation: [q.w, q.x, q.y, q.z], translation: t });
    data.push({ positions: new Float64Array(pos), colors: col.length ? new Float32Array(col) : undefined, intensity: its.length ? new Float32Array(its) : undefined });
  }

  // One origin for every scan, so they stay registered.
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const d of data) {
    for (let i = 0; i < d.positions.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k]!, d.positions[i + k]!);
        max[k] = Math.max(max[k]!, d.positions[i + k]!);
      }
    }
  }
  const any = data.some((d) => d.positions.length);
  const origin: [number, number, number] = any && options.recentre !== false ? [0, 1, 2].map((k) => (min[k]! + max[k]!) / 2) as [number, number, number] : [0, 0, 0];
  const name = baseName(main.name, /\.e57$/i);
  const clouds = new THREE.Group();
  clouds.name = name;
  let colorBy: ColorMode = 'none';
  data.forEach((d, i) => {
    for (let p = 0; p < d.positions.length; p += 3) for (let k = 0; k < 3; k++) d.positions[p + k]! -= origin[k]!;
    const built = buildPoints(scans[i]!.name, d, { ...options, recentre: false });
    built.points.userData.e57 = scans[i];
    colorBy = built.colorBy;
    clouds.add(built.points);
  });
  const group = orient(clouds, name, true, 1);
  return {
    group,
    header: file.header,
    scans,
    coordinateMetadata: text(root, 'coordinateMetadata'),
    origin,
    colorBy,
    images,
    warnings,
    stats: { ...countModel(group), scans: scans.length },
  };
}
