import { isEmergencyQuestion, normaliseText } from "../../supabase/functions/_shared/emergencyTerms";
import type { SitterGuide } from "@/hooks/useSitterGuide";

// One emergency list for the app and the edge function.
export { isEmergencyQuestion };

// Arrival words (keys, codes, alarm, gate, lockbox, Wi-Fi) in the six
// supported languages: pre-ticks "Arrival detail" when the owner saves an
// answer, so it only shows in the sitter's 48-hour window.
const ARRIVAL_TERMS = [
  // English
  "key", "keys", "code", "codes", "alarm", "gate", "lockbox", "lock box", "key safe", "wifi", "wi-fi", "password",
  // Spanish
  "llave", "llaves", "codigo", "codigos", "alarma", "porton", "puerta", "caja de llaves", "contrasena", "clave",
  // French
  "cle", "cles", "clef", "clefs", "alarme", "portail", "boite a cles", "mot de passe",
  // Italian
  "chiave", "chiavi", "codice", "codici", "allarme", "cancello", "cassetta delle chiavi", "portachiavi",
  // German
  "schlussel", "alarmanlage", "tor", "schlusselbox", "schlusselkasten", "schlusseltresor", "wlan", "passwort",
  // Portuguese
  "chave", "chaves", "alarme", "portao", "cofre de chaves", "caixa de chaves", "senha",
];
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const ARRIVAL_RE = new RegExp(
  `(^|[^a-z0-9])(${Array.from(new Set(ARRIVAL_TERMS.map(normaliseText))).map(escape).join("|")})(?=$|[^a-z0-9])`,
);

export const mentionsArrivalDetails = (text: string) => ARRIVAL_RE.test(normaliseText(text));

const filled = (v: unknown) => typeof v === "string" && v.trim().length > 0;

/** Up to 4 question chips, only for topics the sitter can see right now. */
export const suggestedQuestions = (guide: SitterGuide): string[] => {
  const out: string[] = [];
  const pet = guide.pets.find((p) => filled(p.feeding_details)) ?? null;
  const petName = (p: { name: string | null; type: string } | null) => p?.name || (p ? `the ${p.type.toLowerCase()}` : "");

  if (pet) out.push(`When does ${petName(pet)} eat?`);
  if (guide.access_open && filled(guide.access?.key_handover)) out.push("Where are the keys?");
  if (guide.access_open && filled(guide.access?.wifi_details)) out.push("What's the Wi-Fi?");
  if (guide.pets.some((p) => filled(p.vet_info)) || filled(guide.guide?.out_of_hours_vet)) out.push("Where's the vet?");

  const walker = guide.pets.find((p) => filled(p.walks_exercise));
  if (walker) out.push(`When does ${petName(walker)} go for a walk?`);
  if (filled(guide.guide?.bins_recycling)) out.push("Which day are the bins?");
  if (filled(guide.guide?.plants)) out.push("Which plants need watering?");
  if (filled(guide.guide?.house_notes)) out.push("Anything I should know about the house?");
  return out.slice(0, 4);
};
