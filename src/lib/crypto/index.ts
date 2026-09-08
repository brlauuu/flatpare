// The only module the rest of the app imports crypto from. ESLint forbids
// `crypto.subtle` and `hash-wasm` outside src/lib/crypto/** (eslint.config.mjs),
// so every consumer goes through these named functions.
export { toBase64, fromBase64 } from "./encoding";
export {
  DEFAULT_KDF_PARAMS,
  deriveKek,
  deriveKekBytes,
  randomSalt,
  type KdfParams,
} from "./kdf";
export {
  exportPublicKey,
  generateDataKey,
  generateMemberKeypair,
  importPublicKey,
  randomIv,
  toStoredDataKey,
  unwrapDataKey,
  unwrapDataKeyWithKek,
  unwrapPrivateKey,
  wrapDataKey,
  wrapDataKeyWithKek,
  wrapPrivateKey,
  type UnwrapOptions,
  type WrappedBlob,
} from "./keys";
export {
  RECOVERY_CODE_LENGTH,
  formatRecoveryCode,
  generateRecoveryCode,
  normalizeRecoveryCode,
} from "./recovery";
export {
  assertEnvelopeMode,
  envelopeAad,
  open,
  seal,
  type Envelope,
} from "./envelope";
export { clearKeys, isKeyStorePersistent, loadKeys, saveKeys, type StoredKeys } from "./store";
export { openBytes, sealBytes, type SealedBytes } from "./bytes";
