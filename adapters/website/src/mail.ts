import { createTransport } from "nodemailer";

/**
 * Sends one plain-text email. The API sends nothing, so delivering a login link
 * is the website's job — an adapter's, where a club can change it.
 */
export type Mailer = (message: { to: string; subject: string; text: string }) => Promise<void>;

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
