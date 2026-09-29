import { raw } from "hono/html";
import type { FC, PropsWithChildren } from "hono/jsx";
import { STYLE } from "@deuceleague/website";

/**
 * The coach's pages: plain server-rendered HTML with no scripts, in the
 * players' site's style. Hono escapes everything interpolated here.
 */

export type Frame = { club: string | null; signedIn: boolean };

export type CoachMember = { id: string; display_name: string; email?: string | null };

export const Layout: FC<PropsWithChildren<{ title: string; frame: Frame }>> = ({ title, frame, children }) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta name="robots" content="noindex" />
      <link rel="icon" href="/icon.svg" type="image/svg+xml" />
      <title>{frame.club ? `${title} · ${frame.club} coach` : title}</title>
      {/* Raw, not escaped: STYLE is a constant in the website's code, never input. */}
      <style>{raw(STYLE)}</style>
    </head>
    <body>
      <header>
        <a class="club" href="/coach">
          {frame.club ? `${frame.club} · Coach` : "DeuceLeague · Coach"}
        </a>
      </header>
      <main>{children}</main>
      <footer>
        {frame.signedIn && (
          <form method="post" action="/coach/sign-out">
            <button class="link" type="submit">
              Sign out
            </button>
          </form>
        )}
        <span>Runs on DeuceLeague, open-source league software.</span>
      </footer>
    </body>
  </html>
);

const Notice: FC<{ message: string | undefined }> = ({ message }) =>
  message ? (
    <div class="notice" role="alert">
      {message}
    </div>
  ) : null;

export const SignIn: FC<{ frame: Frame; message?: string }> = ({ frame, message }) => (
  <Layout title="Coach sign-in" frame={frame}>
    <h1>Coach sign-in</h1>
    <Notice message={message} />
    <p>
      Paste the administrator key the installer showed you. This browser gets its own key, which lasts 90 days; the
      administrator key itself is not kept.
    </p>
    <form method="post" action="/coach/sign-in">
      <div class="field">
        <label for="key">API key</label>
        <input id="key" name="key" type="password" autocomplete="off" required />
      </div>
      <button type="submit">Sign in</button>
    </form>
  </Layout>
);

export const Members: FC<{ frame: Frame; members: CoachMember[] }> = ({ frame, members }) => (
  <Layout title="Members" frame={frame}>
    <h1>Members</h1>
    <p>
      Make a sign-in link for a player and send it to them however you talk, for example on WhatsApp. A link works
      once, within fifteen minutes.
    </p>
    {members.length === 0 ? (
      <p class="muted">The club has no members yet.</p>
    ) : (
      <div class="card">
        <ul class="list">
          {members.map((m) => (
            <li class="answer">
              <div class="answer-row">
                <span>
                  {m.display_name}
                  {m.email && <span class="muted"> · {m.email}</span>}
                </span>
                <form method="post" action={`/coach/members/${m.id}/sign-in-link`}>
                  <button class="quiet small" type="submit">
                    Sign-in link
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      </div>
    )}
  </Layout>
);

export const SignInLink: FC<{ frame: Frame; member: string; url: string; minutes: number }> = ({
  frame,
  member,
  url,
  minutes,
}) => (
  <Layout title="Sign-in link" frame={frame}>
    <h1>Sign-in link for {member}</h1>
    <p>
      Send this to {member}. It works once, within {minutes} minutes, and is not shown again: make a new one if it
      runs out.
    </p>
    <div class="field">
      <label for="link">Link</label>
      <input id="link" type="text" value={url} readonly />
    </div>
    <p class="muted">
      Opening it in this browser signs this browser in as {member}. To try it as the player yourself, open it in a
      private window.
    </p>
    <p>
      <a href="/coach">Back to members</a>
    </p>
  </Layout>
);

export const Problem: FC<{ frame: Frame; title: string; detail: string }> = ({ frame, title, detail }) => (
  <Layout title={title} frame={frame}>
    <h1>{title}</h1>
    <p>{detail}</p>
    <p>
      <a href="/coach">Back to members</a>
    </p>
  </Layout>
);
