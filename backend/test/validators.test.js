import { describe, it, expect } from 'vitest';
import {
  isValidEmail,
  isValidPhone,
  isValidPin,
  isNonEmptyString,
  oneOf,
  normalizePhone,
  escapeRegExp,
  buildSafeSearchRegex,
  safeContentDisposition
} from '../utils/validators.js';

describe('isValidEmail', () => {
  it('accepts a plausible email', () => {
    expect(isValidEmail('a@b.com')).toBe(true);
  });
  it('rejects missing @ or domain', () => {
    expect(isValidEmail('not-an-email')).toBe(false);
    expect(isValidEmail('a@b')).toBe(false);
    expect(isValidEmail('')).toBe(false);
    expect(isValidEmail(undefined)).toBe(false);
  });
});

describe('isValidPhone', () => {
  it('accepts digits with optional leading +', () => {
    expect(isValidPhone('+2348012345678')).toBe(true);
    expect(isValidPhone('08012345678')).toBe(true);
  });
  it('rejects letters or too-short input', () => {
    expect(isValidPhone('abc')).toBe(false);
    expect(isValidPhone('123')).toBe(false);
  });
});

describe('isValidPin', () => {
  it('accepts exactly 4 digits', () => {
    expect(isValidPin('1234')).toBe(true);
  });
  it('rejects anything else', () => {
    expect(isValidPin('12345')).toBe(false);
    expect(isValidPin('12a4')).toBe(false);
    expect(isValidPin('')).toBe(false);
  });
});

describe('normalizePhone', () => {
  it('assumes Nigeria (+234) for a local 0-prefixed number', () => {
    expect(normalizePhone('08012345678')).toBe('+2348012345678');
  });
  it('preserves an explicit + country code', () => {
    expect(normalizePhone('+2348012345678')).toBe('+2348012345678');
  });
  it('adds + to a bare 234-prefixed number', () => {
    expect(normalizePhone('2348012345678')).toBe('+2348012345678');
  });
  it('makes registration and login of the same number match regardless of format', () => {
    expect(normalizePhone('08012345678')).toBe(normalizePhone('+2348012345678'));
  });
});

describe('isNonEmptyString / oneOf', () => {
  it('treats whitespace-only strings as empty', () => {
    expect(isNonEmptyString('   ')).toBe(false);
    expect(isNonEmptyString('x')).toBe(true);
  });
  it('checks allow-list membership', () => {
    expect(oneOf('match', ['match', 'paired'])).toBe(true);
    expect(oneOf('other', ['match', 'paired'])).toBe(false);
  });
});

describe('escapeRegExp / buildSafeSearchRegex', () => {
  it('escapes regex metacharacters so they are treated as literal text', () => {
    expect(escapeRegExp('a.b*c')).toBe('a\\.b\\*c');
  });
  it('does not choke on a catastrophic-backtracking pattern (ReDoS input)', () => {
    const evilInput = '(a+)+$';
    const re = buildSafeSearchRegex(evilInput);
    // If the input were used as raw regex syntax this would be vulnerable;
    // treated as literal text it matches only that exact literal substring.
    expect(re.test('(a+)+$')).toBe(true);
    expect(re.test('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa!')).toBe(false);
  });
  it('returns null for input over the length ceiling', () => {
    expect(buildSafeSearchRegex('x'.repeat(101))).toBeNull();
  });
  it('returns null for empty input', () => {
    expect(buildSafeSearchRegex('   ')).toBeNull();
  });
});

describe('safeContentDisposition', () => {
  it('strips CR/LF to prevent header injection', () => {
    const header = safeContentDisposition('evil\r\nSet-Cookie: x=1');
    expect(header).not.toMatch(/\r|\n/);
  });
  it('escapes embedded quotes', () => {
    const header = safeContentDisposition('receipt".jpg');
    expect(header).toContain('filename="receipt_.jpg"');
  });
  it('falls back to "file" for an empty name', () => {
    expect(safeContentDisposition('')).toContain('filename="file"');
  });
});
