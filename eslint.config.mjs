import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Layering rule for the E2EE core (docs/superpowers/specs/2026-09-06-e2-crypto-core-design.md):
// key material is handled ONLY inside src/lib/crypto/**. Everything else
// calls the named functions that module exports. This block makes a
// violation a lint failure instead of a code-review habit.
const cryptoLayering = {
  files: ["**/*.{ts,tsx,js,jsx,mjs}"],
  ignores: ["src/lib/crypto/**"],
  rules: {
    "no-restricted-syntax": [
      "error",
      {
        selector: "MemberExpression[property.name=\"subtle\"]",
        message:
          "Use the functions exported from @/lib/crypto; crypto.subtle is only allowed under src/lib/crypto/.",
      },
      {
        selector: "ImportExpression[source.value=\"hash-wasm\"]",
        message:
          "Use deriveKek from @/lib/crypto; hash-wasm is only imported under src/lib/crypto/.",
      },
    ],
    "no-restricted-imports": [
      "error",
      {
        paths: [
          {
            name: "hash-wasm",
            message:
              "Use deriveKek from @/lib/crypto; hash-wasm is only imported under src/lib/crypto/.",
          },
        ],
        patterns: [
          {
            group: ["@/lib/crypto/*", "!@/lib/crypto/__tests__", "**/lib/crypto/*", "!**/lib/crypto/__tests__"],
            message:
              "Import from @/lib/crypto (the index), not from its submodules (test helpers under __tests__ excepted).",
          },
        ],
      },
    ],
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  cryptoLayering,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
