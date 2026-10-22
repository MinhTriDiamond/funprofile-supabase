import { describe, expect, it } from 'vitest';
import { getErrorDiagnostics, isDomMutationError } from './appUpdateRecovery';

const CHROME_INSERT_BEFORE =
  "Failed to execute 'insertBefore' on 'Node': The node before which the new node is to be inserted is not a child of this node.";
const CHROME_REMOVE_CHILD =
  "Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node.";

function domError(message: string) {
  const error = new Error(message);
  error.name = 'NotFoundError';
  return error;
}

describe('isDomMutationError', () => {
  it('detects the Chrome insertBefore NotFoundError from the fun.rich report', () => {
    expect(isDomMutationError(domError(CHROME_INSERT_BEFORE))).toBe(true);
  });

  it('detects the removeChild variant', () => {
    expect(isDomMutationError(domError(CHROME_REMOVE_CHILD))).toBe(true);
  });

  it('detects the message even without the NotFoundError name', () => {
    expect(isDomMutationError(new Error(CHROME_INSERT_BEFORE))).toBe(true);
  });

  it('detects the string form of the error', () => {
    expect(isDomMutationError(CHROME_INSERT_BEFORE)).toBe(true);
  });

  it('does not misfire on chunk-load errors', () => {
    expect(isDomMutationError(new Error('Failed to fetch dynamically imported module'))).toBe(false);
  });

  it('does not misfire on generic runtime errors', () => {
    expect(isDomMutationError(new TypeError("Cannot read properties of undefined (reading 'id')"))).toBe(false);
    expect(isDomMutationError(new Error('Network request failed'))).toBe(false);
  });

  it('does not misfire on empty reasons', () => {
    expect(isDomMutationError(null)).toBe(false);
    expect(isDomMutationError(undefined)).toBe(false);
    expect(isDomMutationError('')).toBe(false);
  });
});

describe('getErrorDiagnostics', () => {
  it('returns a safe shape outside the browser (node test env)', () => {
    const diagnostics = getErrorDiagnostics();
    expect(diagnostics.pageTranslated).toBe(false);
    expect(diagnostics).toHaveProperty('userAgent');
    expect(diagnostics).toHaveProperty('pageLanguage');
    expect(diagnostics).toHaveProperty('path');
  });
});
