// Reads ASTM E57 3D imaging files: the paged file with its checksums, the XML description of
// the scans, and the bit-packed point records of each scan's compressed vector.

import { parseXml, type XmlElement } from './xml.js';

export class E57Error extends Error {
  override name = 'E57Error';
}

export interface E57Header {
  version: string;
  fileLength: number;
  xmlOffset: number;
  xmlLength: number;
  pageSize: number;
}

const PAGE = 1024;
const PAGE_DATA = 1020;

// CRC-32C (Castagnoli), which checks each page.
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0x82f63b78 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

export function crc32c(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** An E57 file: its pages, read as one logical stream. */
export class E57File {
  readonly header: E57Header;
  private readonly view: DataView;
  private readonly checked = new Set<number>();

  constructor(readonly bytes: Uint8Array, private readonly checkPages = true) {
    if (bytes.length < 48 || new TextDecoder('latin1').decode(bytes.subarray(0, 8)) !== 'ASTM-E57') throw new E57Error('Not an E57 file: it does not start with ASTM-E57');
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const u64 = (o: number) => Number(this.view.getBigUint64(o, true));
    this.header = {
      version: `${this.view.getUint32(8, true)}.${this.view.getUint32(12, true)}`,
      fileLength: u64(16),
      xmlOffset: u64(24),
      xmlLength: u64(32),
      pageSize: u64(40),
    };
    if (this.header.pageSize !== PAGE) throw new E57Error(`Pages of ${this.header.pageSize} bytes are not read; E57 files use 1024`);
    if (this.header.fileLength > bytes.length) throw new E57Error(`The file is ${bytes.length} bytes, shorter than the ${this.header.fileLength} its header gives`);
    this.checkPage(0);
  }

  /** Checks a page's CRC-32C, stored big-endian in its last four bytes. */
  private checkPage(page: number): void {
    if (!this.checkPages || this.checked.has(page)) return;
    const start = page * PAGE;
    if (start + PAGE > this.bytes.length) return;
    const stored = this.view.getUint32(start + PAGE_DATA, false);
    if (crc32c(this.bytes.subarray(start, start + PAGE_DATA)) !== stored) throw new E57Error(`Page ${page} of the file is damaged: its checksum is wrong`);
    this.checked.add(page);
  }

  static logical(physical: number): number {
    return physical - Math.floor(physical / PAGE) * 4;
  }

  /** Reads `length` bytes of the logical stream from a physical offset. */
  read(physical: number, length: number): Uint8Array {
    const out = new Uint8Array(length);
    let at = physical;
    let filled = 0;
    while (filled < length) {
      const page = Math.floor(at / PAGE);
      const inPage = at % PAGE;
      if (inPage >= PAGE_DATA) {
        at = (page + 1) * PAGE;
        continue;
      }
      this.checkPage(page);
      const take = Math.min(PAGE_DATA - inPage, length - filled);
      if (at + take > this.bytes.length) throw new E57Error('The file ends in the middle of its data');
      out.set(this.bytes.subarray(at, at + take), filled);
      filled += take;
      at += take;
      if (at % PAGE === PAGE_DATA) at += 4;
    }
    return out;
  }

  /** The physical offset `length` logical bytes after a physical offset. */
  static advance(physical: number, length: number): number {
    const logical = E57File.logical(physical) + length;
    return Math.floor(logical / PAGE_DATA) * PAGE + (logical % PAGE_DATA);
  }

  xml(): XmlElement {
    return parseXml(new TextDecoder().decode(this.read(this.header.xmlOffset, this.header.xmlLength)));
  }
}

/** A field of a point record, as the prototype describes it. */
export interface E57Field {
  name: string;
  type: 'Float' | 'Integer' | 'ScaledInteger';
  /** Bits per value: 32 or 64 for floats; for integers, enough for the range. */
  bits: number;
  minimum: number;
  scale: number;
  offset: number;
}

export function prototypeFields(prototype: XmlElement): E57Field[] {
  return prototype.children.map((c) => {
    const a = c.attributes;
    const type = a.type as E57Field['type'];
    if (type === 'Float') return { name: c.name, type, bits: a.precision === 'single' ? 32 : 64, minimum: 0, scale: 1, offset: 0 };
    if (type !== 'Integer' && type !== 'ScaledInteger') throw new E57Error(`Point fields of type ${a.type} are not read`);
    const min = BigInt(a.minimum ?? '-9223372036854775808');
    const max = BigInt(a.maximum ?? '9223372036854775807');
    const range = max - min;
    const bits = range === 0n ? 0 : range.toString(2).length;
    return { name: c.name, type, bits, minimum: Number(min), scale: type === 'ScaledInteger' ? Number(a.scale ?? 1) : 1, offset: type === 'ScaledInteger' ? Number(a.offset ?? 0) : 0 };
  });
}

/**
 * Reads the records of a compressed vector: every field's bytestream is gathered from the data
 * packets, then unpacked, bit by bit from the lowest, into numbers.
 */
export function readCompressedVector(file: E57File, fileOffset: number, recordCount: number, fields: E57Field[]): Map<string, Float64Array> {
  const out = new Map<string, Float64Array>(fields.map((f) => [f.name, new Float64Array(recordCount)]));
  if (!recordCount) return out;
  const head = file.read(fileOffset, 32);
  const hv = new DataView(head.buffer);
  if (head[0] !== 1) throw new E57Error(`The section at ${fileOffset} is not a compressed vector`);
  const sectionLength = Number(hv.getBigUint64(8, true));
  let at = Number(hv.getBigUint64(16, true));
  const end = E57File.logical(fileOffset) + sectionLength;
  const streams: Uint8Array[][] = fields.map(() => []);
  while (E57File.logical(at) < end) {
    const ph = file.read(at, 4);
    const type = ph[0]!;
    const length = new DataView(ph.buffer).getUint16(2, true) + 1;
    if (type === 1) {
      const packet = file.read(at, length);
      const pv = new DataView(packet.buffer);
      const count = pv.getUint16(4, true);
      let p = 6 + count * 2;
      for (let s = 0; s < count; s++) {
        const n = pv.getUint16(6 + s * 2, true);
        if (s < fields.length && n) streams[s]!.push(packet.subarray(p, p + n));
        p += n;
      }
    } else if (type !== 0 && type !== 2) throw new E57Error(`Unknown packet type ${type} in a compressed vector`);
    at = E57File.advance(at, length);
  }

  fields.forEach((f, s) => {
    const parts = streams[s]!;
    const total = parts.reduce((n, b) => n + b.length, 0);
    const bytes = new Uint8Array(total);
    let o = 0;
    for (const b of parts) {
      bytes.set(b, o);
      o += b.length;
    }
    const values = out.get(f.name)!;
    if (f.type === 'Float') {
      const v = new DataView(bytes.buffer);
      const size = f.bits / 8;
      const n = Math.min(recordCount, Math.floor(total / size));
      for (let i = 0; i < n; i++) values[i] = size === 4 ? v.getFloat32(i * 4, true) : v.getFloat64(i * 8, true);
      return;
    }
    if (f.bits === 0) {
      values.fill(f.minimum * f.scale + f.offset);
      return;
    }
    // Bits are packed from the lowest bit of each byte upwards.
    let bit = 0;
    const totalBits = total * 8;
    for (let i = 0; i < recordCount && bit + f.bits <= totalBits; i++) {
      let raw = 0;
      let mult = 1;
      let need = f.bits;
      while (need > 0) {
        const byte = bytes[bit >> 3]!;
        const offset = bit & 7;
        const take = Math.min(8 - offset, need);
        raw += ((byte >> offset) & ((1 << take) - 1)) * mult;
        mult *= 2 ** take;
        bit += take;
        need -= take;
      }
      values[i] = (raw + f.minimum) * f.scale + f.offset;
    }
  });
  return out;
}
