import type { EmailBinding } from "@deuceleague/website/cloudflare";

export type WebsiteBindings = {
  PUBLIC_URL?: string;
  WEBSITE_API_KEY?: string;
  MAIL_PROVIDER?: string;
  MAIL_FROM?: string;
  EMAIL?: EmailBinding;
  RESEND_API_KEY?: string;
};

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
  if (!env.MAIL_PROVIDER) return { origin, key: env.WEBSITE_API_KEY, mail: null };
  if (!env.MAIL_FROM || /[\r\n]/.test(env.MAIL_FROM)) throw new Error("Missing sender");
  if (env.MAIL_PROVIDER === "cloudflare" ? !env.EMAIL
    : env.MAIL_PROVIDER === "resend" ? !env.RESEND_API_KEY : true) throw new Error("Missing email provider");
  return { origin, key: env.WEBSITE_API_KEY,
    mail: { from: env.MAIL_FROM, provider: env.MAIL_PROVIDER as "cloudflare" | "resend" } };
}
