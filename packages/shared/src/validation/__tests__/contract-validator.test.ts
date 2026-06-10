import { validateContract, ValidationResult } from '../contract-validator';

function validContract(): Record<string, unknown> {
  return {
    consumer: 'order-service',
    provider: 'payment-service',
    version: '1.0.0',
    interactions: [
      {
        description: 'get user by id',
        request: { method: 'GET', path: '/users/1' },
        response: { status: 200 },
      },
    ],
  };
}

describe('validateContract', () => {
  describe('top-level validation', () => {
    it('should pass for a valid minimal contract', () => {
      const result = validateContract(validContract());
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject null input', () => {
      const result = validateContract(null);
      expect(result.valid).toBe(false);
      expect(result.errors[0].field).toBe('contract');
    });

    it('should reject non-object input', () => {
      const result = validateContract('string');
      expect(result.valid).toBe(false);
    });

    it('should reject arrays', () => {
      const result = validateContract([]);
      expect(result.valid).toBe(false);
    });
  });

  describe('consumer/provider name validation', () => {
    it('should require consumer field', () => {
      const data = validContract();
      delete data.consumer;
      const result = validateContract(data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'consumer', message: 'consumer is required' })
      );
    });

    it('should require provider field', () => {
      const data = validContract();
      delete data.provider;
      const result = validateContract(data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'provider', message: 'provider is required' })
      );
    });

    it('should reject empty consumer name', () => {
      const data = validContract();
      data.consumer = '';
      const result = validateContract(data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'consumer', message: 'consumer must not be empty' })
      );
    });

    it('should reject whitespace-only consumer name', () => {
      const data = validContract();
      data.consumer = '   ';
      const result = validateContract(data);
      expect(result.valid).toBe(false);
    });

    it('should reject consumer name exceeding 128 characters', () => {
      const data = validContract();
      data.consumer = 'a'.repeat(129);
      const result = validateContract(data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'consumer', message: 'consumer must not exceed 128 characters' })
      );
    });

    it('should accept consumer name at exactly 128 characters', () => {
      const data = validContract();
      data.consumer = 'a'.repeat(128);
      const result = validateContract(data);
      expect(result.valid).toBe(true);
    });

    it('should reject non-string consumer', () => {
      const data = validContract();
      data.consumer = 123;
      const result = validateContract(data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'consumer', message: 'consumer must be a string' })
      );
    });
  });

  describe('version validation', () => {
    it('should require version field', () => {
      const data = validContract();
      delete data.version;
      const result = validateContract(data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'version', message: 'version is required' })
      );
    });

    it('should accept valid semver', () => {
      const data = validContract();
      data.version = '2.10.3';
      const result = validateContract(data);
      expect(result.valid).toBe(true);
    });

    it('should reject invalid semver format', () => {
      const data = validContract();
      data.version = '1.0';
      const result = validateContract(data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'version', message: 'version must be in semver format (major.minor.patch)' })
      );
    });

    it('should reject semver with pre-release tag', () => {
      const data = validContract();
      data.version = '1.0.0-beta';
      const result = validateContract(data);
      expect(result.valid).toBe(false);
    });

    it('should reject non-string version', () => {
      const data = validContract();
      data.version = 100;
      const result = validateContract(data);
      expect(result.valid).toBe(false);
    });
  });

  describe('interactions validation', () => {
    it('should require interactions field', () => {
      const data = validContract();
      delete data.interactions;
      const result = validateContract(data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'interactions', message: 'interactions is required' })
      );
    });

    it('should reject non-array interactions', () => {
      const data = validContract();
      data.interactions = 'not-array';
      const result = validateContract(data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'interactions', message: 'interactions must be an array' })
      );
    });

    it('should reject empty interactions array', () => {
      const data = validContract();
      data.interactions = [];
      const result = validateContract(data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'interactions', message: 'interactions must contain at least one interaction' })
      );
    });
  });

  describe('interaction description validation', () => {
    it('should require description', () => {
      const data = validContract();
      (data.interactions as any[])[0].description = undefined;
      delete (data.interactions as any[])[0].description;
      const result = validateContract(data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'interactions[0].description', message: 'description is required' })
      );
    });

    it('should reject whitespace-only description', () => {
      const data = validContract();
      (data.interactions as any[])[0].description = '   \t\n';
      const result = validateContract(data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'interactions[0].description',
          message: 'description must contain at least 1 non-whitespace character',
        })
      );
    });
  });

  describe('request spec validation', () => {
    it('should require request field', () => {
      const data = validContract();
      delete (data.interactions as any[])[0].request;
      const result = validateContract(data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'interactions[0].request', message: 'request is required' })
      );
    });

    it('should require method in request', () => {
      const data = validContract();
      delete (data.interactions as any[])[0].request.method;
      const result = validateContract(data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'interactions[0].request.method', message: 'method is required' })
      );
    });

    it('should accept valid HTTP methods case-insensitively', () => {
      for (const method of ['get', 'Post', 'PUT', 'patch', 'DELETE', 'head', 'Options']) {
        const data = validContract();
        (data.interactions as any[])[0].request.method = method;
        const result = validateContract(data);
        expect(result.valid).toBe(true);
      }
    });

    it('should reject invalid HTTP method', () => {
      const data = validContract();
      (data.interactions as any[])[0].request.method = 'FETCH';
      const result = validateContract(data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'interactions[0].request.method' })
      );
    });

    it('should require path in request', () => {
      const data = validContract();
      delete (data.interactions as any[])[0].request.path;
      const result = validateContract(data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'interactions[0].request.path', message: 'path is required' })
      );
    });

    it('should reject path not starting with "/"', () => {
      const data = validContract();
      (data.interactions as any[])[0].request.path = 'users/1';
      const result = validateContract(data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'interactions[0].request.path', message: 'path must start with "/"' })
      );
    });
  });

  describe('response spec validation', () => {
    it('should require response field', () => {
      const data = validContract();
      delete (data.interactions as any[])[0].response;
      const result = validateContract(data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'interactions[0].response', message: 'response is required' })
      );
    });

    it('should require status in response', () => {
      const data = validContract();
      delete (data.interactions as any[])[0].response.status;
      const result = validateContract(data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'interactions[0].response.status', message: 'status is required' })
      );
    });

    it('should reject non-integer status', () => {
      const data = validContract();
      (data.interactions as any[])[0].response.status = 200.5;
      const result = validateContract(data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'interactions[0].response.status', message: 'status must be an integer' })
      );
    });

    it('should reject status below 100', () => {
      const data = validContract();
      (data.interactions as any[])[0].response.status = 99;
      const result = validateContract(data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'interactions[0].response.status', message: 'status must be between 100 and 599' })
      );
    });

    it('should reject status above 599', () => {
      const data = validContract();
      (data.interactions as any[])[0].response.status = 600;
      const result = validateContract(data);
      expect(result.valid).toBe(false);
    });

    it('should accept boundary status values', () => {
      for (const status of [100, 599]) {
        const data = validContract();
        (data.interactions as any[])[0].response.status = status;
        const result = validateContract(data);
        expect(result.valid).toBe(true);
      }
    });
  });

  describe('matching rules validation', () => {
    it('should accept valid matching rules', () => {
      const data = validContract();
      (data.interactions as any[])[0].matchingRules = [
        { path: '$.body.name', type: 'exact', value: 'John' },
      ];
      const result = validateContract(data);
      expect(result.valid).toBe(true);
    });

    it('should reject matching rule with path not starting with "$"', () => {
      const data = validContract();
      (data.interactions as any[])[0].matchingRules = [
        { path: 'body.name', type: 'exact', value: 'John' },
      ];
      const result = validateContract(data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'interactions[0].matchingRules[0].path',
          message: 'path must start with "$"',
        })
      );
    });

    it('should reject matching rule with unsupported type', () => {
      const data = validContract();
      (data.interactions as any[])[0].matchingRules = [
        { path: '$.body.name', type: 'fuzzy', value: 'John' },
      ];
      const result = validateContract(data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'interactions[0].matchingRules[0].type' })
      );
    });

    it('should reject matching rule with null value', () => {
      const data = validContract();
      (data.interactions as any[])[0].matchingRules = [
        { path: '$.body.name', type: 'exact', value: null },
      ];
      const result = validateContract(data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'interactions[0].matchingRules[0].value',
          message: 'value is required and must not be null',
        })
      );
    });

    it('should accept all supported matching rule types', () => {
      for (const type of ['exact', 'type', 'regex', 'include']) {
        const data = validContract();
        (data.interactions as any[])[0].matchingRules = [
          { path: '$.body.field', type, value: 'test' },
        ];
        const result = validateContract(data);
        expect(result.valid).toBe(true);
      }
    });
  });

  describe('multiple errors', () => {
    it('should return all errors at once', () => {
      const data = {
        consumer: '',
        provider: '',
        version: 'bad',
        interactions: [
          { description: '', request: { method: 'INVALID', path: 'bad' }, response: { status: 999 } },
        ],
      };
      const result = validateContract(data);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });
  });
});
