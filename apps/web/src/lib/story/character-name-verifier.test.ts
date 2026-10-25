import { describe, expect, it } from "vitest";
import { verifyCharacterNames } from "./character-name-verifier";
import { personalNameParts, personalIdentity } from "./personal-name";
const analyze = (text: string) => verifyCharacterNames([{ id: "a", title: "Capítulo", text }]);
describe("verificación de nombres de ida y vuelta", () => {
  it("no convierte mayúsculas repetidas, instituciones, saludos o lugares en personajes", () => {
    const names = analyze(
      "La Noche volvió. La Noche cayó. Misterios avanzaban. Misterios regresaron. Banco Central habló. Banco Central volvió. —Hola —dijo Juan. —Hola —respondió Juan. Viajó a San Ramón. Vivía en San Ramón. Nicolás es un pueblo. Nicolás es un pueblo antiguo.",
    ).map((x) => x.name);
    expect(names).toEqual(["Juan"]);
  });
  it("reconoce nombre compuesto y dos apellidos sin inventar datos", () => {
    const [person] = analyze(
      "María Fernanda Ríos Ponce llegó. María Fernanda Ríos Ponce desapareció. —Volveré —dijo María Fernanda.",
    );
    expect(person?.name).toBe("María Fernanda Ríos Ponce");
    expect(person?.nameVerification).toMatchObject({
      givenNames: "María Fernanda",
      surnames: "Ríos Ponce",
      surnameStatus: "probable",
      reverseMentions: 3,
    });
    expect(person?.aliases).toContain("María Fernanda");
    expect(person?.age).toBeUndefined();
    expect(person?.description).toBeUndefined();
  });
  it("no declara apellido en dos nombres de pila", () => {
    expect(personalNameParts("Juan Carlos")).toMatchObject({
      givenNames: "Juan Carlos",
      surnames: "",
      surnameStatus: "not-determined",
    });
    expect(personalNameParts("María del Carmen")).toMatchObject({
      givenNames: "María del Carmen",
      surnames: "",
    });
  });
  it("reconoce partículas, apellido aislado y formas abreviadas realmente escritas", () => {
    const [person] = analyze(
      "Juan Carlos de la Cruz llegó. Juan Carlos de la Cruz sonrió. —Sí —dijo Cruz.",
    );
    expect(person?.nameVerification?.surnames).toBe("de la Cruz");
    expect(person?.aliases).toContain("Cruz");
    expect(personalNameParts("Salazar")).toMatchObject({
      givenNames: "",
      surnames: "Salazar",
      surnameStatus: "probable",
    });
  });
  it("no cuenta los tokens interiores del nombre como nuevas menciones ni alias", () => {
    const [person] = analyze("Andrés Salazar llegó. Andrés Salazar salió.");
    expect(person?.mentions).toBe(2);
    expect(person?.aliases).toEqual([]);
  });
  it("no une personajes que comparten nombre o apellido", () => {
    const people = analyze(
      "Juan Pérez llegó. Juan Pérez volvió. Juan García llegó. Juan García volvió. —Sí —dijo Juan. —No —dijo Juan. Ana Pérez habló. Ana Pérez volvió.",
    );
    expect(people.map((x) => x.name).sort()).toEqual(["Ana Pérez", "Juan García", "Juan Pérez"]);
    expect(
      people.find((x) => x.name === "Juan Pérez")?.nameVerification?.ambiguousVariants,
    ).toContain("Juan");
    expect(people.find((x) => x.name === "Juan Pérez")?.mentions).toBe(2);
  });
  it("tolera nombres inventados con atribución personal reiterada, sin adivinar apellido", () => {
    const [person] = analyze("—Sí —dijo Niv. —Volveré —respondió Niv.");
    expect(person?.name).toBe("Niv");
    expect(person?.nameVerification?.surnameStatus).toBe("not-determined");
    expect(analyze("Niv miró el reloj. Niv volvió.")).toEqual([]);
  });
  it("preserva Unicode, tildes, ñ, guiones, apóstrofos y nombres escritos en mayúsculas", () => {
    expect(personalIdentity("Jose\u0301 Peña")).toBe(personalIdentity("José Peña"));
    expect(personalIdentity("José Peña")).not.toBe(personalIdentity("Jose Pena"));
    const people = analyze(
      "JUAN PÉREZ habló. JUAN PÉREZ volvió. Ana-María O’Connor llegó. Ana-María O’Connor volvió.",
    );
    expect(people.map((x) => x.name)).toEqual(
      expect.arrayContaining(["JUAN PÉREZ", "Ana-María O’Connor"]),
    );
  });
  it("contrasta el manuscrito completo en ambas direcciones sin depender del orden de capítulos", () => {
    const sections = [
      { id: "a", title: "I", text: "Andrés Salazar llegó." },
      { id: "b", title: "II", text: "Andrés miró el cielo. —Sí —dijo Andrés." },
    ];
    const summarize = (input: typeof sections) =>
      verifyCharacterNames(input).map((x) => ({
        name: x.name,
        mentions: x.mentions,
        surnames: x.nameVerification?.surnames,
      }));
    expect(summarize(sections)).toEqual(summarize([...sections].reverse()));
    expect(summarize(sections)).toEqual([
      { name: "Andrés Salazar", mentions: 3, surnames: "Salazar" },
    ]);
  });
  it("una edad próxima de otra persona no se asigna al candidato", () => {
    const people = analyze(
      "Juan Pérez miró a Pedro, de 42 años. Juan Pérez volvió. —Sí —dijo Pedro.",
    );
    expect(people.find((x) => x.name === "Juan Pérez")?.age).toBeUndefined();
  });
});
it("reconoce un nombre regional no listado por el apellido y el contexto humano", () => {
  const [person] = analyze("Nayra Quispe llegó. Nayra Quispe volvió.");
  expect(person?.nameVerification).toMatchObject({
    givenNames: "Nayra",
    surnames: "Quispe",
    surnameStatus: "probable",
  });
});
it("no propone personajes a partir de encabezados nominales repetidos", () => {
  expect(analyze("Juan Carlos.\n\nJuan Carlos.")).toEqual([]);
});
