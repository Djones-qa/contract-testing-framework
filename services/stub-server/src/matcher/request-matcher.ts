/**
 * Stub request matching logic.
 *
 * Matches incoming HTTP requests against contract interactions using scored matching.
 * When multiple interactions match, the one with the highest specificity score is selected.
 */

import type { Interaction, MatchingRule } from '@contract-testing/shared';
import { evaluateMatchingRule } from '@contract-testing/shared';

/** Represents an incoming HTTP request to be matched against interactions. */
export interface IncomingRequest {
  method: string;
  path: string;
  headers: Record<string, string>;
  query: Record<string, string>;
  body?: unknown;
}

/** Internal structure pairing an interaction with its computed match score. */
interface MatchScore {
  interaction: Interaction;
  score: number;
}

/**
 * Finds the best matching interaction for an incoming request.
 *
 * Evaluates all interactions, computing a match score for each. Returns the
 * interaction with the highest score, or null if no interaction matches.
 *
 * @param request - The incoming HTTP request to match
 * @param interactions - The list of contract interactions to match against
 * @returns The best matching Interaction, or null if none match
 */
export function findBestMatch(
  request: IncomingRequest,
  interactions: Interaction[]
): Interaction | null {
  const scores: MatchScore[] = [];

  for (const interaction of interactions) {
    const score = computeMatchScore(request, interaction);
    if (score > 0) {
      scores.push({ interaction, score });
    }
  }

  if (scores.length === 0) return null;

  scores.sort((a, b) => b.score - a.score);
  return scores[0].interaction;
}

/**
 * Computes a match score for a request against an interaction.
 *
 * Method and path are required matches (score 0 = no match).
 * Headers, query, and body matching rules add to the score when defined and matched.
 * If any defined criterion fails, returns 0 (no match).
 *
 * @param request - The incoming request
 * @param interaction - The interaction to score against
 * @returns A positive score if matched, 0 if not matched
 */
export function computeMatchScore(
  request: IncomingRequest,
  interaction: Interaction
): number {
  let score = 0;

  // Method match (required, case-insensitive)
  if (request.method.toUpperCase() !== interaction.request.method.toUpperCase()) {
    return 0;
  }
  score += 1;

  // Path match (required, with wildcard support for :params)
  if (!pathMatches(request.path, interaction.request.path)) {
    return 0;
  }
  score += 2;

  // Header match (optional but adds score; if defined, all must be present)
  if (interaction.request.headers && Object.keys(interaction.request.headers).length > 0) {
    if (!headersMatch(request.headers, interaction.request.headers)) {
      return 0;
    }
    score += 1;
  }

  // Query match (optional but adds score; if defined, all must be present)
  if (interaction.request.query && Object.keys(interaction.request.query).length > 0) {
    if (!queryMatches(request.query, interaction.request.query)) {
      return 0;
    }
    score += 1;
  }

  // Body match via matching rules (optional but adds score)
  if (interaction.request.matchingRules && interaction.request.matchingRules.length > 0) {
    if (!bodyMatchesRules(request.body, interaction.request.matchingRules)) {
      return 0;
    }
    score += interaction.request.matchingRules.length;
  }

  return score;
}

/**
 * Checks if a request path matches an interaction path pattern.
 *
 * Compares path segments one-to-one. Segments prefixed with ":" in the interaction
 * path are treated as wildcards that match any non-empty value.
 *
 * @param requestPath - The actual request path (e.g., "/users/123")
 * @param interactionPath - The interaction path pattern (e.g., "/users/:id")
 * @returns true if the paths match
 */
export function pathMatches(requestPath: string, interactionPath: string): boolean {
  const reqSegments = requestPath.split('/').filter(Boolean);
  const intSegments = interactionPath.split('/').filter(Boolean);

  if (reqSegments.length !== intSegments.length) return false;

  return intSegments.every((seg, i) =>
    seg.startsWith(':') ? reqSegments[i].length > 0 : seg === reqSegments[i]
  );
}

/**
 * Checks if incoming request headers satisfy the required interaction headers.
 *
 * Uses case-insensitive comparison for header names. All headers defined in the
 * interaction must be present in the request with matching values. Additional
 * headers in the request are ignored.
 *
 * @param requestHeaders - The actual request headers
 * @param requiredHeaders - The headers required by the interaction
 * @returns true if all required headers are present with correct values
 */
export function headersMatch(
  requestHeaders: Record<string, string>,
  requiredHeaders: Record<string, string>
): boolean {
  const normalizedRequest = Object.fromEntries(
    Object.entries(requestHeaders).map(([k, v]) => [k.toLowerCase(), v])
  );

  return Object.entries(requiredHeaders).every(([key, value]) =>
    normalizedRequest[key.toLowerCase()] === value
  );
}

/**
 * Checks if incoming request query parameters satisfy the required interaction query params.
 *
 * Uses case-sensitive comparison for both keys and values. All query parameters
 * defined in the interaction must be present in the request with matching values.
 * Additional parameters in the request are ignored.
 *
 * @param requestQuery - The actual request query parameters
 * @param requiredQuery - The query parameters required by the interaction
 * @returns true if all required query parameters are present with correct values
 */
export function queryMatches(
  requestQuery: Record<string, string>,
  requiredQuery: Record<string, string>
): boolean {
  return Object.entries(requiredQuery).every(([key, value]) =>
    requestQuery[key] === value
  );
}

/**
 * Checks if a request body satisfies all matching rules.
 *
 * Applies the matching rules engine to the request body. All rules must pass.
 *
 * @param body - The request body (may be undefined)
 * @param matchingRules - The matching rules to apply
 * @returns true if all matching rules pass, or if body is undefined and rules exist
 */
function bodyMatchesRules(body: unknown, matchingRules: MatchingRule[]): boolean {
  if (body === undefined || body === null) return false;

  return matchingRules.every(
    (rule) => evaluateMatchingRule(rule, body).pass
  );
}
