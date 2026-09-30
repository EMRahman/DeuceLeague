/**
 * The club's public sign-up form: what it checks before a request reaches the
 * coach. The form is open to the internet, so each layer turns away a
 * different kind of junk — a hidden field only bots fill in, a signed time
 * that a person cannot beat, an optional Turnstile check, and a daily limit
 * the Worker keeps per connection and for the club.
 */

/**
 * Which privacy notice the form shows. Written for a club in the UK, under UK
 * GDPR; a club elsewhere, or one that changes the notice's words, gives it a
 * new name here, so each member's record says which one they agreed to.
 */
export const PRIVACY_NOTICE = "uk-2026-09-30";

/** Quicker than this, the form was not filled in by a person. */
export const MIN_FILL_MS = 3_000;
/** Older than this, the page has sat open too long: it is shown again, to send afresh. */
export const MAX_FILL_MS = 86_400_000;

export type JoinForm = { first_name: string; surname: string; email: string; phone: string; privacy: boolean };

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
    privacy: form.privacy === "yes",
  };
  const problems: string[] = [];
  if (!values.first_name) problems.push("Enter your first name.");
  if (!values.surname) problems.push("Enter your surname.");
  if (values.first_name.length > 60 || values.surname.length > 60) problems.push("Names can be up to 60 letters long.");
  if (!values.email && !values.phone) problems.push("Give an email address, a phone number, or both, so the coach can reach you.");
  if (values.email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email) || values.email.length > 254)) {
    problems.push("That does not look like an email address.");
  }
  if (values.phone && !/^\+?[0-9][0-9 ()-]{5,23}$/.test(values.phone)) {
    problems.push("A phone number has digits, and may start with +, such as 07700 900123 or +44 7700 900123.");
  }
  if (!values.privacy) problems.push("Tick the box to say you have read the privacy notice.");
  return { values, problems };
}
