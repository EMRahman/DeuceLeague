/**
 * Sends one plain-text email. The API sends nothing, so delivering a login link
 * is the website's job — an adapter's, where a club can change it.
 */
export type Mailer = (message: { to: string; subject: string; text: string }) => Promise<void>;

export class MailDeliveryError extends Error {
  constructor() { super("Sign-in email could not be sent"); this.name = "MailDeliveryError"; }
}
