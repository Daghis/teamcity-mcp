# Type Safety Standards

This document outlines the standards for type safety in the TeamCity MCP codebase, with a focus on minimizing unsafe type assertions (especially `as unknown as` patterns).

## Table of Contents

- [Guiding Principles](#guiding-principles)
- [Acceptable Type Assertions](#acceptable-type-assertions)
- [Unacceptable Patterns](#unacceptable-patterns)
- [Test Utilities](#test-utilities)
- [Type Guards](#type-guards)
- [Adding New Type Safety](#adding-new-type-safety)
- [ESLint Configuration](#eslint-configuration)

## Guiding Principles

1. **Prefer type guards over assertions** - Use runtime checks when possible
2. **Use Zod schemas for external data** - Validate API responses and user input
3. **Document justified assertions** - Add comments explaining why an assertion is necessary
4. **Use test utilities** - Leverage typed mock factories instead of inline casts

## Acceptable Type Assertions

The following patterns are acceptable uses of type assertions:

### 1. XML/JSON API Contract Mismatches

When the generated TypeScript client expects JSON but the endpoint requires XML:

```typescript
// The TeamCity API expects XML body for requirements, but the generated client types expect JSON
const xmlBody = `<agent-requirement ...>`;
await client.buildTypes.addRequirementToBuildType(
  buildTypeId,
  xmlBody as unknown as AgentRequirement,  // Acceptable: API contract mismatch
  { headers: { 'Content-Type': 'application/xml' } }
);
```

**Why acceptable:** This is a known limitation of the generated client. The actual data sent is valid XML; the type system simply can't express this.

### 2. Jest Mock Typing

When creating typed mocks for Jest:

```typescript
import { createWinstonMockLogger } from 'tests/test-utils';

// Acceptable: Jest mock typing limitation
const mockLogger = createWinstonMockLogger();
```

### 3. Intentional Invalid Input (Testing)

When testing validation or error handling:

```typescript
// Testing that invalid status values are handled
const result = handler({ status: 'INVALID' as unknown as BuildStatus });
expect(result.error).toBeDefined();
```

**Why acceptable:** Tests need to verify behavior with invalid input.

### 4. Partial Fixtures (Testing)

When creating partial test fixtures:

```typescript
// Use factory functions instead of inline casts
import { createBuildFixture } from 'tests/test-utils';

const build = createBuildFixture({ status: 'FAILURE' });
```

**Prefer:** Use the provided fixture factories instead of manual casts.

## Unacceptable Patterns

The following patterns should be avoided or refactored:

### 1. Avoiding Type Errors

```typescript
// BAD: Casting to silence TypeScript
const data = response.data as unknown as ExpectedType;

// GOOD: Use type guards or Zod validation
import { isExpectedType } from './type-guards';
if (isExpectedType(response.data)) {
  const data = response.data; // Properly typed
}
```

### 2. Private Property Access

```typescript
// BAD: Accessing private properties via cast
(object as unknown as { _private: string })._private = 'value';

// GOOD: Expose a test helper or use proper APIs
object.setPrivateForTesting('value');  // Add test helper
```

### 3. Repeated Mock Boilerplate

```typescript
// BAD: Inline mock casts
const logger = {
  debug: jest.fn(),
  info: jest.fn(),
} as unknown as Logger;

// GOOD: Use test utilities
import { createMockLogger } from 'tests/test-utils';
const logger = createMockLogger();
```

### 4. Error Property Mutation

```typescript
// BAD: Mutating error objects
const error = new Error('msg');
(error as unknown as { response: object }).response = { status: 404 };

// GOOD: Use error factories
import { createNotFoundError } from 'tests/test-utils';
const error = createNotFoundError('Build', '123');
```

## Test Utilities

Use the provided test utilities in `tests/test-utils/` for type-safe mocking:

### Logger Mocks

```typescript
import {
  createMockLogger,           // For ILogger/TeamCityLogger
  createWinstonMockLogger,    // For Winston Logger
  createCapturingMockLogger,  // Captures log messages
} from 'tests/test-utils';

// TeamCityLogger mock
const logger = createMockLogger();
expect(logger.info).toHaveBeenCalled();

// Winston Logger mock (for services using Winston directly)
const winstonLogger = createWinstonMockLogger();
const service = new SomeService(winstonLogger);
```

### API Fixtures

```typescript
import {
  createBuildFixture,
  createProjectFixture,
  createBuildTypeFixture,
  createFailedBuildFixture,
  createRunningBuildFixture,
} from 'tests/test-utils';

// Create typed fixtures
const project = createProjectFixture({ name: 'My Project' });
const build = createBuildFixture({ status: 'SUCCESS' });
const failedBuild = createFailedBuildFixture({ statusText: 'Tests failed' });
```

### Error Factories

```typescript
import {
  createAxiosError,
  createNotFoundError,
  createAuthenticationError,
  createValidationError,
  createServerError,
} from 'tests/test-utils';

// Create typed errors
mockFn.mockRejectedValue(createNotFoundError('Build', '123'));
mockFn.mockRejectedValue(createAuthenticationError());
mockFn.mockRejectedValue(createServerError('Database error'));
```

### Transport Mocks

```typescript
import { createMockTransport, MockTransport } from 'tests/test-utils';

const transport = createMockTransport();
await server.connect(transport);

// Simulate events
transport.simulateMessage({ jsonrpc: '2.0', method: 'ping', id: 1 });
transport.simulateError(new Error('Connection lost'));
```

## Type Guards

Prefer type guards for runtime type checking. See `src/teamcity/api-types.ts` for examples:

```typescript
// Type guard definition
export const isTeamCityProperty = (value: unknown): value is TeamCityProperty => {
  if (!isRecord(value)) return false;
  const { name, value: propertyValue } = value as { name?: unknown; value?: unknown };
  return typeof name === 'string' && typeof propertyValue === 'string';
};

// Usage
if (isTeamCityProperty(data)) {
  // data is now typed as TeamCityProperty
  console.log(data.name, data.value);
}
```

### When to Add Type Guards

1. **API Response Validation** - Validate external data from TeamCity API
2. **User Input** - Validate tool parameters
3. **Discriminated Unions** - Distinguish between different response types
4. **Array Type Narrowing** - Normalize single/array response patterns

## Adding New Type Safety

When adding new code that might need type assertions:

1. **First, try type guards** - Can you validate at runtime?
2. **Second, try Zod schemas** - For complex validation
3. **Third, use test utilities** - Extend the factories if needed
4. **Last resort, document** - If assertion is necessary, add a comment

### Extending Test Utilities

To add new fixture types:

```typescript
// In tests/test-utils/fixtures/index.ts

export function createNewTypeFixture(
  overrides: Partial<NewType> = {}
): NewType {
  return {
    id: 'default-id',
    name: 'Default Name',
    ...overrides,
  };
}
```

## ESLint Configuration

The codebase is configured to warn on `as unknown as` patterns:

```javascript
// In eslint.config.cjs
'no-restricted-syntax': [
  'warn',
  {
    selector: 'TSAsExpression > TSAsExpression[typeAnnotation.typeName.name="unknown"]',
    message: 'Avoid `as unknown as` double assertions. Use type guards, Zod schemas, or add an eslint-disable comment explaining why this is necessary.',
  },
],
```

### Disabling for Justified Cases

When a type assertion is justified, disable the warning with an explanation:

```typescript
// eslint-disable-next-line no-restricted-syntax -- XML body for API that expects JSON type
const body = xmlString as unknown as JsonType;
```

## Migration Guide

For existing code with `as unknown as` patterns:

1. **Check test utilities first** - A factory may already exist
2. **Check for type guards** - `api-types.ts` has many
3. **Consider refactoring** - Is the assertion hiding a design issue?
4. **Document if keeping** - Add explanation for justified assertions

## Summary

| Scenario | Recommended Approach |
|----------|---------------------|
| API response validation | Type guards / Zod schemas |
| Test mocks | Test utility factories |
| Error objects | Error factory functions |
| Partial test data | Fixture builders |
| XML/JSON mismatch | Documented assertion |
| Invalid input testing | Documented assertion |
