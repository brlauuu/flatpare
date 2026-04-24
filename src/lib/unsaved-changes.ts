let hasUnsavedRating = false;

export function setUnsavedRating(value: boolean): void {
  hasUnsavedRating = value;
}

export function getUnsavedRating(): boolean {
  return hasUnsavedRating;
}
