/// <reference types="vitest/globals" />
/**
 * SSRF / private-host hardening for the web-source validator.
 *
 * isPrivateHost() (via validateWebUrl) must reject loopback, private, link-local,
 * cloud-metadata, and IPv6 addresses so they can never be classified as citable
 * external sources. Regression coverage for:
 *   - IPv6 hosts, which Node's URL parser wraps in brackets ("[::1]") — the
 *     pre-fix patterns ("^::1$", "^fc..") never matched the bracketed form.
 *   - The cloud metadata endpoint 169.254.169.254 and 0.0.0.0, previously absent.
 */
import { validateWebUrl } from '../webSearch/validateWebSource';

describe('validateWebUrl — private/internal host rejection (SSRF hardening)', () => {
  const rejected = [
    'http://localhost/x',
    'http://127.0.0.1/x',
    'http://10.1.2.3/x',
    'http://172.16.9.9/x',
    'http://192.168.0.1/x',
    'http://0.0.0.0/x',
    'http://169.254.169.254/latest/meta-data/',     // cloud metadata endpoint
    'http://[::1]/x',                                 // IPv6 loopback (bracketed)
    'http://[::]/x',                                  // IPv6 unspecified
    'http://[fc00::1]/x',                             // IPv6 unique-local
    'http://[fd12:3456::1]/x',                        // IPv6 unique-local fd..
    'http://[fe80::1]/x',                             // IPv6 link-local
    'http://[::ffff:127.0.0.1]/x',                    // IPv4-mapped IPv6
  ];

  for (const url of rejected) {
    it(`suppresses private/internal URL: ${url}`, () => {
      const result = validateWebUrl(url);
      expect(result.validationStatus).toBe('suppressed');
      expect(result.qualityWarnings.join(' ')).toMatch(/Private\/internal URL rejected/i);
    });
  }
});

describe('validateWebUrl — legitimate external sources still pass', () => {
  it('accepts an official government source', () => {
    const result = validateWebUrl('https://www.canada.ca/en/employment-social-development.html');
    expect(result.validationStatus).not.toBe('suppressed');
    expect(result.sourceType).toBe('official_government');
  });

  it('accepts a legislation source', () => {
    const result = validateWebUrl('https://laws-lois.justice.gc.ca/eng/acts/L-2/');
    expect(result.validationStatus).toBe('valid');
    expect(result.sourceType).toBe('legislation');
  });
});
