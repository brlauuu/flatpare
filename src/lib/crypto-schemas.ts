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

export const envelopeSchema = z.discriminatedUnion("v", [
  z.object({ v: z.literal(1), iv: base64, ct: ciphertext }),
  z.object({ v: z.literal(0), data: z.unknown() }),
]);

export type KdfParamsRow = z.infer<typeof kdfSchema>;
export type MemberKeyMaterial = z.infer<typeof memberKeySchema>;
export type RecoveryMaterial = z.infer<typeof recoverySchema>;
