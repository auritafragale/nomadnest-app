// Emergency words for Ask the Nest, shared by the app (checked before any
// network call) and the ask-the-nest edge function (server backstop).
// Plain TypeScript with no Deno or browser APIs, so both can import it.
//
// Matching ignores case and accents and only matches whole words/phrases.
// Deliberately NOT included: words that are ordinary in another supported
// language (German "Gift" = English "gift", French "sang" = English "sang").
// When in doubt, a term is included: a false alarm only shows the vet card.

const TERMS: string[] = [
  // English
  "bleeding", "blood", "poison", "poisoned", "poisoning", "toxic", "ate chocolate", "eaten chocolate",
  "ate some chocolate", "seizure", "seizures", "fitting", "convulsing", "convulsion", "not breathing",
  "cant breathe", "can't breathe", "cannot breathe", "struggling to breathe", "collapsed", "unconscious",
  "unresponsive", "hit by a car", "hit by car", "run over", "choking", "vomiting blood",
  "throwing up blood", "bloated belly", "snake bite", "bitten by a snake", "emergency", "dying",
  // Spanish
  "sangra", "sangrando", "sangre", "veneno", "envenenado", "envenenada", "envenenamiento",
  "comio chocolate", "ha comido chocolate", "convulsion", "convulsiones", "no respira",
  "no puede respirar", "se desmayo", "desmayado", "desmayada", "colapso", "inconsciente",
  "atropellado", "atropellada", "se ahoga", "ahogandose", "atragantado", "atragantada",
  "vomita sangre", "vomito con sangre", "emergencia", "urgencia",
  // French
  "saigne", "saignement", "empoisonne", "empoisonnee", "empoisonnement", "mange du chocolat",
  "a mange du chocolat", "convulsions", "ne respire pas", "ne respire plus", "s'est effondre",
  "effondre", "inconscient", "inconsciente", "renverse par une voiture", "percute par une voiture",
  "s'etouffe", "etouffe", "vomit du sang", "urgence",
  // Italian
  "sanguina", "sanguinamento", "sangue", "veleno", "avvelenato", "avvelenata", "avvelenamento",
  "mangiato cioccolato", "mangiato il cioccolato", "convulsione", "convulsioni", "crisi epilettica",
  "non respira", "e svenuto", "e svenuta", "svenuto", "svenuta", "collassato", "incosciente",
  "investito", "investita", "soffoca", "soffocando", "vomita sangue", "emergenza", "urgenza",
  // German
  "blutet", "blutung", "vergiftet", "vergiftung", "giftig", "schokolade gefressen",
  "schokolade gegessen", "krampfanfall", "krampft", "anfall", "atmet nicht", "bekommt keine luft",
  "zusammengebrochen", "bewusstlos", "angefahren", "vom auto erfasst", "erstickt", "wurgt",
  "erbricht blut", "blut erbrochen", "notfall",
  // Portuguese
  "sangrando", "sangramento", "envenenado", "envenenada", "comeu chocolate", "convulsao",
  "convulsoes", "nao respira", "nao esta respirando", "desmaiou", "desmaiado", "desmaiada",
  "colapsou", "atropelado", "atropelada", "engasgado", "engasgada", "engasgando", "sufocando",
  "vomitando sangue", "vomito com sangue", "emergencia",
];

/** Lowercase, strip accents, straighten apostrophes, collapse spaces. */
export const normaliseText = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/\s+/g, " ")
    .trim();

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const EMERGENCY_RE = new RegExp(
  `(^|[^a-z0-9])(${Array.from(new Set(TERMS.map(normaliseText))).map(escape).join("|")})(?=$|[^a-z0-9])`,
);

/** True if the question contains an emergency word in any supported language. */
export const isEmergencyQuestion = (text: string) => EMERGENCY_RE.test(normaliseText(text));
