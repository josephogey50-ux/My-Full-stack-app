import { describe, it, expect } from 'vitest';
import { nairaToKobo, koboToNaira, initPaymentConfig } from '../utils/utils_payments.js';
// SINGLE_TRIP_TOTAL_NAIRA / COUPLE_TRIP_TOTAL_NAIRA / MIN_INITIAL_DEPOSIT_NGN
// are re-imported after each initPaymentConfig() call below because they're
// live module bindings (see the comment at the top of utils_payments.js) —
// reading them via a fresh namespace import keeps this test in sync with the
// current value rather than a snapshot taken at module-load time.
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
  const originalSingle = process.env.SINGLE_TRIP_TOTAL_AMOUNT_NGN;
  const originalCouple = process.env.COUPLE_TRIP_TOTAL_AMOUNT_NGN;
  const originalMinDeposit = process.env.MIN_INITIAL_DEPOSIT_NGN;

  function restoreEnv() {
    process.env.SINGLE_TRIP_TOTAL_AMOUNT_NGN = originalSingle;
    process.env.COUPLE_TRIP_TOTAL_AMOUNT_NGN = originalCouple;
    process.env.MIN_INITIAL_DEPOSIT_NGN = originalMinDeposit;
    initPaymentConfig();
  }

  it('recomputes SINGLE_TRIP_TOTAL_NAIRA / COUPLE_TRIP_TOTAL_NAIRA from the current env vars', () => {
    process.env.SINGLE_TRIP_TOTAL_AMOUNT_NGN = '425000';
    process.env.COUPLE_TRIP_TOTAL_AMOUNT_NGN = '385000';
    delete process.env.MIN_INITIAL_DEPOSIT_NGN;
    initPaymentConfig();
    expect(payments.SINGLE_TRIP_TOTAL_NAIRA).toBe(425000);
    expect(payments.COUPLE_TRIP_TOTAL_NAIRA).toBe(385000);
    restoreEnv();
  });

  it('defaults MIN_INITIAL_DEPOSIT_NGN to 100000 when unset', () => {
    process.env.SINGLE_TRIP_TOTAL_AMOUNT_NGN = '425000';
    process.env.COUPLE_TRIP_TOTAL_AMOUNT_NGN = '385000';
    delete process.env.MIN_INITIAL_DEPOSIT_NGN;
    initPaymentConfig();
    expect(payments.MIN_INITIAL_DEPOSIT_NGN).toBe(100000);
    restoreEnv();
  });
});

describe('tripTotalForRoomPreference / minDepositForRoomPreference', () => {
  const originalSingle = process.env.SINGLE_TRIP_TOTAL_AMOUNT_NGN;
  const originalCouple = process.env.COUPLE_TRIP_TOTAL_AMOUNT_NGN;
  const originalMinDeposit = process.env.MIN_INITIAL_DEPOSIT_NGN;

  function restoreEnv() {
    process.env.SINGLE_TRIP_TOTAL_AMOUNT_NGN = originalSingle;
    process.env.COUPLE_TRIP_TOTAL_AMOUNT_NGN = originalCouple;
    process.env.MIN_INITIAL_DEPOSIT_NGN = originalMinDeposit;
    initPaymentConfig();
  }

  it('charges the single total for "match" (and unset/default) room preference', () => {
    process.env.SINGLE_TRIP_TOTAL_AMOUNT_NGN = '425000';
    process.env.COUPLE_TRIP_TOTAL_AMOUNT_NGN = '385000';
    initPaymentConfig();
    expect(payments.tripTotalForRoomPreference('match')).toBe(425000);
    expect(payments.tripTotalForRoomPreference(undefined)).toBe(425000);
    restoreEnv();
  });

  it('charges the couple (per-person) total for "paired" room preference', () => {
    process.env.SINGLE_TRIP_TOTAL_AMOUNT_NGN = '425000';
    process.env.COUPLE_TRIP_TOTAL_AMOUNT_NGN = '385000';
    initPaymentConfig();
    expect(payments.tripTotalForRoomPreference('paired')).toBe(385000);
    restoreEnv();
  });

  it('caps the minimum deposit at the cheaper of the two per-person trip totals', () => {
    // Guards against a real footgun: an organizer setting a per-person total
    // below the 100k default deposit would otherwise make the minimum unpayable.
    process.env.SINGLE_TRIP_TOTAL_AMOUNT_NGN = '425000';
    process.env.COUPLE_TRIP_TOTAL_AMOUNT_NGN = '75000';
    delete process.env.MIN_INITIAL_DEPOSIT_NGN;
    initPaymentConfig();
    expect(payments.minDepositForRoomPreference('paired')).toBe(75000);
    expect(payments.minDepositForRoomPreference('match')).toBe(100000);
    restoreEnv();
  });
});
