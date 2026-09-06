import type { KdfParams } from "../kdf";

// Small parameters keep the suites fast; the pinned vector in kdf.test.ts
// is the one test that runs the production parameters.
export const TEST_KDF_PARAMS: KdfParams = {
  memoryKib: 1024,
  iterations: 1,
  parallelism: 1,
  version: 1,
};
