import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { crc32c, E57ImportError, loadE57 } from '../src/index.js';
import { sample } from './files.js';

const points = (g: THREE.Object3D) => {
  const out: THREE.Points[] = [];
  g.traverse((o) => (o as THREE.Points).isPoints && out.push(o as THREE.Points));
  return out;
};

describe('E57', () => {
  it('computes CRC-32C', () => {
    // The standard check value of CRC-32C.
    expect(crc32c(new TextEncoder().encode('123456789'))).toBe(0xe3069283);
  });

  it('reads coloured points stored as floats and doubles', async () => {
    for (const name of ['ColouredCubeFloat.e57', 'ColouredCubeDouble.e57']) {
      const r = await loadE57(sample(name));
      expect(r.header.version).toBe('1.0');
      expect(r.scans).toHaveLength(1);
      expect(r.stats.points, name).toBe(r.scans[0]!.recordCount);
      expect(r.colorBy).toBe('rgb');
      // A cube of side 1, around the origin.
      const box = points(r.group)[0]!.geometry.boundingBox!;
      expect(box.max.x - box.min.x).toBeCloseTo(1, 3);
    }
  });

  it('reads scaled integers, leaving out invalid points', async () => {
    const r = await loadE57(sample('bunnyInt32.e57'));
    expect(r.scans[0]).toMatchObject({ name: 'bunny', recordCount: 30571 });
    expect(r.scans[0]!.fields).toContain('cartesianInvalidState');
    expect(r.stats.points).toBeGreaterThan(30000);
    const box = points(r.group)[0]!.geometry.boundingBox!;
    // The bunny is about 15.6 cm wide, as its cartesianBounds say.
    expect(box.max.x - box.min.x).toBeCloseTo(0.094689 + 0.061009, 3);
    const doubles = await loadE57(sample('bunnyDouble.e57'));
    expect(doubles.stats.points).toBe(r.stats.points);
    expect(doubles.origin[0]).toBeCloseTo(r.origin[0], 5);
  });

  it('reads a file without points', async () => {
    const r = await loadE57(sample('ZeroPoints.e57'));
    expect(r.stats.points).toBe(0);
  });

  it('refuses damaged files and files that are not E57', async () => {
    await expect(loadE57(sample('bad-crc.e57'))).rejects.toThrow(/checksum/);
    await expect(loadE57('hello')).rejects.toThrow(E57ImportError);
  });
});
