import { describe, it, expect } from 'vitest';
import { nairaToKobo, koboToNaira, initPaymentConfig } from '../utils/utils_payments.js';
// TRIP_TOTAL_NAIRA / MIN_INITIAL_DEPOSIT_NGN are re-imported after each
// initPaymentConfig() call below because they're live module bindings (see
// the comment at the top of utils_payments.js) — reading them via a fresh
// namespace import keeps this test in sync with the current value rather
// than a snapshot taken at module-load time.
import * as payments from '../utils/utils_payments.js';

describe('nairaToKobo / koboToNaira', () => {
  it('converts naira to kobo (x100), rounding to the nearest kobo', () => {
    expect(nairaToKobo(100)).toBe(10000);
    expect(nairaToKobo(100.005)).toBe(10001); // rounds, doesn't truncate
  });
  it('round-trips kobo back to naira', () => {
    expect(koboToNaira(10000)).toBe(100);
    expect(koboToNaira(50)).toBe(0.5);
  });
});

describe('initPaymentConfig / MIN_INITIAL_DEPOSIT_NGN', () => {
  const originalTotal = process.env.TRIP_TOTAL_AMOUNT_NGN;
  const originalMinDeposit = process.env.MIN_INITIAL_DEPOSIT_NGN;

  function restoreEnv() {
    process.env.TRIP_TOTAL_AMOUNT_NGN = originalTotal;
    process.env.MIN_INITIAL_DEPOSIT_NGN = originalMinDeposit;
    initPaymentConfig();
  }

  it('recomputes TRIP_TOTAL_NAIRA from the current env var', () => {
    process.env.TRIP_TOTAL_AMOUNT_NGN = '385000';
    delete process.env.MIN_INITIAL_DEPOSIT_NGN;
    initPaymentConfig();
    expect(payments.TRIP_TOTAL_NAIRA).toBe(385000);
    restoreEnv();
  });

  it('defaults MIN_INITIAL_DEPOSIT_NGN to 100000 when unset', () => {
    process.env.TRIP_TOTAL_AMOUNT_NGN = '385000';
    delete process.env.MIN_INITIAL_DEPOSIT_NGN;
    initPaymentConfig();
    expect(payments.MIN_INITIAL_DEPOSIT_NGN).toBe(100000);
    restoreEnv();
  });

  it('caps MIN_INITIAL_DEPOSIT_NGN at the trip total for a cheaper trip', () => {
    // Guards against a real footgun: an organizer setting a trip total below
    // the 100k default deposit would otherwise make the minimum unpayable.
    process.env.TRIP_TOTAL_AMOUNT_NGN = '385000';
    delete process.env.MIN_INITIAL_DEPOSIT_NGN;
    initPaymentConfig();
    expect(payments.MIN_INITIAL_DEPOSIT_NGN).toBe(100000);
    restoreEnv();
  });
});
