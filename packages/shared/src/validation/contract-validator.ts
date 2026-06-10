/**
 * Contract validation logic.
 *
 * Validates the structure and content of contract data before storage,
 * returning structured errors for all invalid fields.
 */

/** A single validation failure with a field path and human-readable message. */
export interface ValidationError {
  field: string;
  message: string;
}

/** The outcome of validating a contract payload. */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

const VALID_HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
const VALID_MATCHING_RULE_TYPES = ['exact', 'type', 'regex', 'include'];
const SEMVER_REGEX = /^\d+\.\d+\.\d+$/;
const MAX_NAME_LENGTH = 128;

/**
 * Validates raw contract data (as received from an HTTP request).
 * Returns all validation errors found, not just the first.
 */
export function validateContract(data: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  if (data === null || data === undefined || typeof data !== 'object' || Array.isArray(data)) {
    errors.push({ field: 'contract', message: 'Contract must be a non-null object' });
    return { valid: false, errors };
  }

  const obj = data as Record<string, unknown>;

  // Validate consumer
  validateName(obj, 'consumer', errors);

  // Validate provider
  validateName(obj, 'provider', errors);

  // Validate version
  validateVersion(obj, errors);

  // Validate interactions
  validateInteractions(obj, errors);

  return { valid: errors.length === 0, errors };
}

function validateName(obj: Record<string, unknown>, field: 'consumer' | 'provider', errors: ValidationError[]): void {
  const value = obj[field];

  if (value === undefined || value === null) {
    errors.push({ field, message: `${field} is required` });
    return;
  }

  if (typeof value !== 'string') {
    errors.push({ field, message: `${field} must be a string` });
    return;
  }

  if (value.trim().length === 0) {
    errors.push({ field, message: `${field} must not be empty` });
    return;
  }

  if (value.length > MAX_NAME_LENGTH) {
    errors.push({ field, message: `${field} must not exceed ${MAX_NAME_LENGTH} characters` });
  }
}

function validateVersion(obj: Record<string, unknown>, errors: ValidationError[]): void {
  const value = obj.version;

  if (value === undefined || value === null) {
    errors.push({ field: 'version', message: 'version is required' });
    return;
  }

  if (typeof value !== 'string') {
    errors.push({ field: 'version', message: 'version must be a string' });
    return;
  }

  if (!SEMVER_REGEX.test(value)) {
    errors.push({ field: 'version', message: 'version must be in semver format (major.minor.patch)' });
  }
}

function validateInteractions(obj: Record<string, unknown>, errors: ValidationError[]): void {
  const interactions = obj.interactions;

  if (interactions === undefined || interactions === null) {
    errors.push({ field: 'interactions', message: 'interactions is required' });
    return;
  }

  if (!Array.isArray(interactions)) {
    errors.push({ field: 'interactions', message: 'interactions must be an array' });
    return;
  }

  if (interactions.length === 0) {
    errors.push({ field: 'interactions', message: 'interactions must contain at least one interaction' });
    return;
  }

  for (let i = 0; i < interactions.length; i++) {
    validateInteraction(interactions[i], i, errors);
  }
}

function validateInteraction(interaction: unknown, index: number, errors: ValidationError[]): void {
  const prefix = `interactions[${index}]`;

  if (interaction === null || interaction === undefined || typeof interaction !== 'object' || Array.isArray(interaction)) {
    errors.push({ field: prefix, message: 'interaction must be a non-null object' });
    return;
  }

  const obj = interaction as Record<string, unknown>;

  // Validate description
  validateDescription(obj, prefix, errors);

  // Validate request
  validateRequestSpec(obj, prefix, errors);

  // Validate response
  validateResponseSpec(obj, prefix, errors);

  // Validate matching rules (optional, but if present must be valid)
  if (obj.matchingRules !== undefined && obj.matchingRules !== null) {
    validateMatchingRules(obj.matchingRules, prefix, errors);
  }
}

function validateDescription(obj: Record<string, unknown>, prefix: string, errors: ValidationError[]): void {
  const field = `${prefix}.description`;
  const value = obj.description;

  if (value === undefined || value === null) {
    errors.push({ field, message: 'description is required' });
    return;
  }

  if (typeof value !== 'string') {
    errors.push({ field, message: 'description must be a string' });
    return;
  }

  if (value.trim().length === 0) {
    errors.push({ field, message: 'description must contain at least 1 non-whitespace character' });
  }
}

function validateRequestSpec(obj: Record<string, unknown>, prefix: string, errors: ValidationError[]): void {
  const field = `${prefix}.request`;
  const request = obj.request;

  if (request === undefined || request === null) {
    errors.push({ field, message: 'request is required' });
    return;
  }

  if (typeof request !== 'object' || Array.isArray(request)) {
    errors.push({ field, message: 'request must be a non-null object' });
    return;
  }

  const reqObj = request as Record<string, unknown>;

  // Validate method
  const method = reqObj.method;
  if (method === undefined || method === null) {
    errors.push({ field: `${field}.method`, message: 'method is required' });
  } else if (typeof method !== 'string') {
    errors.push({ field: `${field}.method`, message: 'method must be a string' });
  } else if (!VALID_HTTP_METHODS.includes(method.toUpperCase())) {
    errors.push({ field: `${field}.method`, message: `method must be one of: ${VALID_HTTP_METHODS.join(', ')}` });
  }

  // Validate path
  const path = reqObj.path;
  if (path === undefined || path === null) {
    errors.push({ field: `${field}.path`, message: 'path is required' });
  } else if (typeof path !== 'string') {
    errors.push({ field: `${field}.path`, message: 'path must be a string' });
  } else if (!path.startsWith('/')) {
    errors.push({ field: `${field}.path`, message: 'path must start with "/"' });
  }
}

function validateResponseSpec(obj: Record<string, unknown>, prefix: string, errors: ValidationError[]): void {
  const field = `${prefix}.response`;
  const response = obj.response;

  if (response === undefined || response === null) {
    errors.push({ field, message: 'response is required' });
    return;
  }

  if (typeof response !== 'object' || Array.isArray(response)) {
    errors.push({ field, message: 'response must be a non-null object' });
    return;
  }

  const resObj = response as Record<string, unknown>;

  // Validate status
  const status = resObj.status;
  if (status === undefined || status === null) {
    errors.push({ field: `${field}.status`, message: 'status is required' });
  } else if (typeof status !== 'number' || !Number.isInteger(status)) {
    errors.push({ field: `${field}.status`, message: 'status must be an integer' });
  } else if (status < 100 || status > 599) {
    errors.push({ field: `${field}.status`, message: 'status must be between 100 and 599' });
  }
}

function validateMatchingRules(rules: unknown, prefix: string, errors: ValidationError[]): void {
  if (!Array.isArray(rules)) {
    errors.push({ field: `${prefix}.matchingRules`, message: 'matchingRules must be an array' });
    return;
  }

  for (let i = 0; i < rules.length; i++) {
    validateMatchingRule(rules[i], `${prefix}.matchingRules[${i}]`, errors);
  }
}

function validateMatchingRule(rule: unknown, field: string, errors: ValidationError[]): void {
  if (rule === null || rule === undefined || typeof rule !== 'object' || Array.isArray(rule)) {
    errors.push({ field, message: 'matching rule must be a non-null object' });
    return;
  }

  const ruleObj = rule as Record<string, unknown>;

  // Validate path
  const path = ruleObj.path;
  if (path === undefined || path === null) {
    errors.push({ field: `${field}.path`, message: 'path is required' });
  } else if (typeof path !== 'string') {
    errors.push({ field: `${field}.path`, message: 'path must be a string' });
  } else if (!path.startsWith('$')) {
    errors.push({ field: `${field}.path`, message: 'path must start with "$"' });
  }

  // Validate type
  const type = ruleObj.type;
  if (type === undefined || type === null) {
    errors.push({ field: `${field}.type`, message: 'type is required' });
  } else if (typeof type !== 'string') {
    errors.push({ field: `${field}.type`, message: 'type must be a string' });
  } else if (!VALID_MATCHING_RULE_TYPES.includes(type)) {
    errors.push({ field: `${field}.type`, message: `type must be one of: ${VALID_MATCHING_RULE_TYPES.join(', ')}` });
  }

  // Validate value (non-null)
  const value = ruleObj.value;
  if (value === undefined || value === null) {
    errors.push({ field: `${field}.value`, message: 'value is required and must not be null' });
  }
}
