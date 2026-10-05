/**
 * The club's public sign-up form: what it checks before a request reaches the
 * coach. The form is open to the internet, so each layer turns away a
 * different kind of junk — a hidden field only bots fill in, a signed time
 * that a person cannot beat, an optional Turnstile check, and a daily limit
 * the Worker keeps per source IP and for the club.
 */

/**
 * Which privacy notice the form shows. Written for a club in the UK, under UK
 * GDPR; a club elsewhere, or one that changes the notice's words, gives it a
 * new name here, so each member's record says which one they agreed to.
 */
export const PRIVACY_NOTICE = "uk-2026-10-05";

/** Quicker than this, the form was not filled in by a person. */
export const MIN_FILL_MS = 3_000;
/** Older than this, the page has sat open too long: it is shown again, to send afresh. */
export const MAX_FILL_MS = 86_400_000;

/** The genders the club records, as the form words them. Gender decides which competitions someone can be placed in. */
export const GENDERS = [
  ["female", "Female"], ["male", "Male"], ["other", "Other"], ["undisclosed", "Prefer not to say"],
] as const;
/** The age bands the club records, as the form words them. Never a birth date. */
export const AGE_GROUPS = [
  ["under_18", "Under 18"], ["18_34", "18 to 34"], ["35_49", "35 to 49"], ["50_64", "50 to 64"], ["65_plus", "65 or over"],
] as const;
/** What someone wants to play, as the form and the player's home page word it. `not_now` is a social member. */
export const PLAYS = [
  ["singles", "Singles"], ["doubles", "Doubles"], ["mixed_doubles", "Mixed doubles"],
  ["both", "Singles and doubles"], ["singles_mixed", "Singles and mixed doubles"],
  ["doubles_mixed", "Doubles and mixed doubles"], ["all", "Singles, doubles and mixed doubles"],
  ["not_now", "Not now: I am a social member"],
] as const;
export const playsLabel = (value: string | null | undefined) => PLAYS.find(([v]) => v === value)?.[1] ?? null;
export const genderLabel = (value: string | null | undefined) => GENDERS.find(([v]) => v === value)?.[1] ?? null;
export const ageGroupLabel = (value: string | null | undefined) => AGE_GROUPS.find(([v]) => v === value)?.[1] ?? null;

export type JoinForm = {
  first_name: string; surname: string; email: string; phone: string; gender: string; age_group: string; plays: string;
  privacy: boolean;
};

/** Phone punctuation is allowed, but the number must contain 7–15 digits. */
export const isTelephone = (value: string) => /^\+?[0-9][0-9 ()-]{5,23}$/.test(value)
  && value.replace(/\D/g, "").length >= 7 && value.replace(/\D/g, "").length <= 15;

const bytes = new TextEncoder();
const hex = (buffer: ArrayBuffer) => Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, "0")).join("");
const hmacKey = (secret: string, usage: "sign" | "verify") =>
  crypto.subtle.importKey("raw", bytes.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [usage]);

/** When the form was shown, signed with the website's key so it cannot be made up. */
export async function stamp(secret: string, now = Date.now()): Promise<string> {
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(secret, "sign"), bytes.encode(`join-form:${now}`));
  return `${now}.${hex(signature)}`;
}

/** How long ago a stamp was made, or null if this website did not make it. */
export async function stampAge(secret: string, value: string, now = Date.now()): Promise<number | null> {
  const match = /^(\d{13})\.([0-9a-f]{64})$/.exec(value);
  if (!match) return null;
  const signature = new Uint8Array(match[2]!.match(/../g)!.map((pair) => parseInt(pair, 16)));
  const valid = await crypto.subtle.verify("HMAC", await hmacKey(secret, "verify"), signature,
    bytes.encode(`join-form:${match[1]}`));
  return valid ? now - Number(match[1]) : null;
}

/** The form as sent, and what is wrong with it in words a person can act on. */
export function readJoinForm(form: Record<string, unknown>): { values: JoinForm; problems: string[] } {
  const text = (name: string) => (typeof form[name] === "string" ? (form[name] as string).trim() : "");
  const values = {
    first_name: text("first_name"),
    surname: text("surname"),
    email: text("email"),
    phone: text("phone"),
    gender: text("gender"),
    age_group: text("age_group"),
    plays: text("plays"),
    privacy: form.privacy === "yes",
  };
  const problems: string[] = [];
  if (!values.first_name) problems.push("Enter your first name.");
  if (!values.surname) problems.push("Enter your surname.");
  if (values.first_name.length > 60 || values.surname.length > 60) problems.push("Names can be up to 60 letters long.");
  if (!values.email) problems.push("Enter your email address for sign-in links.");
  if (!values.phone) problems.push("Enter your telephone number for WhatsApp league communications.");
  if (values.email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email) || values.email.length > 254)) {
    problems.push("That does not look like an email address.");
  }
  if (values.phone && !isTelephone(values.phone)) {
    problems.push("A phone number has 7 to 15 digits, and may start with +, such as 07700 900123 or +44 7700 900123.");
  }
  if (!GENDERS.some(([v]) => v === values.gender)) problems.push("Choose your gender, or say you would rather not.");
  if (values.age_group && !AGE_GROUPS.some(([v]) => v === values.age_group)) problems.push("Choose one of the age groups, or leave it blank.");
  if (!PLAYS.some(([v]) => v === values.plays)) problems.push("Choose singles, doubles, mixed doubles, a combination, or not now.");
  if (!values.privacy) problems.push("Tick the box to say you have read the privacy notice.");
  return { values, problems };
}
