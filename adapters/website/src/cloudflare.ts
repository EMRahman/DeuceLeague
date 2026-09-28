import { MailDeliveryError, type Mailer } from "./mail.js";
export { createWebsite, apiClient, openMeteo, parseVenues } from "./app.js";
export type { Mailer } from "./mail.js";

/** Structural interface keeps Cloudflare platform imports out of the adapter. */
export type EmailBinding = {
  send(message: { from: string; to: string; subject: string; text: string }): Promise<{ messageId: string }>;
};

export function cloudflareMailer(binding: EmailBinding, from: string): Mailer {
  return async (message) => {
    try {
      const result = await binding.send({ from, ...message });
      if (!result.messageId) throw new MailDeliveryError();
    } catch {
      // SDK errors may echo recipients or message contents. Do not retain a cause.
      throw new MailDeliveryError();
    }
  };
}

/** Explicit alternative for accounts without Cloudflare Email Sending. Never
 * switches providers or retries after an ambiguous delivery failure. */
export function resendMailer(apiKey: string, from: string, fetcher: typeof fetch = fetch): Mailer {
  return async (message) => {
    try {
      const response = await fetcher("https://api.resend.com/emails", {
        // Workers supports manual/follow only. Reject 3xx below rather than
        // forwarding the provider credential or login message to a redirect.
        method: "POST", redirect: "manual", signal: AbortSignal.timeout(10_000),
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [message.to], subject: message.subject, text: message.text }),
      });
      if (!response.ok) throw new MailDeliveryError();
      const result = await response.json() as { id?: string };
      if (!result.id) throw new MailDeliveryError();
    } catch { throw new MailDeliveryError(); }
  };
}

export type WeatherCache = {
  match(key: string): Promise<Response | undefined>;
  put(key: string, response: Response): Promise<void>;
};

/** Cache only public forecasts, never a general-purpose website/API fetch.
 * The URL contains court coordinates/units only. No cookie/authorization or
 * upstream response headers are stored. Cache outages leave weather optional. */
export function cachedWeatherFetch(cache: WeatherCache, fetcher: typeof fetch = fetch,
  waitUntil?: (work: Promise<unknown>) => void): typeof fetch {
  return async (input, init) => {
    const url = new URL(String(input));
    if (url.origin !== "https://api.open-meteo.com" || url.pathname !== "/v1/forecast"
      || (init?.method && init.method !== "GET") || init?.headers || url.username || url.password) {
      throw new Error("Only public forecasts may use the weather cache");
    }
    try { const found = await cache.match(url.href); if (found) return found; } catch { /* fetch without cache */ }
    const response = await fetcher(url.href, init);
    if (response.ok && response.headers.get("content-type")?.includes("application/json")) {
      const stored = new Response(response.clone().body, {
        headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" },
      });
      const save = cache.put(url.href, stored).catch(() => {});
      if (waitUntil) waitUntil(save); else await save;
    }
    return response;
  };
}
