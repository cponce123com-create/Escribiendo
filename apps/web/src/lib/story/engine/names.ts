import type { AnalysisSection, NameOccurrence } from "./types";
import {
  type Sentence,
  type TextToken,
  normalizeName,
  splitNameTokens,
  stableKey,
  tokenizeSentence,
} from "./text";

const words = (value: string): string[] => normalizeName(value).split(" ").filter(Boolean);

const setOf = (value: string): Set<string> => new Set(words(value));

export const PERSON_TITLES = setOf(`
  don doña señor señora señorita sr sra srta doctor doctora dr dra
  licenciado licenciada lic profesor profesora prof capitan capitana
  general coronel teniente sargento padre madre fray sor san santa
  rey reina principe princesa presidente presidenta ministro ministra
  alcalde alcaldesa gobernador gobernadora embajador embajadora
`);

export const SPEECH_VERBS = setOf(`
  dijo dice decia decía preguntó pregunto pregunta respondió respondio responde
  exclamó exclamo susurró susurro gritó grito añadió anadio comento comentó
  murmuró murmuro contestó contesto replicó replico insistió insistio ordenó ordeno
  rogó rogo suplicó suplico pensó penso reflexionó reflexiono recordó recordo
  explicó explico anunció anuncio advirtió advirtio prometió prometio confesó confeso
  admitió admitio negó nego señaló senalo indicó indico escribió escribio leyó leyo
  contestaba murmuraba preguntaba respondía respondia decía gritaba
`);

export const ACTION_VERBS = setOf(`
  entró entro salió salio miró miro mirada observó observo observaba caminó camino
  corrió corrio sonrió sonrio lloró lloro tomó tomo dejó dejo volvió volvio llegó llego
  partió partio abrió abrio cerró cerro subió subio bajó bajo cruzó cruzo esperó espero
  besó beso abrazó abrazo golpeó golpeo mató mato murió murio nació nacio creció crecio
  trabajaba trabaja vivía vivia estaba estaba fue era es sonriendo llorando mirando
  tenía tenia habia había había nacido habia nacido
  levantó levanto sentó sento quedó quedo siguió siguio escapó escapo huyó huyo
  decidió decidio quiso queria quería podía podia debía debia sabía sabia conocía conocia
  empezó empezo comenzó comenzo terminó termino aprendió aprendio cambió cambio
  recordó recordo recordaba imaginó imagino sintió sintio temía temia amaba amó amo
  odiaba odió odio deseaba deseó deseo necesitaba necesito buscaba buscó busco
  escribía escribia leía leia cantaba cantó canto bailaba bailó bailo
  esperaba esperaban miraba miraban caminaba caminaban hablaba hablaban pensaba pensaban
  sonreía sonreia lloraba lloraban recordaba recordaban observaba observaban
  quería queria querían querian sabía sabia conocía conocia vivía vivia
`);

export const FAMILY_LABELS = setOf(`
  madre padre hermano hermana hijo hija primo prima tío tia tía abuelo abuela
  bisabuelo bisabuela nieto nieta sobrino sobrina suegro suegra cuñado cuñada
  esposo esposa marido mujer pareja novio novia prometido prometida
`);

const RELATION_CONTEXT_LABELS = setOf(`
  amigo amiga compañero companera colega socio socia vecino vecina maestro maestra
  alumno alumna jefe jefa criado criada sirviente enemigo enemiga rival aliado aliada
`);

const CONNECTORS = setOf("de del la las los da do dos van von di le");

const NAME_STOPWORDS = setOf(`
  el la los las un una unos unas lo al del
  y e o u pero sino aunque mientras cuando porque como si que quien quienes donde
  a ante bajo con contra desde durante en entre hacia hasta para por segun sin sobre tras
  yo tu él ella nosotros nosotras ellos ellas usted ustedes mi mis tuyo tuya su sus
  nuestro nuestra nuestros nuestras este esta estos estas ese esa esos esas aquel aquella
  esto eso aquello nada nadie algo alguien todo toda todos todas otro otra otros otras
  no si ya asi también tambien solo sólo muy mas más menos entonces luego despues después
  antes ahora nunca siempre mientras mientras tanto además ademas
  fue era eran es son estaba estaban estoy esta está hay habia había hubo sera será
  tenía tenia tenian tenían hizo hizo hacia había habia dijo dice preguntó pregunto
  capítulo capitulo libro novela cuento prólogo prologo epílogo epilogo parte tomo
  página pagina editorial autor autora obra texto nota nota final fin continuación continuacion
  lunes martes miércoles miercoles jueves viernes sábado sabado domingo
  enero febrero marzo abril mayo junio julio agosto septiembre setiembre octubre noviembre diciembre
  dios cristo virgen navidad
  señor senor señora senora señorita senorita
  hombre mujer niño ninos niña nina muchacho muchacha joven anciano anciana
  madre padre hermano hermana hijo hija amigo amiga familia gente persona
  casa calle ciudad pais país mundo vida muerte noche dia día mañana manana tarde año ano
  tiempo voz mano manos ojos cara puerta ventana habitación habitacion cuarto
  cuerpo cabeza pelo cabello sangre corazón corazon miedo amor odio guerra
  agua fuego aire tierra cielo
  silencio oscuridad sombra viento lluvia frío frio calor olor ruido música musica
`);

const AMBIGUOUS_PLACE_NAMES = setOf(`
  santiago salvador leon león carmen paz victoria guadalupe mercedes rosario
  asuncion asunción concepcion concepción trinidad belen belén
`);

const KNOWN_PLACES = setOf(`
  peru perú lima callao arequipa trujillo cusco cuzco piura chiclayo ica huancayo
  ayacucho puno puno tacna juliaca chincha pisco huanuco huánuco tarapoto iquitos
  amazonas andes amazonia pacifico pacífico atlantico atlántico titicaca
  espana españa madrid barcelona valencia sevilla granada bilbao zaragoza malaga málaga
  argentina buenos aires cordoba córdoba rosario mendoza chile santiago valparaiso valparaíso
  colombia bogota bogotá medellin medellín cali cartagena mexico méxico ciudad de mexico
  ciudad de méxico guadalajara monterrey ecuador quito guayaquil cuenca bolivia la paz
  santa cruz sucre cochabamba venezuela caracas maracaibo uruguay montevideo paraguay
  asuncion asunción brasil brasilia rio de janeiro sao paulo são paulo porto alegre
  portugal lisboa oporto francia paris parís marsella lyon italia roma milan milán venecia
  alemania berlin berlín munich munich reino unido londres inglaterra escocia gales irlanda
  dublin dublín estados unidos nueva york los angeles los ángeles miami chicago boston
  washington california texas florida canada canadá toronto mexico df japon japón tokio
  china pekin pekín shanghai india nueva delhi rusia moscu moscú egipto el cairo marruecos
  africa áfrica asia oceania oceanía australia sidney sídney europa america américa
  latinoamerica latinoamérica iberoamerica iberoamérica
`);

const ORGANIZATION_CUES = setOf(`
  universidad instituto colegio escuela hospital clinica clínica banco empresa compania compañía
  ministerio gobierno municipalidad prefectura policia policía ejercito ejército iglesia
  catedral museo biblioteca teatro hotel restaurante bar cafe café club partido editorial
  periodico periódico revista fundacion fundación asociacion asociación sociedad
  agencia oficina fabrica fábrica institucion institución
`);

const PLACE_CUES = setOf(`
  ciudad pais país region región departamento provincia distrito calle avenida plaza barrio
  pueblo valle rio río lago mar montana montaña volcan volcán isla playa puerto aeropuerto
  estacion estación hotel restaurante colegio universidad hospital iglesia catedral museo
  biblioteca teatro banco empresa fabrica fábrica oficina casa hacienda finca palacio castillo
  torre parque jardin jardín mercado tienda
`);

const BOOK_CUES = setOf(`
  libro novela cuento poema obra capitulo capítulo texto revista periodico periódico articulo
  artículo ensayo historia leyenda cancion canción pelicula película serie programa
`);

const ALIAS_CUES = setOf(`
  apodado apodada apodo alias conocido conocida dicen decian decían llaman llamaban
`);

const SPEECH_PUNCTUATION = /[—–"“”«»]/;
const PLACE_PREPOSITIONS = setOf("en desde hacia hasta");
const PLACE_PREDICATES =
  /\b(es una (ciudad|region|región|provincia|pais|país)|esta en|está en|se encuentra|queda en|fue fundad[oa]|tiene .*habitantes)\b/u;

function previousWords(sentence: Sentence, relativeStart: number, count = 4): string[] {
  return normalizeName(sentence.text.slice(0, relativeStart))
    .split(" ")
    .filter(Boolean)
    .slice(-count);
}

function nextWords(sentence: Sentence, relativeEnd: number, count = 5): string[] {
  return normalizeName(sentence.text.slice(relativeEnd)).split(" ").filter(Boolean).slice(0, count);
}

function isSentenceInitial(sentence: Sentence, relativeStart: number): boolean {
  const before = sentence.text.slice(0, relativeStart);
  return !/[\p{L}\p{N}]/u.test(before);
}

function includesWord(list: string[], target: Set<string>): boolean {
  return list.some((word) => target.has(word));
}

function looksLikePlace(
  normalized: string,
  tokens: string[],
  before: string[],
  after: string[],
  strongPersonCue: boolean,
): string | null {
  const normalizedSentenceAfter = after.join(" ");

  if (strongPersonCue) return null;

  if (KNOWN_PLACES.has(normalized) && !AMBIGUOUS_PLACE_NAMES.has(normalized)) {
    return "Nombre de lugar conocido";
  }

  if (PLACE_PREDICATES.test(normalizedSentenceAfter)) {
    return "El texto lo presenta como lugar";
  }

  const immediateBefore = before.at(-1) ?? "";
  if (PLACE_PREPOSITIONS.has(immediateBefore) && knownOrMultiwordPlace(normalized, tokens)) {
    return "Aparece como complemento de lugar";
  }

  // «la casa de Andrés» no convierte a Andrés en un lugar; «calle Andrés» sí.
  const immediate = before.at(-1) ?? "";
  if (PLACE_CUES.has(immediate)) {
    return "Aparece junto a un nombre de lugar";
  }

  return null;
}

function knownOrMultiwordPlace(normalized: string, _tokens: string[]): boolean {
  return KNOWN_PLACES.has(normalized);
}

function titleCue(before: string[]): boolean {
  return includesWord(before.slice(-3), PERSON_TITLES);
}

function familyCue(before: string[]): boolean {
  return (
    includesWord(before.slice(-4), FAMILY_LABELS) ||
    includesWord(before.slice(-4), RELATION_CONTEXT_LABELS)
  );
}

function actionCue(before: string[], after: string[]): boolean {
  return (
    includesWord(after.slice(0, 12), ACTION_VERBS) ||
    includesWord(before.slice(-3), ACTION_VERBS) ||
    includesWord(after.slice(0, 8), SPEECH_VERBS) ||
    includesWord(before.slice(-3), SPEECH_VERBS)
  );
}

function speechCue(before: string[], after: string[]): boolean {
  return (
    includesWord(before.slice(-3), SPEECH_VERBS) || includesWord(after.slice(0, 8), SPEECH_VERBS)
  );
}

function vocativeCue(sentence: Sentence, relativeStart: number, relativeEnd: number): boolean {
  const rawBefore = sentence.text.slice(Math.max(0, relativeStart - 2), relativeStart);
  const rawAfter = sentence.text.slice(relativeEnd, relativeEnd + 2);
  return /,\s*$/.test(rawBefore) || /^\s*,/.test(rawAfter);
}

function enumerationCue(sentence: Sentence, relativeStart: number, relativeEnd: number): boolean {
  const before = sentence.text.slice(Math.max(0, relativeStart - 6), relativeStart);
  const after = sentence.text.slice(relativeEnd, relativeEnd + 40);
  return /(?:\by\s+|\by\s*,\s*)$/u.test(before) || /^\s*(?:,\s*|\by\s+)[\p{Lu}]/u.test(after);
}

function candidateScore(input: {
  sentenceInitial: boolean;
  tokenCount: number;
  title: boolean;
  speech: boolean;
  action: boolean;
  family: boolean;
  vocative: boolean;
  enumeration: boolean;
  dialogue: boolean;
  negativeCue: string | null;
  knownPlace: boolean;
}): number {
  let score = 0.16;

  if (!input.sentenceInitial) score += 0.24;
  if (input.tokenCount > 1) score += 0.14;
  if (input.title) score += 0.3;
  if (input.speech) score += 0.3;
  if (input.action) score += 0.16;
  if (input.family) score += 0.2;
  if (input.vocative) score += 0.08;
  if (input.enumeration) score += 0.12;
  if (input.dialogue) score += 0.1;
  if (
    input.sentenceInitial &&
    input.tokenCount === 1 &&
    !input.title &&
    !input.speech &&
    !input.action &&
    !input.family &&
    !input.vocative &&
    !input.enumeration
  ) {
    score -= 0.14;
  }
  if (input.knownPlace) score -= 0.22;
  if (input.negativeCue) score -= 0.48;

  return Math.max(0, Math.min(1, score));
}

function readNameSequence(
  tokens: TextToken[],
  startIndex: number,
  sentence: Sentence,
): TextToken[] | null {
  const first = tokens[startIndex];
  if (!first || !first.capitalized) return null;
  if (NAME_STOPWORDS.has(first.normalized) || PERSON_TITLES.has(first.normalized)) return null;
  if (ACTION_VERBS.has(first.normalized) || SPEECH_VERBS.has(first.normalized)) return null;
  if (first.normalized.length < 2) return null;

  const sequence: TextToken[] = [first];
  let cursor = startIndex + 1;

  while (cursor < tokens.length) {
    const next = tokens[cursor];
    const previous = sequence.at(-1);
    if (!next || !previous) break;

    if (next.capitalized) {
      if (NAME_STOPWORDS.has(next.normalized) || PERSON_TITLES.has(next.normalized)) break;
      if (sequence.length >= 4) break;
      if (!tokenGapIsWhitespace(sentence, previous, next)) break;
      sequence.push(next);
      cursor += 1;
      continue;
    }

    // Partículas: «Andrés de la Cruz», «João da Silva».
    if (CONNECTORS.has(next.normalized)) {
      let lookahead = cursor;
      while (
        lookahead < tokens.length &&
        CONNECTORS.has(tokens[lookahead]?.normalized ?? "") &&
        lookahead - cursor < 3
      ) {
        lookahead += 1;
      }

      const afterConnectors = tokens[lookahead];
      if (
        afterConnectors?.capitalized &&
        !NAME_STOPWORDS.has(afterConnectors.normalized) &&
        !PERSON_TITLES.has(afterConnectors.normalized) &&
        sequence.length < 4 &&
        tokenGapIsWhitespace(sentence, previous, afterConnectors)
      ) {
        sequence.push(afterConnectors);
        cursor = lookahead + 1;
        continue;
      }
    }

    break;
  }

  return sequence;
}

function tokenGapIsWhitespace(sentence: Sentence, from: TextToken, to: TextToken): boolean {
  const between = sentence.text.slice(from.end - sentence.start, to.start - sentence.start);
  const withoutConnectors = between.replace(
    /\b(?:de|del|la|las|los|da|do|dos|van|von|di|le)\b/giu,
    " ",
  );
  return /^[\s'’.-]*$/u.test(withoutConnectors);
}

/**
 * Extrae formas nominales candidatas con evidencia de contexto.
 * No se apoya únicamente en mayúsculas: títulos, verbos de habla, verbos de
 * acción, aposiciones y diálogos ponderan cada aparición.
 */
export function extractNameOccurrences(
  section: AnalysisSection,
  sentences: Sentence[],
): NameOccurrence[] {
  const occurrences: NameOccurrence[] = [];

  for (const sentence of sentences) {
    const tokens = tokenizeSentence(sentence);
    if (tokens.length === 0) continue;

    for (let index = 0; index < tokens.length; index += 1) {
      const sequence = readNameSequence(tokens, index, sentence);
      if (!sequence || sequence.length === 0) continue;

      const first = sequence[0];
      const last = sequence.at(-1);
      if (!first || !last) continue;

      let punctuationInside = false;
      for (let part = 1; part < sequence.length; part += 1) {
        const previous = sequence[part - 1];
        const current = sequence[part];
        if (!previous || !current || !tokenGapIsWhitespace(sentence, previous, current)) {
          punctuationInside = true;
          break;
        }
      }
      if (punctuationInside) continue;

      const relativeStart = first.start - sentence.start;
      const relativeEnd = last.end - sentence.start;
      const text = sentence.text.slice(relativeStart, relativeEnd).trim();
      const normalized = normalizeName(text);
      const tokenNames = splitNameTokens(text);
      if (!normalized || tokenNames.length === 0) continue;
      if (NAME_STOPWORDS.has(normalized)) continue;

      const before = previousWords(sentence, relativeStart);
      const after = nextWords(sentence, relativeEnd);
      const sentenceInitial = isSentenceInitial(sentence, relativeStart);
      if (includesWord(before.slice(-6), ALIAS_CUES)) continue;
      const title = titleCue(before);
      const family = familyCue(before);
      const speech = speechCue(before, after);
      const action = actionCue(before, after);
      const vocative = vocativeCue(sentence, relativeStart, relativeEnd);
      const enumeration = enumerationCue(sentence, relativeStart, relativeEnd);
      const strongPersonalContext = title || family || speech || vocative;
      const placeCue = looksLikePlace(normalized, tokenNames, before, after, strongPersonalContext);
      const orgCue =
        !strongPersonalContext &&
        (ORGANIZATION_CUES.has(before.at(-1) ?? "") ||
          (tokenNames.length > 1 && includesWord(before.slice(-3), ORGANIZATION_CUES)))
          ? "Nombre de organización o institución"
          : null;
      const bookContext =
        BOOK_CUES.has(before.at(-1) ?? "") ||
        (tokenNames.length > 1 && includesWord(before.slice(-3), BOOK_CUES)) ||
        (tokenNames.length === 1 &&
          includesWord(before.slice(-8), BOOK_CUES) &&
          /(?:^|\s)(?:de|del|la|las|los)$/u.test(before.join(" ")));
      const bookCue = !strongPersonalContext && bookContext ? "Título de obra o texto" : null;
      const negativeCue = placeCue ?? orgCue ?? bookCue;
      const dialogue = SPEECH_PUNCTUATION.test(sentence.text);
      const knownPlace = KNOWN_PLACES.has(normalized) && !AMBIGUOUS_PLACE_NAMES.has(normalized);

      const score = candidateScore({
        sentenceInitial,
        tokenCount: tokenNames.length,
        title,
        speech,
        action,
        family,
        vocative,
        enumeration,
        dialogue,
        negativeCue,
        knownPlace: knownPlace && !strongPersonalContext,
      });

      // Un nombre de una sola aparición y sin ninguna señal personal no
      // merece una ficha; se evita llenar la interfaz de falsos positivos.
      if (score < 0.3) continue;

      occurrences.push({
        text,
        normalized,
        tokens: tokenNames,
        start: first.start,
        end: last.end,
        sentenceIndex: sentence.index,
        sectionId: section.id,
        sectionTitle: section.title,
        sectionOrder: section.order,
        sectionText: section.content,
        sentenceText: sentence.text,
        sentenceStart: sentence.start,
        sentenceEnd: sentence.end,
        isSentenceInitial: sentenceInitial,
        isDialogue: dialogue,
        score,
        personCue: title
          ? "Título de tratamiento"
          : family
            ? "Contexto familiar"
            : speech
              ? "Verbo de habla"
              : action
                ? "Verbo de acción"
                : vocative
                  ? "Vocativo"
                  : null,
        negativeCue,
        hasActionCue: action,
        hasSpeechCue: speech,
      });

      index = Math.max(index, tokens.indexOf(last));
    }
  }

  return occurrences;
}

export interface NameCluster {
  key: string;
  primaryName: string;
  fullName: string | null;
  variants: string[];
  aliases: string[];
  occurrences: NameOccurrence[];
  confidence: number;
  mergeConfidence: number;
  notes: string[];
}

interface FormRecord {
  normalized: string;
  surfaces: Map<string, number>;
  occurrences: NameOccurrence[];
  tokens: string[];
}

function buildForms(occurrences: NameOccurrence[]): Map<string, FormRecord> {
  const forms = new Map<string, FormRecord>();

  for (const occurrence of occurrences) {
    let form = forms.get(occurrence.normalized);
    if (!form) {
      form = {
        normalized: occurrence.normalized,
        surfaces: new Map(),
        occurrences: [],
        tokens: splitNameTokens(occurrence.text),
      };
      forms.set(occurrence.normalized, form);
    }

    form.surfaces.set(occurrence.text, (form.surfaces.get(occurrence.text) ?? 0) + 1);
    form.occurrences.push(occurrence);
  }

  return forms;
}

function mostFrequentSurface(form: FormRecord): string {
  return (
    Array.from(form.surfaces.entries()).sort(
      (a, b) => b[1] - a[1] || b[0].length - a[0].length,
    )[0]?.[0] ?? form.normalized
  );
}

function isContiguousSubset(shorter: string[], longer: string[]): boolean {
  if (shorter.length >= longer.length) return false;
  for (let start = 0; start <= longer.length - shorter.length; start += 1) {
    if (shorter.every((token, offset) => longer[start + offset] === token)) return true;
  }
  return false;
}

const NICKNAME_ALIASES: Record<string, string> = {
  paco: "francisco",
  curro: "francisco",
  fran: "francisco",
  pepe: "jose",
  pepa: "josefa",
  maruja: "maria",
  lola: "dolores",
  loli: "dolores",
  nacho: "ignacio",
  chema: "jose maria",
  txema: "jose maria",
  tono: "antonio",
  nando: "fernando",
  fer: "fernando",
  chucho: "jesus",
  chuy: "jesus",
  memo: "guillermo",
  majo: "maria jose",
  charo: "rosario",
  pili: "pilar",
  mamen: "maria carmen",
  concha: "concepcion",
  chelo: "consuelo",
  susi: "susana",
  vane: "vanessa",
  mati: "matilde",
};

function fuzzyDiminutiveBase(token: string): string[] {
  const candidates: string[] = [];
  const add = (value: string) => {
    if (value.length >= 3 && !candidates.includes(value)) candidates.push(value);
  };

  if (token.endsWith("itos")) add(`${token.slice(0, -4)}os`);
  if (token.endsWith("itas")) add(`${token.slice(0, -4)}as`);
  if (token.endsWith("citos")) add(`${token.slice(0, -5)}cos`);
  if (token.endsWith("citas")) add(`${token.slice(0, -5)}cas`);
  if (token.endsWith("ito")) add(token.slice(0, -3));
  if (token.endsWith("ita")) add(token.slice(0, -3));
  if (token.endsWith("ico")) add(token.slice(0, -3));
  if (token.endsWith("ica")) add(token.slice(0, -3));
  if (token.endsWith("illo")) add(token.slice(0, -4));
  if (token.endsWith("illa")) add(token.slice(0, -4));
  if (token.endsWith("in")) add(token.slice(0, -2));
  if (token.endsWith("ina")) add(token.slice(0, -3));

  return candidates;
}

/**
 * Agrupa variantes. La regla es deliberadamente conservadora:
 * - un nombre completo y sus partes solo se unen si la parte aparece en un
 *   único nombre completo;
 * - dos nombres completos distintos que comparten un apellido no se fusionan;
 * - los apodos solo se unen si el diccionario o el diminutivo apuntan a una
 *   única base.
 */
export function clusterNameOccurrences(occurrences: NameOccurrence[]): NameCluster[] {
  const forms = buildForms(occurrences);
  const formList = Array.from(forms.values());
  const parent = new Map<string, string>();

  const find = (value: string): string => {
    const current = parent.get(value) ?? value;
    if (current === value) return value;
    const root = find(current);
    parent.set(value, root);
    return root;
  };

  const union = (a: string, b: string) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent.set(rootB, rootA);
  };

  for (const form of formList) parent.set(form.normalized, form.normalized);

  const fullForms = formList.filter((form) => form.tokens.length > 1);
  const singleForms = formList.filter((form) => form.tokens.length === 1);

  // Nombres completos que son prefijo/sufijo uno de otro.
  for (let index = 0; index < fullForms.length; index += 1) {
    for (let other = index + 1; other < fullForms.length; other += 1) {
      const a = fullForms[index];
      const b = fullForms[other];
      if (!a || !b) continue;
      if (isContiguousSubset(a.tokens, b.tokens) || isContiguousSubset(b.tokens, a.tokens)) {
        union(a.normalized, b.normalized);
      }
    }
  }

  // Una parte suelta solo se une si pertenece a un único nombre completo.
  const ambiguousSingles = new Set<string>();
  for (const single of singleForms) {
    const matchingRoots = new Set<string>();
    for (const full of fullForms) {
      if (full.tokens.includes(single.normalized)) {
        matchingRoots.add(find(full.normalized));
      }
    }

    if (matchingRoots.size === 1) {
      union(single.normalized, Array.from(matchingRoots)[0] as string);
    } else if (matchingRoots.size > 1) {
      ambiguousSingles.add(single.normalized);
    }
  }

  // Apodos explícitos y diminutivos, solo cuando hay una base única.
  const rootsToSingleForms = new Map<string, FormRecord[]>();
  for (const single of singleForms) {
    if (ambiguousSingles.has(single.normalized)) continue;
    const root = find(single.normalized);
    const list = rootsToSingleForms.get(root) ?? [];
    list.push(single);
    rootsToSingleForms.set(root, list);
  }

  for (const single of singleForms) {
    if (ambiguousSingles.has(single.normalized)) continue;
    const token = single.tokens[0] ?? single.normalized;
    const dictionaryBase = NICKNAME_ALIASES[token];
    const possibleBases = new Set<string>(dictionaryBase ? [dictionaryBase] : []);
    for (const base of fuzzyDiminutiveBase(token)) possibleBases.add(base);

    for (const base of possibleBases) {
      const targets = singleForms.filter(
        (form) => form.normalized === base && form.normalized !== single.normalized,
      );
      if (targets.length === 1) {
        union(single.normalized, targets[0]?.normalized as string);
        break;
      }

      const fullTargets = fullForms.filter((form) => form.tokens[0] === base);
      if (fullTargets.length === 1) {
        union(single.normalized, fullTargets[0]?.normalized as string);
        break;
      }
    }
  }

  const groups = new Map<string, FormRecord[]>();
  for (const form of formList) {
    const root = find(form.normalized);
    const list = groups.get(root) ?? [];
    list.push(form);
    groups.set(root, list);
  }

  const clusters: NameCluster[] = [];

  for (const group of groups.values()) {
    const groupOccurrences = group.flatMap((form) => form.occurrences);
    const sortedFull = group
      .filter((form) => form.tokens.length > 1)
      .sort(
        (a, b) => b.tokens.length - a.tokens.length || b.occurrences.length - a.occurrences.length,
      );
    const full = sortedFull[0];
    const mostFrequent = [...group].sort((a, b) => b.occurrences.length - a.occurrences.length)[0];
    const primary = full
      ? mostFrequentSurface(full)
      : mostFrequent
        ? mostFrequentSurface(mostFrequent)
        : "";
    const fullName = full ? mostFrequentSurface(full) : null;
    const variantSurfaces = Array.from(
      new Set(group.flatMap((form) => Array.from(form.surfaces.keys()))),
    ).filter((surface) => normalizeName(surface) !== normalizeName(primary));

    const averageScore =
      groupOccurrences.reduce((total, occurrence) => total + occurrence.score, 0) /
      Math.max(1, groupOccurrences.length);
    const countBoost = Math.min(0.18, Math.log10(groupOccurrences.length + 1) * 0.12);
    const mergeConfidence = full
      ? group.length > 1
        ? 0.88
        : 0.95
      : group.length > 1
        ? 0.72
        : 0.62;

    const notes: string[] = [];
    if (ambiguousSingles.size > 0 && group.some((form) => ambiguousSingles.has(form.normalized))) {
      notes.push(
        "El nombre corto aparece también en otro nombre completo; revisa si es la misma persona.",
      );
    }
    if (group.length > 1) {
      notes.push("Se han agrupado variantes por coincidencia de nombre completo o apodo.");
    }

    clusters.push({
      key: stableKey(fullName ?? primary),
      primaryName: primary,
      fullName,
      variants: variantSurfaces,
      aliases: [],
      occurrences: groupOccurrences,
      confidence: Math.min(0.99, averageScore + countBoost),
      mergeConfidence,
      notes,
    });
  }

  return clusters.sort((a, b) => b.occurrences.length - a.occurrences.length);
}

export interface AliasHint {
  alias: string;
  ownerName: string | null;
  excerpt: string;
  sectionId: string;
  sectionTitle: string;
  sectionOrder: number;
  offset: number;
}

const ALIAS_PATTERN =
  /(?:apodad[oa]|conocid[oa] como|le dicen|le decían|le decian|alias|apodo|se hace llamar)\s+([^,.;:!?]{2,40})/giu;

export function extractAliasHints(
  section: AnalysisSection,
  sentences: Sentence[],
  occurrences: NameOccurrence[],
): AliasHint[] {
  const hints: AliasHint[] = [];

  for (const sentence of sentences) {
    ALIAS_PATTERN.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = ALIAS_PATTERN.exec(sentence.text)) !== null) {
      const rawAlias = (match[1] ?? "")
        .replace(/^["“«']|["”»']$/g, "")
        .replace(/\s+/g, " ")
        .trim();
      if (!rawAlias || rawAlias.length > 40) continue;

      const matchIndex = match.index;
      const owner = occurrences
        .filter(
          (occurrence) =>
            occurrence.sectionId === section.id && occurrence.sentenceIndex === sentence.index,
        )
        .sort(
          (a, b) =>
            Math.abs(a.start - (sentence.start + matchIndex)) -
            Math.abs(b.start - (sentence.start + matchIndex)),
        )[0];

      hints.push({
        alias: rawAlias,
        ownerName: owner?.text ?? null,
        excerpt: sentence.text,
        sectionId: section.id,
        sectionTitle: section.title,
        sectionOrder: section.order,
        offset: sentence.start + match.index,
      });
    }
  }

  return hints;
}

export function clusterOccurrenceMap(clusters: NameCluster[]): Map<string, NameCluster> {
  const map = new Map<string, NameCluster>();
  for (const cluster of clusters) {
    for (const occurrence of cluster.occurrences) {
      map.set(`${occurrence.sectionId}:${occurrence.start}:${occurrence.end}`, cluster);
    }
  }
  return map;
}

export function normalizedFormsForCluster(cluster: NameCluster): Set<string> {
  return new Set(cluster.occurrences.map((occurrence) => occurrence.normalized));
}
