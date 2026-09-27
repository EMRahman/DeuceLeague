import { getClub, updateClub, type Tx } from "@deuceleague/db";
import type { z, OpenAPIHono } from "@hono/zod-openapi";
import { toClub } from "../administration/club.js";
import type { AppEnv } from "../context.js";
import { type Club, get, patch } from "../contracts/club.js";
import { audit, definedOnly, sentFields } from "./shared.js";

async function readClub(tx: Tx, clubId: string): Promise<z.infer<typeof Club>> {
  const club = await getClub(tx, clubId);
  // The credential that got this far belongs to this club.
  if (!club) throw new Error("authenticated club not found");
  return toClub(club);
}

export function registerClub(app: OpenAPIHono<AppEnv>): void {
  app.openapi(get, async (c) => c.json(await readClub(c.get("tx"), c.get("auth").clubId), 200));

  app.openapi(patch, async (c) => {
    const body = c.req.valid("json");
    const { clubId } = c.get("auth");
    const changed = sentFields(body);
    if (changed.length === 0) return c.json(await readClub(c.get("tx"), clubId), 200);

    const club = await updateClub(c.get("tx"), clubId, definedOnly(body));
    if (!club) throw new Error("authenticated club not found");
    await audit(c, "club.updated", { type: "club", id: clubId }, { changed });
    return c.json(toClub(club), 200);
  });
}
