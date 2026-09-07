// Row ids are minted in the browser so the ciphertext can be bound to its
// id (envelopeAad) before the server has ever seen the row.
export function newRowId(): string {
  return crypto.randomUUID();
}
