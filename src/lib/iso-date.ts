const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  return ISO_DATE_PATTERN.test(value);
}

/**
 * Convert an ISO `YYYY-MM-DD` date string to Swiss `DD.MM.YYYY` format.
 * Caller must pass a string already validated with `isIsoDate`.
 */
export function formatSwissDate(iso: string): string {
  return iso.split("-").reverse().join(".");
}
