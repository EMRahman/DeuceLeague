export type FullClubRecord = {
  id: string; slug: string; name: string; timezone: string; branding: unknown;
  createdAt: Date; updatedAt: Date;
};
export type WeatherUnits = "uk" | "metric" | "us";
export type CourtLocationRecord = {
  id: string; name: string; latitude: number; longitude: number;
  createdAt: Date; updatedAt: Date;
};
export type WeatherRecord = { units: WeatherUnits; courtLocations: CourtLocationRecord[] };
export type ApiKeyRecord = {
  id: string; name: string; prefix: string; scopes: string[];
  lastUsedAt: Date | null; expiresAt: Date | null; revokedAt: Date | null; createdAt: Date;
};
export type PersonalFields = {
  fullName: string | null; email: string | null; phone: string | null;
  invitationState: "accepted" | "failed" | null; invitationAt: number | null;
  dateOfBirth: string | null; gender: string | null; ageGroup: string | null; notes: string | null;
};
export type MemberRecord = {
  id: string; displayName: string; status: string; rating: string | null;
  ratingSystem: string | null; level: number | null; joinedOn: string | null; deletedAt: Date | null;
  /** When they said they are not playing next season at all, if they did. */
  leavingAt: Date | null;
  /** What they want to play: singles, doubles, both or not now (social). Null: not said. */
  plays: string | null;
  /** The newest session still signed in; null when signed in nowhere. */
  signedInAt: Date | null;
  /** The latest sign-in ever, from the audit history: unlike signedInAt, signing out does not clear it. */
  lastSignedInAt: Date | null;
  createdAt: Date; updatedAt: Date;
} & Partial<PersonalFields>;
export type MemberChanges = Partial<{
  displayName: string; status: string; rating: string | null; ratingSystem: string | null; level: number | null;
  joinedOn: string | null; plays: string | null;
} & Omit<PersonalFields, "invitationState" | "invitationAt">>;
