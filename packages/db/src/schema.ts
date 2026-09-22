import { sql } from "drizzle-orm";
import {
  bigserial,
  check,
  customType,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  type PgTableExtraConfigValue,
} from "drizzle-orm/pg-core";
import type { MatchFormat, RulesSpec, Score } from "@deuceleague/schema";

/**
 * DeuceLeague core schema.
 *
 * Three ideas carry most of the weight:
 *
 *  1. A fixture is a `match` with no score yet. There is no fixture table.
 *  2. The competing unit is an `entry` — one member for singles, two for
 *     doubles — so both disciplines share every query and every calculation.
 *  3. Standings are never stored. They are computed from matches on read, which
 *     makes correcting a wrong score weeks later a plain update.
 *
 * Enumerated values are `text` with CHECK constraints rather than Postgres enum
 * types: the vocabulary will grow, and altering a CHECK is a one-line migration
 * that self-hosters can read. Each list mirrors an enum in @deuceleague/schema.
 */

/** Applications supply UUIDv7 so ids sort chronologically; this is the fallback. */
const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

const oneOf = (name: string, column: string, values: readonly string[]) =>
  // sql-safe: builds CHECK constraints from the fixed lists below, when a migration is generated. Never request input.
  check(name, sql.raw(`${column} in (${values.map((v) => `'${v}'`).join(", ")})`));

/**
 * A result's parts must agree with its outcome, in the ledger and in every
 * claim alike. The same rules as validateResult() in @deuceleague/schema.
 */
const outcomeShape = (table: string) => [
  // Retired, walkover and conceded say which side stopped; nothing else does.
  check(
    `${table}_stopped_side_ck`,
    sql`(retired_side is not null) = coalesce(outcome in ('retired', 'walkover', 'conceded'), false)`,
  ),
  // Only a match that was actually played, in full or in part, has a score.
  check(
    `${table}_score_ck`,
    sql`(score is not null) = coalesce(outcome in ('completed', 'retired'), false)`,
  ),
];

/** Postgres's 64-bit transaction id. Drizzle has no builtin for it. */
const xid8 = customType<{ data: string }>({ dataType: () => "xid8" });

// ───────────────────────────────────────────────────────────── tenancy ──

export const club = pgTable("club", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  /** IANA zone. Every deadline is interpreted here. */
  timezone: text("timezone").notNull().default("Europe/London"),
  /** Logo, colours, sponsor blocks. Served to every client so they render as the club. */
  branding: jsonb("branding").notNull().default({}),
  settings: jsonb("settings").notNull().default({}),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ────────────────────────────────────────────────────────────── people ──

export const member = pgTable(
  "member",
  {
    id: id(),
    clubId: uuid("club_id")
      .notNull()
      .references(() => club.id, { onDelete: "cascade" }),
    /** The only name that appears in player-scoped responses. */
    displayName: text("display_name").notNull(),

    // Everything below is PII and requires the `members:pii` scope to read.
    fullName: text("full_name"),
    email: text("email"),
    phone: text("phone"),
    dateOfBirth: date("date_of_birth"),
    /** Used only to warn on ineligible mixed pairings. Never enforced. Nullable by design. */
    gender: text("gender"),
    notes: text("notes"),

    rating: numeric("rating", { precision: 6, scale: 3 }),
    ratingSystem: text("rating_system"),
    status: text("status").notNull().default("active"),
    joinedOn: date("joined_on"),
    /** Soft delete: members leave and come back, and their results must survive. */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("member_id_club_uq").on(t.id, t.clubId),
    uniqueIndex("member_club_email_uq")
      .on(t.clubId, sql`lower(${t.email})`)
      .where(sql`${t.deletedAt} is null and ${t.email} is not null`),
    index("member_club_status_ix")
      .on(t.clubId, t.status)
      .where(sql`${t.deletedAt} is null`),
    oneOf("member_status_ck", "status", ["active", "paused", "left"]),
    oneOf("member_gender_ck", "gender", ["female", "male", "other", "undisclosed"]),
  ],
);

export const apiKey = pgTable(
  "api_key",
  {
    id: id(),
    clubId: uuid("club_id")
      .notNull()
      .references(() => club.id, { onDelete: "cascade" }),
    /** What this key is for: 'Telegram bot', 'Sam's iOS app'. */
    name: text("name").notNull(),
    /** SHA-256 of the key. The key itself is shown exactly once, at creation. */
    keyHash: text("key_hash").notNull().unique(),
    /** Leading characters, kept so a coach can tell their keys apart. */
    prefix: text("prefix").notNull(),
    scopes: text("scopes").array().notNull().default(sql`'{league:read,results:write}'`),
    createdByMemberId: uuid("created_by_member_id"),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      columns: [t.createdByMemberId, t.clubId],
      foreignColumns: [member.id, member.clubId],
      name: "api_key_creator_fk",
    }),
    index("api_key_club_ix")
      .on(t.clubId)
      .where(sql`${t.revokedAt} is null`),
  ],
);

/**
 * A player's way in: a one-time login link, or the session it is exchanged
 * for. Each speaks for one member. Revoking one deletes it — a used link, a
 * signed-out session — so every row here still works, or has expired.
 */
export const accessGrant = pgTable(
  "access_grant",
  {
    id: id(),
    clubId: uuid("club_id")
      .notNull()
      .references(() => club.id, { onDelete: "cascade" }),
    memberId: uuid("member_id").notNull(),
    kind: text("kind").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    scopes: text("scopes").array().notNull(),
    /** A login link always expires; a session does not, so players stay signed in. */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      columns: [t.memberId, t.clubId],
      foreignColumns: [member.id, member.clubId],
      name: "access_grant_member_fk",
    }).onDelete("cascade"),
    index("access_grant_member_ix").on(t.memberId),
    index("access_grant_expiry_ix").on(t.expiresAt),
    oneOf("access_grant_kind_ck", "kind", ["login_link", "session"]),
    check("access_grant_link_expires_ck", sql`kind <> 'login_link' or expires_at is not null`),
  ],
);

// ───────────────────────────────────────────────── competition structure ──

/**
 * A competitive period the club defines. Most run four a year; the dates are
 * whatever the coach decides, and every competition inside a season shares them.
 */
export const season = pgTable(
  "season",
  {
    id: id(),
    clubId: uuid("club_id")
      .notNull()
      .references(() => club.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Optional label for clubs on a quarterly cadence. */
    kind: text("kind"),
    year: integer("year"),
    /** Null while planning; required before a season can be activated. */
    startsOn: date("starts_on"),
    endsOn: date("ends_on"),
    /** The single deadline for every competition and division in the season. */
    resultsDeadlineAt: timestamp("results_deadline_at", { withTimezone: true }),
    state: text("state").notNull().default("planning"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("season_id_club_uq").on(t.id, t.clubId),
    unique("season_club_name_uq").on(t.clubId, t.name),
    index("season_club_state_ix").on(t.clubId, t.state),
    oneOf("season_kind_ck", "kind", ["spring", "summer", "autumn", "winter"]),
    oneOf("season_state_ck", "state", ["planning", "active", "complete", "archived"]),
    check("season_dates_ck", sql`starts_on is null or ends_on is null or ends_on >= starts_on`),
  ],
);

/** One league within a season: Men's Singles, Women's Doubles, Mixed Doubles. */
export const competition = pgTable(
  "competition",
  {
    id: id(),
    clubId: uuid("club_id")
      .notNull()
      .references(() => club.id, { onDelete: "cascade" }),
    seasonId: uuid("season_id").notNull(),
    name: text("name").notNull(),
    /** Which format plugin drives fixtures, standings and placement suggestions. */
    formatId: text("format_id").notNull().default("box_league"),
    discipline: text("discipline").notNull(),
    category: text("category").notNull().default("open"),
    matchFormat: jsonb("match_format").$type<MatchFormat>().notNull(),
    rules: jsonb("rules").$type<RulesSpec>().notNull(),
    /** Format-specific settings, validated by that format's own schema. */
    config: jsonb("config").notNull().default({}),
    /**
     * Clubs running several box rounds inside one season number them here and
     * chain them with previousCompetitionId. Most clubs leave this at 1 and
     * chain across seasons instead.
     */
    sequenceInSeason: integer("sequence_in_season").notNull().default(1),
    /** Where promotion and relegation suggestions are read from. */
    previousCompetitionId: uuid("previous_competition_id"),
    state: text("state").notNull().default("draft"),
    /** members: any member who signs in. private: the coach's credentials only. */
    visibility: text("visibility").notNull().default("members"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("competition_id_club_uq").on(t.id, t.clubId),
    unique("competition_season_name_uq").on(t.seasonId, t.name),
    foreignKey({
      columns: [t.seasonId, t.clubId],
      foreignColumns: [season.id, season.clubId],
      name: "competition_season_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.previousCompetitionId, t.clubId],
      foreignColumns: [t.id, t.clubId],
      name: "competition_previous_fk",
    }),
    index("competition_club_state_ix").on(t.clubId, t.state),
    oneOf("competition_discipline_ck", "discipline", ["singles", "doubles"]),
    oneOf("competition_category_ck", "category", ["open", "mens", "womens", "mixed"]),
    oneOf("competition_state_ck", "state", ["draft", "active", "complete", "archived"]),
    oneOf("competition_visibility_ck", "visibility", ["members", "private"]),
  ],
);

/**
 * A box or division within a competition. Size is simply however many entries
 * it holds — 11 in one league, 7 in another, and it may change every season.
 */
export const division = pgTable(
  "division",
  {
    id: id(),
    clubId: uuid("club_id")
      .notNull()
      .references(() => club.id, { onDelete: "cascade" }),
    competitionId: uuid("competition_id").notNull(),
    /** 1 is the top division. */
    ordinal: integer("ordinal").notNull(),
    name: text("name").notNull(),
    /** Advisory only: informs placement suggestions, never enforced. */
    targetSize: integer("target_size"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("division_id_club_uq").on(t.id, t.clubId),
    unique("division_id_competition_uq").on(t.id, t.competitionId),
    unique("division_competition_ordinal_uq").on(t.competitionId, t.ordinal),
    foreignKey({
      columns: [t.competitionId, t.clubId],
      foreignColumns: [competition.id, competition.clubId],
      name: "division_competition_fk",
    }).onDelete("cascade"),
    check("division_ordinal_ck", sql`ordinal >= 1`),
  ],
);

// ───────────────────────────────────────────── entries (the competing unit) ──

/**
 * One competing unit in one division: a player in singles, a pair in doubles.
 * Promotion and relegation move the unit, which is what a doubles league needs.
 */
export const entry = pgTable(
  "entry",
  {
    id: id(),
    clubId: uuid("club_id")
      .notNull()
      .references(() => club.id, { onDelete: "cascade" }),
    /** Denormalised from the division so one-division-per-competition is enforceable. */
    competitionId: uuid("competition_id").notNull(),
    divisionId: uuid("division_id").notNull(),
    /** Optional override; otherwise derived from the members' display names. */
    displayName: text("display_name"),
    seed: integer("seed"),
    state: text("state").notNull().default("active"),
    /** Why this unit is in this division. Written when the coach confirms placements. */
    placementReason: text("placement_reason"),
    /** The same unit's entry in the previous competition, for movement history. */
    previousEntryId: uuid("previous_entry_id"),
    withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
    /**
     * When the player said they are not playing in the next competition. The
     * one thing a player says about next season: placements leave them out,
     * and the coach can add them back if they change their mind.
     */
    optedOutAt: timestamp("opted_out_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("entry_id_club_uq").on(t.id, t.clubId),
    unique("entry_id_competition_uq").on(t.id, t.competitionId),
    // Ties the entry's club to its competition's. Without it, one club could
    // place an entry in another club's division by naming its ids.
    foreignKey({
      columns: [t.competitionId, t.clubId],
      foreignColumns: [competition.id, competition.clubId],
      name: "entry_competition_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.divisionId, t.competitionId],
      foreignColumns: [division.id, division.competitionId],
      name: "entry_division_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.previousEntryId, t.clubId],
      foreignColumns: [t.id, t.clubId],
      name: "entry_previous_fk",
    }),
    index("entry_division_ix").on(t.divisionId),
    oneOf("entry_state_ck", "state", ["active", "withdrawn"]),
    oneOf("entry_placement_reason_ck", "placement_reason", [
      "promoted",
      "relegated",
      "held",
      "new",
      "returning",
      "manual",
    ]),
  ],
);

/**
 * Who makes up a unit: one row for singles, two for doubles.
 *
 * The unique constraint on (competition_id, member_id) is what stops a member
 * appearing in two divisions of the same competition, while leaving them free
 * to enter as many different competitions as they like.
 */
export const entryMember = pgTable(
  "entry_member",
  {
    entryId: uuid("entry_id").notNull(),
    memberId: uuid("member_id").notNull(),
    /** Denormalised twice over so the constraint below can exist at all. */
    competitionId: uuid("competition_id").notNull(),
    clubId: uuid("club_id").notNull(),
    role: text("role").notNull().default("player"),
    createdAt: createdAt(),
  },
  (t) => [
    unique("entry_member_pk").on(t.entryId, t.memberId),
    unique("entry_member_one_division_uq").on(t.competitionId, t.memberId),
    foreignKey({
      columns: [t.entryId, t.competitionId],
      foreignColumns: [entry.id, entry.competitionId],
      name: "entry_member_entry_fk",
    }).onDelete("cascade"),
    // The entry and the member must both belong to this row's club, so a
    // member of one club can never be put into another club's entry.
    foreignKey({
      columns: [t.entryId, t.clubId],
      foreignColumns: [entry.id, entry.clubId],
      name: "entry_member_entry_club_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.memberId, t.clubId],
      foreignColumns: [member.id, member.clubId],
      name: "entry_member_member_fk",
    }),
    index("entry_member_member_ix").on(t.memberId),
    oneOf("entry_member_role_ck", "role", ["player", "partner"]),
  ],
);

// ─────────────────────────────────────────────────────────────── matches ──

export const match = pgTable(
  "match",
  {
    id: id(),
    clubId: uuid("club_id")
      .notNull()
      .references(() => club.id, { onDelete: "cascade" }),
    competitionId: uuid("competition_id").notNull(),
    /** Null for friendlies and anything outside a division. */
    divisionId: uuid("division_id"),
    /**
     * open → reported → played, or disputed when the two claims differ. An open
     * match has no date, time or court: arranging it is up to the players.
     */
    status: text("status").notNull().default("open"),
    /** Set when the match reaches `played`, and only then. */
    outcome: text("outcome"),
    /** When it was played, taken from the claim that settled it. */
    playedOn: date("played_on"),
    score: jsonb("score").$type<Score>(),
    /** 0 or 1, matching match_side.side_index. */
    winningSide: integer("winning_side"),
    /** Which side retired, conceded or failed to appear. */
    retiredSide: integer("retired_side"),
    /**
     * The claim that put this result in the ledger: the second of two matching
     * reports, an acceptance, or a coach entry. Required once played, so every
     * result traces back to someone saying it. The full trail is in result_submission.
     */
    acceptedSubmissionId: uuid("accepted_submission_id"),
    /**
     * Sorted entry ids for this pairing. Makes round-robin generation idempotent —
     * re-running it cannot duplicate fixtures.
     */
    pairingKey: text("pairing_key"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  // Annotated because match and result_submission reference each other, which
  // TypeScript cannot infer on its own.
  (t): PgTableExtraConfigValue[] => [
    unique("match_id_club_uq").on(t.id, t.clubId),
    // Lets a match side carry its competition, so both sides come from the same league.
    unique("match_id_competition_uq").on(t.id, t.competitionId),
    uniqueIndex("match_division_pairing_uq")
      .on(t.divisionId, t.pairingKey)
      .where(sql`${t.pairingKey} is not null`),
    foreignKey({
      columns: [t.competitionId, t.clubId],
      foreignColumns: [competition.id, competition.clubId],
      name: "match_competition_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.divisionId, t.competitionId],
      foreignColumns: [division.id, division.competitionId],
      name: "match_division_fk",
    }).onDelete("cascade"),
    // The ledger can only point at a claim made about this match.
    foreignKey({
      columns: [t.acceptedSubmissionId, t.id],
      foreignColumns: [resultSubmission.id, resultSubmission.matchId],
      name: "match_accepted_submission_fk",
    }),
    index("match_competition_status_ix").on(t.competitionId, t.status),
    index("match_division_ix").on(t.divisionId),
    // The "who still hasn't played?" query, which runs constantly near a deadline.
    index("match_outstanding_ix")
      .on(t.competitionId)
      .where(sql`${t.status} in ('open', 'reported', 'disputed')`),
    oneOf("match_status_ck", "status", ["open", "reported", "played", "disputed"]),
    oneOf("match_outcome_ck", "outcome", [
      "completed",
      "retired",
      "walkover",
      "conceded",
      "unplayed",
    ]),
    check("match_winning_side_ck", sql`winning_side is null or winning_side in (0, 1)`),
    check("match_retired_side_ck", sql`retired_side is null or retired_side in (0, 1)`),
    // A result is in the ledger whole or not at all: a played match says how it
    // ended and which claim settled it, and nothing else does.
    check("match_played_outcome_ck", sql`(status = 'played') = (outcome is not null)`),
    check("match_played_claim_ck", sql`(status = 'played') = (accepted_submission_id is not null)`),
    // Every outcome but `unplayed` has a winner.
    check(
      "match_winner_ck",
      sql`(winning_side is not null) = (outcome is not null and outcome <> 'unplayed')`,
    ),
    // Null-safe: only compared when both are set.
    check("match_winner_not_retired_ck", sql`winning_side <> retired_side`),
    ...outcomeShape("match"),
  ],
);

/** A side of a match: the entry drawn to play, and so the one its result counts for. */
export const matchSide = pgTable(
  "match_side",
  {
    id: id(),
    clubId: uuid("club_id")
      .notNull()
      .references(() => club.id, { onDelete: "cascade" }),
    matchId: uuid("match_id").notNull(),
    /** Denormalised from the match so the entry can be required to be in the same competition. */
    competitionId: uuid("competition_id").notNull(),
    sideIndex: integer("side_index").notNull(),
    entryId: uuid("entry_id"),
    createdAt: createdAt(),
  },
  (t) => [
    unique("match_side_id_club_uq").on(t.id, t.clubId),
    unique("match_side_match_index_uq").on(t.matchId, t.sideIndex),
    // An entry cannot be drawn against itself.
    unique("match_side_match_entry_uq").on(t.matchId, t.entryId),
    foreignKey({
      columns: [t.matchId, t.clubId],
      foreignColumns: [match.id, match.clubId],
      name: "match_side_match_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.matchId, t.competitionId],
      foreignColumns: [match.id, match.competitionId],
      name: "match_side_competition_fk",
    }).onDelete("cascade"),
    // So a Men's Singles match cannot have a Mixed Doubles pair on one side.
    foreignKey({
      columns: [t.entryId, t.competitionId],
      foreignColumns: [entry.id, entry.competitionId],
      name: "match_side_entry_fk",
    }),
    index("match_side_entry_ix").on(t.entryId),
    check("match_side_index_ck", sql`side_index in (0, 1)`),
  ],
);

// ──────────────────────────────────────────────── results: submit, confirm ──

/**
 * Every claim ever made about a match. The match row holds the accepted score;
 * this holds how it got there, who said what, and what was overridden.
 *
 * Both sides report independently — nobody rubber-stamps the other's version.
 * A partial unique index allows one pending claim per side, so the two claims
 * coexist and can be compared:
 *
 *   - they agree          -> both confirm, the score enters the ledger
 *   - they differ         -> match.status becomes 'disputed', both claims stand
 *   - only one ever comes -> the match stays 'reported' indefinitely
 *   - the coach overrides -> a `coach_entry` claim confirms and supersedes
 *
 * A side's claim is either a score of its own or an acceptance of the other
 * side's, recorded with acceptsSubmissionId. Either side may replace its own
 * claim at any point before the result is agreed — most disputes are a typo —
 * and the old one is kept as `superseded`. Nothing enters the ledger on a
 * timer: two people agree, or the coach decides.
 *
 * A coach entry has no sideIndex: it speaks for the match, not a side, so it
 * settles the match rather than waiting on anyone.
 */
export const resultSubmission = pgTable(
  "result_submission",
  {
    id: id(),
    clubId: uuid("club_id")
      .notNull()
      .references(() => club.id, { onDelete: "cascade" }),
    matchId: uuid("match_id").notNull(),
    /**
     * Which side is making this claim, matching match_side.side_index.
     * Null only for a coach entry, which speaks for the match as a whole. A bot
     * reporting for a player uses that player's side.
     */
    sideIndex: integer("side_index"),
    /** Null when a coach entered it through an API key rather than as a member. */
    submittedByMemberId: uuid("submitted_by_member_id"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
    score: jsonb("score").$type<Score>(),
    outcome: text("outcome").notNull(),
    retiredSide: integer("retired_side"),
    /** When this side says it was played. Never compared: a different date is not a dispute. */
    playedOn: date("played_on"),
    state: text("state").notNull().default("pending"),
    /** When this claim entered the ledger. Who agreed is the other side's claim. */
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    /**
     * Set when this claim is the other side pressing "accept" rather than
     * reporting independently. Its score must equal the claim it accepts.
     * Null means the side reported a score of its own.
     */
    acceptsSubmissionId: uuid("accepts_submission_id"),
    source: text("source").notNull(),
    /** What the player actually typed. Debugs bad parses and seeds the parser's eval set. */
    rawInput: text("raw_input"),
    createdAt: createdAt(),
  },
  (t): PgTableExtraConfigValue[] => [
    unique("result_submission_id_club_uq").on(t.id, t.clubId),
    // Lets the match, and an acceptance, point at a claim on the same match only.
    unique("result_submission_id_match_uq").on(t.id, t.matchId),
    // One live claim per side. Two sides may both have one; a second claim from
    // the same side replaces its own, never the opponent's.
    uniqueIndex("result_submission_one_pending_per_side_uq")
      .on(t.matchId, t.sideIndex)
      .where(sql`${t.state} = 'pending' and ${t.sideIndex} is not null`),
    foreignKey({
      columns: [t.matchId, t.clubId],
      foreignColumns: [match.id, match.clubId],
      name: "result_submission_match_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.submittedByMemberId, t.clubId],
      foreignColumns: [member.id, member.clubId],
      name: "result_submission_submitter_fk",
    }),
    foreignKey({
      columns: [t.acceptsSubmissionId, t.matchId],
      foreignColumns: [t.id, t.matchId],
      name: "result_submission_accepts_fk",
    }),
    index("result_submission_match_ix").on(t.matchId),
    check(
      "result_submission_side_index_ck",
      sql`side_index is null or side_index in (0, 1)`,
    ),
    // A claim with no side speaks for the whole match: it settles it, so it is
    // never left waiting on a reply. This also keeps it from slipping past the
    // one-live-claim-per-side index above.
    check("result_submission_sideless_ck", sql`side_index is not null or state <> 'pending'`),
    // Accepting is something one side does to the other's claim.
    check(
      "result_submission_accepts_side_ck",
      sql`accepts_submission_id is null or side_index is not null`,
    ),
    ...outcomeShape("result_submission"),
    oneOf("result_submission_state_ck", "state", ["pending", "confirmed", "superseded"]),
    oneOf("result_submission_outcome_ck", "outcome", [
      "completed",
      "retired",
      "walkover",
      "conceded",
      "unplayed",
    ]),
    oneOf("result_submission_source_ck", "source", [
      "web",
      "telegram",
      "api",
      "coach_entry",
      "nl_parse",
    ]),
  ],
);

// ──────────────────────────────────────────────── events: audit and outbox ──

/**
 * Append-only. Never updated, never deleted.
 *
 * One table doing two jobs: it is the webhook outbox that adapters read, and it
 * is the record of what happened when a coach asks why someone was relegated.
 */
export const event = pgTable(
  "event",
  {
    /** Increasing, but not in commit order — so never page on it alone. See txId. */
    id: bigserial("id", { mode: "number" }).primaryKey(),
    /**
     * The transaction that wrote this event. Ids are handed out before commit,
     * so a slow request can commit event 41 after 42 is already visible, and a
     * reader paging on id would skip 41 for good. Read the `event_feed` view in
     * (tx_id, id) order instead; it holds events back until that is safe.
     */
    txId: xid8("tx_id").notNull().default(sql`pg_current_xact_id()`),
    clubId: uuid("club_id")
      .notNull()
      .references(() => club.id, { onDelete: "cascade" }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    /** Dotted name, e.g. 'match.result.confirmed'. */
    type: text("type").notNull(),
    subjectType: text("subject_type").notNull(),
    subjectId: uuid("subject_id"),
    actorType: text("actor_type").notNull(),
    actorId: uuid("actor_id"),
    payload: jsonb("payload").notNull().default({}),
  },
  (t) => [
    index("event_club_ix").on(t.clubId, t.id),
    index("event_feed_ix").on(t.clubId, t.txId, t.id),
    index("event_club_type_ix").on(t.clubId, t.type, t.id),
    index("event_subject_ix").on(t.clubId, t.subjectType, t.subjectId),
    oneOf("event_actor_type_ck", "actor_type", ["member", "api_key", "system"]),
  ],
);
