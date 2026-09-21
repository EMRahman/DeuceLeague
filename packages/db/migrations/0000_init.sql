CREATE TABLE "access_grant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"scopes" text[] NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "access_grant_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "api_key" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"name" text NOT NULL,
	"key_hash" text NOT NULL,
	"prefix" text NOT NULL,
	"scopes" text[] DEFAULT '{league:read,results:write}' NOT NULL,
	"created_by_member_id" uuid,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_key_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "arrangement_proposal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"match_id" uuid NOT NULL,
	"proposed_by_member_id" uuid NOT NULL,
	"proposed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"slots" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"message" text,
	"state" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "arrangement_proposal_id_club_uq" UNIQUE("id","club_id"),
	CONSTRAINT "arrangement_proposal_state_ck" CHECK (state in ('open', 'accepted', 'declined', 'expired', 'withdrawn'))
);
--> statement-breakpoint
CREATE TABLE "arrangement_response" (
	"proposal_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"club_id" uuid NOT NULL,
	"response" text NOT NULL,
	"accepted_slot_index" integer,
	"responded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "arrangement_response_pk" UNIQUE("proposal_id","member_id"),
	CONSTRAINT "arrangement_response_kind_ck" CHECK (response in ('accept', 'decline', 'counter'))
);
--> statement-breakpoint
CREATE TABLE "club" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"timezone" text DEFAULT 'Europe/London' NOT NULL,
	"branding" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "club_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "competition" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"season_id" uuid NOT NULL,
	"name" text NOT NULL,
	"format_id" text DEFAULT 'box_league' NOT NULL,
	"discipline" text NOT NULL,
	"category" text DEFAULT 'open' NOT NULL,
	"match_format" jsonb NOT NULL,
	"rules" jsonb NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sequence_in_season" integer DEFAULT 1 NOT NULL,
	"previous_competition_id" uuid,
	"state" text DEFAULT 'draft' NOT NULL,
	"visibility" text DEFAULT 'members' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "competition_id_club_uq" UNIQUE("id","club_id"),
	CONSTRAINT "competition_season_name_uq" UNIQUE("season_id","name"),
	CONSTRAINT "competition_discipline_ck" CHECK (discipline in ('singles', 'doubles')),
	CONSTRAINT "competition_category_ck" CHECK (category in ('open', 'mens', 'womens', 'mixed')),
	CONSTRAINT "competition_state_ck" CHECK (state in ('draft', 'active', 'complete', 'archived')),
	CONSTRAINT "competition_visibility_ck" CHECK (visibility in ('public', 'members', 'private'))
);
--> statement-breakpoint
CREATE TABLE "division" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"competition_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"name" text NOT NULL,
	"target_size" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "division_id_club_uq" UNIQUE("id","club_id"),
	CONSTRAINT "division_id_competition_uq" UNIQUE("id","competition_id"),
	CONSTRAINT "division_competition_ordinal_uq" UNIQUE("competition_id","ordinal"),
	CONSTRAINT "division_ordinal_ck" CHECK (ordinal >= 1)
);
--> statement-breakpoint
CREATE TABLE "entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"competition_id" uuid NOT NULL,
	"division_id" uuid NOT NULL,
	"display_name" text,
	"seed" integer,
	"state" text DEFAULT 'active' NOT NULL,
	"placement_reason" text,
	"previous_entry_id" uuid,
	"withdrawn_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entry_id_club_uq" UNIQUE("id","club_id"),
	CONSTRAINT "entry_id_competition_uq" UNIQUE("id","competition_id"),
	CONSTRAINT "entry_state_ck" CHECK (state in ('active', 'withdrawn')),
	CONSTRAINT "entry_placement_reason_ck" CHECK (placement_reason in ('promoted', 'relegated', 'held', 'new', 'returning', 'manual'))
);
--> statement-breakpoint
CREATE TABLE "entry_member" (
	"entry_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"competition_id" uuid NOT NULL,
	"club_id" uuid NOT NULL,
	"role" text DEFAULT 'player' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entry_member_pk" UNIQUE("entry_id","member_id"),
	CONSTRAINT "entry_member_one_division_uq" UNIQUE("competition_id","member_id"),
	CONSTRAINT "entry_member_role_ck" CHECK (role in ('player', 'partner'))
);
--> statement-breakpoint
CREATE TABLE "event" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"club_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"type" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" uuid,
	"actor_type" text NOT NULL,
	"actor_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "event_actor_type_ck" CHECK (actor_type in ('member', 'api_key', 'system'))
);
--> statement-breakpoint
CREATE TABLE "match" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"competition_id" uuid NOT NULL,
	"division_id" uuid,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"outcome" text,
	"scheduled_at" timestamp with time zone,
	"court" text,
	"played_on" date,
	"score" jsonb,
	"winning_side" integer,
	"retired_side" integer,
	"accepted_submission_id" uuid,
	"pairing_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_id_club_uq" UNIQUE("id","club_id"),
	CONSTRAINT "match_status_ck" CHECK (status in ('scheduled', 'arranged', 'played', 'disputed', 'void')),
	CONSTRAINT "match_outcome_ck" CHECK (outcome in ('completed', 'retired', 'walkover', 'conceded', 'unplayed')),
	CONSTRAINT "match_winning_side_ck" CHECK (winning_side is null or winning_side in (0, 1)),
	CONSTRAINT "match_retired_side_ck" CHECK (retired_side is null or retired_side in (0, 1))
);
--> statement-breakpoint
CREATE TABLE "match_participant" (
	"match_side_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"club_id" uuid NOT NULL,
	"is_substitute" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_participant_pk" UNIQUE("match_side_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "match_side" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"match_id" uuid NOT NULL,
	"side_index" integer NOT NULL,
	"entry_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_side_id_club_uq" UNIQUE("id","club_id"),
	CONSTRAINT "match_side_match_index_uq" UNIQUE("match_id","side_index"),
	CONSTRAINT "match_side_index_ck" CHECK (side_index in (0, 1))
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"full_name" text,
	"email" text,
	"phone" text,
	"date_of_birth" date,
	"gender" text,
	"notes" text,
	"rating" numeric(6, 3),
	"rating_system" text,
	"status" text DEFAULT 'active' NOT NULL,
	"joined_on" date,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_id_club_uq" UNIQUE("id","club_id"),
	CONSTRAINT "member_status_ck" CHECK (status in ('active', 'paused', 'left')),
	CONSTRAINT "member_gender_ck" CHECK (gender in ('female', 'male', 'other', 'undisclosed'))
);
--> statement-breakpoint
CREATE TABLE "result_submission" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"match_id" uuid NOT NULL,
	"submitted_by_member_id" uuid,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"score" jsonb,
	"outcome" text NOT NULL,
	"retired_side" integer,
	"state" text DEFAULT 'pending' NOT NULL,
	"confirmed_by_member_id" uuid,
	"confirmed_at" timestamp with time zone,
	"rejected_at" timestamp with time zone,
	"reject_reason" text,
	"auto_confirm_at" timestamp with time zone,
	"source" text NOT NULL,
	"raw_input" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "result_submission_state_ck" CHECK (state in ('pending', 'confirmed', 'rejected', 'superseded')),
	CONSTRAINT "result_submission_outcome_ck" CHECK (outcome in ('completed', 'retired', 'walkover', 'conceded', 'unplayed')),
	CONSTRAINT "result_submission_source_ck" CHECK (source in ('web', 'telegram', 'api', 'coach_entry', 'nl_parse'))
);
--> statement-breakpoint
CREATE TABLE "season" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text,
	"year" integer,
	"starts_on" date,
	"ends_on" date,
	"results_deadline_at" timestamp with time zone,
	"state" text DEFAULT 'planning' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "season_id_club_uq" UNIQUE("id","club_id"),
	CONSTRAINT "season_club_name_uq" UNIQUE("club_id","name"),
	CONSTRAINT "season_kind_ck" CHECK (kind in ('spring', 'summer', 'autumn', 'winter')),
	CONSTRAINT "season_state_ck" CHECK (state in ('planning', 'active', 'complete', 'archived')),
	CONSTRAINT "season_dates_ck" CHECK (starts_on is null or ends_on is null or ends_on >= starts_on)
);
--> statement-breakpoint
ALTER TABLE "access_grant" ADD CONSTRAINT "access_grant_club_id_club_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."club"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_grant" ADD CONSTRAINT "access_grant_member_fk" FOREIGN KEY ("member_id","club_id") REFERENCES "public"."member"("id","club_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_club_id_club_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."club"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_creator_fk" FOREIGN KEY ("created_by_member_id","club_id") REFERENCES "public"."member"("id","club_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arrangement_proposal" ADD CONSTRAINT "arrangement_proposal_club_id_club_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."club"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arrangement_proposal" ADD CONSTRAINT "arrangement_proposal_match_fk" FOREIGN KEY ("match_id","club_id") REFERENCES "public"."match"("id","club_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arrangement_proposal" ADD CONSTRAINT "arrangement_proposal_member_fk" FOREIGN KEY ("proposed_by_member_id","club_id") REFERENCES "public"."member"("id","club_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arrangement_response" ADD CONSTRAINT "arrangement_response_proposal_fk" FOREIGN KEY ("proposal_id","club_id") REFERENCES "public"."arrangement_proposal"("id","club_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arrangement_response" ADD CONSTRAINT "arrangement_response_member_fk" FOREIGN KEY ("member_id","club_id") REFERENCES "public"."member"("id","club_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition" ADD CONSTRAINT "competition_club_id_club_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."club"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition" ADD CONSTRAINT "competition_season_fk" FOREIGN KEY ("season_id","club_id") REFERENCES "public"."season"("id","club_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition" ADD CONSTRAINT "competition_previous_fk" FOREIGN KEY ("previous_competition_id","club_id") REFERENCES "public"."competition"("id","club_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "division" ADD CONSTRAINT "division_club_id_club_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."club"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "division" ADD CONSTRAINT "division_competition_fk" FOREIGN KEY ("competition_id","club_id") REFERENCES "public"."competition"("id","club_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry" ADD CONSTRAINT "entry_club_id_club_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."club"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry" ADD CONSTRAINT "entry_division_fk" FOREIGN KEY ("division_id","competition_id") REFERENCES "public"."division"("id","competition_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry" ADD CONSTRAINT "entry_previous_fk" FOREIGN KEY ("previous_entry_id","club_id") REFERENCES "public"."entry"("id","club_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_member" ADD CONSTRAINT "entry_member_entry_fk" FOREIGN KEY ("entry_id","competition_id") REFERENCES "public"."entry"("id","competition_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_member" ADD CONSTRAINT "entry_member_member_fk" FOREIGN KEY ("member_id","club_id") REFERENCES "public"."member"("id","club_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_club_id_club_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."club"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match" ADD CONSTRAINT "match_club_id_club_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."club"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match" ADD CONSTRAINT "match_competition_fk" FOREIGN KEY ("competition_id","club_id") REFERENCES "public"."competition"("id","club_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match" ADD CONSTRAINT "match_division_fk" FOREIGN KEY ("division_id","competition_id") REFERENCES "public"."division"("id","competition_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_participant" ADD CONSTRAINT "match_participant_side_fk" FOREIGN KEY ("match_side_id","club_id") REFERENCES "public"."match_side"("id","club_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_participant" ADD CONSTRAINT "match_participant_member_fk" FOREIGN KEY ("member_id","club_id") REFERENCES "public"."member"("id","club_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_side" ADD CONSTRAINT "match_side_club_id_club_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."club"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_side" ADD CONSTRAINT "match_side_match_fk" FOREIGN KEY ("match_id","club_id") REFERENCES "public"."match"("id","club_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_side" ADD CONSTRAINT "match_side_entry_fk" FOREIGN KEY ("entry_id","club_id") REFERENCES "public"."entry"("id","club_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_club_id_club_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."club"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_submission" ADD CONSTRAINT "result_submission_club_id_club_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."club"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_submission" ADD CONSTRAINT "result_submission_match_fk" FOREIGN KEY ("match_id","club_id") REFERENCES "public"."match"("id","club_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_submission" ADD CONSTRAINT "result_submission_submitter_fk" FOREIGN KEY ("submitted_by_member_id","club_id") REFERENCES "public"."member"("id","club_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_submission" ADD CONSTRAINT "result_submission_confirmer_fk" FOREIGN KEY ("confirmed_by_member_id","club_id") REFERENCES "public"."member"("id","club_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season" ADD CONSTRAINT "season_club_id_club_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."club"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "access_grant_expiry_ix" ON "access_grant" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "api_key_club_ix" ON "api_key" USING btree ("club_id") WHERE "api_key"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "arrangement_proposal_match_ix" ON "arrangement_proposal" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "competition_club_state_ix" ON "competition" USING btree ("club_id","state");--> statement-breakpoint
CREATE INDEX "entry_division_ix" ON "entry" USING btree ("division_id");--> statement-breakpoint
CREATE INDEX "entry_member_member_ix" ON "entry_member" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "event_club_ix" ON "event" USING btree ("club_id","id");--> statement-breakpoint
CREATE INDEX "event_club_type_ix" ON "event" USING btree ("club_id","type","id");--> statement-breakpoint
CREATE INDEX "event_subject_ix" ON "event" USING btree ("club_id","subject_type","subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "match_division_pairing_uq" ON "match" USING btree ("division_id","pairing_key") WHERE "match"."pairing_key" is not null;--> statement-breakpoint
CREATE INDEX "match_competition_status_ix" ON "match" USING btree ("competition_id","status");--> statement-breakpoint
CREATE INDEX "match_division_ix" ON "match" USING btree ("division_id");--> statement-breakpoint
CREATE INDEX "match_outstanding_ix" ON "match" USING btree ("competition_id") WHERE "match"."status" in ('scheduled', 'arranged');--> statement-breakpoint
CREATE INDEX "match_participant_member_ix" ON "match_participant" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "match_side_entry_ix" ON "match_side" USING btree ("entry_id");--> statement-breakpoint
CREATE UNIQUE INDEX "member_club_email_uq" ON "member" USING btree ("club_id",lower("email")) WHERE "member"."deleted_at" is null and "member"."email" is not null;--> statement-breakpoint
CREATE INDEX "member_club_status_ix" ON "member" USING btree ("club_id","status") WHERE "member"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "result_submission_one_pending_uq" ON "result_submission" USING btree ("match_id") WHERE "result_submission"."state" = 'pending';--> statement-breakpoint
CREATE INDEX "result_submission_match_ix" ON "result_submission" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "result_submission_due_ix" ON "result_submission" USING btree ("auto_confirm_at") WHERE "result_submission"."state" = 'pending';--> statement-breakpoint
CREATE INDEX "season_club_state_ix" ON "season" USING btree ("club_id","state");