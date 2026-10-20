import { beforeEach, describe, expect, it } from "vitest";
import {
  clearDrafts,
  deleteDraft,
  indexedDbDisponible,
  listDrafts,
  loadDraft,
  saveDraft,
  type DraftRecord,
} from "./drafts";

function borrador(sectionId: string, extra: Partial<DraftRecord> = {}): DraftRecord {
  return {
    key: `usuario:libro:${sectionId}`,
    userId: "usuario",
    bookId: "libro",
    sectionId,
    baseVersion: 3,
    localVersion: 7,
    content: '{"type":"doc","content":[]}',
    updatedAt: "2026-10-20T10:00:00.000Z",
    syncState: "local",
    serverVersion: 3,
    ...extra,
  };
}

describe("almacén de borradores", () => {
  beforeEach(async () => {
    await clearDrafts("usuario", "libro");
  });

  it("guarda y recupera un borrador", async () => {
    await saveDraft(borrador("seccion-1"));

    const recuperado = await loadDraft("usuario", "libro", "seccion-1");

    expect(recuperado).not.toBeNull();
    expect(recuperado?.localVersion).toBe(7);
    expect(recuperado?.content).toContain("doc");
  });

  it("no devuelve el borrador de otra cuenta", async () => {
    await saveDraft(borrador("seccion-1", { userId: "otro", key: "otro:libro:seccion-1" }));

    const recuperado = await loadDraft("usuario", "libro", "seccion-1");

    expect(recuperado).toBeNull();
  });

  it("borra un borrador", async () => {
    await saveDraft(borrador("seccion-1"));
    await deleteDraft("usuario", "libro", "seccion-1");

    expect(await loadDraft("usuario", "libro", "seccion-1")).toBeNull();
  });

  it("lista los borradores de un libro, del más reciente al más antiguo", async () => {
    await saveDraft(borrador("seccion-1", { updatedAt: "2026-10-20T10:00:00.000Z" }));
    await saveDraft(borrador("seccion-2", { updatedAt: "2026-10-21T10:00:00.000Z" }));

    const lista = await listDrafts("usuario", "libro");

    expect(lista.map((registro) => registro.sectionId)).toEqual(["seccion-2", "seccion-1"]);
  });

  it("no lista los borradores de otro libro", async () => {
    await saveDraft(
      borrador("seccion-1", { bookId: "otro-libro", key: "usuario:otro-libro:seccion-1" }),
    );

    expect(await listDrafts("usuario", "libro")).toHaveLength(0);
  });

  it("limpia todos los borradores de un libro", async () => {
    await saveDraft(borrador("seccion-1"));
    await saveDraft(borrador("seccion-2"));

    await clearDrafts("usuario", "libro");

    expect(await listDrafts("usuario", "libro")).toHaveLength(0);
  });

  it("funciona aunque el navegador no tenga IndexedDB", async () => {
    // En el entorno de pruebas no hay IndexedDB: el almacén debe caer en la
    // memoria sin romperse.
    expect(indexedDbDisponible()).toBe(false);

    await saveDraft(borrador("seccion-1"));

    const recuperado = await loadDraft("usuario", "libro", "seccion-1");

    expect(recuperado?.sectionId).toBe("seccion-1");
  });
});
