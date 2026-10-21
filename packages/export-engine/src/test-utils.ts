/**
 * Utilidades para las pruebas del motor de exportación.
 *
 * Los archivos que se generan van comprimidos (los flujos del PDF con
 * `FlateDecode` y las entradas del ZIP con Deflate), que es lo que hacen los
 * lectores reales. Las pruebas comprueban el contenido lógico, así que
 * primero lo despliegan.
 *
 * No forma parte de la API del paquete: solo lo usan los archivos de prueba.
 */
import { inflateRawSync, inflateSync } from "node:zlib";

/** Convierte los bytes en una cadena Latin-1, byte a byte. */
export function latin1(bytes: Uint8Array): string {
  let result = "";

  for (const byte of bytes) {
    result += String.fromCharCode(byte);
  }

  return result;
}

/**
 * Devuelve el PDF con los flujos comprimidos desplegados.
 *
 * Los flujos que no llevan `FlateDecode` (por ejemplo, un JPEG) se dejan
 * como están.
 */
export function pdfContent(bytes: Uint8Array): string {
  const texto = latin1(bytes);
  const patron = /\d+ 0 obj\s*<<([^>]*?)\/Filter \/FlateDecode([^>]*?)>>\s*stream\r?\n/gu;
  let salida = "";
  let ultimo = 0;
  let match: RegExpExecArray | null;

  while ((match = patron.exec(texto)) !== null) {
    const inicio = match.index + match[0].length;
    const fin = texto.indexOf("\nendstream", inicio);

    if (fin < 0) {
      break;
    }

    const plano = inflateSync(Buffer.from(texto.slice(inicio, fin), "latin1")).toString("latin1");

    salida += texto.slice(ultimo, match.index) + match[0] + plano;
    ultimo = fin;
  }

  return salida + texto.slice(ultimo);
}

export interface ZipEntryLeida {
  name: string;
  /** Contenido ya desplegado. */
  data: Uint8Array;
  /** Método de compresión: 0 sin comprimir, 8 Deflate. */
  method: number;
  offset: number;
}

/** Entradas de un ZIP sin desplegarlas: solo el nombre y el tamaño. */
export interface ZipEntryResumen {
  name: string;
  method: number;
  /** Tamaño guardado en el archivo. */
  compressedSize: number;
  /** Tamaño original de la entrada. */
  originalSize: number;
}

/**
 * Lista las entradas de un ZIP sin descomprimirlas.
 *
 * Sirve para comprobar el contenido de un archivo grande sin gastarse la
 * memoria de todos sus datos.
 */
export function zipEntriesResumen(bytes: Uint8Array): ZipEntryResumen[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries: ZipEntryResumen[] = [];
  let position = 0;

  while (position + 4 <= bytes.length && view.getUint32(position, true) === 0x04034b50) {
    const method = view.getUint16(position + 8, true);
    const compressedSize = view.getUint32(position + 18, true);
    const originalSize = view.getUint32(position + 22, true);
    const nameLength = view.getUint16(position + 26, true);
    const extraLength = view.getUint16(position + 28, true);
    const nameStart = position + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = new TextDecoder().decode(bytes.slice(nameStart, nameStart + nameLength));

    entries.push({ name, method, compressedSize, originalSize });
    position = dataStart + compressedSize;
  }

  return entries;
}

/** Lee las entradas locales de un ZIP y devuelve su contenido descomprimido. */
export function zipEntries(bytes: Uint8Array): Map<string, ZipEntryLeida> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries = new Map<string, ZipEntryLeida>();
  let position = 0;

  while (position + 4 <= bytes.length && view.getUint32(position, true) === 0x04034b50) {
    const method = view.getUint16(position + 8, true);
    const size = view.getUint32(position + 18, true);
    const nameLength = view.getUint16(position + 26, true);
    const extraLength = view.getUint16(position + 28, true);
    const nameStart = position + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = new TextDecoder().decode(bytes.slice(nameStart, nameStart + nameLength));
    const guardada = bytes.slice(dataStart, dataStart + size);
    const data = method === 8 ? new Uint8Array(inflateRawSync(guardada)) : guardada;

    entries.set(name, { name, data, method, offset: position });
    position = dataStart + size;
  }

  return entries;
}

/** Nombres de las entradas de un ZIP, en el orden en que aparecen. */
export function zipEntryNames(bytes: Uint8Array): string[] {
  return [...zipEntries(bytes).values()].map((entry) => entry.name);
}

/** Texto de una entrada del ZIP. */
export function zipText(entries: Map<string, ZipEntryLeida>, name: string): string {
  const entry = entries.get(name);

  if (!entry) {
    throw new Error(`Falta la entrada ${name}`);
  }

  return new TextDecoder().decode(entry.data);
}
