const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  return ISO_DATE_PATTERN.test(value);
}

/**
 * Convert an ISO `YYYY-MM-DD` date string to Swiss `DD.MM.YYYY` format.
 *
 * Anything that is not an ISO date is returned unchanged. The comment here
 * used to say the caller must validate first, and the only caller did not
 * (#262): `availableFrom` is `nullableString` in the envelope schema, so
 * whatever the PDF extraction produced reaches this function. Splitting a
 * non-date on "-" and reversing it renders quiet nonsense, so the check is
 * enforced here rather than asked for.
 */
export function formatSwissDate(iso: string): string {
  if (!isIsoDate(iso)) return iso;
  return iso.split("-").reverse().join(".");
}
