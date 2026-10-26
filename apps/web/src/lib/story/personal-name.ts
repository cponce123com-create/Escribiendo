/** Léxico orientativo local: no pretende enumerar todos los nombres del mundo. */
const words = (value: string) => new Set(value.split(/\s+/u).filter(Boolean));
export const GIVEN_NAMES = words(
  `ada adan adriana agustin aida alberto alejandro alex alexander alfonso alfredo alicia alonso alvaro amanda ana andrea andres angel angela antonia antonio ariana ariel armando arturo beatriz belen benjamin blanca bruno camila carla carlos carmen carolina catalina cecilia cesar christian claudia clara cristian cristina daniel daniela dario david debora diego dolores dora eduardo elena elias elisa elizabeth emilia emilio enrique ernesto esperanza esteban eva fabian fatima federico felipe fernanda fernando francisca francisco gabriel gabriela gisela gloria gonzalo graciela guillermo gustavo hector helena hernan hugo ignacio ines irene iris isaac isabel ivan jaime javier jesus joaquin jorge jose josefa josefina juan juana julia julian julio karen karina kevin laura leandro leo leon leonardo leticia lili liliana lorena lucas lucia luciana luis luisa luz manuel manuela marcela marcelo marcos margarita maria mariana mario marta martin mateo matias mauricio mercedes miguel monica natalia nicolas noelia noe norma octavio olga oscar pablo paola patricia paul paula paz pedro pilar rafael ramiro raquel ramon raul rebeca renato ricardo roberto rocio rodrigo rosa rosario ruben ruth salvador samuel sandra santiago sara sebastian sergio silvia simon sofia sol soledad susana teresa tomas valentina valeria vanessa veronica vicente victoria victor vilma walter wilson ximena yolanda zoe li ian ivo`,
);
export const SURNAMES = words(
  `aguilar alarcon alvarez arias arroyo ayala benitez blanco bravo caballero cabrera calderon campos cardenas carrasco castillo castro chavez cho cabezas cordova cornejo cortez cruz delgado diaz dominguez espinoza estrada fernandez flores fuentes garcia gil gomez gonzales gonzalez guerrero guzman hernandez herrera huaman huaraca inga inoue jimenez juarez leon lopez luna maldonado marin marquez martinez medina mejia mendez mendoza molina montes morales moreno munoz navarro nunez ochoa olano olivera ortega ortiz osorio pacheco padilla palma paredes pardo paz pena peralta perez pineda pizarro ponce prado quispe quiroz ramirez ramos reyes rios rivera rojas romero ruiz salazar salas salinas sanchez sandoval santana santiago santos silva simeon soto suarez torres valdez valencia vargas vega velasco vera vilchez villanueva zambrano zhang wang smith jones brown o'connor`,
);
export const NAME_PARTICLES = words(
  "de del la las los da das do dos van von der den di du le bin bint al",
);
const COMPOUND_GIVEN = words(
  "maria-del-carmen maria-del-mar maria-de-los-angeles maria-del-pilar maria-de-las-mercedes maria-del-rosario maria-de-los-dolores",
);
export const AMBIGUOUS_GIVEN = words(
  "luz paz sol esperanza victoria dolores blanca rosa iris gloria salvador santiago leon carmen pilar soledad rosario mercedes",
);
export const NON_PERSON_WORDS = words(
  `hola adios gracias perdon oye vaya vamos claro bien mal silencio oscuridad misterio misterios sombra sombras luz luna sol paz guerra amor odio muerte destino noche dia tarde madrugada amanecer atardecer puerta ventana reloj casa cielo mundo historia historias cronicas primavera verano otono invierno universidad banco central nacional municipalidad ministerio gobierno editorial biblioteca hospital colegio escuela restaurante hotel plaza parque puente calle avenida ciudad provincia distrito region pais republica capitulo prologo epilogo parte cuento novela libro final dios hombre mujer muchacho muchacha joven jovenes nino nina anciano anciana feliz triste bueno buena grande pequeno primera segundo tercero durante mientras finalmente entretanto entonces despues ahora antes siempre nunca nada nadie algo alguien todos todas todo toda alguno alguna aqui alli alla donde cuando porque aunque pero mientras además ademas mañana tiempo justicia lluvia viento`,
);
export function lexicalName(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("es");
}
/** Identidad: conserva tildes y ñ; normaliza únicamente Unicode, caja y espacios. */
export function personalIdentity(value: string): string {
  return value.normalize("NFC").toLocaleLowerCase("es").replace(/\s+/gu, " ").trim();
}
export interface PersonalNameParts {
  givenNames: string;
  surnames: string;
  surnameStatus: "probable" | "not-determined";
  basis: string;
}
export function personalNameParts(value: string): PersonalNameParts {
  const surface = value.normalize("NFC").trim().split(/\s+/u),
    normalized = surface.map(lexicalName);
  if (surface.length === 1 && SURNAMES.has(normalized[0]!) && !GIVEN_NAMES.has(normalized[0]!))
    return {
      givenNames: "",
      surnames: surface[0]!,
      surnameStatus: "probable",
      basis: "Posible apellido aislado; el nombre no aparece en esta forma.",
    };
  let given = 0;
  for (let count = Math.min(5, surface.length); count >= 1; count--)
    if (COMPOUND_GIVEN.has(normalized.slice(0, count).join("-"))) {
      given = count;
      break;
    }
  if (!given) while (given < surface.length && isGivenName(normalized[given]!)) given++;
  // Un token que también es apellido no cambia por sí solo un nombre compuesto.
  if (!given && surface.length > 1) {
    let boundary = surface.length;
    while (
      boundary > 1 &&
      (SURNAMES.has(normalized[boundary - 1]!) || NAME_PARTICLES.has(normalized[boundary - 1]!))
    )
      boundary--;
    if (boundary < surface.length)
      return {
        givenNames: surface.slice(0, boundary).join(" "),
        surnames: surface.slice(boundary).join(" "),
        surnameStatus: "probable",
        basis:
          "Apellido del léxico personal tras una forma nominal; requiere confirmación del autor.",
      };
  }
  const surname = given > 0 && given < surface.length ? surface.slice(given).join(" ") : "";
  return {
    givenNames: given ? surface.slice(0, given).join(" ") : surface.length === 1 ? surface[0]! : "",
    surnames: surname,
    surnameStatus: surname ? "probable" : "not-determined",
    basis: surname
      ? "Parte nominal posterior al nombre; requiere confirmación del autor."
      : "El texto no permite separar un apellido con suficiente seguridad.",
  };
}
export function isGivenName(value: string): boolean {
  const parts = lexicalName(value).split(/[-]/u);
  return parts.every((part) => GIVEN_NAMES.has(part));
}
export const CHARACTER_NAME_VERIFICATION_VERSION = "personal-names-2.0";
export interface CharacterNameVerification extends PersonalNameParts {
  variants?: string[];
  secondaryEvidence?: {
    sectionId: string;
    sectionTitle: string;
    nameUsed: string;
    excerpt: string;
  }[];
  algorithm: string;
  forwardMentions: number;
  reverseMentions: number;
  strongPersonalMentions: number;
  ambiguousVariants: string[];
  reasons: string[];
}
/** Lectura defensiva de metadatos persistidos; las sugerencias antiguas quedan identificadas. */
export function readNameVerification(value: unknown): CharacterNameVerification | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (
    v.algorithm !== CHARACTER_NAME_VERIFICATION_VERSION ||
    typeof v.givenNames !== "string" ||
    typeof v.surnames !== "string" ||
    (v.surnameStatus !== "probable" && v.surnameStatus !== "not-determined") ||
    typeof v.basis !== "string" ||
    ![v.forwardMentions, v.reverseMentions, v.strongPersonalMentions].every(
      (x) => typeof x === "number" && Number.isInteger(x) && x >= 0,
    ) ||
    !Array.isArray(v.reasons) ||
    !v.reasons.every((x) => typeof x === "string") ||
    !Array.isArray(v.ambiguousVariants) ||
    !v.ambiguousVariants.every((x) => typeof x === "string")
  )
    return null;
  const variants = Array.isArray(v.variants)
    ? v.variants.filter((x): x is string => typeof x === "string" && x.length <= 160).slice(0, 10)
    : [];
  const secondaryEvidence = Array.isArray(v.secondaryEvidence)
    ? v.secondaryEvidence
        .filter(
          (
            x,
          ): x is { sectionId: string; sectionTitle: string; nameUsed: string; excerpt: string } =>
            !!x &&
            typeof x === "object" &&
            typeof x.sectionId === "string" &&
            /^[a-f0-9-]{36}$/iu.test(x.sectionId) &&
            typeof x.sectionTitle === "string" &&
            typeof x.nameUsed === "string" &&
            x.nameUsed.length <= 160 &&
            typeof x.excerpt === "string",
        )
        .slice(0, 2)
    : [];
  return { ...v, variants, secondaryEvidence } as unknown as CharacterNameVerification;
}
