import { describe, it, expect } from 'vitest';
import { nairaToKobo, koboToNaira, initPaymentConfig } from '../utils/utils_payments.js';
// SINGLE_TRIP_TOTAL_NAIRA / COUPLE_TRIP_TOTAL_NAIRA / SINGLE_MIN_DEPOSIT_NGN /
// COUPLE_MIN_DEPOSIT_NGN are re-imported after each initPaymentConfig() call
// below because they're live module bindings (see the comment at the top of
// utils_payments.js) — reading them via a fresh namespace import keeps this
// test in sync with the current value rather than a snapshot taken at
// module-load time.
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

const ENV_KEYS = [
  'SINGLE_TRIP_TOTAL_AMOUNT_NGN',
  'COUPLE_TRIP_TOTAL_AMOUNT_NGN',
  'SINGLE_MIN_INITIAL_DEPOSIT_NGN',
  'COUPLE_MIN_INITIAL_DEPOSIT_NGN'
];

function withEnv(overrides, fn) {
  const originals = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const key of ENV_KEYS) {
    if (key in overrides) {
      if (overrides[key] === undefined) delete process.env[key];
      else process.env[key] = overrides[key];
    }
  }
  initPaymentConfig();
  try {
    fn();
  } finally {
    for (const key of ENV_KEYS) {
      if (originals[key] === undefined) delete process.env[key];
      else process.env[key] = originals[key];
    }
    initPaymentConfig();
  }
}

describe('initPaymentConfig / trip totals', () => {
  it('recomputes SINGLE_TRIP_TOTAL_NAIRA / COUPLE_TRIP_TOTAL_NAIRA from the current env vars', () => {
    withEnv({ SINGLE_TRIP_TOTAL_AMOUNT_NGN: '425000', COUPLE_TRIP_TOTAL_AMOUNT_NGN: '385000' }, () => {
      expect(payments.SINGLE_TRIP_TOTAL_NAIRA).toBe(425000);
      expect(payments.COUPLE_TRIP_TOTAL_NAIRA).toBe(385000);
    });
  });
});

describe('initPaymentConfig / minimum deposit floors', () => {
  it('defaults SINGLE_MIN_DEPOSIT_NGN to 150000 and COUPLE_MIN_DEPOSIT_NGN to 200000 when unset', () => {
    withEnv({ SINGLE_MIN_INITIAL_DEPOSIT_NGN: undefined, COUPLE_MIN_INITIAL_DEPOSIT_NGN: undefined }, () => {
      expect(payments.SINGLE_MIN_DEPOSIT_NGN).toBe(150000);
      expect(payments.COUPLE_MIN_DEPOSIT_NGN).toBe(200000);
    });
  });

  it('recomputes both deposit floors from their own env vars when set', () => {
    withEnv({ SINGLE_MIN_INITIAL_DEPOSIT_NGN: '120000', COUPLE_MIN_INITIAL_DEPOSIT_NGN: '180000' }, () => {
      expect(payments.SINGLE_MIN_DEPOSIT_NGN).toBe(120000);
      expect(payments.COUPLE_MIN_DEPOSIT_NGN).toBe(180000);
    });
  });
});

describe('tripTotalForRoomPreference / minDepositForRoomPreference', () => {
  it('charges the single total for "match" (and unset/default) room preference', () => {
    withEnv({ SINGLE_TRIP_TOTAL_AMOUNT_NGN: '425000', COUPLE_TRIP_TOTAL_AMOUNT_NGN: '385000' }, () => {
      expect(payments.tripTotalForRoomPreference('match')).toBe(425000);
      expect(payments.tripTotalForRoomPreference(undefined)).toBe(425000);
    });
  });

  it('charges the couple (per-person) total for "paired" room preference', () => {
    withEnv({ SINGLE_TRIP_TOTAL_AMOUNT_NGN: '425000', COUPLE_TRIP_TOTAL_AMOUNT_NGN: '385000' }, () => {
      expect(payments.tripTotalForRoomPreference('paired')).toBe(385000);
    });
  });

  it('uses each tier\'s own minimum deposit floor', () => {
    withEnv(
      { SINGLE_TRIP_TOTAL_AMOUNT_NGN: '425000', COUPLE_TRIP_TOTAL_AMOUNT_NGN: '385000', SINGLE_MIN_INITIAL_DEPOSIT_NGN: '150000', COUPLE_MIN_INITIAL_DEPOSIT_NGN: '200000' },
      () => {
        expect(payments.minDepositForRoomPreference('match')).toBe(150000);
        expect(payments.minDepositForRoomPreference('paired')).toBe(200000);
      }
    );
  });

  it('caps each tier\'s minimum deposit at that tier\'s own trip total', () => {
    // Guards against a real footgun: an organizer setting a tier's trip total
    // below its own minimum deposit would otherwise make that minimum unpayable.
    withEnv(
      { SINGLE_TRIP_TOTAL_AMOUNT_NGN: '425000', COUPLE_TRIP_TOTAL_AMOUNT_NGN: '75000', SINGLE_MIN_INITIAL_DEPOSIT_NGN: '150000', COUPLE_MIN_INITIAL_DEPOSIT_NGN: '200000' },
      () => {
        expect(payments.minDepositForRoomPreference('paired')).toBe(75000);
        expect(payments.minDepositForRoomPreference('match')).toBe(150000);
      }
    );
  });
});
