/**
 * Escritor de ZIP mínimo.
 *
 * Lo necesitan el EPUB (que es un ZIP) y el DOCX (que también). Solo admite
 * entradas **sin comprimir**: es una limitación conocida y aceptable, porque
 * ambos formatos se leen igual de bien y evita añadir una dependencia de
 * compresión al proyecto.
 *
 * El EPUB exige además que la entrada `mimetype` sea la primera del
 * archivo y esté sin comprimir; `addFirst` lo garantiza.
 */

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

function writeUint16(target: number[], value: number): void {
  target.push(value & 0xff, (value >>> 8) & 0xff);
}

function writeUint32(target: number[], value: number): void {
  target.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}

function writeBytes(target: number[], data: number[] | Uint8Array): void {
  for (const byte of data) {
    target.push(byte);
  }
}

/**
 * Construye un archivo ZIP con las entradas indicadas.
 *
 * Las entradas marcadas con `first` se colocan al principio, en el orden en
 * que aparecen, y sin comprimir.
 */
export function buildZip(entries: ZipEntry[], modifiedAt: Date): Uint8Array {
  const output: number[] = [];
  const central: number[] = [];
  const stamp = dosDateTime(modifiedAt);

  const ordered = [
    ...entries.filter((entry) => entry.first),
    ...entries.filter((entry) => !entry.first),
  ];

  for (const entry of ordered) {
    const nameBytes = Array.from(new TextEncoder().encode(entry.name));
    const checksum = crc32(entry.data);
    const offset = output.length;

    // Cabecera local.
    writeUint32(output, 0x04034b50);
    writeUint16(output, 10); // versión necesaria
    writeUint16(output, 0); // flags
    writeUint16(output, 0); // sin comprimir
    writeUint16(output, stamp.time);
    writeUint16(output, stamp.date);
    writeUint32(output, checksum);
    writeUint32(output, entry.data.length);
    writeUint32(output, entry.data.length);
    writeUint16(output, nameBytes.length);
    writeUint16(output, 0); // sin campos extra
    writeBytes(output, nameBytes);
    writeBytes(output, entry.data);

    // Registro central.
    writeUint32(central, 0x02014b50);
    writeUint16(central, 0x031e); // versión creada por UNIX, ZIP 3.0
    writeUint16(central, 10);
    writeUint16(central, 0);
    writeUint16(central, 0);
    writeUint16(central, stamp.time);
    writeUint16(central, stamp.date);
    writeUint32(central, checksum);
    writeUint32(central, entry.data.length);
    writeUint32(central, entry.data.length);
    writeUint16(central, nameBytes.length);
    writeUint16(central, 0); // extra
    writeUint16(central, 0); // comentario
    writeUint16(central, 0); // número de disco
    writeUint16(central, 0); // atributos internos
    writeUint32(central, 0); // atributos externos
    writeUint32(central, offset);
    writeBytes(central, nameBytes);
  }

  const centralOffset = output.length;

  for (const byte of central) {
    output.push(byte);
  }

  const centralSize = central.length;

  // Fin del archivo central.
  writeUint32(output, 0x06054b50);
  writeUint16(output, 0);
  writeUint16(output, 0);
  writeUint16(output, ordered.length);
  writeUint16(output, ordered.length);
  writeUint32(output, centralSize);
  writeUint32(output, centralOffset);
  writeUint16(output, 0);

  return Uint8Array.from(output);
}
