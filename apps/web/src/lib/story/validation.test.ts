import { describe, expect, it } from "vitest";
import { characterFormSchema, planItemFormSchema, worldFormSchema } from "./validation";

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

describe("characterFormSchema", () => {
  it("normaliza los campos de texto vacíos a null", () => {
    const parsed = characterFormSchema.safeParse({
      bookId: "",
      name: "Elena Varela",
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
    }
  });

  it("rechaza un papel que no existe", () => {
    const parsed = characterFormSchema.safeParse({
      bookId: "",
      name: "Elena Varela",
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
});

describe("worldFormSchema", () => {
  it("acepta una entrada con solo el nombre y el tipo", () => {
    const parsed = worldFormSchema.safeParse({
      bookId: "",
      name: "La ciudad sumergida",
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
      kind: "PLACE",
      summary: "",
      description: "",
      rules: "",
      notes: "",
    });

    expect(parsed.success).toBe(false);
  });
});
