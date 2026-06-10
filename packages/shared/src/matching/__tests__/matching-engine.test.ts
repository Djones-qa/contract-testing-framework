import {
  evaluateMatchingRule,
  evaluateResponse,
  deepEqual,
  toStringRepresentation,
} from '../engine';
import type { MatchingRule } from '../../types';

describe('deepEqual', () => {
  it('returns true for identical primitives', () => {
    expect(deepEqual(1, 1)).toBe(true);
    expect(deepEqual('hello', 'hello')).toBe(true);
    expect(deepEqual(true, true)).toBe(true);
    expect(deepEqual(null, null)).toBe(true);
  });

  it('returns false for different primitives', () => {
    expect(deepEqual(1, 2)).toBe(false);
    expect(deepEqual('a', 'b')).toBe(false);
    expect(deepEqual(true, false)).toBe(false);
    expect(deepEqual(null, undefined)).toBe(false);
  });

  it('returns false for different types', () => {
    expect(deepEqual(1, '1')).toBe(false);
    expect(deepEqual(true, 1)).toBe(false);
    expect(deepEqual(null, 0)).toBe(false);
    expect(deepEqual([], {})).toBe(false);
  });

  it('handles arrays with deep equality in order', () => {
    expect(deepEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(deepEqual([1, 2, 3], [1, 3, 2])).toBe(false);
    expect(deepEqual([1, 2], [1, 2, 3])).toBe(false);
    expect(deepEqual([[1], [2]], [[1], [2]])).toBe(true);
  });

  it('handles objects regardless of key order', () => {
    expect(deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });

  it('handles nested structures', () => {
    const a = { x: [1, { y: 'z' }], w: null };
    const b = { w: null, x: [1, { y: 'z' }] };
    expect(deepEqual(a, b)).toBe(true);
  });
});

describe('toStringRepresentation', () => {
  it('returns strings as-is', () => {
    expect(toStringRepresentation('hello')).toBe('hello');
  });

  it('JSON-serializes numbers', () => {
    expect(toStringRepresentation(42)).toBe('42');
  });

  it('JSON-serializes booleans', () => {
    expect(toStringRepresentation(true)).toBe('true');
  });

  it('JSON-serializes null', () => {
    expect(toStringRepresentation(null)).toBe('null');
  });

  it('JSON-serializes arrays', () => {
    expect(toStringRepresentation([1, 2])).toBe('[1,2]');
  });

  it('JSON-serializes objects', () => {
    expect(toStringRepresentation({ a: 1 })).toBe('{"a":1}');
  });
});

describe('evaluateMatchingRule', () => {
  describe('exact matching', () => {
    it('passes when values are deeply equal', () => {
      const rule: MatchingRule = { path: '$.name', type: 'exact', value: 'Alice' };
      const result = evaluateMatchingRule(rule, { name: 'Alice' });
      expect(result.pass).toBe(true);
    });

    it('fails when values differ', () => {
      const rule: MatchingRule = { path: '$.name', type: 'exact', value: 'Alice' };
      const result = evaluateMatchingRule(rule, { name: 'Bob' });
      expect(result.pass).toBe(false);
      if (!result.pass) {
        expect(result.mismatch.type).toBe('body');
        expect(result.mismatch.expected).toBe('Alice');
        expect(result.mismatch.actual).toBe('Bob');
      }
    });

    it('passes for deeply equal objects', () => {
      const rule: MatchingRule = {
        path: '$.data',
        type: 'exact',
        value: { x: [1, 2], y: 'z' },
      };
      const result = evaluateMatchingRule(rule, { data: { y: 'z', x: [1, 2] } });
      expect(result.pass).toBe(true);
    });
  });

  describe('type matching', () => {
    it('passes when types match', () => {
      const rule: MatchingRule = { path: '$.age', type: 'type', value: 0 };
      const result = evaluateMatchingRule(rule, { age: 42 });
      expect(result.pass).toBe(true);
    });

    it('fails when types differ', () => {
      const rule: MatchingRule = { path: '$.age', type: 'type', value: 0 };
      const result = evaluateMatchingRule(rule, { age: '42' });
      expect(result.pass).toBe(false);
      if (!result.pass) {
        expect(result.mismatch.type).toBe('body');
        expect(result.mismatch.expected).toBe('number');
        expect(result.mismatch.actual).toBe('string');
      }
    });

    it('distinguishes arrays from objects', () => {
      const rule: MatchingRule = { path: '$.data', type: 'type', value: [] };
      const result = evaluateMatchingRule(rule, { data: {} });
      expect(result.pass).toBe(false);
    });

    it('matches null category', () => {
      const rule: MatchingRule = { path: '$.data', type: 'type', value: null };
      const result = evaluateMatchingRule(rule, { data: null });
      expect(result.pass).toBe(true);
    });
  });

  describe('regex matching', () => {
    it('passes when full string matches pattern', () => {
      const rule: MatchingRule = { path: '$.email', type: 'regex', value: '.+@.+\\..+' };
      const result = evaluateMatchingRule(rule, { email: 'user@example.com' });
      expect(result.pass).toBe(true);
    });

    it('fails when only partial match', () => {
      const rule: MatchingRule = { path: '$.id', type: 'regex', value: '\\d+' };
      const result = evaluateMatchingRule(rule, { id: 'abc123def' });
      expect(result.pass).toBe(false);
    });

    it('passes when entire string matches', () => {
      const rule: MatchingRule = { path: '$.id', type: 'regex', value: '\\d+' };
      const result = evaluateMatchingRule(rule, { id: '123' });
      expect(result.pass).toBe(true);
    });

    it('handles invalid regex pattern gracefully', () => {
      const rule: MatchingRule = { path: '$.val', type: 'regex', value: '[invalid(' };
      const result = evaluateMatchingRule(rule, { val: 'test' });
      expect(result.pass).toBe(false);
      if (!result.pass) {
        expect(result.mismatch.actual).toBe('invalid regex pattern');
      }
    });

    it('converts non-string values to JSON before matching', () => {
      const rule: MatchingRule = { path: '$.count', type: 'regex', value: '\\d+' };
      const result = evaluateMatchingRule(rule, { count: 42 });
      expect(result.pass).toBe(true);
    });
  });

  describe('include matching', () => {
    it('passes when substring is present', () => {
      const rule: MatchingRule = { path: '$.msg', type: 'include', value: 'world' };
      const result = evaluateMatchingRule(rule, { msg: 'hello world' });
      expect(result.pass).toBe(true);
    });

    it('fails when substring is absent', () => {
      const rule: MatchingRule = { path: '$.msg', type: 'include', value: 'xyz' };
      const result = evaluateMatchingRule(rule, { msg: 'hello world' });
      expect(result.pass).toBe(false);
    });

    it('is case-sensitive', () => {
      const rule: MatchingRule = { path: '$.msg', type: 'include', value: 'World' };
      const result = evaluateMatchingRule(rule, { msg: 'hello world' });
      expect(result.pass).toBe(false);
    });

    it('converts non-string values to JSON before checking', () => {
      const rule: MatchingRule = { path: '$.data', type: 'include', value: '"key"' };
      const result = evaluateMatchingRule(rule, { data: { key: 'val' } });
      expect(result.pass).toBe(true);
    });
  });

  describe('missing JSON path', () => {
    it('reports mismatch of type missing when path does not exist', () => {
      const rule: MatchingRule = { path: '$.nonexistent', type: 'exact', value: 'x' };
      const result = evaluateMatchingRule(rule, { name: 'Alice' });
      expect(result.pass).toBe(false);
      if (!result.pass) {
        expect(result.mismatch.type).toBe('missing');
        expect(result.mismatch.actual).toBeUndefined();
      }
    });
  });
});

describe('evaluateResponse', () => {
  it('applies all matching rules and collects mismatches', () => {
    const rules: MatchingRule[] = [
      { path: '$.name', type: 'exact', value: 'Alice' },
      { path: '$.age', type: 'type', value: 0 },
    ];
    const mismatches = evaluateResponse(
      { name: 'Bob', age: 25 },
      undefined,
      rules
    );
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0].path).toBe('$.name');
  });

  it('defaults to exact matching when no rules defined', () => {
    const mismatches = evaluateResponse(
      { a: 1 },
      { a: 2 },
      []
    );
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0].type).toBe('body');
  });

  it('returns empty array when exact body matches with no rules', () => {
    const mismatches = evaluateResponse(
      { a: 1, b: 2 },
      { b: 2, a: 1 },
      []
    );
    expect(mismatches).toHaveLength(0);
  });

  it('returns empty array when all rules pass', () => {
    const rules: MatchingRule[] = [
      { path: '$.name', type: 'type', value: '' },
      { path: '$.age', type: 'type', value: 0 },
    ];
    const mismatches = evaluateResponse(
      { name: 'Alice', age: 30 },
      undefined,
      rules
    );
    expect(mismatches).toHaveLength(0);
  });
});
