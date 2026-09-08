import { readOptionalPositiveInt } from "@/lib/env-int";

// E5 entitlements. Both null means unlimited, which is the self-hoster's
// default and must not regress.
//
// There is deliberately NO tier dimension here, and `households.tier` is not
// read: the hosted deployment has no free tier — everyone using it pays from
// day one — and a self-hoster sets whatever they like. The spec's older line
// about "5 and 20, lifted to 10 and 100 for a paid account" describes a model
// that was not adopted; see docs/superpowers/plans/2026-09-08-e5-tier-limits.md.
//
// Counting rows needs no decryption, so these caps work fine against opaque
// envelopes — nothing here opens one.
export interface Limits {
  maxMembers: number | null;
  maxApartments: number | null;
}

export function readLimits(): Limits {
  return {
    maxMembers: readOptionalPositiveInt("MAX_MEMBERS"),
    maxApartments: readOptionalPositiveInt("MAX_APARTMENTS"),
  };
}
