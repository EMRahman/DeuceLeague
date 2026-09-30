import type { EmailBinding } from "@deuceleague/website/cloudflare";

export type WebsiteBindings = {
  PUBLIC_URL?: string;
  WEBSITE_API_KEY?: string;
  MAIL_PROVIDER?: string;
  MAIL_FROM?: string;
  EMAIL?: EmailBinding;
  RESEND_API_KEY?: string;
  SIGNUPS_PER_DAY?: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
};

/** Join requests the website takes a day when SIGNUPS_PER_DAY is not set. */
export const SIGNUPS_PER_DAY = 100;

/**
 * The join form: on, taking SIGNUPS_PER_DAY a day (100 unless set; 0 turns it
 * off). Turnstile is optional, but a key without its partner is a mistake, so
 * it stops the site rather than leaving the form unguarded.
 */
export function joinConfig(env: WebsiteBindings) {
  const raw = env.SIGNUPS_PER_DAY?.trim() ?? "";
  const perDay = raw === "" ? SIGNUPS_PER_DAY : /^\d{1,4}$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isInteger(perDay) || perDay > 1000) throw new Error("SIGNUPS_PER_DAY must be a whole number from 0 to 1000");
  if (!env.TURNSTILE_SITE_KEY !== !env.TURNSTILE_SECRET_KEY) throw new Error("Set both Turnstile keys, or neither");
  if (perDay === 0) return null;
  return { perDay, turnstile: env.TURNSTILE_SITE_KEY
    ? { siteKey: env.TURNSTILE_SITE_KEY, secret: env.TURNSTILE_SECRET_KEY! } : null };
}

/** Trusted deployment configuration only. Never derive origins from Host or
 * forwarded headers; these determine email links, cookies and CSRF checks. */
export function configuredOrigin(value: string | undefined) {
  const publicUrl = new URL(value ?? "");
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(publicUrl.hostname);
  if ((publicUrl.protocol !== "https:" && !(local && publicUrl.protocol === "http:"))
    || publicUrl.username || publicUrl.password || publicUrl.pathname !== "/" || publicUrl.search || publicUrl.hash) {
    throw new Error("Invalid PUBLIC_URL");
  }
  return publicUrl.origin;
}

/**
 * Email is optional: with no MAIL_PROVIDER, players sign in with links the
 * coach hands them. A provider that is named must be complete, so a typo
 * never silently turns email sign-in off.
 */
export function websiteConfig(env: WebsiteBindings) {
  const origin = configuredOrigin(env.PUBLIC_URL);
  if (!env.WEBSITE_API_KEY?.startsWith("dl_")) throw new Error("Missing website credential");
  const join = joinConfig(env);
  if (!env.MAIL_PROVIDER) return { origin, key: env.WEBSITE_API_KEY, mail: null, join };
  if (!env.MAIL_FROM || /[\r\n]/.test(env.MAIL_FROM)) throw new Error("Missing sender");
  if (env.MAIL_PROVIDER === "cloudflare" ? !env.EMAIL
    : env.MAIL_PROVIDER === "resend" ? !env.RESEND_API_KEY : true) throw new Error("Missing email provider");
  return { origin, key: env.WEBSITE_API_KEY, join,
    mail: { from: env.MAIL_FROM, provider: env.MAIL_PROVIDER as "cloudflare" | "resend" } };
}
