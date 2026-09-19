import { z } from "zod";

// Everything the client sends is base64 the server stores verbatim. 20000
// chars comfortably holds a wrapped RSA-3072 PKCS#8 key (~2.4 KB base64).
const base64 = z
  .string()
  .min(1)
  .max(20000)
  .regex(/^[A-Za-z0-9+/]+={0,2}$/, "must be base64");

export const kdfSchema = z.object({
  salt: base64,
  memoryKib: z.number().int().min(1024).max(1048576),
  iterations: z.number().int().min(1).max(10),
  parallelism: z.number().int().min(1).max(4),
  version: z.literal(1),
});

export const memberKeySchema = z.object({
  publicKey: base64,
  wrappedPrivateKey: base64,
  privateKeyIv: base64,
  kdf: kdfSchema,
});

export const recoverySchema = z.object({
  wrappedKey: base64,
  iv: base64,
  kdf: kdfSchema,
});

// First-time setup. `household` is present only when the caller is the
// owner creating the household's data key.
export const setupSchema = z.object({
  member: memberKeySchema,
  household: z
    .object({
      wrappedKey: base64,
      recovery: recoverySchema,
    })
    .optional(),
});

// An owner who already has a key pair creating the data key for a fresh
// household (#220).
export const householdKeySchema = z.object({
  wrappedKey: base64,
  recovery: recoverySchema,
});

export const wrapsSchema = z.object({
  wraps: z
    // `publicKey` is the key the client wrapped against; fulfilWraps rejects
    // the batch when it no longer matches the target's current public key.
    .array(
      z.object({ userId: z.string().min(1), wrappedKey: base64, publicKey: base64 })
    )
    .min(1)
    .max(50),
});

export const changePassphraseSchema = z.object({
  wrappedPrivateKey: base64,
  privateKeyIv: base64,
  kdf: kdfSchema,
});

export const recoverSchema = z.object({
  member: memberKeySchema,
  wrappedKey: base64,
  recovery: recoverySchema,
});

// An apartment's ciphertext carries rawExtractedData, so it is far larger
// than a wrapped key. 2 000 000 base64 chars ≈ 1.5 MB of plaintext.
const ciphertext = z
  .string()
  .min(1)
  .max(2_000_000)
  .regex(/^[A-Za-z0-9+/]+={0,2}$/, "must be base64");

// `k` is the data-key version the row was sealed under (#219); absent means
// 1, which is every row written before rotation existed.
export const envelopeSchema = z.discriminatedUnion("v", [
  z.object({ v: z.literal(1), k: z.number().int().min(1).optional(), iv: base64, ct: ciphertext }),
  z.object({ v: z.literal(0), data: z.unknown() }),
]);

// Data-key rotation (#219). `envelope: null` means "leave this row as it is"
// — a row that would not open under the old key cannot be re-sealed, and is
// already unreadable to everyone, so it must not block the rotation.
const keptEnvelope = envelopeSchema.nullable();
export const rotateSchema = z.object({
  fromKeyVersion: z.number().int().min(1),
  wraps: z
    .array(z.object({ userId: z.string().min(1), wrappedKey: base64, publicKey: base64 }))
    .max(50),
  recovery: recoverySchema,
  apartments: z
    .array(z.object({ id: z.uuid(), version: z.number().int().min(1), envelope: keptEnvelope }))
    .max(1000),
  ratings: z
    .array(z.object({ apartmentId: z.uuid(), userId: z.string().min(1), envelope: keptEnvelope }))
    .max(10000),
  locations: z.array(z.object({ id: z.uuid(), envelope: keptEnvelope })).max(50),
  retiredPdfPaths: z.array(z.string().min(1).max(1000)).max(1000),
});
export type RotateRequest = z.infer<typeof rotateSchema>;

export type KdfParamsRow = z.infer<typeof kdfSchema>;
export type MemberKeyMaterial = z.infer<typeof memberKeySchema>;
export type RecoveryMaterial = z.infer<typeof recoverySchema>;
