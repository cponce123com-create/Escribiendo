import { describe, expect, it } from "vitest";
import {
  aliasListSchema,
  characterFormSchema,
  MAX_ALIASES,
  planItemFormSchema,
  worldFormSchema,
} from "./validation";

describe("planItemFormSchema", () => {
  it("acepta una idea general con los campos opcionales vacíos", () => {
    const parsed = planItemFormSchema.safeParse({
      bookId: "",
      title: "  El reencuentro en el puerto  ",
      kind: "SCENE",
      status: "IDEA",
      summary: "",
    });

    expect(parsed.success).toBe(true);

    if (parsed.success) {
      expect(parsed.data.title).toBe("El reencuentro en el puerto");
      expect(parsed.data.bookId).toBeNull();
      expect(parsed.data.summary).toBeNull();
    }
  });

  it("rechaza un título vacío", () => {
    const parsed = planItemFormSchema.safeParse({
      bookId: "",
      title: "   ",
      kind: "SCENE",
      status: "IDEA",
      summary: "",
    });

    expect(parsed.success).toBe(false);
  });

  it("rechaza un libro que no es un UUID", () => {
    const parsed = planItemFormSchema.safeParse({
      bookId: "no-es-un-uuid",
      title: "Una idea",
      kind: "SCENE",
      status: "IDEA",
      summary: "",
    });

    expect(parsed.success).toBe(false);
  });
});

describe("aliasListSchema", () => {
  it("separa por comas, recorta y deduplica sin distinguir tildes ni mayúsculas", () => {
    const parsed = aliasListSchema.safeParse(" El   Rojo,  doña Ana , el rojo, ");

    expect(parsed.success).toBe(true);

    if (parsed.success) {
      expect(parsed.data).toEqual(["El Rojo", "doña Ana"]);
    }
  });

  it("trata la cadena vacía como una lista sin alias", () => {
    const parsed = aliasListSchema.safeParse("");

    expect(parsed.success).toBe(true);

    if (parsed.success) {
      expect(parsed.data).toEqual([]);
    }
  });

  it(`rechaza más de ${MAX_ALIASES} alias`, () => {
    const aliases = Array.from({ length: MAX_ALIASES + 1 }, (_, index) => `Alias ${index}`);
    const parsed = aliasListSchema.safeParse(aliases.join(","));

    expect(parsed.success).toBe(false);
  });

  it("rechaza un alias que supera el límite de la columna", () => {
    const parsed = aliasListSchema.safeParse("x".repeat(161));

    expect(parsed.success).toBe(false);
  });
});

describe("characterFormSchema", () => {
  it("normaliza los campos de texto vacíos a null", () => {
    const parsed = characterFormSchema.safeParse({
      bookId: "",
      name: "Elena Varela",
      aliases: "",
      role: "PROTAGONIST",
      age: "",
      occupation: "",
      summary: "",
      description: "",
      personality: "",
      motivation: "",
      conflict: "",
      arc: "",
      notes: "",
    });

    expect(parsed.success).toBe(true);

    if (parsed.success) {
      expect(parsed.data.age).toBeNull();
      expect(parsed.data.occupation).toBeNull();
      expect(parsed.data.notes).toBeNull();
      expect(parsed.data.aliases).toEqual([]);
    }
  });

  it("rechaza un papel que no existe", () => {
    const parsed = characterFormSchema.safeParse({
      bookId: "",
      name: "Elena Varela",
      aliases: "",
      role: "HERO",
      age: "",
      occupation: "",
      summary: "",
      description: "",
      personality: "",
      motivation: "",
      conflict: "",
      arc: "",
      notes: "",
    });

    expect(parsed.success).toBe(false);
  });

  it("rechaza un alias que repite el nombre canónico", () => {
    const parsed = characterFormSchema.safeParse({
      bookId: "",
      name: "Elena Varela",
      aliases: "elena varela",
      role: "PROTAGONIST",
      age: "",
      occupation: "",
      summary: "",
      description: "",
      personality: "",
      motivation: "",
      conflict: "",
      arc: "",
      notes: "",
    });

    expect(parsed.success).toBe(false);

    if (!parsed.success) {
      expect(parsed.error.issues[0]?.path).toEqual(["aliases"]);
    }
  });
});

describe("worldFormSchema", () => {
  it("acepta una entrada con solo el nombre y el tipo", () => {
    const parsed = worldFormSchema.safeParse({
      bookId: "",
      name: "La ciudad sumergida",
      aliases: "",
      kind: "PLACE",
      summary: "",
      description: "",
      rules: "",
      notes: "",
    });

    expect(parsed.success).toBe(true);

    if (parsed.success) {
      expect(parsed.data.description).toBeNull();
      expect(parsed.data.rules).toBeNull();
    }
  });

  it("rechaza un nombre que supera el límite de la columna", () => {
    const parsed = worldFormSchema.safeParse({
      bookId: "",
      name: "x".repeat(161),
      aliases: "",
      kind: "PLACE",
      summary: "",
      description: "",
      rules: "",
      notes: "",
    });

    expect(parsed.success).toBe(false);
  });

  it("guarda los alias normalizados de un lugar", () => {
    const parsed = worldFormSchema.safeParse({
      bookId: "",
      name: "La ciudad sumergida",
      aliases: "Ys, la sumergida",
      kind: "PLACE",
      summary: "",
      description: "",
      rules: "",
      notes: "",
    });

    expect(parsed.success).toBe(true);

    if (parsed.success) {
      expect(parsed.data.aliases).toEqual(["Ys", "la sumergida"]);
    }
  });
});
