import {
  findBestMatch,
  computeMatchScore,
  pathMatches,
  headersMatch,
  queryMatches,
  IncomingRequest,
} from '../request-matcher';
import type { Interaction } from '@contract-testing/shared';

function makeInteraction(overrides: Partial<Interaction> = {}): Interaction {
  return {
    id: 'int-1',
    description: 'Test interaction',
    providerStates: [],
    request: {
      method: 'GET',
      path: '/users',
      headers: undefined,
      query: undefined,
      body: undefined,
    },
    response: {
      status: 200,
      body: { ok: true },
    },
    matchingRules: [],
    ...overrides,
  };
}

describe('pathMatches', () => {
  it('matches identical paths', () => {
    expect(pathMatches('/users/123', '/users/123')).toBe(true);
  });

  it('rejects paths with different segment counts', () => {
    expect(pathMatches('/users', '/users/123')).toBe(false);
  });

  it('rejects paths with mismatched segments', () => {
    expect(pathMatches('/users/abc', '/users/123')).toBe(false);
  });

  it('matches :param wildcards against any non-empty value', () => {
    expect(pathMatches('/users/42', '/users/:id')).toBe(true);
    expect(pathMatches('/users/abc', '/users/:id')).toBe(true);
  });

  it('rejects empty root path against a pattern with segments', () => {
    expect(pathMatches('/', '/users/:id')).toBe(false);
  });

  it('handles multiple wildcards', () => {
    expect(pathMatches('/orgs/myorg/users/42', '/orgs/:org/users/:id')).toBe(true);
  });

  it('handles root path matching', () => {
    expect(pathMatches('/', '/')).toBe(true);
  });
});

describe('headersMatch', () => {
  it('matches when all required headers are present', () => {
    expect(
      headersMatch(
        { 'Content-Type': 'application/json', 'X-Extra': 'foo' },
        { 'Content-Type': 'application/json' }
      )
    ).toBe(true);
  });

  it('uses case-insensitive header name comparison', () => {
    expect(
      headersMatch(
        { 'content-type': 'application/json' },
        { 'Content-Type': 'application/json' }
      )
    ).toBe(true);
  });

  it('rejects when a required header is missing', () => {
    expect(
      headersMatch(
        { 'X-Other': 'value' },
        { 'Content-Type': 'application/json' }
      )
    ).toBe(false);
  });

  it('rejects when header value does not match', () => {
    expect(
      headersMatch(
        { 'Content-Type': 'text/html' },
        { 'Content-Type': 'application/json' }
      )
    ).toBe(false);
  });

  it('ignores extra headers in the request', () => {
    expect(
      headersMatch(
        { 'Content-Type': 'application/json', Authorization: 'Bearer xyz', 'X-Custom': 'val' },
        { 'Content-Type': 'application/json' }
      )
    ).toBe(true);
  });
});

describe('queryMatches', () => {
  it('matches when all required query params are present with correct values', () => {
    expect(
      queryMatches(
        { page: '1', limit: '10', extra: 'ignored' },
        { page: '1', limit: '10' }
      )
    ).toBe(true);
  });

  it('rejects when a required query param is missing', () => {
    expect(queryMatches({ page: '1' }, { page: '1', limit: '10' })).toBe(false);
  });

  it('rejects when a query param value does not match (case-sensitive)', () => {
    expect(queryMatches({ status: 'Active' }, { status: 'active' })).toBe(false);
  });

  it('ignores extra query params in the request', () => {
    expect(queryMatches({ a: '1', b: '2', c: '3' }, { a: '1' })).toBe(true);
  });
});

describe('computeMatchScore', () => {
  it('returns 0 for method mismatch', () => {
    const request: IncomingRequest = {
      method: 'POST',
      path: '/users',
      headers: {},
      query: {},
    };
    const interaction = makeInteraction();
    expect(computeMatchScore(request, interaction)).toBe(0);
  });

  it('returns 0 for path mismatch', () => {
    const request: IncomingRequest = {
      method: 'GET',
      path: '/posts',
      headers: {},
      query: {},
    };
    const interaction = makeInteraction();
    expect(computeMatchScore(request, interaction)).toBe(0);
  });

  it('returns base score 3 for method + path match only', () => {
    const request: IncomingRequest = {
      method: 'GET',
      path: '/users',
      headers: {},
      query: {},
    };
    const interaction = makeInteraction();
    expect(computeMatchScore(request, interaction)).toBe(3);
  });

  it('adds 1 for matching headers', () => {
    const request: IncomingRequest = {
      method: 'GET',
      path: '/users',
      headers: { 'content-type': 'application/json' },
      query: {},
    };
    const interaction = makeInteraction({
      request: {
        method: 'GET',
        path: '/users',
        headers: { 'Content-Type': 'application/json' },
      },
    });
    expect(computeMatchScore(request, interaction)).toBe(4);
  });

  it('adds 1 for matching query params', () => {
    const request: IncomingRequest = {
      method: 'GET',
      path: '/users',
      headers: {},
      query: { page: '1' },
    };
    const interaction = makeInteraction({
      request: {
        method: 'GET',
        path: '/users',
        query: { page: '1' },
      },
    });
    expect(computeMatchScore(request, interaction)).toBe(4);
  });

  it('method comparison is case-insensitive', () => {
    const request: IncomingRequest = {
      method: 'get',
      path: '/users',
      headers: {},
      query: {},
    };
    const interaction = makeInteraction();
    expect(computeMatchScore(request, interaction)).toBe(3);
  });
});

describe('findBestMatch', () => {
  it('returns null when no interactions match', () => {
    const request: IncomingRequest = {
      method: 'GET',
      path: '/unknown',
      headers: {},
      query: {},
    };
    const interactions = [makeInteraction()];
    expect(findBestMatch(request, interactions)).toBeNull();
  });

  it('returns the matching interaction', () => {
    const request: IncomingRequest = {
      method: 'GET',
      path: '/users',
      headers: {},
      query: {},
    };
    const interaction = makeInteraction();
    expect(findBestMatch(request, [interaction])).toBe(interaction);
  });

  it('returns the most specific match when multiple interactions match', () => {
    const request: IncomingRequest = {
      method: 'GET',
      path: '/users',
      headers: { 'content-type': 'application/json' },
      query: { page: '1' },
    };

    const lessSpecific = makeInteraction({ id: 'less', description: 'Less specific' });
    const moreSpecific = makeInteraction({
      id: 'more',
      description: 'More specific',
      request: {
        method: 'GET',
        path: '/users',
        headers: { 'Content-Type': 'application/json' },
        query: { page: '1' },
      },
    });

    const result = findBestMatch(request, [lessSpecific, moreSpecific]);
    expect(result).toBe(moreSpecific);
  });

  it('returns null for empty interactions array', () => {
    const request: IncomingRequest = {
      method: 'GET',
      path: '/users',
      headers: {},
      query: {},
    };
    expect(findBestMatch(request, [])).toBeNull();
  });

  it('matches wildcard paths with highest specificity', () => {
    const request: IncomingRequest = {
      method: 'GET',
      path: '/users/42',
      headers: { authorization: 'Bearer token' },
      query: {},
    };

    const wildcardOnly = makeInteraction({
      id: 'wildcard',
      description: 'Wildcard match',
      request: { method: 'GET', path: '/users/:id' },
    });

    const wildcardWithHeaders = makeInteraction({
      id: 'wildcard-headers',
      description: 'Wildcard with headers',
      request: {
        method: 'GET',
        path: '/users/:id',
        headers: { Authorization: 'Bearer token' },
      },
    });

    const result = findBestMatch(request, [wildcardOnly, wildcardWithHeaders]);
    expect(result).toBe(wildcardWithHeaders);
  });

  it('handles body matching rules', () => {
    const request: IncomingRequest = {
      method: 'POST',
      path: '/users',
      headers: {},
      query: {},
      body: { name: 'Alice', age: 30 },
    };

    const withBodyRules = makeInteraction({
      id: 'body-rules',
      description: 'With body rules',
      request: {
        method: 'POST',
        path: '/users',
        matchingRules: [
          { path: '$.name', type: 'type', value: 'string' },
        ],
      },
    });

    const withoutBodyRules = makeInteraction({
      id: 'no-body',
      description: 'No body rules',
      request: { method: 'POST', path: '/users' },
    });

    const result = findBestMatch(request, [withoutBodyRules, withBodyRules]);
    expect(result).toBe(withBodyRules);
  });

  it('returns 0 score when body does not match matching rules', () => {
    const request: IncomingRequest = {
      method: 'POST',
      path: '/users',
      headers: {},
      query: {},
      body: { name: 123 },
    };

    const interaction = makeInteraction({
      request: {
        method: 'POST',
        path: '/users',
        matchingRules: [
          { path: '$.name', type: 'type', value: 'string' },
        ],
      },
    });

    expect(computeMatchScore(request, interaction)).toBe(0);
  });

  it('returns 0 score when body is undefined but matching rules are defined', () => {
    const request: IncomingRequest = {
      method: 'POST',
      path: '/users',
      headers: {},
      query: {},
      body: undefined,
    };

    const interaction = makeInteraction({
      request: {
        method: 'POST',
        path: '/users',
        matchingRules: [
          { path: '$.name', type: 'exact', value: 'Alice' },
        ],
      },
    });

    expect(computeMatchScore(request, interaction)).toBe(0);
  });
});
