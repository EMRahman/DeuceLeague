import { createTransport } from "nodemailer";
import type { Mailer } from "./mail.js";

/** Over SMTP, which every mail provider speaks. */
export function smtpMailer(url: string, from: string): Mailer {
  const transport = createTransport(url);
  return async ({ to, subject, text }) => {
    await transport.sendMail({ from, to, subject, text });
  };
}

/**
 * With no SMTP configured: the email goes to the log, so the site can be tried
 * locally. Never run a real club like this — the log would hold working links.
 */
export function logMailer(log: (line: string) => void = console.log): Mailer {
  return async ({ to, subject, text }) => {
    log(`[no SMTP_URL set, so not sent] to ${to}: ${subject}\n${text}`);
  };
}
