export type FullClubRecord = {
  id: string; slug: string; name: string; timezone: string; branding: unknown;
  createdAt: Date; updatedAt: Date;
};
export type ApiKeyRecord = {
  id: string; name: string; prefix: string; scopes: string[];
  lastUsedAt: Date | null; expiresAt: Date | null; revokedAt: Date | null; createdAt: Date;
};
export type PersonalFields = {
  fullName: string | null; email: string | null; phone: string | null;
  dateOfBirth: string | null; gender: string | null; notes: string | null;
};
export type MemberRecord = {
  id: string; displayName: string; status: string; rating: string | null;
  ratingSystem: string | null; joinedOn: string | null; deletedAt: Date | null;
  createdAt: Date; updatedAt: Date;
} & Partial<PersonalFields>;
export type MemberChanges = Partial<{
  displayName: string; status: string; rating: string | null; ratingSystem: string | null; joinedOn: string | null;
} & PersonalFields>;
