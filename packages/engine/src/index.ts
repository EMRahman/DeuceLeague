// The league's rules, as pure functions: no database, no network, no clock.
// Everything a function needs is passed in, so each can be tested on its own
// and the API is left with the job of fetching and storing.

export { judgeClaims, compareClaims, formatScore, type Claim, type ClaimVerdict } from "./claims.js";
export { roundRobin, pairingKey, type Pairing } from "./fixtures.js";
export {
  computeStandings,
  type StandingsEntry,
  type StandingsMatch,
  type StandingsInput,
  type StandingsRow,
  type Separator,
  type Tally,
  type MatchPoints,
  type PointsFor,
} from "./standings.js";
export {
  suggestPlacements,
  type DivisionStandings,
  type TargetDivision,
  type PlacementSuggestion,
} from "./placements.js";
