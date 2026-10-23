/**
 * Escritor de ZIP mínimo.
 *
 * Lo necesitan el EPUB (que es un ZIP) y el DOCX (que también). Las entradas
 * van comprimidas con Deflate, que es lo que espera cualquier lector, salvo
 * la entrada `mimetype` del EPUB: la especificación exige que sea la primera
 * del archivo y **sin comprimir**; `addFirst` lo garantiza.
 *
 * El archivo se escribe en un búfer que crece por duplicación, no en una
 * lista de números: con un libro de 80 fotografías el ZIP pesa unos 40 MB y
 * una lista de 40 millones de números se llevaría varios cientos de megabytes
 * de memoria, que es justo lo que no tiene una instancia de Render Free.
 */

import { deflateRawSync } from "node:zlib";

export interface ZipEntry {
  name: string;
  data: Uint8Array;
  /** Guarda la entrada sin comprimir y la coloca al principio del archivo. */
  first?: boolean;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);

  for (let index = 0; index < 256; index += 1) {
    let value = index;

    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }

    table[index] = value >>> 0;
  }

  return table;
})();

/** CRC-32, el que usa el formato ZIP. */
export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;

  for (const byte of data) {
    crc = (crc >>> 8) ^ (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.max(1980, date.getUTCFullYear());
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();
  const seconds = Math.floor(date.getUTCSeconds() / 2);

  return {
    time: (hours << 11) | (minutes << 5) | seconds,
    date: ((year - 1980) << 9) | (month << 5) | day,
  };
}

/**
 * Búfer de bytes que crece por duplicación.
 *
 * Guarda lo justo: el doble del contenido final mientras se escribe y una
 * copia al terminar. Un array de números ocuparía ocho bytes por byte del
 * archivo, y con fotografías eso son cientos de megabytes.
 */
class ByteWriter {
  private data: Uint8Array;

  private length = 0;

  constructor(capacity = 64 * 1024) {
    this.data = new Uint8Array(capacity);
  }

  get size(): number {
    return this.length;
  }

  private reserve(extra: number): void {
    const necesario = this.length + extra;

    if (necesario <= this.data.length) {
      return;
    }

    let capacidad = this.data.length * 2;

    while (capacidad < necesario) {
      capacidad *= 2;
    }

    const siguiente = new Uint8Array(capacidad);

    siguiente.set(this.data.subarray(0, this.length));
    this.data = siguiente;
  }

  u8(value: number): void {
    this.reserve(1);
    this.data[this.length] = value & 0xff;
    this.length += 1;
  }

  u16(value: number): void {
    this.reserve(2);
    this.data[this.length] = value & 0xff;
    this.data[this.length + 1] = (value >>> 8) & 0xff;
    this.length += 2;
  }

  u32(value: number): void {
    this.reserve(4);
    this.data[this.length] = value & 0xff;
    this.data[this.length + 1] = (value >>> 8) & 0xff;
    this.data[this.length + 2] = (value >>> 16) & 0xff;
    this.data[this.length + 3] = (value >>> 24) & 0xff;
    this.length += 4;
  }

  bytes(data: Uint8Array): void {
    this.reserve(data.length);
    this.data.set(data, this.length);
    this.length += data.length;
  }

  text(text: string): void {
    this.bytes(new TextEncoder().encode(text));
  }

  toUint8Array(): Uint8Array {
    return this.data.slice(0, this.length);
  }
}

interface CentralEntry {
  name: Uint8Array;
  method: number;
  checksum: number;
  compressedSize: number;
  originalSize: number;
  offset: number;
}

/**
 * Construye un archivo ZIP con las entradas indicadas.
 *
 * Las entradas marcadas con `first` se colocan al principio, en el orden en
 * que aparecen, y sin comprimir. Las demás van comprimidas con Deflate.
 */
export function buildZip(entries: ZipEntry[], modifiedAt: Date): Uint8Array {
  const salida = new ByteWriter();
  const central: CentralEntry[] = [];
  const stamp = dosDateTime(modifiedAt);

  const ordered = [
    ...entries.filter((entry) => entry.first),
    ...entries.filter((entry) => !entry.first),
  ];

  for (const entry of ordered) {
    const nameBytes = new TextEncoder().encode(entry.name);
    const checksum = crc32(entry.data);
    const offset = salida.size;
    // JPEG/PNG/WebP are already compressed. Storing them avoids CPU work and
    // a temporary copy for each illustration without losing image quality.
    const alreadyCompressed = /\.(?:jpe?g|png|webp|gif|avif)$/iu.test(entry.name);
    const comprimido =
      entry.first || alreadyCompressed ? null : deflateRawSync(entry.data, { level: 9 });
    const guardada = comprimido ?? entry.data;
    const method = comprimido ? 8 : 0;

    // Cabecera local.
    salida.u32(0x04034b50);
    salida.u16(10); // versión necesaria
    salida.u16(0); // flags
    salida.u16(method);
    salida.u16(stamp.time);
    salida.u16(stamp.date);
    salida.u32(checksum);
    salida.u32(guardada.length);
    salida.u32(entry.data.length);
    salida.u16(nameBytes.length);
    salida.u16(0); // sin campos extra
    salida.bytes(nameBytes);
    salida.bytes(guardada);

    central.push({
      name: nameBytes,
      method,
      checksum,
      compressedSize: guardada.length,
      originalSize: entry.data.length,
      offset,
    });
  }

  const centralOffset = salida.size;
  const centralStart = centralOffset;

  for (const entry of central) {
    // Registro central.
    salida.u32(0x02014b50);
    salida.u16(0x031e); // versión creada por UNIX, ZIP 3.0
    salida.u16(10);
    salida.u16(0);
    salida.u16(entry.method);
    salida.u16(stamp.time);
    salida.u16(stamp.date);
    salida.u32(entry.checksum);
    salida.u32(entry.compressedSize);
    salida.u32(entry.originalSize);
    salida.u16(entry.name.length);
    salida.u16(0); // extra
    salida.u16(0); // comentario
    salida.u16(0); // número de disco
    salida.u16(0); // atributos internos
    salida.u32(0); // atributos externos
    salida.u32(entry.offset);
    salida.bytes(entry.name);
  }

  const centralSize = salida.size - centralStart;

  // Fin del archivo central.
  salida.u32(0x06054b50);
  salida.u16(0);
  salida.u16(0);
  salida.u16(central.length);
  salida.u16(central.length);
  salida.u32(centralSize);
  salida.u32(centralOffset);
  salida.u16(0);

  return salida.toUint8Array();
}
