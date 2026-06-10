/**
 * Matching rules engine for contract verification.
 *
 * This module provides a pure-function engine that evaluates matching rules
 * against actual response values using JSON path resolution.
 */

import jp from 'jsonpath';
import type { MatchingRule, Mismatch } from '../types';

/** Result of evaluating a single matching rule. */
export type MatchResult = { pass: true } | { pass: false; mismatch: Mismatch };

/**
 * Evaluates a single matching rule against an actual response body.
 *
 * Resolves the JSON path from the rule against the actual body, then applies
 * the matching logic based on the rule type (exact, type, regex, include).
 *
 * @param rule - The matching rule to evaluate
 * @param actualBody - The actual response body to evaluate against
 * @returns A MatchResult indicating pass or fail with mismatch details
 */
export function evaluateMatchingRule(
  rule: MatchingRule,
  actualBody: unknown
): MatchResult {
  // Resolve JSON path
  let values: unknown[];
  try {
    values = jp.query(actualBody, rule.path);
  } catch {
    // If the path expression itself is invalid, treat as missing
    return {
      pass: false,
      mismatch: {
        path: rule.path,
        expected: rule.value,
        actual: undefined,
        type: 'missing',
      },
    };
  }

  if (values.length === 0) {
    return {
      pass: false,
      mismatch: {
        path: rule.path,
        expected: rule.value,
        actual: undefined,
        type: 'missing',
      },
    };
  }

  const actual = values[0];

  switch (rule.type) {
    case 'exact':
      return deepEqual(actual, rule.value)
        ? { pass: true }
        : {
            pass: false,
            mismatch: {
              path: rule.path,
              expected: rule.value,
              actual,
              type: 'body',
            },
          };

    case 'type':
      return sameTypeCategory(actual, rule.value)
        ? { pass: true }
        : {
            pass: false,
            mismatch: {
              path: rule.path,
              expected: typeOf(rule.value),
              actual: typeOf(actual),
              type: 'body',
            },
          };

    case 'regex': {
      let regex: RegExp;
      try {
        regex = new RegExp(`^(?:${rule.value as string})$`);
      } catch {
        return {
          pass: false,
          mismatch: {
            path: rule.path,
            expected: rule.value,
            actual: 'invalid regex pattern',
            type: 'body',
          },
        };
      }
      const strValue = toStringRepresentation(actual);
      return regex.test(strValue)
        ? { pass: true }
        : {
            pass: false,
            mismatch: {
              path: rule.path,
              expected: rule.value,
              actual: strValue,
              type: 'body',
            },
          };
    }

    case 'include': {
      const strActual = toStringRepresentation(actual);
      const substring = rule.value as string;
      return strActual.includes(substring)
        ? { pass: true }
        : {
            pass: false,
            mismatch: {
              path: rule.path,
              expected: `contains "${substring}"`,
              actual: strActual,
              type: 'body',
            },
          };
    }
  }
}

/**
 * Evaluates all matching rules against an actual response body.
 * If no matching rules are provided, defaults to exact matching of the entire body.
 *
 * @param responseBody - The actual response body received from the provider
 * @param expectedBody - The expected response body from the contract
 * @param matchingRules - Array of matching rules to apply
 * @returns Array of mismatches found (empty array means all rules passed)
 */
export function evaluateResponse(
  responseBody: unknown,
  expectedBody: unknown,
  matchingRules: MatchingRule[]
): Mismatch[] {
  const mismatches: Mismatch[] = [];

  if (matchingRules.length > 0) {
    for (const rule of matchingRules) {
      const result = evaluateMatchingRule(rule, responseBody);
      if (!result.pass) {
        mismatches.push(result.mismatch);
      }
    }
  } else if (expectedBody !== undefined) {
    // Default to exact matching when no rules are defined (Requirement 5.5)
    if (!deepEqual(responseBody, expectedBody)) {
      mismatches.push({
        path: '$.body',
        expected: expectedBody,
        actual: responseBody,
        type: 'body',
      });
    }
  }

  return mismatches;
}

/**
 * Converts a value to its string representation for regex/include matching.
 * Strings are returned as-is; non-strings are JSON-serialized.
 *
 * @param value - The value to convert
 * @returns String representation of the value
 */
export function toStringRepresentation(value: unknown): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

/**
 * Returns the type category of a value.
 * Categories: "string", "number", "boolean", "null", "array", "object"
 */
function typeOf(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/**
 * Checks if two values share the same type category.
 */
function sameTypeCategory(a: unknown, b: unknown): boolean {
  return typeOf(a) === typeOf(b);
}

/**
 * Deep equality comparison for matching rule evaluation.
 *
 * - Primitives: strict equality (===)
 * - null: only equal to null
 * - Arrays: same length with element-wise deep equality in order
 * - Objects: same keys with deep equality of values, regardless of key order
 *
 * @param a - First value
 * @param b - Second value
 * @returns true if values are deeply equal
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  // Strict equality handles primitives, same-reference objects, and both-undefined
  if (a === b) return true;

  // If either is null/undefined but not both (handled above), they differ
  if (a === null || b === null) return false;
  if (a === undefined || b === undefined) return false;

  // Type mismatch
  if (typeof a !== typeof b) return false;

  // Array comparison
  if (Array.isArray(a)) {
    if (!Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, b[i]));
  }

  // Object comparison (non-null, non-array objects)
  if (typeof a === 'object' && typeof b === 'object') {
    const keysA = Object.keys(a as object);
    const keysB = Object.keys(b as object);
    if (keysA.length !== keysB.length) return false;
    return keysA.every(
      (key) =>
        keysB.includes(key) &&
        deepEqual(
          (a as Record<string, unknown>)[key],
          (b as Record<string, unknown>)[key]
        )
    );
  }

  return false;
}
