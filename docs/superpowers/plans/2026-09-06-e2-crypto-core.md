# E2 Crypto Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the client-side crypto core (issues #183, #184) and household invitations (#197): a per-household AES-256-GCM data key that the server never sees, wrapped to each member's RSA-OAEP keypair, a passphrase-protected private key per member, a recovery kit, a deploy-wide `FLATPARE_ENCRYPTION` opt-out, and the invitation flow that new members arrive through.

**Architecture:** All key material is handled in `src/lib/crypto/**` (the only code allowed to touch `crypto.subtle` or `hash-wasm`; ESLint enforces this). The server stores only public keys and wrapped blobs in four new tables, and every route re-checks membership against the database. A client `CryptoProvider` walks a five-state machine (`off · needs-setup · pending-wrap · locked · unlocked`) and gates every app page behind it; keys live as non-extractable `CryptoKey`s in IndexedDB so the passphrase is entered once per device. E2 produces and holds the data key — E3 is what starts encrypting apartment data with it.

**Tech Stack:** Next.js 16 App Router, React 19, Drizzle ORM + libSQL, Auth.js v5 beta, WebCrypto (`crypto.subtle`), `hash-wasm` 4.12 (Argon2id), `fake-indexeddb` 6 (tests only), Vitest + Testing Library, zod 4.

**Spec:** `docs/superpowers/specs/2026-09-06-e2-crypto-core-design.md` — the plan argues from the spec; read both.

## Global Constraints

- **Layering rule:** only files under `src/lib/crypto/**` may reference `crypto.subtle` or import `hash-wasm`. Everything else calls the named functions the library exports. Enforced by ESLint (Task 4) — a violation fails `npm run lint`.
- **KDF:** Argon2id via `hash-wasm`, 32-byte output, parameters `memoryKib: 65536, iterations: 3, parallelism: 1, version: 1` (`DEFAULT_KDF_PARAMS`); every derived key records the parameters it was derived with.
- **Keys:** RSA-OAEP, modulus 3072, `SHA-256`, public exponent 65537 for member keypairs; AES-256-GCM for the data key and every symmetric wrap; 96-bit random IV per operation; envelope AAD is mandatory and is the string `` `${householdId}:${table}:${rowId}` ``.
- **Non-extractability:** every `CryptoKey` persisted to IndexedDB is created with `extractable: false`. WebCrypto can only *wrap* an extractable key, so any flow that must wrap the data key or the private key unwraps a **transient** extractable copy from the server-held blob, uses it, and drops the reference. Never store an extractable key.
- **Recovery code:** 120 random bits → 24 base32 chars (`A–Z2–7`) + 1 check char, displayed as five groups of five separated by `-`. Input normalization is case-insensitive and strips separators.
- **Envelope:** `{ v: 1, iv, ct }` (base64) when encrypting, `{ v: 0, data }` when the deployment runs with encryption off. `assertEnvelopeMode` rejects the wrong kind for the mode.
- **Encryption mode:** `FLATPARE_ENCRYPTION` ∈ `on | off`; unset/empty means `on`; any other value fails boot. The mode is stamped into `settings.encryption_mode` on first boot and a later boot with a different value must refuse to start.
- **Passphrase:** minimum 12 characters, entered twice at setup; changing it requires the current one.
- **Setup acknowledgement copy (verbatim):** "I understand that if I lose both my passphrase and this recovery kit, my household's data cannot be recovered by anyone, including Flatpare."
- **Invitations:** email stored lowercased and trimmed; expire 7 days after creation; one pending invitation per (household, email); owner-only to create/revoke; accepting requires the signed-in user's email to match.
- **Abandon rule:** accepting an invitation while already in a household succeeds only if the user is that household's sole member and it has zero apartments (the household is deleted); otherwise `409`.
- **Session staleness:** the JWT keeps `householdId`/`role` for up to 24h. Every crypto and invitation write re-checks membership/role against the database, never the token.
- **Repo rules (from AGENTS.md):** Vitest not Jest; tests in co-located `__tests__/`; `npm run lint`, `npm run typecheck`, `npm test` all green before each commit; coverage floors 80/80/78/75 on the covered set; no `middleware.ts` (the gate is `src/proxy.ts`); shadcn primitives available are badge, button, card, dropdown-menu, input, label, select, separator, textarea — use a native `<input type="checkbox">` for the acknowledgement.
- **Never run `npm run dev` without clearing `TURSO_DATABASE_URL`** — `.env.local` points it at production.

---

## File structure

**New — encryption mode and schema**
- `src/lib/encryption-mode.ts` — parse `FLATPARE_ENCRYPTION`; the one place that knows the env var name.
- `src/lib/db/schema.ts` (modify) — `settings`, `memberKeys`, `householdKeyWraps`, `invitations` tables; recovery columns on `households`.
- `drizzle/0013_e2_crypto_core.sql` + journal/snapshot — generated by drizzle-kit.
- `src/lib/db/migrate.ts` (modify) — `stampEncryptionMode` after the migrator.

**New — crypto library (`src/lib/crypto/`)**
- `encoding.ts` — base64 helpers returning `Uint8Array<ArrayBuffer>`.
- `kdf.ts` — Argon2id → AES-GCM KEK.
- `keys.ts` — keypair/data-key generation, wrap/unwrap in both directions.
- `recovery.ts` — recovery code generate/format/normalize.
- `envelope.ts` — `seal` / `open` / `assertEnvelopeMode` / `envelopeAad`.
- `store.ts` — IndexedDB persistence of non-extractable keys; memory fallback when IndexedDB is unavailable.
- `index.ts` — the public surface every other file imports from.

**New — server side**
- `src/lib/crypto-schemas.ts` — zod schemas for crypto route bodies.
- `src/lib/member-keys.ts` — all reads/writes of `member_keys`, `household_key_wraps`, recovery columns.
- `src/lib/api-error.ts` — `ApiError` (message + HTTP status); no imports, so any lib file can throw it without creating a cycle.
- `src/lib/api-route.ts` — `apiErrorResponse`, `parseBody`, `requireEncryptionOn`: the shared error → HTTP mapping and body parsing for the new route handlers.
- `src/app/api/crypto/{status,setup,pending-wraps,wraps,member-keys,member-keys/reset,recover,recovery}/route.ts`.
- `src/lib/invitations.ts` — invitation lifecycle + accept with the abandon rule.
- `src/lib/household.ts` (modify) — `resolveHouseholdForUser` returns `null` while a pending invitation exists; `createHouseholdForUser`, `listMembers`, `removeMember`.
- `src/auth.ts`, `src/proxy.ts`, `src/types/next-auth.d.ts` (modify) — nullable household on the session; `/invitations` allow-list; `unstable_update`.
- `src/app/api/invitations/route.ts`, `.../[id]/route.ts`, `.../[id]/accept/route.ts`, `.../mine/route.ts`, `.../decline/route.ts`, `src/app/api/household/members/route.ts`, `.../members/[userId]/route.ts`.

**New — client**
- `src/components/crypto/flows.ts` — orchestration (calls `@/lib/crypto` + `fetch`); no `crypto.subtle` here.
- `src/components/crypto/crypto-provider.tsx` — context + state machine + gate rendering.
- `src/components/crypto/crypto-gate.tsx` — server component: reads the mode, renders the provider.
- `src/components/crypto/setup-screen.tsx`, `unlock-screen.tsx`, `pending-screen.tsx`, `recovery-kit.tsx`, `forgot-passphrase.tsx`, `encryption-settings.tsx`.
- `src/components/nav-bar.tsx` (modify) — sign-out clears the device key store.
- `src/components/household-settings.tsx` — members, invite, revoke, remove.
- `src/app/invitations/page.tsx` — accept / start-own-household screen.
- Four section layouts (`apartments`, `compare`, `guide`, `settings`) wrap children in `<CryptoGate>`.

**Docs:** `AGENTS.md`, `docs/security-notes.md`, `.env.example`, `docker-compose.yml`.

---

### Task 1: Encryption mode, schema, migration 0013, boot stamp

**Files:**
- Create: `src/lib/encryption-mode.ts`
- Create: `src/lib/__tests__/encryption-mode.test.ts`
- Modify: `src/lib/db/schema.ts`
- Create (generated): `drizzle/0013_e2_crypto_core.sql`, `drizzle/meta/0013_snapshot.json`, `drizzle/meta/_journal.json` entry
- Modify: `src/lib/db/migrate.ts` (`applyMigrations`, new `stampEncryptionMode`)
- Modify: `src/lib/db/__tests__/migrate.test.ts`

**Interfaces:**
- Produces: `readEncryptionMode(value?: string): EncryptionMode` and `type EncryptionMode = "on" | "off"` from `@/lib/encryption-mode`; `ENCRYPTION_MODE_SETTING = "encryption_mode"`.
- Produces: `applyMigrations(client, options?: { encryptionMode?: EncryptionMode })`; `stampEncryptionMode(client, mode)`.
- Produces: Drizzle tables `settings`, `memberKeys`, `householdKeyWraps`, `invitations` and the `households.recovery*` columns, exported from `@/lib/db/schema`.

- [ ] **Step 1: Write the failing mode-parser test**

`src/lib/__tests__/encryption-mode.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readEncryptionMode } from "../encryption-mode";

describe("readEncryptionMode", () => {
  it("defaults to on when unset or empty", () => {
    expect(readEncryptionMode(undefined)).toBe("on");
    expect(readEncryptionMode("")).toBe("on");
  });

  it("accepts the two documented values", () => {
    expect(readEncryptionMode("on")).toBe("on");
    expect(readEncryptionMode("off")).toBe("off");
  });

  it("rejects anything else, naming the variable", () => {
    expect(() => readEncryptionMode("false")).toThrow(/FLATPARE_ENCRYPTION/);
    expect(() => readEncryptionMode("OFF")).toThrow(/FLATPARE_ENCRYPTION/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/__tests__/encryption-mode.test.ts`
Expected: FAIL — cannot find module `../encryption-mode`.

- [ ] **Step 3: Implement the parser**

`src/lib/encryption-mode.ts`:

```ts
export type EncryptionMode = "on" | "off";

// Key in the `settings` table where the mode is stamped on first boot.
export const ENCRYPTION_MODE_SETTING = "encryption_mode";

// Values are matched exactly on purpose: "OFF" or "false" failing boot is
// better than a deployment silently running encrypted when the operator
// believed they had turned it off.
export function readEncryptionMode(
  value: string | undefined = process.env.FLATPARE_ENCRYPTION
): EncryptionMode {
  if (value === undefined || value === "" || value === "on") return "on";
  if (value === "off") return "off";
  throw new Error(
    `FLATPARE_ENCRYPTION must be "on" or "off" (got ${JSON.stringify(value)}). ` +
      "Leave it unset to run with encryption on."
  );
}
```

- [ ] **Step 4: Run the parser test — expect PASS**

Run: `npx vitest run src/lib/__tests__/encryption-mode.test.ts`

- [ ] **Step 5: Add the tables to the Drizzle schema**

Append to `src/lib/db/schema.ts` (after the existing `householdMembers` block; `users` is already imported at the top; `uniqueIndex`, `primaryKey`, `sql` are already imported):

```ts
// Deployment-wide flags stamped at boot. Today it holds one key,
// `encryption_mode` (see src/lib/encryption-mode.ts).
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

// One row per user: their RSA-OAEP public key (SPKI, base64) and their
// private key wrapped under an Argon2id-derived KEK. The server never holds
// a passphrase or an unwrapped private key.
export const memberKeys = sqliteTable("member_keys", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  publicKey: text("public_key").notNull(),
  wrappedPrivateKey: text("wrapped_private_key").notNull(),
  privateKeyIv: text("private_key_iv").notNull(),
  kdfSalt: text("kdf_salt").notNull(),
  kdfMemoryKib: integer("kdf_memory_kib").notNull(),
  kdfIterations: integer("kdf_iterations").notNull(),
  kdfParallelism: integer("kdf_parallelism").notNull(),
  kdfVersion: integer("kdf_version").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).default(
    sql`(unixepoch())`
  ),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(
    sql`(unixepoch())`
  ),
});

// The household data key, RSA-OAEP-wrapped to one member's public key. A
// member without a row here has a key pair but cannot read household data
// yet ("pending wrap").
export const householdKeyWraps = sqliteTable(
  "household_key_wraps",
  {
    householdId: integer("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    wrappedKey: text("wrapped_key").notNull(),
    wrappedBy: text("wrapped_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp" }).default(
      sql`(unixepoch())`
    ),
  },
  (table) => [primaryKey({ columns: [table.householdId, table.userId] })]
);

export const invitations = sqliteTable(
  "invitations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    householdId: integer("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    // Lowercased and trimmed before insert (src/lib/invitations.ts).
    email: text("email").notNull(),
    invitedBy: text("invited_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status", {
      enum: ["pending", "accepted", "revoked", "expired"],
    })
      .notNull()
      .default("pending"),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
    acceptedBy: text("accepted_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: integer("created_at", { mode: "timestamp" }).default(
      sql`(unixepoch())`
    ),
  },
  (table) => [
    // One live invitation per address per household; history rows are kept.
    uniqueIndex("invitations_pending_household_email")
      .on(table.householdId, table.email)
      .where(sql`status = 'pending'`),
  ]
);

export type MemberKeyRow = typeof memberKeys.$inferSelect;
export type HouseholdKeyWrap = typeof householdKeyWraps.$inferSelect;
export type Invitation = typeof invitations.$inferSelect;
```

And add the recovery columns to the existing `households` table, after `tier`:

```ts
  // Recovery kit: the data key AES-GCM-wrapped under a KEK derived from the
  // recovery code. All nullable — the owner may not have set up yet.
  recoveryWrappedKey: text("recovery_wrapped_key"),
  recoveryIv: text("recovery_iv"),
  recoveryKdfSalt: text("recovery_kdf_salt"),
  recoveryKdfMemoryKib: integer("recovery_kdf_memory_kib"),
  recoveryKdfIterations: integer("recovery_kdf_iterations"),
  recoveryKdfParallelism: integer("recovery_kdf_parallelism"),
  recoveryKdfVersion: integer("recovery_kdf_version"),
  recoveryCreatedAt: integer("recovery_created_at", { mode: "timestamp" }),
```

- [ ] **Step 6: Generate the migration**

Run: `npx drizzle-kit generate --name e2_crypto_core`
Expected: creates `drizzle/0013_e2_crypto_core.sql`, `drizzle/meta/0013_snapshot.json`, and appends an entry to `drizzle/meta/_journal.json`. Open the SQL and confirm it contains `CREATE TABLE \`settings\``, `CREATE TABLE \`member_keys\``, `CREATE TABLE \`household_key_wraps\``, `CREATE TABLE \`invitations\``, `CREATE UNIQUE INDEX \`invitations_pending_household_email\` ... WHERE status = 'pending'`, and eight `ALTER TABLE \`households\` ADD \`recovery_...\`` statements. If drizzle-kit emitted anything else (a table rebuild, a drop), stop: the schema edit is wrong.

- [ ] **Step 7: Write the failing boot-stamp tests**

Add to `src/lib/db/__tests__/migrate.test.ts` (inside the existing `describe("applyMigrations")` block; `createClient` and `applyMigrations` are already imported; add `import { stampEncryptionMode } from "../migrate";` if you keep it as a separate import):

```ts
  it("creates the E2 tables and recovery columns", async () => {
    const client = createClient({ url: ":memory:" });
    await applyMigrations(client);

    expect(await columnNames(client, "member_keys")).toEqual(
      expect.arrayContaining(["user_id", "public_key", "kdf_salt", "kdf_version"])
    );
    expect(await columnNames(client, "household_key_wraps")).toEqual(
      expect.arrayContaining(["household_id", "user_id", "wrapped_key", "wrapped_by"])
    );
    expect(await columnNames(client, "invitations")).toEqual(
      expect.arrayContaining(["email", "status", "expires_at", "accepted_by"])
    );
    expect(await columnNames(client, "households")).toEqual(
      expect.arrayContaining(["recovery_wrapped_key", "recovery_kdf_version"])
    );
    expect(await columnNames(client, "settings")).toEqual(["key", "value"]);
  });

  it("stamps the encryption mode on first boot and accepts the same mode again", async () => {
    const client = createClient({ url: ":memory:" });
    await applyMigrations(client, { encryptionMode: "off" });
    const stored = await client.execute({
      sql: "SELECT value FROM settings WHERE key = 'encryption_mode'",
      args: [],
    });
    expect(stored.rows[0]?.value).toBe("off");

    await expect(
      applyMigrations(client, { encryptionMode: "off" })
    ).resolves.toBeUndefined();
  });

  it("refuses to boot when the mode differs from the stamped one", async () => {
    const client = createClient({ url: ":memory:" });
    await applyMigrations(client, { encryptionMode: "on" });

    await expect(
      applyMigrations(client, { encryptionMode: "off" })
    ).rejects.toThrow(/initialised with FLATPARE_ENCRYPTION=on/);
  });

  it("defaults the stamp to on when no option is passed", async () => {
    const client = createClient({ url: ":memory:" });
    await applyMigrations(client);
    const stored = await client.execute({
      sql: "SELECT value FROM settings WHERE key = 'encryption_mode'",
      args: [],
    });
    expect(stored.rows[0]?.value).toBe("on");
  });
```

- [ ] **Step 8: Run — expect the new tests to fail**

Run: `npx vitest run src/lib/db/__tests__/migrate.test.ts`
Expected: the first test may already pass (tables exist), the stamp tests FAIL (no `settings` row / no error thrown).

- [ ] **Step 9: Implement the stamp in `migrate.ts`**

Add near the top of `src/lib/db/migrate.ts`:

```ts
import {
  ENCRYPTION_MODE_SETTING,
  readEncryptionMode,
  type EncryptionMode,
} from "@/lib/encryption-mode";
```

Add before `applyMigrations`:

```ts
// The encryption mode is a property of the DATABASE, fixed on first boot:
// rows written under one mode are unreadable under the other (encrypted
// envelopes need a key that "off" never creates; plaintext envelopes are
// rejected by assertEnvelopeMode when "on"). Refusing to start is the only
// safe response to a mismatch — the operator either fixes the env var or
// points the deployment at a fresh database.
export async function stampEncryptionMode(
  client: Client,
  mode: EncryptionMode
): Promise<void> {
  const res = await client.execute({
    sql: "SELECT value FROM settings WHERE key = ?",
    args: [ENCRYPTION_MODE_SETTING],
  });
  if (res.rows.length === 0) {
    await client.execute({
      sql: "INSERT INTO settings (key, value) VALUES (?, ?)",
      args: [ENCRYPTION_MODE_SETTING, mode],
    });
    return;
  }
  const stored = String(res.rows[0].value);
  if (stored === mode) return;
  throw new Error(
    `This database was initialised with FLATPARE_ENCRYPTION=${stored} but ` +
      `the process is running with FLATPARE_ENCRYPTION=${mode}. The ` +
      "encryption mode is fixed on first boot and cannot be switched. " +
      `Run this deployment with FLATPARE_ENCRYPTION=${stored}, or point it ` +
      "at a fresh database."
  );
}
```

Change the `applyMigrations` signature and add the stamp as the last step:

```ts
export async function applyMigrations(
  client: Client,
  options: { encryptionMode?: EncryptionMode } = {}
): Promise<void> {
  await preflightTenancyMigration(client);
  await ensureListingUrlColumn(client);
  await reconcileHasWashingMachine(client);
  if (fs.existsSync(path.join(MIGRATIONS_FOLDER, "meta", "_journal.json"))) {
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  }
  await backfillShortCodes(client);
  await migrateLocationsOfInterestBackfill(client);
  // Last, because the `settings` table is created by 0013 above. Reading
  // the env var here (not at module load) keeps tests able to pass a mode.
  await stampEncryptionMode(
    client,
    options.encryptionMode ?? readEncryptionMode()
  );
}
```

Keep the existing comment about Vercel/`drizzle/` folder where it was.

- [ ] **Step 10: Run the full suite, lint, typecheck**

Run: `npm test && npm run lint && npm run typecheck`
Expected: all green. (Global setup runs `runMigrations()` with the env var unset, so the test DB is stamped `on`.)

- [ ] **Step 11: Commit**

```bash
git add src/lib/encryption-mode.ts src/lib/__tests__/encryption-mode.test.ts src/lib/db/schema.ts drizzle/ src/lib/db/migrate.ts src/lib/db/__tests__/migrate.test.ts
git commit -m "feat(e2): encryption mode, crypto/invitation tables, boot stamp (#183)"
```

---

### Task 2: Crypto library — encoding, KDF, keys

**Files:**
- Modify: `package.json` (add `hash-wasm@^4.12.0` to dependencies)
- Create: `src/lib/crypto/encoding.ts`, `src/lib/crypto/kdf.ts`, `src/lib/crypto/keys.ts`
- Create: `src/lib/crypto/__tests__/params.ts`, `src/lib/crypto/__tests__/encoding.test.ts`, `src/lib/crypto/__tests__/kdf.test.ts`, `src/lib/crypto/__tests__/keys.test.ts`

**Interfaces:**
- Produces (`encoding.ts`): `toBase64(bytes: ArrayBuffer | Uint8Array): string`, `fromBase64(s: string): Uint8Array<ArrayBuffer>`.
- Produces (`kdf.ts`): `interface KdfParams { memoryKib; iterations; parallelism; version }`, `DEFAULT_KDF_PARAMS`, `randomSalt(): Uint8Array<ArrayBuffer>` (16 bytes), `deriveKekBytes(secret, salt, params): Promise<Uint8Array<ArrayBuffer>>`, `deriveKek(secret, salt, params?): Promise<CryptoKey>` (AES-GCM, non-extractable, `wrapKey`/`unwrapKey`).
- Produces (`keys.ts`): `interface WrappedBlob { wrapped: string; iv: string }`, `randomIv()`, `generateMemberKeypair(): Promise<CryptoKeyPair>`, `exportPublicKey(key): Promise<string>`, `importPublicKey(spkiB64): Promise<CryptoKey>`, `wrapPrivateKey(privateKey, kek): Promise<WrappedBlob>`, `unwrapPrivateKey(blob, kek, opts?: { extractable?: boolean }): Promise<CryptoKey>`, `generateDataKey(): Promise<CryptoKey>` (extractable — wrap it, then convert with `toStoredDataKey`), `toStoredDataKey(dataKey): Promise<CryptoKey>` (non-extractable copy), `wrapDataKey(dataKey, publicKey): Promise<string>`, `unwrapDataKey(wrappedB64, privateKey, opts?): Promise<CryptoKey>`, `wrapDataKeyWithKek(dataKey, kek): Promise<WrappedBlob>`, `unwrapDataKeyWithKek(blob, kek, opts?): Promise<CryptoKey>`.

Note on types: TypeScript ≥5.7 types `Uint8Array` generically; WebCrypto's `BufferSource` wants `Uint8Array<ArrayBuffer>`. `new Uint8Array(x)` copies into a fresh `ArrayBuffer` and satisfies it — that is why the helpers below copy.

- [ ] **Step 1: Install hash-wasm**

Run: `npm install hash-wasm@^4.12.0`
Expected: `package.json` dependencies gain `"hash-wasm": "^4.12.0"`; lockfile updated.

- [ ] **Step 2: Write the failing encoding + KDF tests**

`src/lib/crypto/__tests__/encoding.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { toBase64, fromBase64 } from "../encoding";

describe("base64 helpers", () => {
  it("round-trips bytes", () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 255]);
    expect(fromBase64(toBase64(bytes))).toEqual(bytes);
  });

  it("accepts an ArrayBuffer", () => {
    expect(toBase64(new Uint8Array([104, 105]).buffer)).toBe("aGk=");
  });

  it("returns a Uint8Array backed by its own ArrayBuffer", () => {
    const out = fromBase64("aGk=");
    expect(out.buffer).toBeInstanceOf(ArrayBuffer);
    expect(Array.from(out)).toEqual([104, 105]);
  });
});
```

`src/lib/crypto/__tests__/params.ts` — a helper, not a test (the vitest
`include` pattern is `**/__tests__/**/*.test.{ts,tsx}`, so this file is not
collected). It lives here rather than in `kdf.test.ts` because importing a
`.test.ts` file from another suite re-registers its `describe` blocks —
including the 64 MiB pinned vector — in every importing file.

```ts
import type { KdfParams } from "../kdf";

// Small parameters keep the suites fast; the pinned vector in kdf.test.ts
// is the one test that runs the production parameters.
export const TEST_KDF_PARAMS: KdfParams = {
  memoryKib: 1024,
  iterations: 1,
  parallelism: 1,
  version: 1,
};
```

`src/lib/crypto/__tests__/kdf.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  DEFAULT_KDF_PARAMS,
  deriveKek,
  deriveKekBytes,
  randomSalt,
} from "../kdf";
import { TEST_KDF_PARAMS } from "./params";

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

describe("deriveKekBytes", () => {
  it("matches the pinned Argon2id vector at production parameters", async () => {
    // Pinned on 2026-09-06 with hash-wasm 4.12.0. If this changes, every
    // stored key becomes unrecoverable: treat a failure here as a release
    // blocker, never as a fixture to update.
    const salt = new Uint8Array(16).map((_, i) => i);
    const out = await deriveKekBytes(
      "correct horse battery staple",
      salt,
      DEFAULT_KDF_PARAMS
    );
    expect(hex(out)).toBe(
      "0d1a3c6523c8f06e4e0af9c515aa5b5448cfebd6838f2d52c3d8b6ef8ddc3c2e"
    );
  }, 30_000);

  it("is deterministic and salt-sensitive", async () => {
    const salt = randomSalt();
    const a = await deriveKekBytes("pw", salt, TEST_KDF_PARAMS);
    const b = await deriveKekBytes("pw", salt, TEST_KDF_PARAMS);
    const c = await deriveKekBytes("pw", randomSalt(), TEST_KDF_PARAMS);
    expect(hex(a)).toBe(hex(b));
    expect(hex(a)).not.toBe(hex(c));
  });

  it("rejects an unknown KDF version", async () => {
    await expect(
      deriveKekBytes("pw", randomSalt(), { ...TEST_KDF_PARAMS, version: 2 })
    ).rejects.toThrow(/version/);
  });
});

describe("deriveKek", () => {
  it("returns a non-extractable AES-GCM wrapping key", async () => {
    const kek = await deriveKek("pw", randomSalt(), TEST_KDF_PARAMS);
    expect(kek.algorithm).toMatchObject({ name: "AES-GCM", length: 256 });
    expect(kek.extractable).toBe(false);
    expect([...kek.usages].sort()).toEqual(["unwrapKey", "wrapKey"]);
    await expect(crypto.subtle.exportKey("raw", kek)).rejects.toThrow();
  });
});

describe("randomSalt", () => {
  it("is 16 bytes and not constant", () => {
    const a = randomSalt();
    expect(a).toHaveLength(16);
    expect(hex(a)).not.toBe(hex(randomSalt()));
  });
});
```

- [ ] **Step 3: Run — expect FAIL (modules missing)**

Run: `npx vitest run src/lib/crypto`

- [ ] **Step 4: Implement encoding and kdf**

`src/lib/crypto/encoding.ts`:

```ts
// Base64 for key material and envelopes. Hand-rolled over btoa/atob rather
// than Uint8Array.prototype.toBase64 because the latter is not in every
// browser this app targets yet. Sizes here are a few KB at most.

export function toBase64(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = "";
  for (const b of view) bin += String.fromCharCode(b);
  return btoa(bin);
}

// Returns a Uint8Array over a fresh ArrayBuffer, which is what WebCrypto's
// BufferSource parameter type demands.
export function fromBase64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
```

`src/lib/crypto/kdf.ts`:

```ts
import { argon2id } from "hash-wasm";

export interface KdfParams {
  memoryKib: number;
  iterations: number;
  parallelism: number;
  // Bumped only if the derivation itself changes; stored rows record the
  // version they were derived under so old keys stay unwrappable.
  version: number;
}

export const DEFAULT_KDF_PARAMS: KdfParams = {
  memoryKib: 65536,
  iterations: 3,
  parallelism: 1,
  version: 1,
};

export function randomSalt(): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(16));
}

export async function deriveKekBytes(
  secret: string,
  salt: Uint8Array,
  params: KdfParams
): Promise<Uint8Array<ArrayBuffer>> {
  if (params.version !== 1) {
    throw new Error(`Unsupported KDF version ${params.version}`);
  }
  const out = await argon2id({
    password: secret,
    salt,
    parallelism: params.parallelism,
    iterations: params.iterations,
    memorySize: params.memoryKib,
    hashLength: 32,
    outputType: "binary",
  });
  return new Uint8Array(out);
}

// The KEK is only ever used to wrap/unwrap other keys, never to encrypt
// data directly, so its usages say exactly that.
export async function deriveKek(
  secret: string,
  salt: Uint8Array,
  params: KdfParams = DEFAULT_KDF_PARAMS
): Promise<CryptoKey> {
  const bytes = await deriveKekBytes(secret, salt, params);
  try {
    return await crypto.subtle.importKey("raw", bytes, "AES-GCM", false, [
      "wrapKey",
      "unwrapKey",
    ]);
  } finally {
    bytes.fill(0);
  }
}
```

- [ ] **Step 5: Run encoding + kdf tests — expect PASS**

Run: `npx vitest run src/lib/crypto/__tests__/encoding.test.ts src/lib/crypto/__tests__/kdf.test.ts`

- [ ] **Step 6: Write the failing keys tests**

`src/lib/crypto/__tests__/keys.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { deriveKek, randomSalt } from "../kdf";
import { TEST_KDF_PARAMS } from "./params";
import {
  exportPublicKey,
  generateDataKey,
  generateMemberKeypair,
  importPublicKey,
  toStoredDataKey,
  unwrapDataKey,
  unwrapDataKeyWithKek,
  unwrapPrivateKey,
  wrapDataKey,
  wrapDataKeyWithKek,
  wrapPrivateKey,
} from "../keys";

async function encryptProbe(key: CryptoKey): Promise<string> {
  const iv = new Uint8Array(12);
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode("probe")
  );
  return Buffer.from(ct).toString("hex");
}

describe("member keypair", () => {
  it("is RSA-OAEP-3072/SHA-256 and the public key survives export/import", async () => {
    const pair = await generateMemberKeypair();
    expect(pair.publicKey.algorithm).toMatchObject({
      name: "RSA-OAEP",
      modulusLength: 3072,
      hash: { name: "SHA-256" },
    });
    const spki = await exportPublicKey(pair.publicKey);
    const imported = await importPublicKey(spki);
    expect(imported.usages).toEqual(["wrapKey"]);
  });

  it("private key round-trips through a passphrase KEK and comes back non-extractable", async () => {
    const pair = await generateMemberKeypair();
    const kek = await deriveKek("passphrase-12chars", randomSalt(), TEST_KDF_PARAMS);
    const blob = await wrapPrivateKey(pair.privateKey, kek);

    const restored = await unwrapPrivateKey(blob, kek);
    expect(restored.extractable).toBe(false);
    expect(restored.usages).toEqual(["unwrapKey"]);
    await expect(crypto.subtle.exportKey("pkcs8", restored)).rejects.toThrow();

    // An explicitly transient extractable copy is allowed (change-passphrase
    // needs it) but must be requested.
    const transient = await unwrapPrivateKey(blob, kek, { extractable: true });
    expect(transient.extractable).toBe(true);
  });

  it("refuses to unwrap the private key under the wrong passphrase", async () => {
    const pair = await generateMemberKeypair();
    const salt = randomSalt();
    const kek = await deriveKek("right-passphrase", salt, TEST_KDF_PARAMS);
    const wrong = await deriveKek("wrong-passphrase", salt, TEST_KDF_PARAMS);
    const blob = await wrapPrivateKey(pair.privateKey, kek);
    await expect(unwrapPrivateKey(blob, wrong)).rejects.toThrow();
  });
});

describe("data key", () => {
  it("wraps to a public key and unwraps with the private key to the same key", async () => {
    const pair = await generateMemberKeypair();
    const dataKey = await generateDataKey();
    const wrapped = await wrapDataKey(dataKey, pair.publicKey);

    const restored = await unwrapDataKey(wrapped, pair.privateKey);
    expect(restored.extractable).toBe(false);
    expect([...restored.usages].sort()).toEqual(["decrypt", "encrypt"]);
    expect(await encryptProbe(restored)).toBe(await encryptProbe(dataKey));
  });

  it("cannot be unwrapped by a different member's private key", async () => {
    const a = await generateMemberKeypair();
    const b = await generateMemberKeypair();
    const wrapped = await wrapDataKey(await generateDataKey(), a.publicKey);
    await expect(unwrapDataKey(wrapped, b.privateKey)).rejects.toThrow();
  });

  it("toStoredDataKey yields a non-extractable copy of the same key", async () => {
    const dataKey = await generateDataKey();
    const stored = await toStoredDataKey(dataKey);
    expect(stored.extractable).toBe(false);
    expect(await encryptProbe(stored)).toBe(await encryptProbe(dataKey));
  });

  it("round-trips through a recovery KEK", async () => {
    const dataKey = await generateDataKey();
    const rk = await deriveKek("RECOVERYCODE", randomSalt(), TEST_KDF_PARAMS);
    const blob = await wrapDataKeyWithKek(dataKey, rk);
    const restored = await unwrapDataKeyWithKek(blob, rk, { extractable: true });
    expect(restored.extractable).toBe(true);
    expect(await encryptProbe(restored)).toBe(await encryptProbe(dataKey));
  });
});
```

- [ ] **Step 7: Run — expect FAIL (`../keys` missing)**

Run: `npx vitest run src/lib/crypto/__tests__/keys.test.ts`

- [ ] **Step 8: Implement keys.ts**

`src/lib/crypto/keys.ts`:

```ts
import { fromBase64, toBase64 } from "./encoding";

const RSA_GEN: RsaHashedKeyGenParams = {
  name: "RSA-OAEP",
  modulusLength: 3072,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: "SHA-256",
};
const RSA_IMPORT: RsaHashedImportParams = { name: "RSA-OAEP", hash: "SHA-256" };
const AES: AesKeyGenParams = { name: "AES-GCM", length: 256 };

// A wrapped key plus the IV it was wrapped under, both base64.
export interface WrappedBlob {
  wrapped: string;
  iv: string;
}

export interface UnwrapOptions {
  // WebCrypto can only wrap an EXTRACTABLE key. Flows that need to re-wrap
  // (change passphrase, fulfil a wrap for a new member, regenerate the
  // recovery kit) unwrap a transient extractable copy, use it, and drop it.
  // Nothing extractable is ever persisted — see store.ts.
  extractable?: boolean;
}

export function randomIv(): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(12));
}

// Generated extractable because the private half has to be wrapped once;
// the caller converts it to a stored key by unwrapping (unwrapPrivateKey)
// and never keeps this pair around.
export function generateMemberKeypair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(RSA_GEN, true, ["wrapKey", "unwrapKey"]);
}

export async function exportPublicKey(key: CryptoKey): Promise<string> {
  return toBase64(await crypto.subtle.exportKey("spki", key));
}

export function importPublicKey(spkiB64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("spki", fromBase64(spkiB64), RSA_IMPORT, true, [
    "wrapKey",
  ]);
}

export async function wrapPrivateKey(
  privateKey: CryptoKey,
  kek: CryptoKey
): Promise<WrappedBlob> {
  const iv = randomIv();
  const wrapped = await crypto.subtle.wrapKey("pkcs8", privateKey, kek, {
    name: "AES-GCM",
    iv,
  });
  return { wrapped: toBase64(wrapped), iv: toBase64(iv) };
}

export function unwrapPrivateKey(
  blob: WrappedBlob,
  kek: CryptoKey,
  opts: UnwrapOptions = {}
): Promise<CryptoKey> {
  return crypto.subtle.unwrapKey(
    "pkcs8",
    fromBase64(blob.wrapped),
    kek,
    { name: "AES-GCM", iv: fromBase64(blob.iv) },
    RSA_IMPORT,
    opts.extractable ?? false,
    ["unwrapKey"]
  );
}

// Extractable so it can be wrapped to the creator's public key and under the
// recovery KEK. Convert with toStoredDataKey before keeping it anywhere.
export function generateDataKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(AES, true, ["encrypt", "decrypt"]);
}

export async function toStoredDataKey(dataKey: CryptoKey): Promise<CryptoKey> {
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", dataKey));
  try {
    return await crypto.subtle.importKey("raw", raw, AES, false, [
      "encrypt",
      "decrypt",
    ]);
  } finally {
    raw.fill(0);
  }
}

export async function wrapDataKey(
  dataKey: CryptoKey,
  publicKey: CryptoKey
): Promise<string> {
  return toBase64(
    await crypto.subtle.wrapKey("raw", dataKey, publicKey, { name: "RSA-OAEP" })
  );
}

export function unwrapDataKey(
  wrappedB64: string,
  privateKey: CryptoKey,
  opts: UnwrapOptions = {}
): Promise<CryptoKey> {
  return crypto.subtle.unwrapKey(
    "raw",
    fromBase64(wrappedB64),
    privateKey,
    { name: "RSA-OAEP" },
    AES,
    opts.extractable ?? false,
    ["encrypt", "decrypt"]
  );
}

export async function wrapDataKeyWithKek(
  dataKey: CryptoKey,
  kek: CryptoKey
): Promise<WrappedBlob> {
  const iv = randomIv();
  const wrapped = await crypto.subtle.wrapKey("raw", dataKey, kek, {
    name: "AES-GCM",
    iv,
  });
  return { wrapped: toBase64(wrapped), iv: toBase64(iv) };
}

export function unwrapDataKeyWithKek(
  blob: WrappedBlob,
  kek: CryptoKey,
  opts: UnwrapOptions = {}
): Promise<CryptoKey> {
  return crypto.subtle.unwrapKey(
    "raw",
    fromBase64(blob.wrapped),
    kek,
    { name: "AES-GCM", iv: fromBase64(blob.iv) },
    AES,
    opts.extractable ?? false,
    ["encrypt", "decrypt"]
  );
}
```

- [ ] **Step 9: Run all crypto tests, lint, typecheck**

Run: `npx vitest run src/lib/crypto && npm run lint && npm run typecheck`
Expected: PASS. If `tsc` complains that `Uint8Array<ArrayBufferLike>` is not assignable to `BufferSource`, the fix is a `new Uint8Array(...)` copy at that call site, not a cast.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json src/lib/crypto
git commit -m "feat(e2): crypto library — Argon2id KDF, member keypairs, data key wrapping (#183)"
```

---

### Task 3: Crypto library — recovery codes, envelope, IndexedDB store, index

**Files:**
- Modify: `package.json` (add `fake-indexeddb@^6.2.5` to devDependencies)
- Create: `src/lib/crypto/recovery.ts`, `src/lib/crypto/envelope.ts`, `src/lib/crypto/store.ts`, `src/lib/crypto/index.ts`
- Create: `src/lib/crypto/__tests__/recovery.test.ts`, `envelope.test.ts`, `store.test.ts`

**Interfaces:**
- Produces (`recovery.ts`): `generateRecoveryCode(): string` (formatted `XXXXX-XXXXX-XXXXX-XXXXX-XXXXX`), `formatRecoveryCode(compact): string`, `normalizeRecoveryCode(input): string | null` (25-char compact uppercase, or `null` if malformed / bad check char). **The compact 25-char string is the KDF secret for the recovery KEK.**
- Produces (`envelope.ts`): `type Envelope = { v: 1; iv: string; ct: string } | { v: 0; data: unknown }`, `envelopeAad(householdId, table, rowId): string`, `seal(key: CryptoKey | null, value: unknown, aad: string): Promise<Envelope>`, `open(key: CryptoKey | null, envelope: Envelope, aad: string): Promise<unknown>`, `assertEnvelopeMode(envelope, mode: EncryptionMode): void`.
- Produces (`store.ts`): `interface StoredKeys { userId: string; householdId: number; privateKey: CryptoKey; dataKey: CryptoKey | null }`, `saveKeys(keys): Promise<void>`, `loadKeys(userId, householdId): Promise<StoredKeys | null>` (null and clears on identity mismatch), `clearKeys(): Promise<void>`, `isKeyStorePersistent(): boolean` (false once IndexedDB has failed and the keys are held in module memory instead).
- Produces (`index.ts`): re-exports everything above plus Task 2's exports. **Every consumer imports from `@/lib/crypto`, never from the submodules.**

- [ ] **Step 1: Install fake-indexeddb**

Run: `npm install --save-dev fake-indexeddb@^6.2.5`

- [ ] **Step 2: Write the failing recovery + envelope tests**

`src/lib/crypto/__tests__/recovery.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  formatRecoveryCode,
  generateRecoveryCode,
  normalizeRecoveryCode,
} from "../recovery";

describe("recovery codes", () => {
  it("generates five dash-separated groups of five base32 chars", () => {
    const code = generateRecoveryCode();
    expect(code).toMatch(/^[A-Z2-7]{5}(-[A-Z2-7]{5}){4}$/);
    expect(generateRecoveryCode()).not.toBe(code);
  });

  it("normalizes case and separators back to the 25-char compact form", () => {
    const code = generateRecoveryCode();
    const compact = code.replaceAll("-", "");
    expect(normalizeRecoveryCode(code)).toBe(compact);
    expect(normalizeRecoveryCode(code.toLowerCase())).toBe(compact);
    expect(normalizeRecoveryCode(` ${code.replaceAll("-", " ")} `)).toBe(compact);
    expect(formatRecoveryCode(compact)).toBe(code);
  });

  it("rejects a code with a wrong check character or wrong length", () => {
    const compact = generateRecoveryCode().replaceAll("-", "");
    const badCheck =
      compact.slice(0, 24) + (compact[24] === "A" ? "B" : "A");
    expect(normalizeRecoveryCode(badCheck)).toBeNull();
    expect(normalizeRecoveryCode(compact.slice(0, 24))).toBeNull();
    expect(normalizeRecoveryCode("")).toBeNull();
  });

  it("rejects a single-character typo", () => {
    const compact = generateRecoveryCode().replaceAll("-", "");
    const replacement = compact[0] === "A" ? "B" : "A";
    expect(normalizeRecoveryCode(replacement + compact.slice(1))).toBeNull();
  });
});
```

`src/lib/crypto/__tests__/envelope.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { generateDataKey } from "../keys";
import { assertEnvelopeMode, envelopeAad, open, seal } from "../envelope";

describe("envelope", () => {
  const aad = envelopeAad(7, "apartments", 42);

  it("builds the AAD as householdId:table:rowId", () => {
    expect(aad).toBe("7:apartments:42");
  });

  it("round-trips a JSON value under a key", async () => {
    const key = await generateDataKey();
    const env = await seal(key, { name: "Flat", rent: 1200 }, aad);
    expect(env.v).toBe(1);
    expect(await open(key, env, aad)).toEqual({ name: "Flat", rent: 1200 });
  });

  it("uses a fresh IV per seal", async () => {
    const key = await generateDataKey();
    const a = await seal(key, "x", aad);
    const b = await seal(key, "x", aad);
    expect(a).not.toEqual(b);
  });

  it("refuses to open under a different AAD (row moved or relabelled)", async () => {
    const key = await generateDataKey();
    const env = await seal(key, "secret", aad);
    await expect(open(key, env, envelopeAad(7, "apartments", 43))).rejects.toThrow();
  });

  it("refuses a tampered ciphertext", async () => {
    const key = await generateDataKey();
    const env = await seal(key, "secret", aad);
    if (env.v !== 1) throw new Error("expected v1");
    const flipped = { ...env, ct: env.ct.slice(0, -4) + "AAAA" };
    await expect(open(key, flipped, aad)).rejects.toThrow();
  });

  it("requires a non-empty AAD", async () => {
    const key = await generateDataKey();
    await expect(seal(key, "x", "")).rejects.toThrow(/AAD/);
  });

  it("produces and opens plaintext envelopes when there is no key", async () => {
    const env = await seal(null, { a: 1 }, aad);
    expect(env).toEqual({ v: 0, data: { a: 1 } });
    expect(await open(null, env, aad)).toEqual({ a: 1 });
  });

  it("cannot open an encrypted envelope without a key", async () => {
    const key = await generateDataKey();
    const env = await seal(key, "x", aad);
    await expect(open(null, env, aad)).rejects.toThrow(/without a key/);
  });

  it("assertEnvelopeMode rejects the wrong kind for the mode", async () => {
    const key = await generateDataKey();
    const encrypted = await seal(key, "x", aad);
    const plain = await seal(null, "x", aad);
    expect(() => assertEnvelopeMode(encrypted, "on")).not.toThrow();
    expect(() => assertEnvelopeMode(plain, "off")).not.toThrow();
    expect(() => assertEnvelopeMode(plain, "on")).toThrow(/plaintext/i);
    expect(() => assertEnvelopeMode(encrypted, "off")).toThrow(/encrypted/i);
  });
});
```

- [ ] **Step 3: Run — expect FAIL (modules missing)**

Run: `npx vitest run src/lib/crypto/__tests__/recovery.test.ts src/lib/crypto/__tests__/envelope.test.ts`

- [ ] **Step 4: Implement recovery.ts and envelope.ts**

`src/lib/crypto/recovery.ts`:

```ts
// RFC 4648 base32 alphabet. No 0/1/8/9, so a printed code is unambiguous.
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const DATA_CHARS = 24; // 120 bits
export const RECOVERY_CODE_LENGTH = DATA_CHARS + 1; // + check char

function checkChar(data: string): string {
  let sum = 0;
  for (const c of data) sum += ALPHABET.indexOf(c);
  return ALPHABET[sum % 32];
}

export function formatRecoveryCode(compact: string): string {
  return compact.match(/.{1,5}/g)!.join("-");
}

export function generateRecoveryCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(15));
  let bits = 0;
  let acc = 0;
  let out = "";
  for (const b of bytes) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += ALPHABET[(acc >> bits) & 31];
      acc &= (1 << bits) - 1;
    }
  }
  return formatRecoveryCode(out + checkChar(out));
}

// Accepts whatever the user typed — any case, with or without dashes or
// spaces — and returns the 25-char compact form, which is ALSO the string
// fed to the KDF. Returns null rather than throwing so the UI can show
// "that doesn't look like a recovery code" without an exception path.
export function normalizeRecoveryCode(input: string): string | null {
  const compact = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  if (compact.length !== RECOVERY_CODE_LENGTH) return null;
  if (checkChar(compact.slice(0, DATA_CHARS)) !== compact[DATA_CHARS]) {
    return null;
  }
  return compact;
}
```

`src/lib/crypto/envelope.ts`:

```ts
import type { EncryptionMode } from "@/lib/encryption-mode";
import { fromBase64, toBase64 } from "./encoding";
import { randomIv } from "./keys";

// v1: AES-256-GCM ciphertext of the JSON-encoded value, bound to its AAD.
// v0: the plaintext value, written only when the deployment runs with
// FLATPARE_ENCRYPTION=off. A row's envelope version is how a reader tells
// which it is; assertEnvelopeMode is how a deployment refuses the other.
export type Envelope =
  | { v: 1; iv: string; ct: string }
  | { v: 0; data: unknown };

const enc = new TextEncoder();
const dec = new TextDecoder();

// Binding a ciphertext to its row stops the server (or anyone with database
// access) from moving a valid ciphertext onto another row or household.
export function envelopeAad(
  householdId: number,
  table: string,
  rowId: number | string
): string {
  return `${householdId}:${table}:${rowId}`;
}

function requireAad(aad: string): Uint8Array<ArrayBuffer> {
  if (!aad) throw new Error("Envelope AAD is required");
  return new Uint8Array(enc.encode(aad));
}

export async function seal(
  key: CryptoKey | null,
  value: unknown,
  aad: string
): Promise<Envelope> {
  const additionalData = requireAad(aad);
  if (key === null) return { v: 0, data: value };
  const iv = randomIv();
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData },
    key,
    enc.encode(JSON.stringify(value))
  );
  return { v: 1, iv: toBase64(iv), ct: toBase64(ct) };
}

export async function open(
  key: CryptoKey | null,
  envelope: Envelope,
  aad: string
): Promise<unknown> {
  const additionalData = requireAad(aad);
  if (envelope.v === 0) return envelope.data;
  if (key === null) {
    throw new Error("Cannot open an encrypted envelope without a key");
  }
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(envelope.iv), additionalData },
    key,
    fromBase64(envelope.ct)
  );
  return JSON.parse(dec.decode(pt));
}

export function assertEnvelopeMode(
  envelope: Envelope,
  mode: EncryptionMode
): void {
  if (mode === "on" && envelope.v !== 1) {
    throw new Error("Plaintext envelope in an encrypted deployment");
  }
  if (mode === "off" && envelope.v !== 0) {
    throw new Error("Encrypted envelope in a deployment with encryption off");
  }
}
```

- [ ] **Step 5: Run recovery + envelope tests — expect PASS**

Run: `npx vitest run src/lib/crypto/__tests__/recovery.test.ts src/lib/crypto/__tests__/envelope.test.ts`

- [ ] **Step 6: Write the failing store test**

`src/lib/crypto/__tests__/store.test.ts`:

```ts
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { generateDataKey, generateMemberKeypair, toStoredDataKey } from "../keys";
import { clearKeys, isKeyStorePersistent, loadKeys, saveKeys } from "../store";

// generateMemberKeypair() is extractable by design (the private half has to
// be wrapped once); the store only accepts non-extractable keys, so re-import
// the private key the way unwrapPrivateKey would.
async function storedPrivateKey() {
  const pair = await generateMemberKeypair();
  const pkcs8 = await crypto.subtle.exportKey("pkcs8", pair.privateKey);
  return crypto.subtle.importKey(
    "pkcs8",
    pkcs8,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["unwrapKey"]
  );
}

async function fixture() {
  return {
    userId: "u1",
    householdId: 1,
    privateKey: await storedPrivateKey(),
    dataKey: await toStoredDataKey(await generateDataKey()),
  };
}

describe("key store", () => {
  beforeEach(async () => {
    await clearKeys();
  });

  it("returns null when nothing is stored", async () => {
    expect(await loadKeys("u1", 1)).toBeNull();
  });

  it("round-trips CryptoKeys and keeps them non-extractable", async () => {
    const keys = await fixture();
    await saveKeys(keys);
    const loaded = await loadKeys("u1", 1);
    expect(loaded).not.toBeNull();
    expect(loaded!.dataKey).toBeInstanceOf(CryptoKey);
    expect(loaded!.dataKey!.extractable).toBe(false);
    expect(loaded!.privateKey.extractable).toBe(false);
    await expect(crypto.subtle.exportKey("raw", loaded!.dataKey!)).rejects.toThrow();
  });

  it("stores a private key with no data key yet (member awaiting a wrap)", async () => {
    await saveKeys({ ...(await fixture()), dataKey: null });
    const loaded = await loadKeys("u1", 1);
    expect(loaded!.dataKey).toBeNull();
    expect(loaded!.privateKey.extractable).toBe(false);
  });

  it("refuses an extractable key", async () => {
    const pair = await generateMemberKeypair();
    await expect(
      saveKeys({ ...(await fixture()), privateKey: pair.privateKey })
    ).rejects.toThrow(/extractable/);
    await expect(
      saveKeys({ ...(await fixture()), dataKey: await generateDataKey() })
    ).rejects.toThrow(/extractable/);
  });

  it("returns null and clears the store when the identity does not match", async () => {
    await saveKeys(await fixture());
    expect(await loadKeys("someone-else", 1)).toBeNull();
    expect(await loadKeys("u1", 1)).toBeNull();
  });

  it("clearKeys removes everything", async () => {
    await saveKeys(await fixture());
    await clearKeys();
    expect(await loadKeys("u1", 1)).toBeNull();
  });

  it("reports a persistent store when IndexedDB works", async () => {
    await saveKeys(await fixture());
    expect(isKeyStorePersistent()).toBe(true);
  });

  it("falls back to memory when IndexedDB is unavailable", async () => {
    const original = globalThis.indexedDB;
    vi.stubGlobal("indexedDB", undefined);
    try {
      const keys = await fixture();
      await saveKeys(keys);
      expect(isKeyStorePersistent()).toBe(false);
      expect((await loadKeys("u1", 1))?.privateKey).toBe(keys.privateKey);
      await clearKeys();
      expect(await loadKeys("u1", 1)).toBeNull();
    } finally {
      vi.stubGlobal("indexedDB", original);
    }
  });
});
```

- [ ] **Step 7: Run — expect FAIL (`../store` missing)**

Run: `npx vitest run src/lib/crypto/__tests__/store.test.ts`

- [ ] **Step 8: Implement store.ts and index.ts**

`src/lib/crypto/store.ts`:

```ts
// Persists the unlocked keys per device so the passphrase is entered once.
// IndexedDB can structured-clone a CryptoKey, and a non-extractable key
// stays non-extractable across that clone — which is the whole reason this
// is IndexedDB and not localStorage (which could only hold exported bytes).
//
// Keys are stored under one fixed record, tagged with the user and household
// they belong to, so a different account signing in on the same browser can
// never pick up the previous account's keys.

const DB_NAME = "flatpare-keys";
const DB_VERSION = 1;
const STORE = "keys";
const RECORD = "current";

export interface StoredKeys {
  userId: string;
  householdId: number;
  privateKey: CryptoKey;
  // null while the member has a key pair but nobody has wrapped the
  // household key to it yet ("pending wrap").
  dataKey: CryptoKey | null;
}

// Some private-browsing modes have no IndexedDB, or refuse to open it. Then
// the keys live in this module for the lifetime of the page and the unlock
// prompt comes back on every load; the provider tells the user why via
// isKeyStorePersistent().
let memory: StoredKeys | null = null;
let persistent = true;

export function isKeyStorePersistent(): boolean {
  return persistent;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function requestToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, mode);
    const result = await requestToPromise(fn(tx.objectStore(STORE)));
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    return result;
  } finally {
    db.close();
  }
}

export async function saveKeys(keys: StoredKeys): Promise<void> {
  if (keys.privateKey.extractable || keys.dataKey?.extractable) {
    throw new Error("Refusing to persist an extractable key");
  }
  try {
    await withStore("readwrite", (store) => store.put(keys, RECORD));
    persistent = true;
  } catch {
    persistent = false;
    memory = keys;
  }
}

export async function loadKeys(
  userId: string,
  householdId: number
): Promise<StoredKeys | null> {
  let record: StoredKeys | undefined;
  try {
    record = await withStore<StoredKeys | undefined>("readonly", (store) =>
      store.get(RECORD)
    );
    persistent = true;
  } catch {
    persistent = false;
    record = memory ?? undefined;
  }
  if (!record) return null;
  if (record.userId !== userId || record.householdId !== householdId) {
    await clearKeys();
    return null;
  }
  return record;
}

export async function clearKeys(): Promise<void> {
  memory = null;
  try {
    await withStore("readwrite", (store) => store.delete(RECORD));
  } catch {
    // Nothing persisted to clear.
  }
}
```

`src/lib/crypto/index.ts`:

```ts
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
```

- [ ] **Step 9: Run all crypto tests, lint, typecheck**

Run: `npx vitest run src/lib/crypto && npm run lint && npm run typecheck`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json src/lib/crypto
git commit -m "feat(e2): recovery codes, AEAD envelope, IndexedDB key store (#183, #184)"
```

---

### Task 4: ESLint layering rule

**Files:**
- Modify: `eslint.config.mjs`
- Create (temporary, deleted in this task): `src/lib/__layer-probe.ts`

**Interfaces:**
- Produces: `npm run lint` fails on `crypto.subtle` or `import ... from "hash-wasm"` anywhere outside `src/lib/crypto/**`.

- [ ] **Step 1: Add the rules**

Replace the body of `eslint.config.mjs` with:

```js
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
    "no-restricted-properties": [
      "error",
      {
        object: "crypto",
        property: "subtle",
        message:
          "Use the functions exported from @/lib/crypto; crypto.subtle is only allowed under src/lib/crypto/.",
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
            group: ["@/lib/crypto/*", "**/lib/crypto/*"],
            message:
              "Import from @/lib/crypto (the index), not from its submodules.",
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
```

- [ ] **Step 2: Prove the rule fires**

Create `src/lib/__layer-probe.ts`:

```ts
import { argon2id } from "hash-wasm";
export async function probe() {
  await argon2id({ password: "x", salt: new Uint8Array(16), parallelism: 1, iterations: 1, memorySize: 8, hashLength: 32 });
  return crypto.subtle.digest("SHA-256", new Uint8Array(1));
}
```

Run: `npm run lint`
Expected: two errors on `src/lib/__layer-probe.ts` — one `no-restricted-imports` naming `hash-wasm`, one `no-restricted-properties` naming `crypto.subtle`. Then delete the probe:

```bash
rm src/lib/__layer-probe.ts
```

- [ ] **Step 3: Confirm the crypto library itself is exempt and the tree is clean**

Run: `npm run lint`
Expected: exit 0. (`src/lib/crypto/__tests__/*.test.ts` live under the exempt path and may call `crypto.subtle` directly to assert non-extractability.)

- [ ] **Step 4: Commit**

```bash
git add eslint.config.mjs
git commit -m "chore(lint): confine crypto.subtle and hash-wasm to src/lib/crypto (#183)"
```

---
### Task 5: Server library — API errors, request schemas, member-keys store

**Files:**
- Create: `src/lib/api-error.ts`
- Create: `src/lib/api-route.ts`
- Create: `src/lib/crypto-schemas.ts`
- Create: `src/lib/member-keys.ts`
- Test: `src/lib/__tests__/api-route.test.ts`
- Test: `src/lib/__tests__/crypto-schemas.test.ts`
- Test: `src/lib/__tests__/member-keys.test.ts`

**Interfaces:**
- Consumes: `readEncryptionMode()` (Task 1); tables `memberKeys`, `householdKeyWraps`, `households`, `householdMembers`, `users` (Task 1); `UnauthorizedError`, `ForbiddenError`, `Role` from `@/lib/household`.
- Produces:
  - `class ApiError extends Error { status: number }`.
  - `apiErrorResponse(err: unknown, tag: string): NextResponse`, `parseBody<T>(req: Request, schema: ZodType<T>): Promise<T>`, `requireEncryptionOn(): void`.
  - zod schemas `setupSchema`, `wrapsSchema`, `changePassphraseSchema`, `recoverSchema`, `recoverySchema`, `memberKeySchema`, `kdfSchema`; types `KdfParamsRow`, `MemberKeyMaterial`, `RecoveryMaterial`.
  - `interface CryptoStatus`, `getCryptoStatus`, `setupMemberKeys`, `listPendingWraps`, `fulfilWraps`, `replaceMemberKeys`, `resetMemberKeys`, `recoverHousehold`, `replaceRecovery`, `class CryptoStateError`.

Everything in this task is server-only and never touches `crypto.subtle`: it stores and returns base64 strings the client produced. Tests use short fake base64 strings (`"AAAA"`) — the server does not validate that material decrypts, only that it is well-formed base64.

- [ ] **Step 1: Write the failing tests for `api-route`**

`src/lib/__tests__/api-route.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { z } from "zod";
import { ApiError } from "../api-error";
import { apiErrorResponse, parseBody, requireEncryptionOn } from "../api-route";
import { ForbiddenError, UnauthorizedError } from "../household";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("apiErrorResponse", () => {
  it("maps UnauthorizedError to 401", async () => {
    const res = apiErrorResponse(new UnauthorizedError(), "t");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Not authenticated" });
  });

  it("maps ForbiddenError to 403", async () => {
    const res = apiErrorResponse(new ForbiddenError(), "t");
    expect(res.status).toBe(403);
  });

  it("maps ApiError to its own status and message", async () => {
    const res = apiErrorResponse(new ApiError("Keys already exist", 409), "t");
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Keys already exist" });
  });

  it("maps a ZodError to 400 with issues", async () => {
    const parsed = z.object({ a: z.string() }).safeParse({ a: 1 });
    if (parsed.success) throw new Error("expected failure");
    const res = apiErrorResponse(parsed.error, "t");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid request body");
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("logs and returns 500 for anything else", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = apiErrorResponse(new Error("boom"), "crypto:setup");
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Internal error" });
    expect(spy).toHaveBeenCalledWith("[crypto:setup]", expect.any(Error));
  });
});

describe("parseBody", () => {
  const schema = z.object({ name: z.string() });

  it("returns the parsed body", async () => {
    const req = new Request("http://x", {
      method: "POST",
      body: JSON.stringify({ name: "a" }),
    });
    expect(await parseBody(req, schema)).toEqual({ name: "a" });
  });

  it("throws ApiError 400 on invalid JSON", async () => {
    const req = new Request("http://x", { method: "POST", body: "{not json" });
    await expect(parseBody(req, schema)).rejects.toMatchObject({ status: 400 });
  });

  it("throws a ZodError on a schema mismatch", async () => {
    const req = new Request("http://x", {
      method: "POST",
      body: JSON.stringify({ name: 3 }),
    });
    await expect(parseBody(req, schema)).rejects.toBeInstanceOf(z.ZodError);
  });
});

describe("requireEncryptionOn", () => {
  it("passes when encryption is on", () => {
    vi.stubEnv("FLATPARE_ENCRYPTION", "on");
    expect(() => requireEncryptionOn()).not.toThrow();
  });

  it("throws ApiError 409 when encryption is off", () => {
    vi.stubEnv("FLATPARE_ENCRYPTION", "off");
    expect(() => requireEncryptionOn()).toThrow(ApiError);
    try {
      requireEncryptionOn();
    } catch (e) {
      expect((e as ApiError).status).toBe(409);
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/__tests__/api-route.test.ts`
Expected: FAIL — cannot find module `../api-error`.

- [ ] **Step 3: Implement `api-error.ts` and `api-route.ts`**

`src/lib/api-error.ts` (deliberately import-free so `household.ts`, `invitations.ts`, and `member-keys.ts` can all throw it without a cycle):

```ts
// An error that already knows which HTTP status it should become.
// Route handlers hand it to apiErrorResponse (src/lib/api-route.ts).
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}
```

`src/lib/api-route.ts`:

```ts
import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { ApiError } from "@/lib/api-error";
import { readEncryptionMode } from "@/lib/encryption-mode";
import { ForbiddenError, UnauthorizedError } from "@/lib/household";

// Single error → response mapping for the E2 route handlers. `tag` names the
// route in the 500 log line, e.g. "crypto:setup".
export function apiErrorResponse(err: unknown, tag: string): NextResponse {
  if (err instanceof UnauthorizedError) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (err instanceof ForbiddenError) {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
  if (err instanceof ApiError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      { error: "Invalid request body", issues: err.issues },
      { status: 400 }
    );
  }
  console.error(`[${tag}]`, err);
  return NextResponse.json({ error: "Internal error" }, { status: 500 });
}

// Parses JSON and validates it. Malformed JSON is a 400 via ApiError; a shape
// mismatch throws the ZodError so apiErrorResponse can include the issues.
export async function parseBody<T>(
  req: Request,
  schema: ZodType<T>
): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ApiError("Request body must be JSON", 400);
  }
  return schema.parse(raw);
}

// Every crypto write is meaningless in an encryption-off deployment; the
// client never calls them there, so a call is a bug or a probe.
export function requireEncryptionOn(): void {
  if (readEncryptionMode() === "off") {
    throw new ApiError("Encryption is off for this deployment", 409);
  }
}
```

- [ ] **Step 4: Run the api-route tests — expect PASS**

Run: `npx vitest run src/lib/__tests__/api-route.test.ts`

- [ ] **Step 5: Write the failing schema tests**

`src/lib/__tests__/crypto-schemas.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  setupSchema,
  wrapsSchema,
  changePassphraseSchema,
  recoverSchema,
} from "../crypto-schemas";

const kdf = { salt: "AAAA", memoryKib: 65536, iterations: 3, parallelism: 1, version: 1 };
const member = {
  publicKey: "AAAA",
  wrappedPrivateKey: "AAAA",
  privateKeyIv: "AAAA",
  kdf,
};
const recovery = { wrappedKey: "AAAA", iv: "AAAA", kdf };

describe("setupSchema", () => {
  it("accepts a member-only body", () => {
    expect(setupSchema.safeParse({ member }).success).toBe(true);
  });

  it("accepts a member + household body", () => {
    const r = setupSchema.safeParse({
      member,
      household: { wrappedKey: "AAAA", recovery },
    });
    expect(r.success).toBe(true);
  });

  it("rejects non-base64 material", () => {
    const r = setupSchema.safeParse({
      member: { ...member, publicKey: "not base64!" },
    });
    expect(r.success).toBe(false);
  });

  it("rejects KDF parameters outside the allowed range", () => {
    const r = setupSchema.safeParse({
      member: { ...member, kdf: { ...kdf, memoryKib: 16 } },
    });
    expect(r.success).toBe(false);
    const v = setupSchema.safeParse({
      member: { ...member, kdf: { ...kdf, version: 2 } },
    });
    expect(v.success).toBe(false);
  });
});

describe("wrapsSchema", () => {
  it("requires at least one wrap and at most 50", () => {
    expect(wrapsSchema.safeParse({ wraps: [] }).success).toBe(false);
    const many = Array.from({ length: 51 }, (_, i) => ({
      userId: `u${i}`,
      wrappedKey: "AAAA",
    }));
    expect(wrapsSchema.safeParse({ wraps: many }).success).toBe(false);
    expect(
      wrapsSchema.safeParse({ wraps: [{ userId: "u1", wrappedKey: "AAAA" }] })
        .success
    ).toBe(true);
  });
});

describe("changePassphraseSchema / recoverSchema", () => {
  it("accept well-formed bodies", () => {
    expect(
      changePassphraseSchema.safeParse({
        wrappedPrivateKey: "AAAA",
        privateKeyIv: "AAAA",
        kdf,
      }).success
    ).toBe(true);
    expect(
      recoverSchema.safeParse({ member, wrappedKey: "AAAA", recovery }).success
    ).toBe(true);
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run src/lib/__tests__/crypto-schemas.test.ts`
Expected: FAIL — cannot find module `../crypto-schemas`.

- [ ] **Step 7: Implement the schemas**

`src/lib/crypto-schemas.ts`:

```ts
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
    .array(z.object({ userId: z.string().min(1), wrappedKey: base64 }))
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

export type KdfParamsRow = z.infer<typeof kdfSchema>;
export type MemberKeyMaterial = z.infer<typeof memberKeySchema>;
export type RecoveryMaterial = z.infer<typeof recoverySchema>;
```

- [ ] **Step 8: Run the schema tests — expect PASS**

Run: `npx vitest run src/lib/__tests__/crypto-schemas.test.ts`

- [ ] **Step 9: Write the failing member-keys tests**

`src/lib/__tests__/member-keys.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import {
  households,
  householdMembers,
  householdKeyWraps,
  memberKeys,
} from "@/lib/db/schema";
import { users } from "@/lib/db/schema-auth";
import { eq } from "drizzle-orm";
import {
  CryptoStateError,
  fulfilWraps,
  getCryptoStatus,
  listPendingWraps,
  recoverHousehold,
  replaceMemberKeys,
  replaceRecovery,
  resetMemberKeys,
  setupMemberKeys,
} from "../member-keys";

const kdf = { salt: "AAAA", memoryKib: 65536, iterations: 3, parallelism: 1, version: 1 as const };
const member = (tag: string) => ({
  publicKey: `PUB${tag}`,
  wrappedPrivateKey: `PRIV${tag}`,
  privateKeyIv: "IVIV",
  kdf,
});
const recovery = { wrappedKey: "RECOV", iv: "RIV", kdf };

beforeEach(async () => {
  await db.delete(householdKeyWraps);
  await db.delete(memberKeys);
  await db.delete(householdMembers);
  await db.delete(households);
  await db.delete(users);
});

async function makeHousehold(ownerId: string, ...memberIds: string[]) {
  for (const id of [ownerId, ...memberIds]) {
    await db.insert(users).values({ id, email: `${id}@example.com`, name: id });
  }
  const [h] = await db
    .insert(households)
    .values({ name: "H", ownerId })
    .returning();
  await db
    .insert(householdMembers)
    .values({ householdId: h.id, userId: ownerId, role: "owner" });
  for (const id of memberIds) {
    await db
      .insert(householdMembers)
      .values({ householdId: h.id, userId: id, role: "member" });
  }
  return h.id;
}

describe("getCryptoStatus", () => {
  it("reports no keys, no wrap, no recovery on a fresh household", async () => {
    const hid = await makeHousehold("o");
    const s = await getCryptoStatus(hid, "o", "owner");
    expect(s).toEqual({
      userId: "o",
      householdId: hid,
      role: "owner",
      memberKeys: null,
      wrap: null,
      householdHasWraps: false,
      recovery: null,
    });
  });
});

describe("setupMemberKeys", () => {
  it("owner setup stores keys, the wrap, and the recovery kit", async () => {
    const hid = await makeHousehold("o");
    await setupMemberKeys({
      householdId: hid,
      userId: "o",
      role: "owner",
      member: member("o"),
      household: { wrappedKey: "WRAP_O", recovery },
    });

    const s = await getCryptoStatus(hid, "o", "owner");
    expect(s.memberKeys?.publicKey).toBe("PUBo");
    expect(s.memberKeys?.kdf).toEqual(kdf);
    expect(s.wrap).toBe("WRAP_O");
    expect(s.householdHasWraps).toBe(true);
    expect(s.recovery).toEqual(recovery);

    const [wrap] = await db
      .select()
      .from(householdKeyWraps)
      .where(eq(householdKeyWraps.userId, "o"));
    expect(wrap.wrappedBy).toBe("o");
  });

  it("member setup stores keys only", async () => {
    const hid = await makeHousehold("o", "m");
    await setupMemberKeys({
      householdId: hid,
      userId: "m",
      role: "member",
      member: member("m"),
    });
    const s = await getCryptoStatus(hid, "m", "member");
    expect(s.memberKeys?.publicKey).toBe("PUBm");
    expect(s.wrap).toBeNull();
    expect(s.householdHasWraps).toBe(false);
  });

  it("rejects a second setup with 409", async () => {
    const hid = await makeHousehold("o");
    const args = {
      householdId: hid,
      userId: "o",
      role: "owner" as const,
      member: member("o"),
      household: { wrappedKey: "WRAP_O", recovery },
    };
    await setupMemberKeys(args);
    await expect(setupMemberKeys(args)).rejects.toMatchObject({ status: 409 });
  });

  it("only the owner may create the household key (403)", async () => {
    const hid = await makeHousehold("o", "m");
    await expect(
      setupMemberKeys({
        householdId: hid,
        userId: "m",
        role: "member",
        member: member("m"),
        household: { wrappedKey: "X", recovery },
      })
    ).rejects.toMatchObject({ status: 403 });
  });

  it("refuses to create a second household key once wraps exist (409)", async () => {
    const hid = await makeHousehold("o");
    await setupMemberKeys({
      householdId: hid,
      userId: "o",
      role: "owner",
      member: member("o"),
      household: { wrappedKey: "WRAP_O", recovery },
    });
    // Simulate a second owner-like caller: same role, fresh user.
    await db.insert(users).values({ id: "o2", email: "o2@example.com" });
    await db
      .insert(householdMembers)
      .values({ householdId: hid, userId: "o2", role: "owner" });
    await expect(
      setupMemberKeys({
        householdId: hid,
        userId: "o2",
        role: "owner",
        member: member("o2"),
        household: { wrappedKey: "X", recovery },
      })
    ).rejects.toMatchObject({ status: 409 });
    // And the failure left no member_keys row behind.
    const rows = await db.select().from(memberKeys).where(eq(memberKeys.userId, "o2"));
    expect(rows).toHaveLength(0);
  });
});

describe("listPendingWraps / fulfilWraps", () => {
  async function seeded() {
    const hid = await makeHousehold("o", "m1", "m2");
    await setupMemberKeys({
      householdId: hid,
      userId: "o",
      role: "owner",
      member: member("o"),
      household: { wrappedKey: "WRAP_O", recovery },
    });
    await setupMemberKeys({ householdId: hid, userId: "m1", role: "member", member: member("m1") });
    return hid;
  }

  it("lists members who have keys but no wrap", async () => {
    const hid = await seeded();
    const pending = await listPendingWraps(hid);
    expect(pending).toEqual([
      { userId: "m1", name: "m1", email: "m1@example.com", publicKey: "PUBm1" },
    ]);
  });

  it("fulfils wraps atomically and records who wrapped", async () => {
    const hid = await seeded();
    const n = await fulfilWraps(hid, "o", [{ userId: "m1", wrappedKey: "WRAP_M1" }]);
    expect(n).toBe(1);
    const s = await getCryptoStatus(hid, "m1", "member");
    expect(s.wrap).toBe("WRAP_M1");
    const [row] = await db
      .select()
      .from(householdKeyWraps)
      .where(eq(householdKeyWraps.userId, "m1"));
    expect(row.wrappedBy).toBe("o");
    expect(await listPendingWraps(hid)).toEqual([]);
  });

  it("rejects a wrapper who holds no wrap (403)", async () => {
    const hid = await seeded();
    await expect(
      fulfilWraps(hid, "m1", [{ userId: "m1", wrappedKey: "X" }])
    ).rejects.toMatchObject({ status: 403 });
  });

  it("rejects a target that is not pending (400) and writes nothing", async () => {
    const hid = await seeded();
    await expect(
      fulfilWraps(hid, "o", [
        { userId: "m1", wrappedKey: "WRAP_M1" },
        { userId: "m2", wrappedKey: "X" }, // m2 has no keys yet
      ])
    ).rejects.toMatchObject({ status: 400 });
    const s = await getCryptoStatus(hid, "m1", "member");
    expect(s.wrap).toBeNull();
  });
});

describe("replaceMemberKeys / resetMemberKeys", () => {
  it("replaceMemberKeys swaps the wrapped private key and KDF params", async () => {
    const hid = await makeHousehold("o");
    await setupMemberKeys({
      householdId: hid,
      userId: "o",
      role: "owner",
      member: member("o"),
      household: { wrappedKey: "WRAP_O", recovery },
    });
    await replaceMemberKeys("o", {
      wrappedPrivateKey: "PRIV2",
      privateKeyIv: "IV2",
      kdf: { ...kdf, iterations: 4 },
    });
    const s = await getCryptoStatus(hid, "o", "owner");
    expect(s.memberKeys?.wrappedPrivateKey).toBe("PRIV2");
    expect(s.memberKeys?.publicKey).toBe("PUBo");
    expect(s.memberKeys?.kdf.iterations).toBe(4);
    expect(s.wrap).toBe("WRAP_O");
  });

  it("replaceMemberKeys without keys is 409", async () => {
    await makeHousehold("o");
    await expect(
      replaceMemberKeys("o", { wrappedPrivateKey: "P", privateKeyIv: "I", kdf })
    ).rejects.toMatchObject({ status: 409 });
  });

  it("resetMemberKeys replaces the keypair and drops the user's wrap", async () => {
    const hid = await makeHousehold("o", "m");
    await setupMemberKeys({
      householdId: hid,
      userId: "o",
      role: "owner",
      member: member("o"),
      household: { wrappedKey: "WRAP_O", recovery },
    });
    await setupMemberKeys({ householdId: hid, userId: "m", role: "member", member: member("m") });
    await fulfilWraps(hid, "o", [{ userId: "m", wrappedKey: "WRAP_M" }]);

    await resetMemberKeys(hid, "m", member("m-new"));
    const s = await getCryptoStatus(hid, "m", "member");
    expect(s.memberKeys?.publicKey).toBe("PUBm-new");
    expect(s.wrap).toBeNull();
    expect(await listPendingWraps(hid)).toEqual([
      { userId: "m", name: "m", email: "m@example.com", publicKey: "PUBm-new" },
    ]);
  });
});

describe("recoverHousehold / replaceRecovery", () => {
  it("recover installs new keys, a self-wrap, and a fresh kit", async () => {
    const hid = await makeHousehold("o");
    await setupMemberKeys({
      householdId: hid,
      userId: "o",
      role: "owner",
      member: member("o"),
      household: { wrappedKey: "WRAP_O", recovery },
    });
    const newRecovery = { wrappedKey: "RECOV2", iv: "RIV2", kdf };
    await recoverHousehold(hid, "o", {
      member: member("o-new"),
      wrappedKey: "WRAP_O2",
      recovery: newRecovery,
    });
    const s = await getCryptoStatus(hid, "o", "owner");
    expect(s.memberKeys?.publicKey).toBe("PUBo-new");
    expect(s.wrap).toBe("WRAP_O2");
    expect(s.recovery).toEqual(newRecovery);
  });

  it("recover without a kit is 409", async () => {
    const hid = await makeHousehold("o");
    await expect(
      recoverHousehold(hid, "o", { member: member("o"), wrappedKey: "W", recovery })
    ).rejects.toMatchObject({ status: 409 });
  });

  it("replaceRecovery overwrites the kit", async () => {
    const hid = await makeHousehold("o");
    await setupMemberKeys({
      householdId: hid,
      userId: "o",
      role: "owner",
      member: member("o"),
      household: { wrappedKey: "WRAP_O", recovery },
    });
    await replaceRecovery(hid, { wrappedKey: "R3", iv: "I3", kdf });
    const s = await getCryptoStatus(hid, "o", "owner");
    expect(s.recovery?.wrappedKey).toBe("R3");
  });
});

describe("CryptoStateError", () => {
  it("carries its status", () => {
    expect(new CryptoStateError("x", 409).status).toBe(409);
  });
});
```

- [ ] **Step 10: Run it to verify it fails**

Run: `npx vitest run src/lib/__tests__/member-keys.test.ts`
Expected: FAIL — cannot find module `../member-keys`.

- [ ] **Step 11: Implement `member-keys.ts`**

`src/lib/member-keys.ts`:

```ts
import { db } from "@/lib/db";
import {
  householdKeyWraps,
  householdMembers,
  households,
  memberKeys,
} from "@/lib/db/schema";
import { users } from "@/lib/db/schema-auth";
import { and, eq, isNull, sql } from "drizzle-orm";
import { ApiError } from "@/lib/api-error";
import type { Role } from "@/lib/household";
import type {
  KdfParamsRow,
  MemberKeyMaterial,
  RecoveryMaterial,
} from "@/lib/crypto-schemas";

export class CryptoStateError extends ApiError {
  constructor(message: string, status: 400 | 403 | 409) {
    super(message, status);
    this.name = "CryptoStateError";
  }
}

export interface CryptoStatus {
  userId: string;
  householdId: number;
  role: Role;
  memberKeys: MemberKeyMaterial | null;
  // This user's wrapped copy of the household data key, if any.
  wrap: string | null;
  // Whether anyone in the household holds a wrap — i.e. the data key exists.
  householdHasWraps: boolean;
  recovery: RecoveryMaterial | null;
}

export interface PendingWrap {
  userId: string;
  name: string | null;
  email: string;
  publicKey: string;
}

type Db = typeof db;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

function kdfFromRow(row: {
  kdfSalt: string;
  kdfMemoryKib: number;
  kdfIterations: number;
  kdfParallelism: number;
  kdfVersion: number;
}): KdfParamsRow {
  return {
    salt: row.kdfSalt,
    memoryKib: row.kdfMemoryKib,
    iterations: row.kdfIterations,
    parallelism: row.kdfParallelism,
    version: 1,
  };
}

async function loadMemberKeys(
  conn: Db | Tx,
  userId: string
): Promise<MemberKeyMaterial | null> {
  const [row] = await conn
    .select()
    .from(memberKeys)
    .where(eq(memberKeys.userId, userId))
    .limit(1);
  if (!row) return null;
  return {
    publicKey: row.publicKey,
    wrappedPrivateKey: row.wrappedPrivateKey,
    privateKeyIv: row.privateKeyIv,
    kdf: kdfFromRow(row),
  };
}

async function loadWrap(
  conn: Db | Tx,
  householdId: number,
  userId: string
): Promise<string | null> {
  const [row] = await conn
    .select({ wrappedKey: householdKeyWraps.wrappedKey })
    .from(householdKeyWraps)
    .where(
      and(
        eq(householdKeyWraps.householdId, householdId),
        eq(householdKeyWraps.userId, userId)
      )
    )
    .limit(1);
  return row?.wrappedKey ?? null;
}

async function countWraps(conn: Db | Tx, householdId: number): Promise<number> {
  const [row] = await conn
    .select({ n: sql<number>`count(*)` })
    .from(householdKeyWraps)
    .where(eq(householdKeyWraps.householdId, householdId));
  return Number(row?.n ?? 0);
}

async function loadRecovery(
  conn: Db | Tx,
  householdId: number
): Promise<RecoveryMaterial | null> {
  const [h] = await conn
    .select()
    .from(households)
    .where(eq(households.id, householdId))
    .limit(1);
  if (
    !h ||
    h.recoveryWrappedKey === null ||
    h.recoveryIv === null ||
    h.recoveryKdfSalt === null ||
    h.recoveryKdfMemoryKib === null ||
    h.recoveryKdfIterations === null ||
    h.recoveryKdfParallelism === null
  ) {
    return null;
  }
  return {
    wrappedKey: h.recoveryWrappedKey,
    iv: h.recoveryIv,
    kdf: {
      salt: h.recoveryKdfSalt,
      memoryKib: h.recoveryKdfMemoryKib,
      iterations: h.recoveryKdfIterations,
      parallelism: h.recoveryKdfParallelism,
      version: 1,
    },
  };
}

function memberKeyRow(userId: string, m: MemberKeyMaterial) {
  return {
    userId,
    publicKey: m.publicKey,
    wrappedPrivateKey: m.wrappedPrivateKey,
    privateKeyIv: m.privateKeyIv,
    kdfSalt: m.kdf.salt,
    kdfMemoryKib: m.kdf.memoryKib,
    kdfIterations: m.kdf.iterations,
    kdfParallelism: m.kdf.parallelism,
    kdfVersion: m.kdf.version,
  };
}

function recoveryColumns(r: RecoveryMaterial) {
  return {
    recoveryWrappedKey: r.wrappedKey,
    recoveryIv: r.iv,
    recoveryKdfSalt: r.kdf.salt,
    recoveryKdfMemoryKib: r.kdf.memoryKib,
    recoveryKdfIterations: r.kdf.iterations,
    recoveryKdfParallelism: r.kdf.parallelism,
    recoveryKdfVersion: r.kdf.version,
    recoveryCreatedAt: new Date(),
  };
}

export async function getCryptoStatus(
  householdId: number,
  userId: string,
  role: Role
): Promise<CryptoStatus> {
  const [keys, wrap, wrapCount, recovery] = await Promise.all([
    loadMemberKeys(db, userId),
    loadWrap(db, householdId, userId),
    countWraps(db, householdId),
    loadRecovery(db, householdId),
  ]);
  return {
    userId,
    householdId,
    role,
    memberKeys: keys,
    wrap,
    householdHasWraps: wrapCount > 0,
    recovery,
  };
}

// First-time setup on a device. `role` must come from assertMembership (the
// database), never from the JWT — see Global Constraints, session staleness.
export async function setupMemberKeys(args: {
  householdId: number;
  userId: string;
  role: Role;
  member: MemberKeyMaterial;
  household?: { wrappedKey: string; recovery: RecoveryMaterial };
}): Promise<void> {
  const { householdId, userId, role, member, household } = args;
  await db.transaction(async (tx) => {
    if (await loadMemberKeys(tx, userId)) {
      throw new CryptoStateError("Keys already exist for this user", 409);
    }
    if (household) {
      if (role !== "owner") {
        throw new CryptoStateError(
          "Only the owner can create the household key",
          403
        );
      }
      if ((await countWraps(tx, householdId)) > 0) {
        throw new CryptoStateError("The household key already exists", 409);
      }
    }
    await tx.insert(memberKeys).values(memberKeyRow(userId, member));
    if (household) {
      await tx.insert(householdKeyWraps).values({
        householdId,
        userId,
        wrappedKey: household.wrappedKey,
        wrappedBy: userId,
      });
      await tx
        .update(households)
        .set(recoveryColumns(household.recovery))
        .where(eq(households.id, householdId));
    }
  });
}

// Members who have published a public key but hold no wrap yet.
export async function listPendingWraps(
  householdId: number
): Promise<PendingWrap[]> {
  const rows = await db
    .select({
      userId: memberKeys.userId,
      name: users.name,
      email: users.email,
      publicKey: memberKeys.publicKey,
    })
    .from(householdMembers)
    .innerJoin(memberKeys, eq(memberKeys.userId, householdMembers.userId))
    .innerJoin(users, eq(users.id, householdMembers.userId))
    .leftJoin(
      householdKeyWraps,
      and(
        eq(householdKeyWraps.householdId, householdMembers.householdId),
        eq(householdKeyWraps.userId, householdMembers.userId)
      )
    )
    .where(
      and(
        eq(householdMembers.householdId, householdId),
        isNull(householdKeyWraps.userId)
      )
    )
    .orderBy(householdMembers.createdAt);
  return rows;
}

// A member who already holds a wrap (and therefore the data key) publishes
// wraps for pending members. All-or-nothing: one bad target rejects the batch.
export async function fulfilWraps(
  householdId: number,
  byUserId: string,
  wraps: { userId: string; wrappedKey: string }[]
): Promise<number> {
  return db.transaction(async (tx) => {
    if (!(await loadWrap(tx, householdId, byUserId))) {
      throw new CryptoStateError("You do not hold the household key", 403);
    }
    const pending = new Set(
      (
        await tx
          .select({ userId: memberKeys.userId })
          .from(householdMembers)
          .innerJoin(memberKeys, eq(memberKeys.userId, householdMembers.userId))
          .leftJoin(
            householdKeyWraps,
            and(
              eq(householdKeyWraps.householdId, householdMembers.householdId),
              eq(householdKeyWraps.userId, householdMembers.userId)
            )
          )
          .where(
            and(
              eq(householdMembers.householdId, householdId),
              isNull(householdKeyWraps.userId)
            )
          )
      ).map((r) => r.userId)
    );
    for (const w of wraps) {
      if (!pending.has(w.userId)) {
        throw new CryptoStateError(
          `User ${w.userId} is not awaiting a wrap`,
          400
        );
      }
    }
    for (const w of wraps) {
      await tx.insert(householdKeyWraps).values({
        householdId,
        userId: w.userId,
        wrappedKey: w.wrappedKey,
        wrappedBy: byUserId,
      });
    }
    return wraps.length;
  });
}

// Passphrase change: same keypair, re-wrapped private key.
export async function replaceMemberKeys(
  userId: string,
  next: { wrappedPrivateKey: string; privateKeyIv: string; kdf: KdfParamsRow }
): Promise<void> {
  const updated = await db
    .update(memberKeys)
    .set({
      wrappedPrivateKey: next.wrappedPrivateKey,
      privateKeyIv: next.privateKeyIv,
      kdfSalt: next.kdf.salt,
      kdfMemoryKib: next.kdf.memoryKib,
      kdfIterations: next.kdf.iterations,
      kdfParallelism: next.kdf.parallelism,
      kdfVersion: next.kdf.version,
      updatedAt: new Date(),
    })
    .where(eq(memberKeys.userId, userId))
    .returning({ userId: memberKeys.userId });
  if (updated.length === 0) {
    throw new CryptoStateError("No keys to replace", 409);
  }
}

// Forgotten passphrase, no recovery: a brand-new keypair. The old wrap is
// useless (nobody can open it), so it is dropped and the user becomes
// pending again for another member to re-wrap.
export async function resetMemberKeys(
  householdId: number,
  userId: string,
  member: MemberKeyMaterial
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .delete(householdKeyWraps)
      .where(
        and(
          eq(householdKeyWraps.householdId, householdId),
          eq(householdKeyWraps.userId, userId)
        )
      );
    await tx
      .insert(memberKeys)
      .values(memberKeyRow(userId, member))
      .onConflictDoUpdate({
        target: memberKeys.userId,
        set: { ...memberKeyRow(userId, member), updatedAt: new Date() },
      });
  });
}

// Recovery-code path: the client unwrapped the data key from the kit,
// generated a fresh keypair, wrapped the data key to it, and made a new kit.
export async function recoverHousehold(
  householdId: number,
  userId: string,
  args: {
    member: MemberKeyMaterial;
    wrappedKey: string;
    recovery: RecoveryMaterial;
  }
): Promise<void> {
  await db.transaction(async (tx) => {
    if (!(await loadRecovery(tx, householdId))) {
      throw new CryptoStateError("This household has no recovery kit", 409);
    }
    await tx
      .insert(memberKeys)
      .values(memberKeyRow(userId, args.member))
      .onConflictDoUpdate({
        target: memberKeys.userId,
        set: { ...memberKeyRow(userId, args.member), updatedAt: new Date() },
      });
    await tx
      .insert(householdKeyWraps)
      .values({
        householdId,
        userId,
        wrappedKey: args.wrappedKey,
        wrappedBy: userId,
      })
      .onConflictDoUpdate({
        target: [householdKeyWraps.householdId, householdKeyWraps.userId],
        set: { wrappedKey: args.wrappedKey, wrappedBy: userId },
      });
    await tx
      .update(households)
      .set(recoveryColumns(args.recovery))
      .where(eq(households.id, householdId));
  });
}

export async function replaceRecovery(
  householdId: number,
  recovery: RecoveryMaterial
): Promise<void> {
  await db
    .update(households)
    .set(recoveryColumns(recovery))
    .where(eq(households.id, householdId));
}
```

- [ ] **Step 12: Run the member-keys tests — expect PASS**

Run: `npx vitest run src/lib/__tests__/member-keys.test.ts`

If `db.transaction` rejects with "Transactions are not supported" the libSQL driver is in HTTP mode — it is not, for `file:` URLs, but if it happens, check `LOCAL_DB_URL` in `src/test-global-setup.ts` is the `file:./data/test.db` default.

- [ ] **Step 13: Lint, typecheck, full test run, commit**

Run: `npm run lint && npm run typecheck && npm test`

```bash
git add src/lib/api-error.ts src/lib/api-route.ts src/lib/crypto-schemas.ts src/lib/member-keys.ts src/lib/__tests__/api-route.test.ts src/lib/__tests__/crypto-schemas.test.ts src/lib/__tests__/member-keys.test.ts
git commit -m "feat(crypto): server store for member keys, wraps, and recovery kit (#184)"
```

---
### Task 6: Crypto route handlers

**Files:**
- Create: `src/app/api/crypto/status/route.ts`
- Create: `src/app/api/crypto/setup/route.ts`
- Create: `src/app/api/crypto/pending-wraps/route.ts`
- Create: `src/app/api/crypto/wraps/route.ts`
- Create: `src/app/api/crypto/member-keys/route.ts`
- Create: `src/app/api/crypto/member-keys/reset/route.ts`
- Create: `src/app/api/crypto/recover/route.ts`
- Create: `src/app/api/crypto/recovery/route.ts`
- Test: `src/app/api/crypto/__tests__/crypto-routes.test.ts`

**Interfaces:**
- Consumes: everything Task 5 produces; `requireHousehold()` from `@/lib/session`; `assertMembership` from `@/lib/household`; `readEncryptionMode` (Task 1).
- Produces the HTTP contract the client flows (Task 9) call:
  - `GET /api/crypto/status` → `200 { mode: "on"|"off", userId, householdId, role, memberKeys, wrap, householdHasWraps, recovery }` (a `CryptoStatus` plus `mode`). Works in off mode.
  - `POST /api/crypto/setup` body `setupSchema` → `201 {}`.
  - `GET /api/crypto/pending-wraps` → `200 { pending: PendingWrap[] }`.
  - `POST /api/crypto/wraps` body `wrapsSchema` → `200 { fulfilled: number }`.
  - `PUT /api/crypto/member-keys` body `changePassphraseSchema` → `200 {}`.
  - `POST /api/crypto/member-keys/reset` body `memberKeySchema` → `200 {}`.
  - `POST /api/crypto/recover` body `recoverSchema` → `200 {}`.
  - `PUT /api/crypto/recovery` body `recoverySchema` → `200 {}` (owner only, 403 otherwise).
  - Every route except `status` returns `409 { error: "Encryption is off for this deployment" }` when `FLATPARE_ENCRYPTION=off`.

Every handler has the same shape: `requireHousehold()` → `requireEncryptionOn()` → `assertMembership(householdId, userId)` (the DB role, never the token's) → `parseBody` → library call → `NextResponse.json`. Errors go through `apiErrorResponse`.

- [ ] **Step 1: Write the failing route tests**

`src/app/api/crypto/__tests__/crypto-routes.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { db } from "@/lib/db";
import {
  households,
  householdMembers,
  householdKeyWraps,
  memberKeys,
} from "@/lib/db/schema";
import { users } from "@/lib/db/schema-auth";

const currentSession = { householdId: 0, userId: "", role: "owner" as "owner" | "member" };

vi.mock("@/lib/session", () => ({
  requireHousehold: vi.fn(async () => ({ ...currentSession })),
}));

import { GET as statusGET } from "../status/route";
import { POST as setupPOST } from "../setup/route";
import { GET as pendingGET } from "../pending-wraps/route";
import { POST as wrapsPOST } from "../wraps/route";
import { PUT as memberKeysPUT } from "../member-keys/route";
import { POST as resetPOST } from "../member-keys/reset/route";
import { POST as recoverPOST } from "../recover/route";
import { PUT as recoveryPUT } from "../recovery/route";

const kdf = { salt: "AAAA", memoryKib: 65536, iterations: 3, parallelism: 1, version: 1 };
const member = (tag: string) => ({
  publicKey: `PUB${tag}`,
  wrappedPrivateKey: `PRIV${tag}`,
  privateKeyIv: "IVIV",
  kdf,
});
const recovery = { wrappedKey: "RECOV", iv: "RIV", kdf };

function post(body: unknown) {
  return new Request("http://localhost/api/crypto/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function as(userId: string, role: "owner" | "member", householdId: number) {
  currentSession.userId = userId;
  currentSession.role = role;
  currentSession.householdId = householdId;
}

let hid: number;

beforeEach(async () => {
  vi.stubEnv("FLATPARE_ENCRYPTION", "on");
  await db.delete(householdKeyWraps);
  await db.delete(memberKeys);
  await db.delete(householdMembers);
  await db.delete(households);
  await db.delete(users);
  for (const id of ["o", "m"]) {
    await db.insert(users).values({ id, email: `${id}@example.com`, name: id });
  }
  const [h] = await db.insert(households).values({ name: "H", ownerId: "o" }).returning();
  hid = h.id;
  await db.insert(householdMembers).values({ householdId: hid, userId: "o", role: "owner" });
  await db.insert(householdMembers).values({ householdId: hid, userId: "m", role: "member" });
});

afterEach(() => vi.unstubAllEnvs());

async function ownerSetup() {
  await as("o", "owner", hid);
  const res = await setupPOST(
    post({ member: member("o"), household: { wrappedKey: "WRAP_O", recovery } })
  );
  expect(res.status).toBe(201);
}

describe("GET /api/crypto/status", () => {
  it("returns the mode and a fresh status", async () => {
    await as("o", "owner", hid);
    const res = await statusGET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mode).toBe("on");
    expect(body.memberKeys).toBeNull();
    expect(body.householdHasWraps).toBe(false);
  });

  it("still answers when encryption is off", async () => {
    vi.stubEnv("FLATPARE_ENCRYPTION", "off");
    await as("o", "owner", hid);
    const res = await statusGET();
    expect(res.status).toBe(200);
    expect((await res.json()).mode).toBe("off");
  });

  it("401 without a session", async () => {
    await as("", "owner", hid);
    const { requireHousehold } = await import("@/lib/session");
    const { UnauthorizedError } = await import("@/lib/household");
    vi.mocked(requireHousehold).mockRejectedValueOnce(new UnauthorizedError());
    const res = await statusGET();
    expect(res.status).toBe(401);
  });
});

describe("POST /api/crypto/setup", () => {
  it("owner creates keys + household key; member creates keys only", async () => {
    await ownerSetup();
    await as("m", "member", hid);
    const res = await setupPOST(post({ member: member("m") }));
    expect(res.status).toBe(201);
    const status = await (await statusGET()).json();
    expect(status.memberKeys.publicKey).toBe("PUBm");
    expect(status.wrap).toBeNull();
    expect(status.householdHasWraps).toBe(true);
  });

  it("400 on an invalid body", async () => {
    await as("o", "owner", hid);
    const res = await setupPOST(post({ member: { publicKey: "!!" } }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid request body");
  });

  it("409 when encryption is off", async () => {
    vi.stubEnv("FLATPARE_ENCRYPTION", "off");
    await as("o", "owner", hid);
    const res = await setupPOST(post({ member: member("o") }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("Encryption is off for this deployment");
  });

  it("uses the database role, not the token's", async () => {
    // Token claims owner, DB says member → household key creation is 403.
    await as("m", "owner", hid);
    const res = await setupPOST(
      post({ member: member("m"), household: { wrappedKey: "X", recovery } })
    );
    expect(res.status).toBe(403);
  });

  it("403 when the token's household no longer contains the user", async () => {
    await db.delete(householdMembers).where(
      (await import("drizzle-orm")).eq(householdMembers.userId, "m")
    );
    await as("m", "member", hid);
    const res = await setupPOST(post({ member: member("m") }));
    expect(res.status).toBe(403);
  });
});

describe("pending-wraps + wraps", () => {
  it("lists pending members and lets a key holder fulfil them", async () => {
    await ownerSetup();
    await as("m", "member", hid);
    await setupPOST(post({ member: member("m") }));

    await as("o", "owner", hid);
    const pending = await (await pendingGET()).json();
    expect(pending.pending).toEqual([
      { userId: "m", name: "m", email: "m@example.com", publicKey: "PUBm" },
    ]);

    const res = await wrapsPOST(post({ wraps: [{ userId: "m", wrappedKey: "WRAP_M" }] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ fulfilled: 1 });

    await as("m", "member", hid);
    expect((await (await statusGET()).json()).wrap).toBe("WRAP_M");
  });

  it("403 when the caller holds no wrap", async () => {
    await ownerSetup();
    await as("m", "member", hid);
    await setupPOST(post({ member: member("m") }));
    const res = await wrapsPOST(post({ wraps: [{ userId: "m", wrappedKey: "X" }] }));
    expect(res.status).toBe(403);
  });
});

describe("PUT /api/crypto/member-keys and reset", () => {
  it("replaces the wrapped private key", async () => {
    await ownerSetup();
    const res = await memberKeysPUT(
      new Request("http://localhost/api/crypto/member-keys", {
        method: "PUT",
        body: JSON.stringify({ wrappedPrivateKey: "P2", privateKeyIv: "I2", kdf }),
      })
    );
    expect(res.status).toBe(200);
    expect((await (await statusGET()).json()).memberKeys.wrappedPrivateKey).toBe("P2");
  });

  it("reset installs a new keypair and drops the wrap", async () => {
    await ownerSetup();
    const res = await resetPOST(post(member("o2")));
    expect(res.status).toBe(200);
    const status = await (await statusGET()).json();
    expect(status.memberKeys.publicKey).toBe("PUBo2");
    expect(status.wrap).toBeNull();
  });
});

describe("recover + recovery", () => {
  it("recover reinstalls keys, wrap, and kit", async () => {
    await ownerSetup();
    const res = await recoverPOST(
      post({
        member: member("o3"),
        wrappedKey: "WRAP_O3",
        recovery: { wrappedKey: "R2", iv: "I2", kdf },
      })
    );
    expect(res.status).toBe(200);
    const status = await (await statusGET()).json();
    expect(status.memberKeys.publicKey).toBe("PUBo3");
    expect(status.wrap).toBe("WRAP_O3");
    expect(status.recovery.wrappedKey).toBe("R2");
  });

  it("recovery PUT is owner-only", async () => {
    await ownerSetup();
    await as("m", "member", hid);
    const forbidden = await recoveryPUT(
      new Request("http://localhost/api/crypto/recovery", {
        method: "PUT",
        body: JSON.stringify({ wrappedKey: "R3", iv: "I3", kdf }),
      })
    );
    expect(forbidden.status).toBe(403);

    await as("o", "owner", hid);
    const ok = await recoveryPUT(
      new Request("http://localhost/api/crypto/recovery", {
        method: "PUT",
        body: JSON.stringify({ wrappedKey: "R3", iv: "I3", kdf }),
      })
    );
    expect(ok.status).toBe(200);
    expect((await (await statusGET()).json()).recovery.wrappedKey).toBe("R3");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/app/api/crypto/__tests__/crypto-routes.test.ts`
Expected: FAIL — cannot find module `../status/route`.

- [ ] **Step 3: Implement the eight handlers**

`src/app/api/crypto/status/route.ts`:

```ts
import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-route";
import { readEncryptionMode } from "@/lib/encryption-mode";
import { assertMembership } from "@/lib/household";
import { getCryptoStatus } from "@/lib/member-keys";
import { requireHousehold } from "@/lib/session";

export async function GET() {
  try {
    const { householdId, userId } = await requireHousehold();
    const role = await assertMembership(householdId, userId);
    const status = await getCryptoStatus(householdId, userId, role);
    return NextResponse.json({ mode: readEncryptionMode(), ...status });
  } catch (e) {
    return apiErrorResponse(e, "crypto:status");
  }
}
```

`src/app/api/crypto/setup/route.ts`:

```ts
import { NextResponse } from "next/server";
import { apiErrorResponse, parseBody, requireEncryptionOn } from "@/lib/api-route";
import { setupSchema } from "@/lib/crypto-schemas";
import { assertMembership } from "@/lib/household";
import { setupMemberKeys } from "@/lib/member-keys";
import { requireHousehold } from "@/lib/session";

export async function POST(req: Request) {
  try {
    const { householdId, userId } = await requireHousehold();
    requireEncryptionOn();
    const role = await assertMembership(householdId, userId);
    const body = await parseBody(req, setupSchema);
    await setupMemberKeys({ householdId, userId, role, ...body });
    return NextResponse.json({}, { status: 201 });
  } catch (e) {
    return apiErrorResponse(e, "crypto:setup");
  }
}
```

`src/app/api/crypto/pending-wraps/route.ts`:

```ts
import { NextResponse } from "next/server";
import { apiErrorResponse, requireEncryptionOn } from "@/lib/api-route";
import { assertMembership } from "@/lib/household";
import { listPendingWraps } from "@/lib/member-keys";
import { requireHousehold } from "@/lib/session";

export async function GET() {
  try {
    const { householdId, userId } = await requireHousehold();
    requireEncryptionOn();
    await assertMembership(householdId, userId);
    return NextResponse.json({ pending: await listPendingWraps(householdId) });
  } catch (e) {
    return apiErrorResponse(e, "crypto:pending-wraps");
  }
}
```

`src/app/api/crypto/wraps/route.ts`:

```ts
import { NextResponse } from "next/server";
import { apiErrorResponse, parseBody, requireEncryptionOn } from "@/lib/api-route";
import { wrapsSchema } from "@/lib/crypto-schemas";
import { assertMembership } from "@/lib/household";
import { fulfilWraps } from "@/lib/member-keys";
import { requireHousehold } from "@/lib/session";

export async function POST(req: Request) {
  try {
    const { householdId, userId } = await requireHousehold();
    requireEncryptionOn();
    await assertMembership(householdId, userId);
    const { wraps } = await parseBody(req, wrapsSchema);
    const fulfilled = await fulfilWraps(householdId, userId, wraps);
    return NextResponse.json({ fulfilled });
  } catch (e) {
    return apiErrorResponse(e, "crypto:wraps");
  }
}
```

`src/app/api/crypto/member-keys/route.ts`:

```ts
import { NextResponse } from "next/server";
import { apiErrorResponse, parseBody, requireEncryptionOn } from "@/lib/api-route";
import { changePassphraseSchema } from "@/lib/crypto-schemas";
import { assertMembership } from "@/lib/household";
import { replaceMemberKeys } from "@/lib/member-keys";
import { requireHousehold } from "@/lib/session";

export async function PUT(req: Request) {
  try {
    const { householdId, userId } = await requireHousehold();
    requireEncryptionOn();
    await assertMembership(householdId, userId);
    const body = await parseBody(req, changePassphraseSchema);
    await replaceMemberKeys(userId, body);
    return NextResponse.json({});
  } catch (e) {
    return apiErrorResponse(e, "crypto:member-keys");
  }
}
```

`src/app/api/crypto/member-keys/reset/route.ts`:

```ts
import { NextResponse } from "next/server";
import { apiErrorResponse, parseBody, requireEncryptionOn } from "@/lib/api-route";
import { memberKeySchema } from "@/lib/crypto-schemas";
import { assertMembership } from "@/lib/household";
import { resetMemberKeys } from "@/lib/member-keys";
import { requireHousehold } from "@/lib/session";

export async function POST(req: Request) {
  try {
    const { householdId, userId } = await requireHousehold();
    requireEncryptionOn();
    await assertMembership(householdId, userId);
    const member = await parseBody(req, memberKeySchema);
    await resetMemberKeys(householdId, userId, member);
    return NextResponse.json({});
  } catch (e) {
    return apiErrorResponse(e, "crypto:member-keys:reset");
  }
}
```

`src/app/api/crypto/recover/route.ts`:

```ts
import { NextResponse } from "next/server";
import { apiErrorResponse, parseBody, requireEncryptionOn } from "@/lib/api-route";
import { recoverSchema } from "@/lib/crypto-schemas";
import { assertMembership } from "@/lib/household";
import { recoverHousehold } from "@/lib/member-keys";
import { requireHousehold } from "@/lib/session";

export async function POST(req: Request) {
  try {
    const { householdId, userId } = await requireHousehold();
    requireEncryptionOn();
    await assertMembership(householdId, userId);
    const body = await parseBody(req, recoverSchema);
    await recoverHousehold(householdId, userId, body);
    return NextResponse.json({});
  } catch (e) {
    return apiErrorResponse(e, "crypto:recover");
  }
}
```

`src/app/api/crypto/recovery/route.ts`:

```ts
import { NextResponse } from "next/server";
import { ApiError } from "@/lib/api-error";
import { apiErrorResponse, parseBody, requireEncryptionOn } from "@/lib/api-route";
import { recoverySchema } from "@/lib/crypto-schemas";
import { assertMembership } from "@/lib/household";
import { replaceRecovery } from "@/lib/member-keys";
import { requireHousehold } from "@/lib/session";

export async function PUT(req: Request) {
  try {
    const { householdId, userId } = await requireHousehold();
    requireEncryptionOn();
    const role = await assertMembership(householdId, userId);
    if (role !== "owner") {
      throw new ApiError("Only the owner can regenerate the recovery kit", 403);
    }
    const body = await parseBody(req, recoverySchema);
    await replaceRecovery(householdId, body);
    return NextResponse.json({});
  } catch (e) {
    return apiErrorResponse(e, "crypto:recovery");
  }
}
```

- [ ] **Step 4: Run the route tests — expect PASS**

Run: `npx vitest run src/app/api/crypto/__tests__/crypto-routes.test.ts`

- [ ] **Step 5: Lint, typecheck, full test run, commit**

Run: `npm run lint && npm run typecheck && npm test`

```bash
git add src/app/api/crypto
git commit -m "feat(crypto): /api/crypto route handlers (#184)"
```

---
### Task 7: Household members and the invitation lifecycle (server library)

**Files:**
- Modify: `src/lib/household.ts`
- Create: `src/lib/invitations.ts`
- Modify: `src/auth.ts:109-125` (callbacks only), `src/types/next-auth.d.ts`
- Modify: `src/lib/__tests__/household.test.ts`
- Test: `src/lib/__tests__/invitations.test.ts`

**Interfaces:**
- Consumes: `ApiError` (Task 5); tables `invitations`, `householdKeyWraps`, `memberKeys`, `apartments`, `locationsOfInterest`, `apartmentDistances`, `ratings` (Task 1 + existing).
- Produces:
  - `household.ts`: `class HouseholdError extends ApiError`; `createHouseholdForUser(userId): Promise<number>`; **changed signature** `resolveHouseholdForUser(userId): Promise<number | null>` (null while a pending, unexpired invitation matches the user's email and they are in no household); `interface MemberSummary { userId; name: string | null; email; role: Role; hasWrap: boolean }`; `listMembers(householdId): Promise<MemberSummary[]>`; `removeMember(householdId, actorUserId, targetUserId): Promise<void>`.
  - `invitations.ts`: `INVITATION_TTL_MS`; `class InvitationError extends ApiError`; `normalizeEmail(raw): string`; `createInvitation(householdId, invitedBy, rawEmail): Promise<Invitation>`; `listInvitations(householdId): Promise<Invitation[]>` (pending only, lazily expiring); `revokeInvitation(householdId, id): Promise<void>`; `interface PendingInvitationForUser { id; householdName; invitedByName: string | null; expiresAt: Date }`; `pendingInvitationsForUser(userId): Promise<PendingInvitationForUser[]>`; `acceptInvitation(id, userId): Promise<number>` (returns the joined household id); `startOwnHousehold(userId): Promise<number>`.

Dependency direction: `invitations.ts` imports from `household.ts`; `household.ts` queries the `invitations` table directly (schema only) and never imports `invitations.ts`. That keeps `src/lib` acyclic at file level.

- [ ] **Step 1: Update the existing household tests for the nullable return**

In `src/lib/__tests__/household.test.ts`, replace the whole file with:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import {
  households,
  householdMembers,
  householdKeyWraps,
  invitations,
  memberKeys,
} from "@/lib/db/schema";
import { users } from "@/lib/db/schema-auth";
import { eq } from "drizzle-orm";
import {
  resolveHouseholdForUser,
  createHouseholdForUser,
  assertMembership,
  listMembers,
  removeMember,
  ForbiddenError,
  HouseholdError,
} from "../household";

beforeEach(async () => {
  await db.delete(invitations);
  await db.delete(householdKeyWraps);
  await db.delete(memberKeys);
  await db.delete(householdMembers);
  await db.delete(households);
  await db.delete(users);
});

async function makeUser(id: string) {
  await db.insert(users).values({ id, email: `${id}@example.com`, name: id });
}

describe("resolveHouseholdForUser", () => {
  it("creates a household and makes the first user its owner", async () => {
    await makeUser("u1");
    const id = await resolveHouseholdForUser("u1");
    expect(id).not.toBeNull();

    const [h] = await db.select().from(households).where(eq(households.id, id!));
    expect(h.ownerId).toBe("u1");

    const members = await db
      .select()
      .from(householdMembers)
      .where(eq(householdMembers.householdId, id!));
    expect(members).toHaveLength(1);
    expect(members[0].role).toBe("owner");
  });

  it("reuses the household on a second sign-in", async () => {
    await makeUser("u1");
    const first = await resolveHouseholdForUser("u1");
    const second = await resolveHouseholdForUser("u1");
    expect(second).toBe(first);
    expect(await db.select().from(households)).toHaveLength(1);
  });

  it("does not create a second household for an invited member", async () => {
    await makeUser("owner");
    await makeUser("invitee");
    const id = (await resolveHouseholdForUser("owner"))!;
    await db
      .insert(householdMembers)
      .values({ householdId: id, userId: "invitee", role: "member" });

    expect(await resolveHouseholdForUser("invitee")).toBe(id);
    expect(await db.select().from(households)).toHaveLength(1);
  });

  it("returns null instead of creating when a pending invitation matches the email", async () => {
    await makeUser("owner");
    await makeUser("invitee");
    const id = (await resolveHouseholdForUser("owner"))!;
    await db.insert(invitations).values({
      householdId: id,
      email: "invitee@example.com",
      invitedBy: "owner",
      expiresAt: new Date(Date.now() + 60_000),
    });

    expect(await resolveHouseholdForUser("invitee")).toBeNull();
    expect(await db.select().from(households)).toHaveLength(1);
  });

  it("ignores expired and non-pending invitations", async () => {
    await makeUser("owner");
    await makeUser("invitee");
    const id = (await resolveHouseholdForUser("owner"))!;
    await db.insert(invitations).values({
      householdId: id,
      email: "invitee@example.com",
      invitedBy: "owner",
      expiresAt: new Date(Date.now() - 1),
    });
    await db.insert(invitations).values({
      householdId: id,
      email: "invitee@example.com",
      invitedBy: "owner",
      status: "revoked",
      expiresAt: new Date(Date.now() + 60_000),
    });

    expect(await resolveHouseholdForUser("invitee")).not.toBeNull();
    expect(await db.select().from(households)).toHaveLength(2);
  });
});

describe("createHouseholdForUser", () => {
  it("creates an owned household", async () => {
    await makeUser("u1");
    const id = await createHouseholdForUser("u1");
    expect(await assertMembership(id, "u1")).toBe("owner");
  });
});

describe("assertMembership", () => {
  it("returns the role for a member", async () => {
    await makeUser("u1");
    const id = (await resolveHouseholdForUser("u1"))!;
    expect(await assertMembership(id, "u1")).toBe("owner");
  });

  it("throws for a non-member — this is the cross-tenant guard", async () => {
    await makeUser("u1");
    await makeUser("outsider");
    const id = (await resolveHouseholdForUser("u1"))!;
    await expect(assertMembership(id, "outsider")).rejects.toBeInstanceOf(
      ForbiddenError
    );
  });
});

describe("listMembers / removeMember", () => {
  async function seeded() {
    await makeUser("o");
    await makeUser("m");
    await makeUser("x");
    const id = await createHouseholdForUser("o");
    await db
      .insert(householdMembers)
      .values({ householdId: id, userId: "m", role: "member" });
    await db.insert(householdKeyWraps).values({
      householdId: id,
      userId: "o",
      wrappedKey: "W",
      wrappedBy: "o",
    });
    return id;
  }

  it("lists members with their wrap state, owner first", async () => {
    const id = await seeded();
    expect(await listMembers(id)).toEqual([
      { userId: "o", name: "o", email: "o@example.com", role: "owner", hasWrap: true },
      { userId: "m", name: "m", email: "m@example.com", role: "member", hasWrap: false },
    ]);
  });

  it("owner removes a member and their wrap", async () => {
    const id = await seeded();
    await db.insert(householdKeyWraps).values({
      householdId: id,
      userId: "m",
      wrappedKey: "W2",
      wrappedBy: "o",
    });
    await removeMember(id, "o", "m");
    expect((await listMembers(id)).map((m) => m.userId)).toEqual(["o"]);
    expect(
      await db.select().from(householdKeyWraps).where(eq(householdKeyWraps.userId, "m"))
    ).toHaveLength(0);
  });

  it("a member cannot remove anyone (403)", async () => {
    const id = await seeded();
    await expect(removeMember(id, "m", "o")).rejects.toMatchObject({ status: 403 });
  });

  it("the owner cannot remove themselves (400)", async () => {
    const id = await seeded();
    await expect(removeMember(id, "o", "o")).rejects.toMatchObject({ status: 400 });
  });

  it("removing a non-member is 404", async () => {
    const id = await seeded();
    await expect(removeMember(id, "o", "x")).rejects.toBeInstanceOf(HouseholdError);
    await expect(removeMember(id, "o", "x")).rejects.toMatchObject({ status: 404 });
  });

  it("an outsider acting as owner is rejected by the membership check", async () => {
    const id = await seeded();
    await expect(removeMember(id, "x", "m")).rejects.toBeInstanceOf(ForbiddenError);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/__tests__/household.test.ts`
Expected: FAIL — `createHouseholdForUser` / `listMembers` / `removeMember` / `HouseholdError` are not exported.

- [ ] **Step 3: Extend `household.ts`**

Replace `src/lib/household.ts` with:

```ts
import { db } from "@/lib/db";
import {
  households,
  householdMembers,
  householdKeyWraps,
  invitations,
} from "@/lib/db/schema";
import { users } from "@/lib/db/schema-auth";
import { and, eq, gt } from "drizzle-orm";
import { ApiError } from "@/lib/api-error";

export class UnauthorizedError extends Error {
  constructor() {
    super("Not authenticated");
  }
}

export class ForbiddenError extends Error {
  constructor() {
    super("Not a member of this household");
  }
}

export class HouseholdError extends ApiError {
  constructor(message: string, status: 400 | 403 | 404 | 409) {
    super(message, status);
    this.name = "HouseholdError";
  }
}

export type Role = "owner" | "member";

export interface MemberSummary {
  userId: string;
  name: string | null;
  email: string;
  role: Role;
  hasWrap: boolean;
}

export async function createHouseholdForUser(userId: string): Promise<number> {
  const [created] = await db
    .insert(households)
    .values({ name: "My household", ownerId: userId })
    .returning();

  await db
    .insert(householdMembers)
    .values({ householdId: created.id, userId, role: "owner" });

  return created.id;
}

// Returns the user's household, creating one on first sign-in — unless a
// pending invitation is waiting for their email, in which case it returns
// null so the sign-in flow can send them to /invitations to choose.
export async function resolveHouseholdForUser(
  userId: string
): Promise<number | null> {
  const existing = await db
    .select({ householdId: householdMembers.householdId })
    .from(householdMembers)
    .where(eq(householdMembers.userId, userId))
    .limit(1);

  if (existing.length > 0) return existing[0].householdId;

  const [user] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (user) {
    const pending = await db
      .select({ id: invitations.id })
      .from(invitations)
      .where(
        and(
          eq(invitations.email, user.email.trim().toLowerCase()),
          eq(invitations.status, "pending"),
          gt(invitations.expiresAt, new Date())
        )
      )
      .limit(1);
    if (pending.length > 0) return null;
  }

  return createHouseholdForUser(userId);
}

// Reads the database rather than trusting the JWT. Call this from every
// destructive or membership-changing operation: a JWT stays valid for up to
// its 24h lifetime, so a removed member's token still carries a householdId.
export async function assertMembership(
  householdId: number,
  userId: string
): Promise<Role> {
  const rows = await db
    .select({ role: householdMembers.role })
    .from(householdMembers)
    .where(
      and(
        eq(householdMembers.householdId, householdId),
        eq(householdMembers.userId, userId)
      )
    )
    .limit(1);

  if (rows.length === 0) throw new ForbiddenError();
  return rows[0].role as Role;
}

export async function listMembers(householdId: number): Promise<MemberSummary[]> {
  const rows = await db
    .select({
      userId: householdMembers.userId,
      name: users.name,
      email: users.email,
      role: householdMembers.role,
      wrapUserId: householdKeyWraps.userId,
    })
    .from(householdMembers)
    .innerJoin(users, eq(users.id, householdMembers.userId))
    .leftJoin(
      householdKeyWraps,
      and(
        eq(householdKeyWraps.householdId, householdMembers.householdId),
        eq(householdKeyWraps.userId, householdMembers.userId)
      )
    )
    .where(eq(householdMembers.householdId, householdId))
    .orderBy(householdMembers.createdAt);

  return rows.map((r) => ({
    userId: r.userId,
    name: r.name,
    email: r.email,
    role: r.role as Role,
    hasWrap: r.wrapUserId !== null,
  }));
}

// Owner-only, checked against the database. Deletes the membership and the
// member's wrap; their JWT keeps working for up to 24h (documented limit).
export async function removeMember(
  householdId: number,
  actorUserId: string,
  targetUserId: string
): Promise<void> {
  const actorRole = await assertMembership(householdId, actorUserId);
  if (actorRole !== "owner") {
    throw new HouseholdError("Only the owner can remove members", 403);
  }
  if (actorUserId === targetUserId) {
    throw new HouseholdError("The owner cannot remove themselves", 400);
  }

  await db.transaction(async (tx) => {
    const deleted = await tx
      .delete(householdMembers)
      .where(
        and(
          eq(householdMembers.householdId, householdId),
          eq(householdMembers.userId, targetUserId)
        )
      )
      .returning({ userId: householdMembers.userId });
    if (deleted.length === 0) {
      throw new HouseholdError("Not a member", 404);
    }
    await tx
      .delete(householdKeyWraps)
      .where(
        and(
          eq(householdKeyWraps.householdId, householdId),
          eq(householdKeyWraps.userId, targetUserId)
        )
      );
  });
}
```

- [ ] **Step 4: Run the household tests — expect PASS**

Run: `npx vitest run src/lib/__tests__/household.test.ts`

Then run `npm run typecheck`. Expect exactly one error: `src/auth.ts` passes `number | null` to `assertMembership`. Fix it now by making the session's household nullable end to end (Task 8 builds on this):

`src/types/next-auth.d.ts` — replace the two fields:

```ts
import "next-auth";

declare module "next-auth" {
  interface Session {
    // null while the user has no household yet (a pending invitation is
    // waiting for them) — see src/lib/household.ts resolveHouseholdForUser.
    householdId: number | null;
    role: "owner" | "member" | null;
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}
```

`src/auth.ts` — replace the `callbacks` block:

```ts
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        token.userId = user.id;
        const householdId = await resolveHouseholdForUser(user.id);
        token.householdId = householdId;
        token.role =
          householdId === null ? null : await assertMembership(householdId, user.id);
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.userId as string;
      session.householdId = (token.householdId as number | null) ?? null;
      session.role = (token.role as "owner" | "member" | null) ?? null;
      return session;
    },
  },
```

`src/lib/session.ts` needs no change: `!householdId` already rejects `null`, and the narrowed return type stays `number`.

Run: `npm run typecheck` — expect exit 0.

- [ ] **Step 5: Write the failing invitation tests**

`src/lib/__tests__/invitations.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import {
  apartments,
  households,
  householdMembers,
  householdKeyWraps,
  invitations,
  locationsOfInterest,
  memberKeys,
} from "@/lib/db/schema";
import { users } from "@/lib/db/schema-auth";
import { eq } from "drizzle-orm";
import { createHouseholdForUser, assertMembership } from "../household";
import {
  INVITATION_TTL_MS,
  acceptInvitation,
  createInvitation,
  listInvitations,
  normalizeEmail,
  pendingInvitationsForUser,
  revokeInvitation,
  startOwnHousehold,
} from "../invitations";

beforeEach(async () => {
  await db.delete(apartments);
  await db.delete(locationsOfInterest);
  await db.delete(invitations);
  await db.delete(householdKeyWraps);
  await db.delete(memberKeys);
  await db.delete(householdMembers);
  await db.delete(households);
  await db.delete(users);
});

async function makeUser(id: string, email = `${id}@example.com`) {
  await db.insert(users).values({ id, email, name: id });
}

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Ana@Example.COM ")).toBe("ana@example.com");
  });
});

describe("createInvitation / listInvitations / revokeInvitation", () => {
  it("creates a pending invitation that expires in 7 days", async () => {
    await makeUser("o");
    const hid = await createHouseholdForUser("o");
    const before = Date.now();
    const inv = await createInvitation(hid, "o", " Ana@Example.com ");
    expect(inv.email).toBe("ana@example.com");
    expect(inv.status).toBe("pending");
    expect(inv.expiresAt.getTime()).toBeGreaterThanOrEqual(before + INVITATION_TTL_MS - 2000);
    expect(INVITATION_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
    expect(await listInvitations(hid)).toHaveLength(1);
  });

  it("rejects an invalid email (400)", async () => {
    await makeUser("o");
    const hid = await createHouseholdForUser("o");
    await expect(createInvitation(hid, "o", "nope")).rejects.toMatchObject({ status: 400 });
  });

  it("rejects an existing member (409)", async () => {
    await makeUser("o");
    const hid = await createHouseholdForUser("o");
    await expect(createInvitation(hid, "o", "O@example.com")).rejects.toMatchObject({
      status: 409,
    });
  });

  it("rejects a duplicate pending invitation (409) but allows one after revoke", async () => {
    await makeUser("o");
    const hid = await createHouseholdForUser("o");
    const first = await createInvitation(hid, "o", "ana@example.com");
    await expect(createInvitation(hid, "o", "ANA@example.com")).rejects.toMatchObject({
      status: 409,
    });
    await revokeInvitation(hid, first.id);
    expect(await listInvitations(hid)).toHaveLength(0);
    await createInvitation(hid, "o", "ana@example.com");
    expect(await listInvitations(hid)).toHaveLength(1);
  });

  it("lazily marks expired invitations and hides them", async () => {
    await makeUser("o");
    const hid = await createHouseholdForUser("o");
    await db.insert(invitations).values({
      householdId: hid,
      email: "old@example.com",
      invitedBy: "o",
      expiresAt: new Date(Date.now() - 1),
    });
    expect(await listInvitations(hid)).toHaveLength(0);
    const [row] = await db.select().from(invitations);
    expect(row.status).toBe("expired");
  });

  it("revoke of another household's invitation is 404", async () => {
    await makeUser("o");
    await makeUser("p");
    const hid = await createHouseholdForUser("o");
    const other = await createHouseholdForUser("p");
    const inv = await createInvitation(hid, "o", "ana@example.com");
    await expect(revokeInvitation(other, inv.id)).rejects.toMatchObject({ status: 404 });
  });
});

describe("pendingInvitationsForUser", () => {
  it("returns pending, unexpired invitations for the user's email", async () => {
    await makeUser("o");
    await makeUser("ana", "Ana@Example.com");
    const hid = await createHouseholdForUser("o");
    const inv = await createInvitation(hid, "o", "ana@example.com");
    const list = await pendingInvitationsForUser("ana");
    expect(list).toEqual([
      {
        id: inv.id,
        householdName: "My household",
        invitedByName: "o",
        expiresAt: inv.expiresAt,
      },
    ]);
  });
});

describe("acceptInvitation", () => {
  it("joins a household-less user as a member and marks the invitation accepted", async () => {
    await makeUser("o");
    await makeUser("ana");
    const hid = await createHouseholdForUser("o");
    const inv = await createInvitation(hid, "o", "ana@example.com");
    expect(await acceptInvitation(inv.id, "ana")).toBe(hid);
    expect(await assertMembership(hid, "ana")).toBe("member");
    const [row] = await db.select().from(invitations).where(eq(invitations.id, inv.id));
    expect(row.status).toBe("accepted");
    expect(row.acceptedBy).toBe("ana");
  });

  it("404 when not pending, 409 when expired, 403 on email mismatch", async () => {
    await makeUser("o");
    await makeUser("ana");
    await makeUser("bob");
    const hid = await createHouseholdForUser("o");
    const inv = await createInvitation(hid, "o", "ana@example.com");

    await expect(acceptInvitation(inv.id, "bob")).rejects.toMatchObject({ status: 403 });
    await expect(acceptInvitation(999999, "ana")).rejects.toMatchObject({ status: 404 });

    await db
      .update(invitations)
      .set({ expiresAt: new Date(Date.now() - 1) })
      .where(eq(invitations.id, inv.id));
    await expect(acceptInvitation(inv.id, "ana")).rejects.toMatchObject({ status: 409 });
    const [row] = await db.select().from(invitations).where(eq(invitations.id, inv.id));
    expect(row.status).toBe("expired");
  });

  it("abandons an empty solo household and deletes it", async () => {
    await makeUser("o");
    await makeUser("ana");
    const hid = await createHouseholdForUser("o");
    const solo = await createHouseholdForUser("ana");
    await db.insert(householdKeyWraps).values({
      householdId: solo,
      userId: "ana",
      wrappedKey: "W",
      wrappedBy: "ana",
    });
    await db.insert(locationsOfInterest).values({
      householdId: solo,
      label: "Work",
      icon: "briefcase",
      address: "x",
      sortOrder: 0,
    });
    const inv = await createInvitation(hid, "o", "ana@example.com");

    expect(await acceptInvitation(inv.id, "ana")).toBe(hid);
    expect(await db.select().from(households).where(eq(households.id, solo))).toHaveLength(0);
    expect(
      await db.select().from(householdKeyWraps).where(eq(householdKeyWraps.householdId, solo))
    ).toHaveLength(0);
    expect(
      await db.select().from(locationsOfInterest).where(eq(locationsOfInterest.householdId, solo))
    ).toHaveLength(0);
    expect(await assertMembership(hid, "ana")).toBe("member");
  });

  it("refuses to abandon a household with apartments (409) and changes nothing", async () => {
    await makeUser("o");
    await makeUser("ana");
    const hid = await createHouseholdForUser("o");
    const solo = await createHouseholdForUser("ana");
    await db.insert(apartments).values({ householdId: solo, name: "Flat" });
    const inv = await createInvitation(hid, "o", "ana@example.com");

    await expect(acceptInvitation(inv.id, "ana")).rejects.toMatchObject({ status: 409 });
    expect(await assertMembership(solo, "ana")).toBe("owner");
    const [row] = await db.select().from(invitations).where(eq(invitations.id, inv.id));
    expect(row.status).toBe("pending");
  });

  it("refuses to abandon a household with other members (409)", async () => {
    await makeUser("o");
    await makeUser("ana");
    await makeUser("bob");
    const hid = await createHouseholdForUser("o");
    const shared = await createHouseholdForUser("ana");
    await db
      .insert(householdMembers)
      .values({ householdId: shared, userId: "bob", role: "member" });
    const inv = await createInvitation(hid, "o", "ana@example.com");
    await expect(acceptInvitation(inv.id, "ana")).rejects.toMatchObject({ status: 409 });
  });

  it("accepting an invitation to your own household is 409", async () => {
    await makeUser("o");
    await makeUser("ana");
    const hid = await createHouseholdForUser("o");
    await db
      .insert(householdMembers)
      .values({ householdId: hid, userId: "ana", role: "member" });
    // Bypass createInvitation's member check to get a stale invitation row.
    const [inv] = await db
      .insert(invitations)
      .values({
        householdId: hid,
        email: "ana@example.com",
        invitedBy: "o",
        expiresAt: new Date(Date.now() + 60_000),
      })
      .returning();
    await expect(acceptInvitation(inv.id, "ana")).rejects.toMatchObject({ status: 409 });
  });
});

describe("startOwnHousehold", () => {
  it("creates a household for a user without one", async () => {
    await makeUser("ana");
    const id = await startOwnHousehold("ana");
    expect(await assertMembership(id, "ana")).toBe("owner");
  });

  it("is 409 when the user already has a household", async () => {
    await makeUser("ana");
    await createHouseholdForUser("ana");
    await expect(startOwnHousehold("ana")).rejects.toMatchObject({ status: 409 });
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run src/lib/__tests__/invitations.test.ts`
Expected: FAIL — cannot find module `../invitations`.

- [ ] **Step 7: Implement `invitations.ts`**

`src/lib/invitations.ts`:

```ts
import { db } from "@/lib/db";
import {
  apartments,
  apartmentDistances,
  households,
  householdMembers,
  householdKeyWraps,
  invitations,
  locationsOfInterest,
  ratings,
  type Invitation,
} from "@/lib/db/schema";
import { users } from "@/lib/db/schema-auth";
import { and, eq, gt, lte, sql } from "drizzle-orm";
import { ApiError } from "@/lib/api-error";
import { createHouseholdForUser } from "@/lib/household";

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export class InvitationError extends ApiError {
  constructor(message: string, status: 400 | 403 | 404 | 409) {
    super(message, status);
    this.name = "InvitationError";
  }
}

export interface PendingInvitationForUser {
  id: number;
  householdName: string;
  invitedByName: string | null;
  expiresAt: Date;
}

// Deliberately loose: one "@" with something either side. The real check is
// that the invitee signs in with a provider that vouches for the address.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

async function expireStale(householdId?: number): Promise<void> {
  const now = new Date();
  await db
    .update(invitations)
    .set({ status: "expired" })
    .where(
      and(
        eq(invitations.status, "pending"),
        lte(invitations.expiresAt, now),
        householdId === undefined ? undefined : eq(invitations.householdId, householdId)
      )
    );
}

export async function createInvitation(
  householdId: number,
  invitedBy: string,
  rawEmail: string
): Promise<Invitation> {
  const email = normalizeEmail(rawEmail);
  if (!EMAIL_RE.test(email)) {
    throw new InvitationError("Enter a valid email address", 400);
  }

  const member = await db
    .select({ userId: householdMembers.userId })
    .from(householdMembers)
    .innerJoin(users, eq(users.id, householdMembers.userId))
    .where(
      and(
        eq(householdMembers.householdId, householdId),
        eq(sql`lower(${users.email})`, email)
      )
    )
    .limit(1);
  if (member.length > 0) {
    throw new InvitationError("That person is already a member", 409);
  }

  await expireStale(householdId);
  try {
    const [created] = await db
      .insert(invitations)
      .values({
        householdId,
        email,
        invitedBy,
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
      })
      .returning();
    return created;
  } catch (e) {
    // The partial unique index invitations_pending_household_email.
    if (e instanceof Error && /UNIQUE constraint failed/.test(e.message)) {
      throw new InvitationError("An invitation is already pending for that email", 409);
    }
    throw e;
  }
}

export async function listInvitations(householdId: number): Promise<Invitation[]> {
  await expireStale(householdId);
  return db
    .select()
    .from(invitations)
    .where(
      and(eq(invitations.householdId, householdId), eq(invitations.status, "pending"))
    )
    .orderBy(invitations.createdAt);
}

export async function revokeInvitation(householdId: number, id: number): Promise<void> {
  const updated = await db
    .update(invitations)
    .set({ status: "revoked" })
    .where(
      and(
        eq(invitations.id, id),
        eq(invitations.householdId, householdId),
        eq(invitations.status, "pending")
      )
    )
    .returning({ id: invitations.id });
  if (updated.length === 0) throw new InvitationError("Invitation not found", 404);
}

export async function pendingInvitationsForUser(
  userId: string
): Promise<PendingInvitationForUser[]> {
  const [user] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) return [];

  const inviter = sql<string | null>`(select ${users.name} from ${users} where ${users.id} = ${invitations.invitedBy})`;
  return db
    .select({
      id: invitations.id,
      householdName: households.name,
      invitedByName: inviter,
      expiresAt: invitations.expiresAt,
    })
    .from(invitations)
    .innerJoin(households, eq(households.id, invitations.householdId))
    .where(
      and(
        eq(invitations.email, normalizeEmail(user.email)),
        eq(invitations.status, "pending"),
        gt(invitations.expiresAt, new Date())
      )
    )
    .orderBy(invitations.createdAt);
}

// Accept: join the household as a member. If the user already belongs to a
// household, the abandon rule applies (Global Constraints): sole member and
// zero apartments → the old household is deleted; anything else is 409.
// Migration 0011 toggled foreign_keys, so the deletes are explicit rather
// than relying on ON DELETE CASCADE.
export async function acceptInvitation(id: number, userId: string): Promise<number> {
  return db.transaction(async (tx) => {
    const [inv] = await tx
      .select()
      .from(invitations)
      .where(and(eq(invitations.id, id), eq(invitations.status, "pending")))
      .limit(1);
    if (!inv) throw new InvitationError("Invitation not found", 404);

    if (inv.expiresAt.getTime() <= Date.now()) {
      await tx
        .update(invitations)
        .set({ status: "expired" })
        .where(eq(invitations.id, id));
      throw new InvitationError("This invitation has expired", 409);
    }

    const [user] = await tx
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user || normalizeEmail(user.email) !== inv.email) {
      throw new InvitationError("This invitation was sent to a different email", 403);
    }

    const [current] = await tx
      .select({ householdId: householdMembers.householdId })
      .from(householdMembers)
      .where(eq(householdMembers.userId, userId))
      .limit(1);

    if (current) {
      if (current.householdId === inv.householdId) {
        throw new InvitationError("You are already a member of this household", 409);
      }
      const [{ members }] = await tx
        .select({ members: sql<number>`count(*)` })
        .from(householdMembers)
        .where(eq(householdMembers.householdId, current.householdId));
      const [{ flats }] = await tx
        .select({ flats: sql<number>`count(*)` })
        .from(apartments)
        .where(eq(apartments.householdId, current.householdId));
      if (Number(members) !== 1 || Number(flats) !== 0) {
        throw new InvitationError("You already belong to a household", 409);
      }
      const old = current.householdId;
      await tx.delete(apartmentDistances).where(eq(apartmentDistances.householdId, old));
      await tx.delete(ratings).where(eq(ratings.householdId, old));
      await tx.delete(locationsOfInterest).where(eq(locationsOfInterest.householdId, old));
      await tx.delete(invitations).where(eq(invitations.householdId, old));
      await tx.delete(householdKeyWraps).where(eq(householdKeyWraps.householdId, old));
      await tx.delete(householdMembers).where(eq(householdMembers.householdId, old));
      await tx.delete(households).where(eq(households.id, old));
    }

    await tx
      .insert(householdMembers)
      .values({ householdId: inv.householdId, userId, role: "member" });
    await tx
      .update(invitations)
      .set({ status: "accepted", acceptedBy: userId })
      .where(eq(invitations.id, id));

    return inv.householdId;
  });
}

// "Start my own household instead" on /invitations. Pending invitations are
// left alone: the user may still accept one later under the abandon rule.
export async function startOwnHousehold(userId: string): Promise<number> {
  const existing = await db
    .select({ householdId: householdMembers.householdId })
    .from(householdMembers)
    .where(eq(householdMembers.userId, userId))
    .limit(1);
  if (existing.length > 0) {
    throw new InvitationError("You already have a household", 409);
  }
  return createHouseholdForUser(userId);
}
```

- [ ] **Step 8: Run the invitation tests — expect PASS**

Run: `npx vitest run src/lib/__tests__/invitations.test.ts`

If the "abandons an empty solo household" test fails on the `households` delete with a FOREIGN KEY error, `invitations.acceptedBy` or `households.ownerId` is not the cause (both point at `users`); check that every table referencing `households` is deleted above — the list must match the tables in `src/lib/db/schema.ts` with a `household_id` column.

- [ ] **Step 9: Lint, typecheck, full test run, commit**

Run: `npm run lint && npm run typecheck && npm test`

```bash
git add src/lib/household.ts src/lib/invitations.ts src/lib/__tests__/household.test.ts src/lib/__tests__/invitations.test.ts src/auth.ts src/types/next-auth.d.ts
git commit -m "feat(household): invitation lifecycle, member listing/removal, nullable session household (#197)"
```

---
### Task 8: Session re-resolution and the proxy's no-household state

**Files:**
- Modify: `src/auth.ts` (callbacks + exports)
- Modify: `src/proxy.ts`
- Modify: `src/__tests__/proxy.test.ts`
- Test: `src/__tests__/auth-callbacks.test.ts`

**Interfaces:**
- Consumes: `resolveHouseholdForUser(): Promise<number | null>`, `assertMembership` (Task 7).
- Produces:
  - `src/auth.ts` exports `unstable_update` (from `NextAuth()`) and `authCallbacks` (`{ jwt, session }`) so the callbacks are unit-testable.
  - JWT contract: the callback re-resolves the household whenever the token has none **or** `trigger === "update"`. Route handlers that change membership call `await unstable_update({})` afterwards so the cookie is rewritten in the same response.
  - Proxy contract: `NO_HOUSEHOLD_ALLOWED` — `/invitations`, `/api/invitations/mine`, `/api/invitations/decline`, `/api/invitations/:id/accept` — is reachable by a signed-in user with no household. Everywhere else, such a user gets `403 { error: "No household" }` on `/api/*` and a redirect to `/invitations` on pages. `/` redirects them to `/invitations`.

- [ ] **Step 1: Write the failing callback tests**

`src/__tests__/auth-callbacks.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { households, householdMembers, invitations } from "@/lib/db/schema";
import { users } from "@/lib/db/schema-auth";
import { authCallbacks } from "@/auth";

beforeEach(async () => {
  await db.delete(invitations);
  await db.delete(householdMembers);
  await db.delete(households);
  await db.delete(users);
  await db.insert(users).values({ id: "u1", email: "u1@example.com" });
});

describe("jwt callback", () => {
  it("stamps userId, householdId and role at sign-in", async () => {
    const token = await authCallbacks.jwt({
      token: {},
      user: { id: "u1" },
      trigger: "signIn",
    });
    expect(token.userId).toBe("u1");
    expect(typeof token.householdId).toBe("number");
    expect(token.role).toBe("owner");
  });

  it("leaves householdId null while an invitation is pending", async () => {
    await db.insert(users).values({ id: "o", email: "o@example.com" });
    const [h] = await db.insert(households).values({ name: "H", ownerId: "o" }).returning();
    await db.insert(householdMembers).values({ householdId: h.id, userId: "o", role: "owner" });
    await db.insert(invitations).values({
      householdId: h.id,
      email: "u1@example.com",
      invitedBy: "o",
      expiresAt: new Date(Date.now() + 60_000),
    });

    const token = await authCallbacks.jwt({ token: {}, user: { id: "u1" }, trigger: "signIn" });
    expect(token.householdId).toBeNull();
    expect(token.role).toBeNull();

    // A later request with no household re-resolves; still nothing.
    const again = await authCallbacks.jwt({ token, user: undefined });
    expect(again.householdId).toBeNull();

    // After accepting (membership row appears), the next request picks it up.
    await db.insert(householdMembers).values({ householdId: h.id, userId: "u1", role: "member" });
    const joined = await authCallbacks.jwt({ token: again, user: undefined });
    expect(joined.householdId).toBe(h.id);
    expect(joined.role).toBe("member");
  });

  it("re-resolves on trigger=update even when the token already has a household", async () => {
    const token = await authCallbacks.jwt({ token: {}, user: { id: "u1" }, trigger: "signIn" });
    const original = token.householdId as number;

    // Move the user to a new household directly in the DB.
    await db.delete(householdMembers);
    const [h2] = await db.insert(households).values({ name: "H2", ownerId: "u1" }).returning();
    await db.insert(householdMembers).values({ householdId: h2.id, userId: "u1", role: "member" });

    const unchanged = await authCallbacks.jwt({ token, user: undefined });
    expect(unchanged.householdId).toBe(original);

    const refreshed = await authCallbacks.jwt({ token, user: undefined, trigger: "update" });
    expect(refreshed.householdId).toBe(h2.id);
    expect(refreshed.role).toBe("member");
  });
});

describe("session callback", () => {
  it("copies nullable claims onto the session", async () => {
    const session = await authCallbacks.session({
      session: { user: { id: "", name: null, email: null, image: null }, householdId: null, role: null, expires: "" },
      token: { userId: "u1", householdId: null, role: null },
    });
    expect(session.user.id).toBe("u1");
    expect(session.householdId).toBeNull();
    expect(session.role).toBeNull();

    const full = await authCallbacks.session({
      session: { user: { id: "", name: null, email: null, image: null }, householdId: null, role: null, expires: "" },
      token: { userId: "u1", householdId: 7, role: "owner" },
    });
    expect(full.householdId).toBe(7);
    expect(full.role).toBe("owner");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/__tests__/auth-callbacks.test.ts`
Expected: FAIL — `authCallbacks` is not exported from `@/auth`.

- [ ] **Step 3: Extract and extend the callbacks in `src/auth.ts`**

Add these imports near the top of `src/auth.ts`:

```ts
import type { Session } from "next-auth";
import type { JWT } from "next-auth/jwt";
```

Insert the following **above** the `export const { handlers, ... } = NextAuth({` line, and then replace the `callbacks: { ... }` block inside `NextAuth({...})` with `callbacks: authCallbacks,`:

```ts
// Exported so the callbacks can be unit-tested against the real database
// without standing up Auth.js. The jwt callback re-resolves the household
// (a) at sign-in, (b) on every request while the token has none — the user
// is on /invitations deciding — and (c) when a route handler calls
// `unstable_update({})` after changing membership. Otherwise the claims are
// left alone for the token's 24h life (see AGENTS.md, session staleness).
export const authCallbacks = {
  async jwt({
    token,
    user,
    trigger,
  }: {
    token: JWT;
    user?: { id?: string | null } | null;
    trigger?: "signIn" | "signUp" | "update";
  }): Promise<JWT> {
    if (user?.id) {
      token.userId = user.id;
      token.householdId = null;
      token.role = null;
    }
    const userId = token.userId as string | undefined;
    if (userId && (!token.householdId || trigger === "update")) {
      const householdId = await resolveHouseholdForUser(userId);
      if (householdId === null) {
        token.householdId = null;
        token.role = null;
      } else {
        token.householdId = householdId;
        token.role = await assertMembership(householdId, userId);
      }
    }
    return token;
  },
  async session({
    session,
    token,
  }: {
    session: Session;
    token: JWT;
  }): Promise<Session> {
    session.user.id = token.userId as string;
    session.householdId = (token.householdId as number | null) ?? null;
    session.role = (token.role as "owner" | "member" | null) ?? null;
    return session;
  },
};
```

And change the destructuring export to include `unstable_update`:

```ts
export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
```

- [ ] **Step 4: Run the callback tests — expect PASS**

Run: `npx vitest run src/__tests__/auth-callbacks.test.ts`
Then `npm run typecheck`. Object-literal methods are checked bivariantly, so the narrower `user?: { id?: string | null } | null` parameter is accepted where Auth.js expects `AdapterUser | User`. If TypeScript still rejects `callbacks: authCallbacks`, add `import type { NextAuthConfig } from "next-auth";` and write `callbacks: authCallbacks as NextAuthConfig["callbacks"],` — the cast is on the config site only; the exported object keeps its precise types for the tests.

- [ ] **Step 5: Update the proxy tests**

In `src/__tests__/proxy.test.ts`, replace the two tests that begin with `it("redirects a page request when the session has a user id but no householdId"` and `it("returns JSON 401 for an API request when the session has a user id but no householdId"` (and the comment block above them) with:

```ts
  // A session can carry a user id without a household: the user signed in
  // while an invitation was pending and has not chosen yet. They may reach
  // /invitations and its three API endpoints, nothing else.
  function signedInWithoutHousehold() {
    mockedAuth.mockResolvedValue({
      user: { id: "u1" },
      householdId: null,
      role: null,
      expires: new Date(Date.now() + 3600_000).toISOString(),
    } as never);
  }

  it("sends a household-less user to /invitations instead of a data page", async () => {
    signedInWithoutHousehold();
    const res = await proxy(makeRequest("/apartments"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/invitations");
  });

  it("returns JSON 403 for a data API request from a household-less user", async () => {
    signedInWithoutHousehold();
    const res = await proxy(makeRequest("/api/apartments"));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "No household" });
  });

  it("lets a household-less user reach the invitation endpoints", async () => {
    signedInWithoutHousehold();
    for (const path of [
      "/invitations",
      "/api/invitations/mine",
      "/api/invitations/decline",
      "/api/invitations/12/accept",
    ]) {
      const res = await proxy(makeRequest(path));
      expect(res.headers.get("x-middleware-next"), path).toBe("1");
    }
  });

  it("does not open the owner-side invitation endpoints to a household-less user", async () => {
    signedInWithoutHousehold();
    for (const path of ["/api/invitations", "/api/invitations/12", "/api/household/members"]) {
      const res = await proxy(makeRequest(path));
      expect(res.status, path).toBe(403);
    }
  });

  it("redirects a household-less user from / to /invitations", async () => {
    signedInWithoutHousehold();
    const res = await proxy(makeRequest("/"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/invitations");
  });

  it("still fails closed on a session with an undefined householdId", async () => {
    mockedAuth.mockResolvedValue({
      user: { id: "u1" },
      householdId: undefined,
      role: "owner",
      expires: new Date(Date.now() + 3600_000).toISOString(),
    } as never);
    const res = await proxy(makeRequest("/api/apartments"));
    expect(res.status).toBe(403);
  });
```

- [ ] **Step 6: Run the proxy tests to verify the new ones fail**

Run: `npx vitest run src/__tests__/proxy.test.ts`
Expected: the five new tests FAIL (307 to `/` and 401 instead of `/invitations` and 403).

- [ ] **Step 7: Rewrite `src/proxy.ts`**

```ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/auth";

// Reachable by a signed-in user who has no household yet. Everything else
// needs both a user and a household.
const NO_HOUSEHOLD_ALLOWED = [
  /^\/invitations$/,
  /^\/api\/invitations\/mine$/,
  /^\/api\/invitations\/decline$/,
  /^\/api\/invitations\/\d+\/accept$/,
];

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Auth.js owns its own endpoints; gating them breaks the sign-in flow.
  if (path.startsWith("/api/auth/")) return NextResponse.next();

  const session = await auth();
  const userId = session?.user?.id;
  const hasHousehold = !!userId && !!session?.householdId;
  const isApi = path.startsWith("/api/");

  if (path === "/") {
    if (hasHousehold) return NextResponse.redirect(new URL("/apartments", request.url));
    if (userId) return NextResponse.redirect(new URL("/invitations", request.url));
    return NextResponse.next();
  }

  if (!userId) {
    return isApi
      ? NextResponse.json({ error: "Not authenticated" }, { status: 401 })
      : NextResponse.redirect(new URL("/", request.url));
  }

  if (!hasHousehold) {
    if (NO_HOUSEHOLD_ALLOWED.some((re) => re.test(path))) return NextResponse.next();
    return isApi
      ? NextResponse.json({ error: "No household" }, { status: 403 })
      : NextResponse.redirect(new URL("/invitations", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // The PWA manifest and its icons must stay public: a browser fetches the
    // manifest WITHOUT credentials, so gating it makes the app silently
    // uninstallable. None of these files contain user data.
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icon-192.png|icon-512.png|icon-maskable-512.png|apple-touch-icon.png).*)",
  ],
};
```

- [ ] **Step 8: Run the proxy tests — expect PASS**

Run: `npx vitest run src/__tests__/proxy.test.ts`

- [ ] **Step 9: Lint, typecheck, full test run, commit**

Run: `npm run lint && npm run typecheck && npm test`

```bash
git add src/auth.ts src/proxy.ts src/__tests__/proxy.test.ts src/__tests__/auth-callbacks.test.ts
git commit -m "feat(auth): re-resolve household on update; proxy allows /invitations without one (#197)"
```

---
### Task 9: Invitation and household-member route handlers

**Files:**
- Create: `src/app/api/invitations/route.ts`
- Create: `src/app/api/invitations/[id]/route.ts`
- Create: `src/app/api/invitations/[id]/accept/route.ts`
- Create: `src/app/api/invitations/mine/route.ts`
- Create: `src/app/api/invitations/decline/route.ts`
- Create: `src/app/api/household/members/route.ts`
- Create: `src/app/api/household/members/[userId]/route.ts`
- Test: `src/app/api/invitations/__tests__/invitation-routes.test.ts`
- Test: `src/app/api/household/__tests__/members-routes.test.ts`

**Interfaces:**
- Consumes: Task 7's `invitations.ts` and `household.ts` functions; `auth`, `unstable_update` from `@/auth` (Task 8); `apiErrorResponse`, `parseBody` (Task 5).
- Produces the HTTP contract the client (Task 13) calls:
  - `GET /api/invitations` → `200 { invitations: [{ id, email, expiresAt, createdAt }] }` (owner only, 403 otherwise).
  - `POST /api/invitations` body `{ email }` → `201 { id, email, expiresAt, createdAt }`.
  - `DELETE /api/invitations/:id` → `204`.
  - `GET /api/invitations/mine` → `200 { invitations: PendingInvitationForUser[] }` — **reads `auth()` directly**, not `requireHousehold()`, because the caller has no household. Same for the next two. This is the documented exception to "no `requireUser()`" (Task 14 records it in AGENTS.md).
  - `POST /api/invitations/:id/accept` → `200 { householdId }`, after `await unstable_update({})`.
  - `POST /api/invitations/decline` → `200 { householdId }` (starts an own household), after `await unstable_update({})`.
  - `GET /api/household/members` → `200 { members: MemberSummary[], me: { userId, role } }`.
  - `DELETE /api/household/members/:userId` → `204`.

- [ ] **Step 1: Write the failing invitation route tests**

`src/app/api/invitations/__tests__/invitation-routes.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { db } from "@/lib/db";
import { households, householdMembers, invitations } from "@/lib/db/schema";
import { users } from "@/lib/db/schema-auth";
import { eq } from "drizzle-orm";

const currentSession = { householdId: 0, userId: "", role: "owner" as "owner" | "member" };
vi.mock("@/lib/session", () => ({
  requireHousehold: vi.fn(async () => ({ ...currentSession })),
}));

const authUser = { id: "" as string | null };
const unstableUpdate = vi.fn(async () => null);
vi.mock("@/auth", () => ({
  auth: vi.fn(async () => (authUser.id ? { user: { id: authUser.id } } : null)),
  unstable_update: (...args: unknown[]) => unstableUpdate(...(args as [])),
}));

import { GET as listGET, POST as createPOST } from "../route";
import { DELETE as revokeDELETE } from "../[id]/route";
import { GET as mineGET } from "../mine/route";
import { POST as acceptPOST } from "../[id]/accept/route";
import { POST as declinePOST } from "../decline/route";

function json(body: unknown, method = "POST") {
  return new Request("http://localhost/api/invitations", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });

let hid: number;

beforeEach(async () => {
  unstableUpdate.mockClear();
  await db.delete(invitations);
  await db.delete(householdMembers);
  await db.delete(households);
  await db.delete(users);
  for (const id of ["o", "m", "ana"]) {
    await db.insert(users).values({ id, email: `${id}@example.com`, name: id });
  }
  const [h] = await db.insert(households).values({ name: "H", ownerId: "o" }).returning();
  hid = h.id;
  await db.insert(householdMembers).values({ householdId: hid, userId: "o", role: "owner" });
  await db.insert(householdMembers).values({ householdId: hid, userId: "m", role: "member" });
  currentSession.householdId = hid;
  currentSession.userId = "o";
  currentSession.role = "owner";
  authUser.id = "ana";
});

describe("GET/POST /api/invitations", () => {
  it("owner creates and lists invitations", async () => {
    const created = await createPOST(json({ email: "Ana@Example.com" }));
    expect(created.status).toBe(201);
    const body = await created.json();
    expect(body.email).toBe("ana@example.com");

    const list = await listGET();
    expect(list.status).toBe(200);
    const { invitations: rows } = await list.json();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: body.id, email: "ana@example.com" });
  });

  it("a member (by database role) gets 403 even if the token says owner", async () => {
    currentSession.userId = "m";
    currentSession.role = "owner";
    expect((await createPOST(json({ email: "x@example.com" }))).status).toBe(403);
    expect((await listGET()).status).toBe(403);
  });

  it("400 on a bad email, 409 on a duplicate", async () => {
    expect((await createPOST(json({ email: "nope" }))).status).toBe(400);
    await createPOST(json({ email: "ana@example.com" }));
    expect((await createPOST(json({ email: "ana@example.com" }))).status).toBe(409);
  });
});

describe("DELETE /api/invitations/[id]", () => {
  it("owner revokes; unknown id is 404", async () => {
    const created = await (await createPOST(json({ email: "ana@example.com" }))).json();
    const res = await revokeDELETE(new Request("http://localhost"), params(String(created.id)));
    expect(res.status).toBe(204);
    expect((await (await listGET()).json()).invitations).toHaveLength(0);
    const missing = await revokeDELETE(new Request("http://localhost"), params("999999"));
    expect(missing.status).toBe(404);
    const bad = await revokeDELETE(new Request("http://localhost"), params("abc"));
    expect(bad.status).toBe(400);
  });
});

describe("GET /api/invitations/mine", () => {
  it("lists invitations addressed to the signed-in user's email", async () => {
    await createPOST(json({ email: "ana@example.com" }));
    const res = await mineGET();
    expect(res.status).toBe(200);
    const { invitations: rows } = await res.json();
    expect(rows).toHaveLength(1);
    expect(rows[0].householdName).toBe("H");
    expect(rows[0].invitedByName).toBe("o");
  });

  it("401 without a session", async () => {
    authUser.id = null;
    expect((await mineGET()).status).toBe(401);
  });
});

describe("POST /api/invitations/[id]/accept and /decline", () => {
  it("accept joins the household and refreshes the session cookie", async () => {
    const created = await (await createPOST(json({ email: "ana@example.com" }))).json();
    const res = await acceptPOST(new Request("http://localhost", { method: "POST" }), params(String(created.id)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ householdId: hid });
    expect(unstableUpdate).toHaveBeenCalledTimes(1);
    const [row] = await db.select().from(householdMembers).where(eq(householdMembers.userId, "ana"));
    expect(row.householdId).toBe(hid);
  });

  it("accept with a mismatched email is 403 and does not refresh", async () => {
    const created = await (await createPOST(json({ email: "someone-else@example.com" }))).json();
    const res = await acceptPOST(new Request("http://localhost", { method: "POST" }), params(String(created.id)));
    expect(res.status).toBe(403);
    expect(unstableUpdate).not.toHaveBeenCalled();
  });

  it("decline starts an own household and refreshes the session cookie", async () => {
    const res = await declinePOST();
    expect(res.status).toBe(200);
    const { householdId } = await res.json();
    expect(typeof householdId).toBe("number");
    expect(householdId).not.toBe(hid);
    expect(unstableUpdate).toHaveBeenCalledTimes(1);
  });

  it("decline when already in a household is 409", async () => {
    authUser.id = "m";
    expect((await declinePOST()).status).toBe(409);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/app/api/invitations/__tests__/invitation-routes.test.ts`
Expected: FAIL — cannot find module `../route`.

- [ ] **Step 3: Implement the invitation handlers**

`src/app/api/invitations/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError } from "@/lib/api-error";
import { apiErrorResponse, parseBody } from "@/lib/api-route";
import { assertMembership } from "@/lib/household";
import { createInvitation, listInvitations } from "@/lib/invitations";
import { requireHousehold } from "@/lib/session";

const createSchema = z.object({ email: z.string().min(1).max(320) });

async function requireOwner() {
  const { householdId, userId } = await requireHousehold();
  const role = await assertMembership(householdId, userId);
  if (role !== "owner") throw new ApiError("Only the owner can manage invitations", 403);
  return { householdId, userId };
}

const publicShape = (i: { id: number; email: string; expiresAt: Date; createdAt: Date | null }) => ({
  id: i.id,
  email: i.email,
  expiresAt: i.expiresAt,
  createdAt: i.createdAt,
});

export async function GET() {
  try {
    const { householdId } = await requireOwner();
    const rows = await listInvitations(householdId);
    return NextResponse.json({ invitations: rows.map(publicShape) });
  } catch (e) {
    return apiErrorResponse(e, "invitations:GET");
  }
}

export async function POST(req: Request) {
  try {
    const { householdId, userId } = await requireOwner();
    const { email } = await parseBody(req, createSchema);
    const created = await createInvitation(householdId, userId, email);
    return NextResponse.json(publicShape(created), { status: 201 });
  } catch (e) {
    return apiErrorResponse(e, "invitations:POST");
  }
}
```

`src/app/api/invitations/[id]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { ApiError } from "@/lib/api-error";
import { apiErrorResponse } from "@/lib/api-route";
import { assertMembership } from "@/lib/household";
import { revokeInvitation } from "@/lib/invitations";
import { requireHousehold } from "@/lib/session";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { householdId, userId } = await requireHousehold();
    const role = await assertMembership(householdId, userId);
    if (role !== "owner") throw new ApiError("Only the owner can manage invitations", 403);
    const id = Number((await params).id);
    if (!Number.isInteger(id)) throw new ApiError("Invalid invitation id", 400);
    await revokeInvitation(householdId, id);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    return apiErrorResponse(e, "invitations:DELETE");
  }
}
```

`src/app/api/invitations/mine/route.ts` — reads `auth()` directly: the caller usually has no household, so `requireHousehold()` would reject them.

```ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { apiErrorResponse } from "@/lib/api-route";
import { UnauthorizedError } from "@/lib/household";
import { pendingInvitationsForUser } from "@/lib/invitations";

export async function GET() {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) throw new UnauthorizedError();
    return NextResponse.json({ invitations: await pendingInvitationsForUser(userId) });
  } catch (e) {
    return apiErrorResponse(e, "invitations:mine");
  }
}
```

`src/app/api/invitations/[id]/accept/route.ts`:

```ts
import { NextResponse } from "next/server";
import { auth, unstable_update } from "@/auth";
import { ApiError } from "@/lib/api-error";
import { apiErrorResponse } from "@/lib/api-route";
import { UnauthorizedError } from "@/lib/household";
import { acceptInvitation } from "@/lib/invitations";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) throw new UnauthorizedError();
    const id = Number((await params).id);
    if (!Number.isInteger(id)) throw new ApiError("Invalid invitation id", 400);
    const householdId = await acceptInvitation(id, userId);
    // Rewrites the JWT cookie in this response (jwt callback, trigger "update").
    await unstable_update({});
    return NextResponse.json({ householdId });
  } catch (e) {
    return apiErrorResponse(e, "invitations:accept");
  }
}
```

`src/app/api/invitations/decline/route.ts`:

```ts
import { NextResponse } from "next/server";
import { auth, unstable_update } from "@/auth";
import { apiErrorResponse } from "@/lib/api-route";
import { UnauthorizedError } from "@/lib/household";
import { startOwnHousehold } from "@/lib/invitations";

export async function POST() {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) throw new UnauthorizedError();
    const householdId = await startOwnHousehold(userId);
    await unstable_update({});
    return NextResponse.json({ householdId });
  } catch (e) {
    return apiErrorResponse(e, "invitations:decline");
  }
}
```

- [ ] **Step 4: Run the invitation route tests — expect PASS**

Run: `npx vitest run src/app/api/invitations/__tests__/invitation-routes.test.ts`

- [ ] **Step 5: Write the failing member route tests**

`src/app/api/household/__tests__/members-routes.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { db } from "@/lib/db";
import { households, householdMembers, householdKeyWraps } from "@/lib/db/schema";
import { users } from "@/lib/db/schema-auth";

const currentSession = { householdId: 0, userId: "", role: "owner" as "owner" | "member" };
vi.mock("@/lib/session", () => ({
  requireHousehold: vi.fn(async () => ({ ...currentSession })),
}));

import { GET as membersGET } from "../members/route";
import { DELETE as memberDELETE } from "../members/[userId]/route";

const params = (userId: string) => ({ params: Promise.resolve({ userId }) });
let hid: number;

beforeEach(async () => {
  await db.delete(householdKeyWraps);
  await db.delete(householdMembers);
  await db.delete(households);
  await db.delete(users);
  for (const id of ["o", "m"]) {
    await db.insert(users).values({ id, email: `${id}@example.com`, name: id });
  }
  const [h] = await db.insert(households).values({ name: "H", ownerId: "o" }).returning();
  hid = h.id;
  await db.insert(householdMembers).values({ householdId: hid, userId: "o", role: "owner" });
  await db.insert(householdMembers).values({ householdId: hid, userId: "m", role: "member" });
  await db.insert(householdKeyWraps).values({ householdId: hid, userId: "o", wrappedKey: "W", wrappedBy: "o" });
  currentSession.householdId = hid;
  currentSession.userId = "o";
  currentSession.role = "owner";
});

describe("GET /api/household/members", () => {
  it("lists members with wrap state and identifies the caller", async () => {
    const res = await membersGET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.me).toEqual({ userId: "o", role: "owner" });
    expect(body.members).toEqual([
      { userId: "o", name: "o", email: "o@example.com", role: "owner", hasWrap: true },
      { userId: "m", name: "m", email: "m@example.com", role: "member", hasWrap: false },
    ]);
  });

  it("a member can read the list too (role comes from the database)", async () => {
    currentSession.userId = "m";
    currentSession.role = "owner";
    const body = await (await membersGET()).json();
    expect(body.me).toEqual({ userId: "m", role: "member" });
  });
});

describe("DELETE /api/household/members/[userId]", () => {
  it("owner removes a member", async () => {
    const res = await memberDELETE(new Request("http://localhost"), params("m"));
    expect(res.status).toBe(204);
    const body = await (await membersGET()).json();
    expect(body.members.map((m: { userId: string }) => m.userId)).toEqual(["o"]);
  });

  it("member cannot remove (403); owner cannot remove self (400); unknown is 404", async () => {
    currentSession.userId = "m";
    expect((await memberDELETE(new Request("http://localhost"), params("o"))).status).toBe(403);
    currentSession.userId = "o";
    expect((await memberDELETE(new Request("http://localhost"), params("o"))).status).toBe(400);
    expect((await memberDELETE(new Request("http://localhost"), params("zzz"))).status).toBe(404);
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run src/app/api/household/__tests__/members-routes.test.ts`
Expected: FAIL — cannot find module `../members/route`.

- [ ] **Step 7: Implement the member handlers**

`src/app/api/household/members/route.ts`:

```ts
import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-route";
import { assertMembership, listMembers } from "@/lib/household";
import { requireHousehold } from "@/lib/session";

export async function GET() {
  try {
    const { householdId, userId } = await requireHousehold();
    const role = await assertMembership(householdId, userId);
    const members = await listMembers(householdId);
    return NextResponse.json({ members, me: { userId, role } });
  } catch (e) {
    return apiErrorResponse(e, "household:members");
  }
}
```

`src/app/api/household/members/[userId]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-route";
import { removeMember } from "@/lib/household";
import { requireHousehold } from "@/lib/session";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { householdId, userId } = await requireHousehold();
    const target = (await params).userId;
    // removeMember re-checks the caller's role against the database.
    await removeMember(householdId, userId, target);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    return apiErrorResponse(e, "household:members:DELETE");
  }
}
```

- [ ] **Step 8: Run the member route tests — expect PASS**

Run: `npx vitest run src/app/api/household/__tests__/members-routes.test.ts`

- [ ] **Step 9: Lint, typecheck, full test run, commit**

Run: `npm run lint && npm run typecheck && npm test`

```bash
git add src/app/api/invitations src/app/api/household
git commit -m "feat(invitations): invitation and member route handlers (#197)"
```

---
### Task 10: Client flows — setup, unlock, wraps, passphrase, recovery

**Files:**
- Create: `src/components/crypto/flows.ts`
- Test: `src/components/crypto/__tests__/flows.test.ts`

**Interfaces:**
- Consumes: everything from `@/lib/crypto` (Tasks 2–3); `type CryptoStatus` from `@/lib/member-keys` and `type EncryptionMode` from `@/lib/encryption-mode` (type-only imports — no server code reaches the client bundle); the `/api/crypto/*` contract (Task 6).
- Produces:
  - `type StatusResponse = CryptoStatus & { mode: EncryptionMode }`.
  - `class FlowError extends Error { code: "wrong-passphrase" | "bad-recovery-code" | "http" | "state" }`.
  - `interface FlowOptions { kdfParams?: KdfParams }` — tests pass small parameters; production callers omit it.
  - `fetchStatus(): Promise<StatusResponse>`
  - `runSetup(status, passphrase, opts?): Promise<{ recoveryCode: string | null }>` — creates the member key pair; when `status.role === "owner" && !status.householdHasWraps` also creates the household data key and recovery kit and returns the formatted recovery code.
  - `runUnlock(status, passphrase): Promise<StoredKeys>` — unwraps and persists; throws `FlowError("wrong-passphrase")`.
  - `runFulfilPendingWraps(status, keys): Promise<{ count: number; names: string[] }>` — wraps the data key to every pending member; `names` is what the UI announces (member name, or email when the name is null).
  - `runAdoptWrap(status, keys): Promise<StoredKeys>` — a pending member whose wrap has arrived unwraps the data key with the private key already on this device (no passphrase needed) and persists it.
  - `runChangePassphrase(status, current, next, opts?): Promise<void>`
  - `runResetKeys(status, passphrase, opts?): Promise<void>` — new key pair, back to pending.
  - `runRecover(status, code, newPassphrase, opts?): Promise<{ recoveryCode: string }>` — throws `FlowError("bad-recovery-code")`.
  - `runRegenerateRecovery(status, keys, opts?): Promise<{ recoveryCode: string }>` (owner).
  - `runLock(): Promise<void>` — clears the device store.

This file may not touch `crypto.subtle` (ESLint, Task 4): every primitive comes through `@/lib/crypto`.

- [ ] **Step 1: Write the failing flow tests**

`src/components/crypto/__tests__/flows.test.ts`. It runs the real crypto library against an in-memory fake of the server: `fetch` is stubbed with a tiny handler that stores whatever the routes would store. That proves the client and server contracts agree on field names, and that a full owner → member → wrap → unlock cycle actually round-trips a data key.

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import "fake-indexeddb/auto";
import { clearKeys, loadKeys, seal, open } from "@/lib/crypto";
import { TEST_KDF_PARAMS } from "@/lib/crypto/__tests__/params";
import {
  FlowError,
  fetchStatus,
  runAdoptWrap,
  runChangePassphrase,
  runFulfilPendingWraps,
  runLock,
  runRecover,
  runRegenerateRecovery,
  runResetKeys,
  runSetup,
  runUnlock,
  type StatusResponse,
} from "../flows";

type Member = StatusResponse["memberKeys"];
type Recovery = StatusResponse["recovery"];

// Minimal in-memory stand-in for the /api/crypto routes of Task 6.
const server = {
  keys: new Map<string, NonNullable<Member>>(),
  wraps: new Map<string, string>(),
  recovery: null as Recovery,
  me: { userId: "o", role: "owner" as "owner" | "member" },
  status(): StatusResponse {
    return {
      mode: "on",
      userId: this.me.userId,
      householdId: 1,
      role: this.me.role,
      memberKeys: this.keys.get(this.me.userId) ?? null,
      wrap: this.wraps.get(this.me.userId) ?? null,
      householdHasWraps: this.wraps.size > 0,
      recovery: this.recovery,
    };
  },
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function handle(url: string, init?: RequestInit): Promise<Response> {
  const body = init?.body ? JSON.parse(String(init.body)) : undefined;
  const me = server.me.userId;
  switch (`${init?.method ?? "GET"} ${url}`) {
    case "GET /api/crypto/status":
      return json(server.status());
    case "POST /api/crypto/setup":
      server.keys.set(me, body.member);
      if (body.household) {
        server.wraps.set(me, body.household.wrappedKey);
        server.recovery = body.household.recovery;
      }
      return json({}, 201);
    case "GET /api/crypto/pending-wraps":
      return json({
        pending: [...server.keys.entries()]
          .filter(([id]) => !server.wraps.has(id))
          .map(([id, k]) => ({ userId: id, name: id, email: `${id}@x`, publicKey: k.publicKey })),
      });
    case "POST /api/crypto/wraps":
      for (const w of body.wraps) server.wraps.set(w.userId, w.wrappedKey);
      return json({ fulfilled: body.wraps.length });
    case "PUT /api/crypto/member-keys": {
      const k = server.keys.get(me)!;
      server.keys.set(me, { ...k, ...body });
      return json({});
    }
    case "POST /api/crypto/member-keys/reset":
      server.keys.set(me, body);
      server.wraps.delete(me);
      return json({});
    case "POST /api/crypto/recover":
      server.keys.set(me, body.member);
      server.wraps.set(me, body.wrappedKey);
      server.recovery = body.recovery;
      return json({});
    case "PUT /api/crypto/recovery":
      server.recovery = body;
      return json({});
    default:
      return json({ error: `unhandled ${init?.method} ${url}` }, 500);
  }
}

const opts = { kdfParams: TEST_KDF_PARAMS };

beforeEach(async () => {
  server.keys.clear();
  server.wraps.clear();
  server.recovery = null;
  server.me = { userId: "o", role: "owner" };
  await clearKeys();
  vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => handle(url, init)));
});

async function probe(key: CryptoKey) {
  const env = await seal(key, { hello: "world" }, "1:apartments:1");
  return open(key, env, "1:apartments:1");
}

describe("owner setup and unlock", () => {
  it("creates keys, a wrap, and a recovery kit; stores non-extractable keys", async () => {
    const { recoveryCode } = await runSetup(await fetchStatus(), "correct horse battery", opts);
    expect(recoveryCode).toMatch(/^[A-Z2-7]{5}(-[A-Z2-7]{5}){4}$/);
    expect(server.keys.get("o")?.kdf).toMatchObject({ ...TEST_KDF_PARAMS });
    expect(server.wraps.get("o")).toBeTruthy();
    expect(server.recovery).not.toBeNull();

    const keys = await loadKeys("o", 1);
    expect(keys?.privateKey.extractable).toBe(false);
    expect(keys?.dataKey?.extractable).toBe(false);
    expect(await probe(keys!.dataKey!)).toEqual({ hello: "world" });
  });

  it("unlock on a new device restores the same data key", async () => {
    await runSetup(await fetchStatus(), "correct horse battery", opts);
    const first = (await loadKeys("o", 1))!;
    const sealed = await seal(first.dataKey!, "secret", "1:t:1");
    await runLock();
    expect(await loadKeys("o", 1)).toBeNull();

    await expect(runUnlock(await fetchStatus(), "wrong passphrase!")).rejects.toMatchObject({
      code: "wrong-passphrase",
    });
    const keys = await runUnlock(await fetchStatus(), "correct horse battery");
    expect(await open(keys.dataKey!, sealed, "1:t:1")).toBe("secret");
    expect((await loadKeys("o", 1))?.dataKey).toBeTruthy();
  });

  it("member setup creates keys only and stores no data key", async () => {
    server.me = { userId: "m", role: "member" };
    const { recoveryCode } = await runSetup(await fetchStatus(), "member passphrase!", opts);
    expect(recoveryCode).toBeNull();
    expect(server.wraps.has("m")).toBe(false);
    expect((await loadKeys("m", 1))?.dataKey).toBeNull();
  });
});

describe("pending wraps", () => {
  it("owner wraps to a pending member, who can then unlock", async () => {
    server.me = { userId: "m", role: "member" };
    await runSetup(await fetchStatus(), "member passphrase!", opts);
    await runLock();

    server.me = { userId: "o", role: "owner" };
    await runSetup(await fetchStatus(), "owner passphrase!!", opts);
    const ownerKeys = (await loadKeys("o", 1))!;
    const sealed = await seal(ownerKeys.dataKey!, 42, "1:t:9");
    expect(await runFulfilPendingWraps(await fetchStatus(), ownerKeys)).toEqual({
      count: 1,
      names: ["m"],
    });
    expect(server.wraps.has("m")).toBe(true);
    expect((await runFulfilPendingWraps(await fetchStatus(), ownerKeys)).count).toBe(0);

    server.me = { userId: "m", role: "member" };
    const memberKeys = await runUnlock(await fetchStatus(), "member passphrase!");
    expect(await open(memberKeys.dataKey!, sealed, "1:t:9")).toBe(42);
  });

  it("a pending member adopts an arrived wrap without re-entering the passphrase", async () => {
    server.me = { userId: "m", role: "member" };
    await runSetup(await fetchStatus(), "member passphrase!", opts);
    const pendingKeys = (await loadKeys("m", 1))!;
    expect(pendingKeys.dataKey).toBeNull();

    server.me = { userId: "o", role: "owner" };
    await runSetup(await fetchStatus(), "owner passphrase!!", opts);
    const ownerKeys = (await loadKeys("o", 1))!;
    const sealed = await seal(ownerKeys.dataKey!, "hi", "1:t:2");
    await runFulfilPendingWraps(await fetchStatus(), ownerKeys);

    server.me = { userId: "m", role: "member" };
    const adopted = await runAdoptWrap(await fetchStatus(), pendingKeys);
    expect(await open(adopted.dataKey!, sealed, "1:t:2")).toBe("hi");
    expect((await loadKeys("m", 1))?.dataKey?.extractable).toBe(false);
  });
});

describe("change passphrase / reset", () => {
  it("change passphrase keeps the key pair and rejects the wrong current one", async () => {
    await runSetup(await fetchStatus(), "old passphrase!!", opts);
    const before = server.keys.get("o")!.publicKey;
    await expect(
      runChangePassphrase(await fetchStatus(), "not it at all", "new passphrase!!", opts)
    ).rejects.toMatchObject({ code: "wrong-passphrase" });
    await runChangePassphrase(await fetchStatus(), "old passphrase!!", "new passphrase!!", opts);
    expect(server.keys.get("o")!.publicKey).toBe(before);
    await runLock();
    const keys = await runUnlock(await fetchStatus(), "new passphrase!!");
    expect(keys.dataKey).toBeTruthy();
  });

  it("reset installs a new key pair and drops the wrap", async () => {
    await runSetup(await fetchStatus(), "old passphrase!!", opts);
    const before = server.keys.get("o")!.publicKey;
    await runResetKeys(await fetchStatus(), "fresh passphrase!", opts);
    expect(server.keys.get("o")!.publicKey).not.toBe(before);
    expect(server.wraps.has("o")).toBe(false);
    expect((await loadKeys("o", 1))?.dataKey).toBeNull();
  });
});

describe("recovery", () => {
  it("recovers the data key from the code and issues a new kit", async () => {
    const { recoveryCode } = await runSetup(await fetchStatus(), "old passphrase!!", opts);
    const sealed = await seal((await loadKeys("o", 1))!.dataKey!, "x", "1:t:1");
    await runLock();

    await expect(
      runRecover(await fetchStatus(), "AAAAA-AAAAA-AAAAA-AAAAA-AAAAB", "new passphrase!!", opts)
    ).rejects.toMatchObject({ code: "bad-recovery-code" });

    const result = await runRecover(
      await fetchStatus(),
      recoveryCode!.toLowerCase(),
      "new passphrase!!",
      opts
    );
    expect(result.recoveryCode).not.toBe(recoveryCode);
    const keys = (await loadKeys("o", 1))!;
    expect(await open(keys.dataKey!, sealed, "1:t:1")).toBe("x");

    // The old code no longer works, the new one does.
    await runLock();
    await expect(
      runRecover(await fetchStatus(), recoveryCode!, "another passphrase", opts)
    ).rejects.toMatchObject({ code: "bad-recovery-code" });
    await runRecover(await fetchStatus(), result.recoveryCode, "another passphrase", opts);
  });

  it("regenerate replaces the kit without touching keys", async () => {
    const { recoveryCode } = await runSetup(await fetchStatus(), "old passphrase!!", opts);
    const keys = (await loadKeys("o", 1))!;
    const { recoveryCode: next } = await runRegenerateRecovery(await fetchStatus(), keys, opts);
    expect(next).not.toBe(recoveryCode);
    await runLock();
    await runRecover(await fetchStatus(), next, "new passphrase!!", opts);
    expect((await loadKeys("o", 1))?.dataKey).toBeTruthy();
  });
});

describe("FlowError", () => {
  it("surfaces the server's error message on non-2xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ error: "Encryption is off for this deployment" }, 409))
    );
    await expect(fetchStatus()).rejects.toMatchObject({
      code: "http",
      message: "Encryption is off for this deployment",
    });
    expect(new FlowError("x", "state").code).toBe("state");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/crypto/__tests__/flows.test.ts`
Expected: FAIL — cannot find module `../flows`.

- [ ] **Step 3: Implement `flows.ts`**

`src/components/crypto/flows.ts`:

```ts
import {
  DEFAULT_KDF_PARAMS,
  clearKeys,
  deriveKek,
  exportPublicKey,
  fromBase64,
  generateDataKey,
  generateMemberKeypair,
  generateRecoveryCode,
  importPublicKey,
  normalizeRecoveryCode,
  randomSalt,
  saveKeys,
  toBase64,
  toStoredDataKey,
  unwrapDataKey,
  unwrapDataKeyWithKek,
  unwrapPrivateKey,
  wrapDataKey,
  wrapDataKeyWithKek,
  wrapPrivateKey,
  type KdfParams,
  type StoredKeys,
} from "@/lib/crypto";
import type { EncryptionMode } from "@/lib/encryption-mode";
import type { CryptoStatus, PendingWrap } from "@/lib/member-keys";

export type StatusResponse = CryptoStatus & { mode: EncryptionMode };

export type FlowErrorCode = "wrong-passphrase" | "bad-recovery-code" | "http" | "state";

export class FlowError extends Error {
  constructor(
    message: string,
    public readonly code: FlowErrorCode
  ) {
    super(message);
    this.name = "FlowError";
  }
}

export interface FlowOptions {
  // Tests pass small Argon2 parameters; production callers leave this unset.
  kdfParams?: KdfParams;
}

// The server's KDF row shape (src/lib/crypto-schemas.ts) carries the salt;
// the library's KdfParams does not. Split/join here.
type KdfRow = KdfParams & { salt: string };

function kdfRow(salt: Uint8Array, params: KdfParams): KdfRow {
  return { salt: toBase64(salt), ...params };
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let message = `${init?.method ?? "GET"} ${path} failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // keep the generic message
    }
    throw new FlowError(message, "http");
  }
  return (await res.json()) as T;
}

const post = <T>(path: string, body: unknown, method = "POST") =>
  api<T>(path, { method, body: JSON.stringify(body) });

export function fetchStatus(): Promise<StatusResponse> {
  return api<StatusResponse>("/api/crypto/status");
}

// AES-GCM unwrap fails with an OperationError on a wrong key; that is the
// only signal we get that the passphrase was wrong.
async function unwrapOrWrongPassphrase<T>(p: Promise<T>): Promise<T> {
  try {
    return await p;
  } catch {
    throw new FlowError("Wrong passphrase", "wrong-passphrase");
  }
}

function requireMemberKeys(status: StatusResponse) {
  if (!status.memberKeys) throw new FlowError("No keys to unlock", "state");
  return status.memberKeys;
}

async function makeMemberMaterial(passphrase: string, params: KdfParams) {
  const salt = randomSalt();
  const kek = await deriveKek(passphrase, salt, params);
  const pair = await generateMemberKeypair();
  const blob = await wrapPrivateKey(pair.privateKey, kek);
  return {
    pair,
    kek,
    blob,
    member: {
      publicKey: await exportPublicKey(pair.publicKey),
      wrappedPrivateKey: blob.wrapped,
      privateKeyIv: blob.iv,
      kdf: kdfRow(salt, params),
    },
  };
}

async function makeRecoveryKit(dataKey: CryptoKey, params: KdfParams) {
  const code = generateRecoveryCode();
  const compact = normalizeRecoveryCode(code);
  if (!compact) throw new FlowError("Generated an invalid recovery code", "state");
  const salt = randomSalt();
  const kek = await deriveKek(compact, salt, params);
  const blob = await wrapDataKeyWithKek(dataKey, kek);
  return {
    code,
    recovery: { wrappedKey: blob.wrapped, iv: blob.iv, kdf: kdfRow(salt, params) },
  };
}

export async function runSetup(
  status: StatusResponse,
  passphrase: string,
  opts: FlowOptions = {}
): Promise<{ recoveryCode: string | null }> {
  const params = opts.kdfParams ?? DEFAULT_KDF_PARAMS;
  if (status.memberKeys) throw new FlowError("Keys already exist", "state");
  const { pair, kek, blob, member } = await makeMemberMaterial(passphrase, params);

  const creator = status.role === "owner" && !status.householdHasWraps;
  let dataKey: CryptoKey | null = null;
  let recoveryCode: string | null = null;
  let household:
    | { wrappedKey: string; recovery: { wrappedKey: string; iv: string; kdf: KdfRow } }
    | undefined;

  if (creator) {
    dataKey = await generateDataKey();
    const kit = await makeRecoveryKit(dataKey, params);
    recoveryCode = kit.code;
    household = {
      wrappedKey: await wrapDataKey(dataKey, pair.publicKey),
      recovery: kit.recovery,
    };
  }

  await post("/api/crypto/setup", { member, household });

  await saveKeys({
    userId: status.userId,
    householdId: status.householdId,
    privateKey: await unwrapPrivateKey(blob, kek),
    dataKey: dataKey ? await toStoredDataKey(dataKey) : null,
  });
  return { recoveryCode };
}

export async function runUnlock(
  status: StatusResponse,
  passphrase: string
): Promise<StoredKeys> {
  const m = requireMemberKeys(status);
  const kek = await deriveKek(passphrase, fromBase64(m.kdf.salt), m.kdf);
  const privateKey = await unwrapOrWrongPassphrase(
    unwrapPrivateKey({ wrapped: m.wrappedPrivateKey, iv: m.privateKeyIv }, kek)
  );
  const dataKey = status.wrap ? await unwrapDataKey(status.wrap, privateKey) : null;
  const keys: StoredKeys = {
    userId: status.userId,
    householdId: status.householdId,
    privateKey,
    dataKey,
  };
  await saveKeys(keys);
  return keys;
}

// Wrapping needs an extractable data key; unwrap a transient copy from our
// own wrap and let it go out of scope. The stored key stays non-extractable.
async function transientDataKey(status: StatusResponse, keys: StoredKeys): Promise<CryptoKey> {
  if (!status.wrap) throw new FlowError("You do not hold the household key", "state");
  return unwrapDataKey(status.wrap, keys.privateKey, { extractable: true });
}

export async function runFulfilPendingWraps(
  status: StatusResponse,
  keys: StoredKeys
): Promise<{ count: number; names: string[] }> {
  const { pending } = await api<{ pending: PendingWrap[] }>("/api/crypto/pending-wraps");
  if (pending.length === 0) return { count: 0, names: [] };
  const dataKey = await transientDataKey(status, keys);
  const wraps = [];
  for (const p of pending) {
    const publicKey = await importPublicKey(p.publicKey);
    wraps.push({ userId: p.userId, wrappedKey: await wrapDataKey(dataKey, publicKey) });
  }
  const { fulfilled } = await post<{ fulfilled: number }>("/api/crypto/wraps", { wraps });
  return { count: fulfilled, names: pending.map((p) => p.name ?? p.email) };
}

export async function runAdoptWrap(
  status: StatusResponse,
  keys: StoredKeys
): Promise<StoredKeys> {
  if (!status.wrap) throw new FlowError("No wrap has arrived yet", "state");
  const adopted: StoredKeys = {
    ...keys,
    dataKey: await unwrapDataKey(status.wrap, keys.privateKey),
  };
  await saveKeys(adopted);
  return adopted;
}

export async function runChangePassphrase(
  status: StatusResponse,
  current: string,
  next: string,
  opts: FlowOptions = {}
): Promise<void> {
  const params = opts.kdfParams ?? DEFAULT_KDF_PARAMS;
  const m = requireMemberKeys(status);
  const oldKek = await deriveKek(current, fromBase64(m.kdf.salt), m.kdf);
  const transient = await unwrapOrWrongPassphrase(
    unwrapPrivateKey({ wrapped: m.wrappedPrivateKey, iv: m.privateKeyIv }, oldKek, {
      extractable: true,
    })
  );
  const salt = randomSalt();
  const newKek = await deriveKek(next, salt, params);
  const blob = await wrapPrivateKey(transient, newKek);
  await post(
    "/api/crypto/member-keys",
    { wrappedPrivateKey: blob.wrapped, privateKeyIv: blob.iv, kdf: kdfRow(salt, params) },
    "PUT"
  );
}

export async function runResetKeys(
  status: StatusResponse,
  passphrase: string,
  opts: FlowOptions = {}
): Promise<void> {
  const params = opts.kdfParams ?? DEFAULT_KDF_PARAMS;
  const { kek, blob, member } = await makeMemberMaterial(passphrase, params);
  await post("/api/crypto/member-keys/reset", member);
  await saveKeys({
    userId: status.userId,
    householdId: status.householdId,
    privateKey: await unwrapPrivateKey(blob, kek),
    dataKey: null,
  });
}

export async function runRecover(
  status: StatusResponse,
  code: string,
  newPassphrase: string,
  opts: FlowOptions = {}
): Promise<{ recoveryCode: string }> {
  const params = opts.kdfParams ?? DEFAULT_KDF_PARAMS;
  if (!status.recovery) throw new FlowError("This household has no recovery kit", "state");
  const compact = normalizeRecoveryCode(code);
  if (!compact) throw new FlowError("That recovery code is not valid", "bad-recovery-code");

  const r = status.recovery;
  const recoveryKek = await deriveKek(compact, fromBase64(r.kdf.salt), r.kdf);
  let dataKey: CryptoKey;
  try {
    dataKey = await unwrapDataKeyWithKek({ wrapped: r.wrappedKey, iv: r.iv }, recoveryKek, {
      extractable: true,
    });
  } catch {
    throw new FlowError("That recovery code is not valid", "bad-recovery-code");
  }

  const { pair, kek, blob, member } = await makeMemberMaterial(newPassphrase, params);
  const kit = await makeRecoveryKit(dataKey, params);
  await post("/api/crypto/recover", {
    member,
    wrappedKey: await wrapDataKey(dataKey, pair.publicKey),
    recovery: kit.recovery,
  });
  await saveKeys({
    userId: status.userId,
    householdId: status.householdId,
    privateKey: await unwrapPrivateKey(blob, kek),
    dataKey: await toStoredDataKey(dataKey),
  });
  return { recoveryCode: kit.code };
}

export async function runRegenerateRecovery(
  status: StatusResponse,
  keys: StoredKeys,
  opts: FlowOptions = {}
): Promise<{ recoveryCode: string }> {
  const params = opts.kdfParams ?? DEFAULT_KDF_PARAMS;
  const dataKey = await transientDataKey(status, keys);
  const kit = await makeRecoveryKit(dataKey, params);
  await post("/api/crypto/recovery", kit.recovery, "PUT");
  return { recoveryCode: kit.code };
}

export async function runLock(): Promise<void> {
  await clearKeys();
}
```

- [ ] **Step 4: Run the flow tests — expect PASS**

Run: `npx vitest run src/components/crypto/__tests__/flows.test.ts`
The suite derives ~20 Argon2 keys at `TEST_KDF_PARAMS`; expect it under 10 s. If `importPublicKey` rejects in `runFulfilPendingWraps`, check the fake server returns the member's `publicKey` unchanged — the SPKI base64 must round-trip verbatim.

- [ ] **Step 5: Lint, typecheck, full test run, commit**

Run: `npm run lint && npm run typecheck && npm test`
`npm run lint` is the layering check: `flows.ts` must import nothing from `hash-wasm` and reference no `crypto.subtle`.

```bash
git add src/components/crypto/flows.ts src/components/crypto/__tests__/flows.test.ts
git commit -m "feat(crypto): client flows for setup, unlock, wraps, passphrase, recovery (#183)"
```

---
### Task 11: CryptoProvider, gate, and the setup / unlock / pending / recovery-kit screens

**Files:**
- Create: `src/components/crypto/crypto-provider.tsx`
- Create: `src/components/crypto/crypto-gate.tsx`
- Create: `src/components/crypto/recovery-kit.tsx`
- Create: `src/components/crypto/setup-screen.tsx`
- Create: `src/components/crypto/unlock-screen.tsx`
- Create: `src/components/crypto/pending-screen.tsx`
- Modify: `src/app/apartments/layout.tsx`, `src/app/compare/layout.tsx`, `src/app/guide/layout.tsx`, `src/app/settings/layout.tsx` (wrap `{children}` in `<CryptoGate>`)
- Modify: `src/components/nav-bar.tsx:28-36` (sign-out clears the key store)
- Modify: `src/components/__tests__/nav-bar.test.tsx`
- Test: `src/components/crypto/__tests__/crypto-provider.test.tsx`, `src/components/crypto/__tests__/recovery-kit.test.tsx`

**Interfaces:**
- Consumes: Task 10's flows (`fetchStatus`, `runSetup`, `runUnlock`, `runAdoptWrap`, `runFulfilPendingWraps`, `runLock`, `FlowError`, `StatusResponse`); `loadKeys`, `isKeyStorePersistent`, `clearKeys`, `StoredKeys` from `@/lib/crypto`; `readEncryptionMode` from `@/lib/encryption-mode`.
- Produces:
  - `type CryptoState = "loading" | "error" | "off" | "needs-setup" | "pending-wrap" | "locked" | "unlocked"`.
  - `useCrypto(): CryptoContextValue` where `CryptoContextValue = { state; status: StatusResponse | null; keys: StoredKeys | null; error: string | null; persistent: boolean; refresh(): Promise<void>; setup(passphrase): Promise<void>; unlock(passphrase): Promise<void>; lock(): Promise<void>; showRecoveryKit(code: string): void }`. `keys.dataKey` is non-null whenever `state === "unlocked"` — that is the guarantee E3 builds on.
  - `<CryptoProvider mode>` renders the matching screen instead of `children` until `unlocked` (or `off`).
  - `<CryptoGate>` (server component) — `<CryptoProvider mode={readEncryptionMode()}>`. The spec says "the root layout" passes the mode; it goes in the four signed-in layouts instead, because the root layout also wraps `/` (sign-in) and `/invitations` (no household yet), where the provider must not call `/api/crypto/status` at all. Same pattern, narrower placement.
  - `<RecoveryKit code onContinue>` — shown once; Continue disabled until the acknowledgement is ticked. Task 12 reuses it for recover/regenerate.
  - `<UnlockScreen>` accepts `extra?: React.ReactNode` rendered under the form — Task 12 puts the "forgot passphrase" flows there.

- [ ] **Step 1: Write the failing recovery-kit test**

`src/components/crypto/__tests__/recovery-kit.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecoveryKit } from "../recovery-kit";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const CODE = "ABCDE-FGHIJ-KLMNO-PQRST-UVWXY";

describe("RecoveryKit", () => {
  it("shows the code and keeps Continue disabled until the acknowledgement is ticked", async () => {
    const user = userEvent.setup();
    const onContinue = vi.fn();
    render(<RecoveryKit code={CODE} onContinue={onContinue} />);

    expect(screen.getByText(CODE)).toBeInTheDocument();
    const cont = screen.getByRole("button", { name: /continue/i });
    expect(cont).toBeDisabled();
    await user.click(cont);
    expect(onContinue).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("checkbox", {
        name: /I understand that if I lose both my passphrase and this recovery kit/i,
      })
    );
    expect(cont).toBeEnabled();
    await user.click(cont);
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it("copies and prints", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async () => {});
    // navigator.clipboard is a prototype getter in jsdom; define an own
    // property over it rather than spreading navigator (which yields {}).
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    render(<RecoveryKit code={CODE} onContinue={() => {}} />);

    await user.click(screen.getByRole("button", { name: /copy/i }));
    expect(writeText).toHaveBeenCalledWith(CODE);
    expect(await screen.findByText(/copied/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /print/i }));
    expect(print).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Write the failing provider test**

`src/components/crypto/__tests__/crypto-provider.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { StatusResponse } from "../flows";
import type { StoredKeys } from "@/lib/crypto";

const flows = vi.hoisted(() => ({
  fetchStatus: vi.fn(),
  runSetup: vi.fn(),
  runUnlock: vi.fn(),
  runAdoptWrap: vi.fn(),
  runFulfilPendingWraps: vi.fn(),
  runLock: vi.fn(),
}));
const store = vi.hoisted(() => ({
  loadKeys: vi.fn(),
  clearKeys: vi.fn(),
  isKeyStorePersistent: vi.fn(() => true),
}));

vi.mock("../flows", async () => {
  const actual = await vi.importActual<typeof import("../flows")>("../flows");
  return { ...actual, ...flows };
});
vi.mock("@/lib/crypto", () => store);

import { CryptoProvider, useCrypto } from "../crypto-provider";
import { FlowError } from "../flows";

// Stand-ins: the provider never inspects a CryptoKey, it only passes them on.
const fakeKey = {} as CryptoKey;
const keysWithData: StoredKeys = { userId: "u", householdId: 1, privateKey: fakeKey, dataKey: fakeKey };
const keysPending: StoredKeys = { ...keysWithData, dataKey: null };

const member = {
  publicKey: "pub",
  wrappedPrivateKey: "w",
  privateKeyIv: "iv",
  kdf: { salt: "s", memoryKib: 65536, iterations: 3, parallelism: 1, version: 1 as const },
};

function status(over: Partial<StatusResponse> = {}): StatusResponse {
  return {
    mode: "on",
    userId: "u",
    householdId: 1,
    role: "owner",
    memberKeys: null,
    wrap: null,
    householdHasWraps: false,
    recovery: null,
    ...over,
  };
}

function Page() {
  const { state, keys } = useCrypto();
  return (
    <div>
      page:{state}:{keys?.dataKey ? "has-key" : "no-key"}
    </div>
  );
}

function renderApp(mode: "on" | "off" = "on") {
  return render(
    <CryptoProvider mode={mode}>
      <Page />
    </CryptoProvider>
  );
}

beforeEach(() => {
  store.loadKeys.mockResolvedValue(null);
  store.clearKeys.mockResolvedValue(undefined);
  store.isKeyStorePersistent.mockReturnValue(true);
  flows.runFulfilPendingWraps.mockResolvedValue({ count: 0, names: [] });
  flows.runLock.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("CryptoProvider", () => {
  it("off mode renders children without calling the API", async () => {
    renderApp("off");
    expect(await screen.findByText("page:off:no-key")).toBeInTheDocument();
    expect(flows.fetchStatus).not.toHaveBeenCalled();
    expect(store.loadKeys).not.toHaveBeenCalled();
  });

  it("shows the error state when status cannot be loaded", async () => {
    flows.fetchStatus.mockRejectedValue(new FlowError("Not authenticated", "http"));
    renderApp();
    expect(await screen.findByText(/Not authenticated/)).toBeInTheDocument();
    expect(screen.queryByText(/^page:/)).not.toBeInTheDocument();
  });

  describe("needs-setup", () => {
    beforeEach(() => {
      flows.fetchStatus.mockResolvedValue(status());
    });

    it("refuses short or mismatched passphrases without calling runSetup", async () => {
      const user = userEvent.setup();
      renderApp();
      const pass = await screen.findByLabelText(/^Passphrase$/i);
      const confirm = screen.getByLabelText(/Confirm passphrase/i);
      const submit = screen.getByRole("button", { name: /Create my keys/i });

      await user.type(pass, "short");
      await user.type(confirm, "short");
      await user.click(submit);
      expect(await screen.findByText(/at least 12 characters/i)).toBeInTheDocument();

      await user.clear(pass);
      await user.clear(confirm);
      await user.type(pass, "long enough passphrase");
      await user.type(confirm, "long enough passphrasX");
      await user.click(submit);
      expect(await screen.findByText(/do not match/i)).toBeInTheDocument();
      expect(flows.runSetup).not.toHaveBeenCalled();
    });

    it("owner setup shows the recovery kit, then the page after acknowledgement", async () => {
      const user = userEvent.setup();
      flows.runSetup.mockImplementation(async () => {
        flows.fetchStatus.mockResolvedValue(status({ memberKeys: member, wrap: "wrap", householdHasWraps: true }));
        store.loadKeys.mockResolvedValue(keysWithData);
        return { recoveryCode: "ABCDE-FGHIJ-KLMNO-PQRST-UVWXY" };
      });
      renderApp();
      await user.type(await screen.findByLabelText(/^Passphrase$/i), "long enough passphrase");
      await user.type(screen.getByLabelText(/Confirm passphrase/i), "long enough passphrase");
      await user.click(screen.getByRole("button", { name: /Create my keys/i }));

      expect(await screen.findByText("ABCDE-FGHIJ-KLMNO-PQRST-UVWXY")).toBeInTheDocument();
      expect(flows.runSetup).toHaveBeenCalledWith(expect.objectContaining({ role: "owner" }), "long enough passphrase");
      expect(screen.queryByText(/^page:/)).not.toBeInTheDocument();

      await user.click(screen.getByRole("checkbox"));
      await user.click(screen.getByRole("button", { name: /continue/i }));
      expect(await screen.findByText("page:unlocked:has-key")).toBeInTheDocument();
    });

    it("member setup goes straight to pending-wrap", async () => {
      const user = userEvent.setup();
      flows.fetchStatus.mockResolvedValue(status({ role: "member", householdHasWraps: true }));
      flows.runSetup.mockImplementation(async () => {
        flows.fetchStatus.mockResolvedValue(status({ role: "member", householdHasWraps: true, memberKeys: member }));
        store.loadKeys.mockResolvedValue(keysPending);
        return { recoveryCode: null };
      });
      renderApp();
      await user.type(await screen.findByLabelText(/^Passphrase$/i), "long enough passphrase");
      await user.type(screen.getByLabelText(/Confirm passphrase/i), "long enough passphrase");
      await user.click(screen.getByRole("button", { name: /Create my keys/i }));
      expect(
        await screen.findByText(/Waiting for someone in your household to open Flatpare/)
      ).toBeInTheDocument();
    });
  });

  describe("locked", () => {
    beforeEach(() => {
      flows.fetchStatus.mockResolvedValue(status({ memberKeys: member, wrap: "wrap", householdHasWraps: true }));
    });

    it("shows wrong-passphrase and then unlocks; fulfils pending wraps and announces them", async () => {
      const user = userEvent.setup();
      flows.runUnlock
        .mockRejectedValueOnce(new FlowError("Wrong passphrase", "wrong-passphrase"))
        .mockResolvedValueOnce(keysWithData);
      flows.runFulfilPendingWraps.mockResolvedValue({ count: 1, names: ["Bob"] });
      renderApp();

      const pass = await screen.findByLabelText(/^Passphrase$/i);
      await user.type(pass, "nope nope nope");
      await user.click(screen.getByRole("button", { name: /^Unlock$/i }));
      expect(await screen.findByText(/Wrong passphrase/)).toBeInTheDocument();
      expect(screen.queryByText(/^page:/)).not.toBeInTheDocument();

      await user.clear(pass);
      await user.type(pass, "correct passphrase");
      await user.click(screen.getByRole("button", { name: /^Unlock$/i }));
      expect(await screen.findByText("page:unlocked:has-key")).toBeInTheDocument();
      await waitFor(() => expect(flows.runFulfilPendingWraps).toHaveBeenCalledTimes(1));
      expect(await screen.findByText(/Bob can now open Flatpare/)).toBeInTheDocument();
    });

    it("warns when the key store is not persistent", async () => {
      store.isKeyStorePersistent.mockReturnValue(false);
      renderApp();
      await screen.findByLabelText(/^Passphrase$/i);
      expect(screen.getByText(/can't remember your keys between visits/i)).toBeInTheDocument();
    });
  });

  describe("pending-wrap", () => {
    it("polls status every 15 s and adopts the wrap when it arrives", async () => {
      vi.useFakeTimers();
      store.loadKeys.mockResolvedValue(keysPending);
      flows.fetchStatus.mockResolvedValue(status({ role: "member", memberKeys: member, householdHasWraps: true }));
      renderApp();
      await act(async () => {});
      expect(screen.getByText(/Waiting for someone in your household/)).toBeInTheDocument();
      expect(flows.fetchStatus).toHaveBeenCalledTimes(1);

      flows.fetchStatus.mockResolvedValue(
        status({ role: "member", memberKeys: member, householdHasWraps: true, wrap: "wrap" })
      );
      flows.runAdoptWrap.mockResolvedValue(keysWithData);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(15_000);
      });
      expect(flows.fetchStatus).toHaveBeenCalledTimes(2);
      expect(flows.runAdoptWrap).toHaveBeenCalledWith(expect.objectContaining({ wrap: "wrap" }), keysPending);
      expect(screen.getByText("page:unlocked:has-key")).toBeInTheDocument();
    });
  });

  describe("unlocked", () => {
    it("renders children immediately when keys are on the device, and lock() returns to the unlock screen", async () => {
      store.loadKeys.mockResolvedValue(keysWithData);
      flows.fetchStatus.mockResolvedValue(status({ memberKeys: member, wrap: "wrap", householdHasWraps: true }));
      function LockButton() {
        const { lock } = useCrypto();
        return <button onClick={() => lock()}>lock now</button>;
      }
      const user = userEvent.setup();
      render(
        <CryptoProvider mode="on">
          <Page />
          <LockButton />
        </CryptoProvider>
      );
      expect(await screen.findByText("page:unlocked:has-key")).toBeInTheDocument();
      await user.click(screen.getByText("lock now"));
      expect(flows.runLock).toHaveBeenCalled();
      expect(await screen.findByLabelText(/^Passphrase$/i)).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 3: Run both — expect FAIL (modules missing)**

Run: `npx vitest run src/components/crypto/__tests__/`

- [ ] **Step 4: Implement `recovery-kit.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export const RECOVERY_ACK =
  "I understand that if I lose both my passphrase and this recovery kit, my household's data cannot be recovered by anyone, including Flatpare.";

export function RecoveryKit({
  code,
  onContinue,
  title = "Your recovery kit",
}: {
  code: string;
  onContinue: () => void;
  title?: string;
}) {
  const [acked, setAcked] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
  }

  return (
    <div className="mx-auto max-w-md space-y-4 print:max-w-none">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="text-sm text-muted-foreground print:hidden">
        Write this code down or print it and keep it somewhere safe. It is the
        only way to get your household&apos;s data back if you forget your
        passphrase and nobody else in your household can let you in. It is
        shown once.
      </p>
      <p className="rounded-md border bg-muted p-4 text-center font-mono text-lg tracking-wider">
        {code}
      </p>
      <div className="flex gap-2 print:hidden">
        <Button type="button" variant="outline" onClick={copy}>
          Copy
        </Button>
        <Button type="button" variant="outline" onClick={() => window.print()}>
          Print
        </Button>
        {copied && <span className="self-center text-sm text-muted-foreground">Copied.</span>}
      </div>
      <label className="flex items-start gap-2 text-sm print:hidden">
        <input
          type="checkbox"
          className="mt-1"
          checked={acked}
          onChange={(e) => setAcked(e.target.checked)}
        />
        <span>{RECOVERY_ACK}</span>
      </label>
      <Button type="button" className="print:hidden" disabled={!acked} onClick={onContinue}>
        Continue
      </Button>
    </div>
  );
}
```

Tailwind's `print:` variant is the "print stylesheet" the spec asks for: only the title and the code survive on paper.

- [ ] **Step 5: Implement the three screens**

`src/components/crypto/setup-screen.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCrypto } from "./crypto-provider";

export const MIN_PASSPHRASE_LENGTH = 12;

export function SetupScreen() {
  const { status, setup } = useCrypto();
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const creator = status?.role === "owner" && !status.householdHasWraps;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
      setError(`Use at least ${MIN_PASSPHRASE_LENGTH} characters.`);
      return;
    }
    if (passphrase !== confirm) {
      setError("The passphrases do not match.");
      return;
    }
    setBusy(true);
    try {
      await setup(passphrase);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup failed");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-md space-y-4">
      <h1 className="text-xl font-semibold">Choose a passphrase</h1>
      <p className="text-sm text-muted-foreground">
        Flatpare encrypts your household&apos;s data in your browser. This
        passphrase protects your keys; Flatpare never sees it and cannot reset
        it for you.
        {creator
          ? " You will get a recovery kit on the next screen — keep it safe."
          : " Once your keys exist, someone in your household will let you in automatically the next time they open Flatpare."}
      </p>
      <div className="space-y-1">
        <Label htmlFor="setup-passphrase">Passphrase</Label>
        <Input
          id="setup-passphrase"
          type="password"
          autoComplete="new-password"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="setup-confirm">Confirm passphrase</Label>
        <Input
          id="setup-confirm"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={busy}>
        {busy ? "Creating keys…" : "Create my keys"}
      </Button>
    </form>
  );
}
```

`src/components/crypto/unlock-screen.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCrypto } from "./crypto-provider";

export function UnlockScreen({ extra }: { extra?: React.ReactNode }) {
  const { unlock, persistent } = useCrypto();
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await unlock(passphrase);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unlock failed");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <form onSubmit={onSubmit} className="space-y-4">
        <h1 className="text-xl font-semibold">Unlock Flatpare</h1>
        <p className="text-sm text-muted-foreground">
          Enter your passphrase to decrypt your household&apos;s data on this
          device.
        </p>
        {!persistent && (
          <p className="text-sm text-muted-foreground">
            This browser can&apos;t remember your keys between visits (private
            browsing?), so you&apos;ll be asked for your passphrase each time.
          </p>
        )}
        <div className="space-y-1">
          <Label htmlFor="unlock-passphrase">Passphrase</Label>
          <Input
            id="unlock-passphrase"
            type="password"
            autoComplete="current-password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={busy || passphrase.length === 0}>
          {busy ? "Unlocking…" : "Unlock"}
        </Button>
      </form>
      {extra}
    </div>
  );
}
```

`src/components/crypto/pending-screen.tsx`:

```tsx
"use client";

export function PendingScreen() {
  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-xl font-semibold">Almost there</h1>
      <p className="text-sm text-muted-foreground">
        Waiting for someone in your household to open Flatpare. They don&apos;t
        need to do anything — it happens automatically.
      </p>
      <p className="text-sm text-muted-foreground">
        This page checks again every 15 seconds.
      </p>
    </div>
  );
}
```

- [ ] **Step 6: Implement `crypto-provider.tsx`**

```tsx
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { isKeyStorePersistent, loadKeys, type StoredKeys } from "@/lib/crypto";
import type { EncryptionMode } from "@/lib/encryption-mode";
import {
  fetchStatus,
  runAdoptWrap,
  runFulfilPendingWraps,
  runLock,
  runSetup,
  runUnlock,
  type StatusResponse,
} from "./flows";
import { RecoveryKit } from "./recovery-kit";
import { SetupScreen } from "./setup-screen";
import { UnlockScreen } from "./unlock-screen";
import { PendingScreen } from "./pending-screen";

export type CryptoState =
  | "loading"
  | "error"
  | "off"
  | "needs-setup"
  | "pending-wrap"
  | "locked"
  | "unlocked";

export interface CryptoContextValue {
  state: CryptoState;
  status: StatusResponse | null;
  keys: StoredKeys | null;
  error: string | null;
  persistent: boolean;
  refresh: () => Promise<void>;
  setup: (passphrase: string) => Promise<void>;
  unlock: (passphrase: string) => Promise<void>;
  lock: () => Promise<void>;
  // Task 12's recover/regenerate flows hand their fresh code here so the kit
  // is shown through the same one-time screen as setup.
  showRecoveryKit: (code: string) => void;
}

const PENDING_POLL_MS = 15_000;
const WRAP_SWEEP_MS = 60_000;
const NOTICE_MS = 8_000;

const CryptoContext = createContext<CryptoContextValue | null>(null);

export function useCrypto(): CryptoContextValue {
  const ctx = useContext(CryptoContext);
  if (!ctx) throw new Error("useCrypto must be used inside <CryptoProvider>");
  return ctx;
}

function deriveState(status: StatusResponse, keys: StoredKeys | null): CryptoState {
  if (status.mode === "off") return "off";
  if (!status.memberKeys) return "needs-setup";
  if (!keys) return "locked";
  if (keys.dataKey) return "unlocked";
  // Private key on this device, no data key yet: either nobody has wrapped
  // to us (pending) or a wrap arrived and load() will adopt it on next pass.
  return status.wrap ? "locked" : "pending-wrap";
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong";
}

export function CryptoProvider({
  mode,
  children,
}: {
  mode: EncryptionMode;
  children: React.ReactNode;
}) {
  const [state, setState] = useState<CryptoState>(mode === "off" ? "off" : "loading");
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [keys, setKeys] = useState<StoredKeys | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [persistent, setPersistent] = useState(true);
  const [kitCode, setKitCode] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const sweeping = useRef(false);

  const apply = useCallback((s: StatusResponse, k: StoredKeys | null) => {
    setStatus(s);
    setKeys(k);
    setPersistent(isKeyStorePersistent());
    setState(deriveState(s, k));
  }, []);

  const refresh = useCallback(async () => {
    try {
      const s = await fetchStatus();
      let k = s.mode === "off" ? null : await loadKeys(s.userId, s.householdId);
      if (k && !k.dataKey && s.wrap) k = await runAdoptWrap(s, k);
      setError(null);
      apply(s, k);
    } catch (err) {
      setError(describe(err));
      setState("error");
    }
  }, [apply]);

  useEffect(() => {
    if (mode === "off") return;
    void refresh();
  }, [mode, refresh]);

  // pending-wrap: poll until a wrap arrives.
  useEffect(() => {
    if (state !== "pending-wrap") return;
    const id = setInterval(() => void refresh(), PENDING_POLL_MS);
    return () => clearInterval(id);
  }, [state, refresh]);

  // unlocked: let pending members in, now and periodically.
  useEffect(() => {
    if (state !== "unlocked" || !status || !keys) return;
    const sweep = async () => {
      if (sweeping.current) return;
      sweeping.current = true;
      try {
        const { count, names } = await runFulfilPendingWraps(status, keys);
        if (count > 0) setNotice(`${names.join(", ")} can now open Flatpare.`);
      } catch (err) {
        console.error("[crypto:wraps]", err);
      } finally {
        sweeping.current = false;
      }
    };
    void sweep();
    const id = setInterval(() => void sweep(), WRAP_SWEEP_MS);
    return () => clearInterval(id);
  }, [state, status, keys]);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(id);
  }, [notice]);

  const setup = useCallback(
    async (passphrase: string) => {
      if (!status) throw new Error("Status not loaded");
      const { recoveryCode } = await runSetup(status, passphrase);
      if (recoveryCode) setKitCode(recoveryCode);
      await refresh();
    },
    [status, refresh]
  );

  const unlock = useCallback(
    async (passphrase: string) => {
      if (!status) throw new Error("Status not loaded");
      const k = await runUnlock(status, passphrase);
      apply(status, k);
    },
    [status, apply]
  );

  const lock = useCallback(async () => {
    await runLock();
    if (status) apply(status, null);
  }, [status, apply]);

  const value: CryptoContextValue = {
    state,
    status,
    keys,
    error,
    persistent,
    refresh,
    setup,
    unlock,
    lock,
    showRecoveryKit: setKitCode,
  };

  let body: React.ReactNode;
  if (kitCode) {
    body = <RecoveryKit code={kitCode} onContinue={() => setKitCode(null)} />;
  } else {
    switch (state) {
      case "off":
      case "unlocked":
        body = children;
        break;
      case "loading":
        body = <p className="text-sm text-muted-foreground">Loading…</p>;
        break;
      case "error":
        body = (
          <div className="mx-auto max-w-md space-y-2">
            <p className="text-sm text-destructive">{error}</p>
            <button type="button" className="text-sm underline" onClick={() => void refresh()}>
              Try again
            </button>
          </div>
        );
        break;
      case "needs-setup":
        body = <SetupScreen />;
        break;
      case "pending-wrap":
        body = <PendingScreen />;
        break;
      case "locked":
        body = <UnlockScreen />;
        break;
    }
  }

  return (
    <CryptoContext.Provider value={value}>
      {body}
      {notice && (
        <div
          role="status"
          className="fixed bottom-20 left-1/2 -translate-x-1/2 rounded-md border bg-background px-4 py-2 text-sm shadow sm:bottom-6"
        >
          {notice}
        </div>
      )}
    </CryptoContext.Provider>
  );
}
```

`src/components/crypto/crypto-gate.tsx`:

```tsx
import { readEncryptionMode } from "@/lib/encryption-mode";
import { CryptoProvider } from "./crypto-provider";

// Server component: reads the env var once per request so no env access
// ships to the client. Layouts wrap their page content in this.
export function CryptoGate({ children }: { children: React.ReactNode }) {
  return <CryptoProvider mode={readEncryptionMode()}>{children}</CryptoProvider>;
}
```

- [ ] **Step 7: Run the component tests — expect PASS**

Run: `npx vitest run src/components/crypto/__tests__/`

If the pending-wrap test times out, the culprit is usually the first `act(async () => {})` not flushing the initial `refresh()` — the promise chain there is `fetchStatus → loadKeys`; both are resolved mocks, so two microtask turns suffice. Under fake timers `await act(async () => {})` flushes them.

- [ ] **Step 8: Wrap the four layouts and clear the store on sign-out**

In each of `src/app/apartments/layout.tsx`, `src/app/compare/layout.tsx`, `src/app/guide/layout.tsx`, `src/app/settings/layout.tsx` add the import and wrap the page content. `apartments/layout.tsx` becomes:

```tsx
import { auth } from "@/auth";
import { NavBar } from "@/components/nav-bar";
import { CryptoGate } from "@/components/crypto/crypto-gate";

export default async function ApartmentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const userName = session?.user?.name ?? "Unknown";

  return (
    <>
      <NavBar userName={userName} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 pb-20 sm:pb-6">
        <CryptoGate>{children}</CryptoGate>
      </main>
    </>
  );
}
```

`compare`, `guide`, and `settings` get the identical change: same import line, and `{children}` inside `<main>` becomes `<CryptoGate>{children}</CryptoGate>`. Keep each layout's existing `<main>` className untouched (`compare` has no `mx-auto max-w-5xl`).

`src/components/nav-bar.tsx`: add `import { clearKeys } from "@/lib/crypto";` and change `handleSignOut` to clear the device store before signing out:

```tsx
  async function handleSignOut() {
    if (getUnsavedRating()) {
      const ok = window.confirm(
        "You have unsaved rating changes. Sign out anyway? Your input will be discarded."
      );
      if (!ok) return;
    }
    await clearKeys();
    await signOut({ callbackUrl: "/" });
  }
```

`src/components/__tests__/nav-bar.test.tsx`: add the store mock next to the `next-auth/react` mock, and assert it in the sign-out test.

```tsx
const clearKeysMock = vi.fn(async () => {});
vi.mock("@/lib/crypto", () => ({
  clearKeys: () => clearKeysMock(),
}));
```

and in `"signs out when 'Sign out' is clicked"`, after the existing `waitFor` on `signOutMock`, add:

```tsx
    expect(clearKeysMock).toHaveBeenCalledTimes(1);
```

Also reset it in `beforeEach`: `clearKeysMock.mockClear();`.

- [ ] **Step 9: Lint, typecheck, full test run, commit**

Run: `npm run lint && npm run typecheck && npm test`

`crypto-gate.tsx` is a server component that imports a client component — allowed, that is the standard boundary. If `next build` complains that `readEncryptionMode` is reached from a client bundle, a `"use client"` file has imported `@/lib/encryption-mode` as a value instead of `import type` — the provider must only use the type.

```bash
git add src/components/crypto src/components/nav-bar.tsx src/components/__tests__/nav-bar.test.tsx \
  src/app/apartments/layout.tsx src/app/compare/layout.tsx src/app/guide/layout.tsx src/app/settings/layout.tsx
git commit -m "feat(crypto): CryptoProvider gate with setup, unlock, pending, and recovery-kit screens (#183)"
```

---
### Task 12: Forgot-passphrase flows and the encryption settings panel

**Files:**
- Create: `src/components/crypto/forgot-passphrase.tsx`
- Create: `src/components/crypto/encryption-settings.tsx`
- Modify: `src/components/crypto/crypto-provider.tsx` (export `CryptoContext`; render `<UnlockScreen extra={<ForgotPassphrase />} />`)
- Modify: `src/app/settings/page.tsx:269-271` (mount `<EncryptionSettings />` under the heading)
- Modify: `src/app/settings/__tests__/settings-page.test.tsx` (mock the new panel)
- Test: `src/components/crypto/__tests__/forgot-passphrase.test.tsx`, `src/components/crypto/__tests__/encryption-settings.test.tsx`

**Interfaces:**
- Consumes: `useCrypto`, `CryptoContextValue`, `UnlockScreen`'s `extra` prop (Task 11); `runResetKeys`, `runRecover`, `runChangePassphrase`, `runRegenerateRecovery`, `FlowError` (Task 10); `MIN_PASSPHRASE_LENGTH` from `./setup-screen`.
- Produces: `CryptoContext` exported from `crypto-provider.tsx` (so tests can supply a hand-built `CryptoContextValue`); `<ForgotPassphrase />`; `<EncryptionSettings />`. Task 13 mounts `<HouseholdSettings />` next to `<EncryptionSettings />` on the settings page.

- [ ] **Step 1: Export the context and mount the forgot flow**

In `src/components/crypto/crypto-provider.tsx`:

- change `const CryptoContext = createContext<CryptoContextValue | null>(null);` to `export const CryptoContext = createContext<CryptoContextValue | null>(null);` with the comment `// Exported so component tests can render consumers under a hand-built value.`
- add `import { ForgotPassphrase } from "./forgot-passphrase";`
- change `case "locked": body = <UnlockScreen />;` to `case "locked": body = <UnlockScreen extra={<ForgotPassphrase />} />;`

- [ ] **Step 2: Write the failing forgot-passphrase test**

`src/components/crypto/__tests__/forgot-passphrase.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { StatusResponse } from "../flows";

const flows = vi.hoisted(() => ({
  runResetKeys: vi.fn(),
  runRecover: vi.fn(),
}));
vi.mock("../flows", async () => {
  const actual = await vi.importActual<typeof import("../flows")>("../flows");
  return { ...actual, ...flows };
});

import { CryptoContext, type CryptoContextValue } from "../crypto-provider";
import { ForgotPassphrase } from "../forgot-passphrase";
import { FlowError } from "../flows";

const member = {
  publicKey: "pub",
  wrappedPrivateKey: "w",
  privateKeyIv: "iv",
  kdf: { salt: "s", memoryKib: 65536, iterations: 3, parallelism: 1, version: 1 as const },
};
const recovery = { wrappedKey: "rk", iv: "riv", kdf: member.kdf };

function ctx(over: Partial<StatusResponse> = {}): CryptoContextValue {
  return {
    state: "locked",
    status: {
      mode: "on",
      userId: "u",
      householdId: 1,
      role: "owner",
      memberKeys: member,
      wrap: "wrap",
      householdHasWraps: true,
      recovery: null,
      ...over,
    },
    keys: null,
    error: null,
    persistent: true,
    refresh: vi.fn(async () => {}),
    setup: vi.fn(async () => {}),
    unlock: vi.fn(async () => {}),
    lock: vi.fn(async () => {}),
    showRecoveryKit: vi.fn(),
  };
}

function renderWith(value: CryptoContextValue) {
  return render(
    <CryptoContext.Provider value={value}>
      <ForgotPassphrase />
    </CryptoContext.Provider>
  );
}

beforeEach(() => {
  flows.runResetKeys.mockResolvedValue(undefined);
});
afterEach(() => cleanup());

describe("ForgotPassphrase", () => {
  it("is collapsed until clicked and hides the recovery option without a kit", async () => {
    const user = userEvent.setup();
    renderWith(ctx());
    expect(screen.queryByText(/Reset my keys/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Forgot your passphrase/i }));
    expect(screen.getByRole("button", { name: /Reset my keys/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Use my recovery kit/i })).not.toBeInTheDocument();
  });

  it("reset asks for a new passphrase, calls runResetKeys, and refreshes", async () => {
    const user = userEvent.setup();
    const value = ctx();
    renderWith(value);
    await user.click(screen.getByRole("button", { name: /Forgot your passphrase/i }));
    await user.click(screen.getByRole("button", { name: /Reset my keys/i }));
    await user.type(screen.getByLabelText(/^New passphrase$/i), "a brand new passphrase");
    await user.type(screen.getByLabelText(/Confirm new passphrase/i), "a brand new passphrase");
    await user.click(screen.getByRole("button", { name: /Reset and wait/i }));
    expect(flows.runResetKeys).toHaveBeenCalledWith(value.status, "a brand new passphrase");
    expect(value.refresh).toHaveBeenCalled();
  });

  it("recover rejects a bad code, then shows the new kit on success", async () => {
    const user = userEvent.setup();
    const value = ctx({ recovery });
    flows.runRecover
      .mockRejectedValueOnce(new FlowError("That recovery code is not valid", "bad-recovery-code"))
      .mockResolvedValueOnce({ recoveryCode: "NEWCO-DENEW-CODEN-EWCOD-ENEWC" });
    renderWith(value);
    await user.click(screen.getByRole("button", { name: /Forgot your passphrase/i }));
    await user.click(screen.getByRole("button", { name: /Use my recovery kit/i }));

    await user.type(screen.getByLabelText(/Recovery code/i), "bad code");
    await user.type(screen.getByLabelText(/^New passphrase$/i), "a brand new passphrase");
    await user.type(screen.getByLabelText(/Confirm new passphrase/i), "a brand new passphrase");
    await user.click(screen.getByRole("button", { name: /^Recover$/i }));
    expect(await screen.findByText(/not valid/)).toBeInTheDocument();
    expect(value.showRecoveryKit).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText(/Recovery code/i));
    await user.type(screen.getByLabelText(/Recovery code/i), "ABCDE-FGHIJ-KLMNO-PQRST-UVWXY");
    await user.click(screen.getByRole("button", { name: /^Recover$/i }));
    expect(await screen.findByText(/old recovery kit no longer works/i)).toBeInTheDocument();
    expect(flows.runRecover).toHaveBeenLastCalledWith(
      value.status,
      "ABCDE-FGHIJ-KLMNO-PQRST-UVWXY",
      "a brand new passphrase"
    );
    expect(value.showRecoveryKit).toHaveBeenCalledWith("NEWCO-DENEW-CODEN-EWCOD-ENEWC");
    expect(value.refresh).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Write the failing encryption-settings test**

`src/components/crypto/__tests__/encryption-settings.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { StatusResponse } from "../flows";
import type { StoredKeys } from "@/lib/crypto";

const flows = vi.hoisted(() => ({
  runChangePassphrase: vi.fn(),
  runRegenerateRecovery: vi.fn(),
}));
vi.mock("../flows", async () => {
  const actual = await vi.importActual<typeof import("../flows")>("../flows");
  return { ...actual, ...flows };
});

import { CryptoContext, type CryptoContextValue } from "../crypto-provider";
import { EncryptionSettings } from "../encryption-settings";
import { FlowError } from "../flows";

const member = {
  publicKey: "pub",
  wrappedPrivateKey: "w",
  privateKeyIv: "iv",
  kdf: { salt: "s", memoryKib: 65536, iterations: 3, parallelism: 1, version: 1 as const },
};
const fakeKey = {} as CryptoKey;
const keys: StoredKeys = { userId: "u", householdId: 1, privateKey: fakeKey, dataKey: fakeKey };

function ctx(over: Partial<CryptoContextValue> = {}, status: Partial<StatusResponse> = {}): CryptoContextValue {
  return {
    state: "unlocked",
    status: {
      mode: "on",
      userId: "u",
      householdId: 1,
      role: "owner",
      memberKeys: member,
      wrap: "wrap",
      householdHasWraps: true,
      recovery: { wrappedKey: "rk", iv: "riv", kdf: member.kdf },
      ...status,
    },
    keys,
    error: null,
    persistent: true,
    refresh: vi.fn(async () => {}),
    setup: vi.fn(async () => {}),
    unlock: vi.fn(async () => {}),
    lock: vi.fn(async () => {}),
    showRecoveryKit: vi.fn(),
    ...over,
  };
}

function renderWith(value: CryptoContextValue) {
  return render(
    <CryptoContext.Provider value={value}>
      <EncryptionSettings />
    </CryptoContext.Provider>
  );
}

beforeEach(() => {
  flows.runChangePassphrase.mockResolvedValue(undefined);
  flows.runRegenerateRecovery.mockResolvedValue({ recoveryCode: "NEWCO-DENEW-CODEN-EWCOD-ENEWC" });
});
afterEach(() => cleanup());

describe("EncryptionSettings", () => {
  it("says so when encryption is off", () => {
    renderWith(ctx({ state: "off", status: null, keys: null }));
    expect(screen.getByText(/Encryption: off — set by this deployment/)).toBeInTheDocument();
    expect(screen.queryByText(/Change passphrase/)).not.toBeInTheDocument();
  });

  it("changes the passphrase and reports the wrong current one", async () => {
    const user = userEvent.setup();
    const value = ctx();
    flows.runChangePassphrase
      .mockRejectedValueOnce(new FlowError("Wrong passphrase", "wrong-passphrase"))
      .mockResolvedValueOnce(undefined);
    renderWith(value);

    await user.type(screen.getByLabelText(/Current passphrase/i), "wrong one here");
    await user.type(screen.getByLabelText(/^New passphrase$/i), "a brand new passphrase");
    await user.type(screen.getByLabelText(/Confirm new passphrase/i), "a brand new passphrase");
    await user.click(screen.getByRole("button", { name: /Change passphrase/i }));
    expect(await screen.findByText(/Wrong passphrase/)).toBeInTheDocument();

    await user.clear(screen.getByLabelText(/Current passphrase/i));
    await user.type(screen.getByLabelText(/Current passphrase/i), "the current one");
    await user.click(screen.getByRole("button", { name: /Change passphrase/i }));
    expect(await screen.findByText(/Passphrase changed/)).toBeInTheDocument();
    expect(flows.runChangePassphrase).toHaveBeenLastCalledWith(
      value.status,
      "the current one",
      "a brand new passphrase"
    );
    expect(value.refresh).toHaveBeenCalled();
  });

  it("locks this device", async () => {
    const user = userEvent.setup();
    const value = ctx();
    renderWith(value);
    await user.click(screen.getByRole("button", { name: /Lock this device/i }));
    expect(value.lock).toHaveBeenCalled();
  });

  it("regenerates the recovery kit for the owner only", async () => {
    const user = userEvent.setup();
    const value = ctx();
    renderWith(value);
    await user.click(screen.getByRole("button", { name: /Regenerate recovery kit/i }));
    expect(flows.runRegenerateRecovery).toHaveBeenCalledWith(value.status, value.keys);
    expect(value.showRecoveryKit).toHaveBeenCalledWith("NEWCO-DENEW-CODEN-EWCOD-ENEWC");
    cleanup();

    renderWith(ctx({}, { role: "member" }));
    expect(screen.queryByRole("button", { name: /Regenerate recovery kit/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run both — expect FAIL (modules missing)**

Run: `npx vitest run src/components/crypto/__tests__/forgot-passphrase.test.tsx src/components/crypto/__tests__/encryption-settings.test.tsx`

- [ ] **Step 5: Implement `forgot-passphrase.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCrypto } from "./crypto-provider";
import { runRecover, runResetKeys } from "./flows";
import { MIN_PASSPHRASE_LENGTH } from "./setup-screen";

type Mode = "closed" | "menu" | "reset" | "recover";

function validateNew(passphrase: string, confirm: string): string | null {
  if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
    return `Use at least ${MIN_PASSPHRASE_LENGTH} characters.`;
  }
  if (passphrase !== confirm) return "The passphrases do not match.";
  return null;
}

function NewPassphraseFields({
  passphrase,
  confirm,
  onPassphrase,
  onConfirm,
}: {
  passphrase: string;
  confirm: string;
  onPassphrase: (v: string) => void;
  onConfirm: (v: string) => void;
}) {
  return (
    <>
      <div className="space-y-1">
        <Label htmlFor="forgot-new">New passphrase</Label>
        <Input
          id="forgot-new"
          type="password"
          autoComplete="new-password"
          value={passphrase}
          onChange={(e) => onPassphrase(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="forgot-confirm">Confirm new passphrase</Label>
        <Input
          id="forgot-confirm"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => onConfirm(e.target.value)}
        />
      </div>
    </>
  );
}

export function ForgotPassphrase() {
  const { status, refresh, showRecoveryKit } = useCrypto();
  const [mode, setMode] = useState<Mode>("closed");
  const [code, setCode] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const hasKit = Boolean(status?.recovery);

  async function submitReset(e: React.FormEvent) {
    e.preventDefault();
    if (!status) return;
    const problem = validateNew(passphrase, confirm);
    if (problem) return setError(problem);
    setError(null);
    setBusy(true);
    try {
      await runResetKeys(status, passphrase);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
      setBusy(false);
    }
  }

  async function submitRecover(e: React.FormEvent) {
    e.preventDefault();
    if (!status) return;
    const problem = validateNew(passphrase, confirm);
    if (problem) return setError(problem);
    setError(null);
    setBusy(true);
    try {
      const { recoveryCode } = await runRecover(status, code, passphrase);
      setDone("Recovered. Your old recovery kit no longer works — here is the new one.");
      showRecoveryKit(recoveryCode);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Recovery failed");
      setBusy(false);
    }
  }

  if (mode === "closed") {
    return (
      <button type="button" className="text-sm underline" onClick={() => setMode("menu")}>
        Forgot your passphrase?
      </button>
    );
  }

  if (mode === "menu") {
    return (
      <div className="space-y-3 rounded-md border p-4">
        <p className="text-sm text-muted-foreground">
          Flatpare cannot reset your passphrase. You can start over with new
          keys and be let back in by someone in your household
          {hasKit ? ", or use your recovery kit" : ""}.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => setMode("reset")}>
            Reset my keys
          </Button>
          {hasKit && (
            <Button type="button" variant="outline" onClick={() => setMode("recover")}>
              Use my recovery kit
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={() => setMode("closed")}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  if (mode === "reset") {
    return (
      <form onSubmit={submitReset} className="space-y-4 rounded-md border p-4">
        <h2 className="font-semibold">Reset my keys</h2>
        <p className="text-sm text-muted-foreground">
          You will get new keys under a new passphrase and wait for someone in
          your household to open Flatpare. If you are the only member, use your
          recovery kit instead — a reset alone cannot bring the data back.
        </p>
        <NewPassphraseFields
          passphrase={passphrase}
          confirm={confirm}
          onPassphrase={setPassphrase}
          onConfirm={setConfirm}
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button type="submit" disabled={busy}>
            {busy ? "Resetting…" : "Reset and wait"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setMode("menu")}>
            Back
          </Button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={submitRecover} className="space-y-4 rounded-md border p-4">
      <h2 className="font-semibold">Use my recovery kit</h2>
      <div className="space-y-1">
        <Label htmlFor="forgot-code">Recovery code</Label>
        <Input
          id="forgot-code"
          autoComplete="off"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
      </div>
      <NewPassphraseFields
        passphrase={passphrase}
        confirm={confirm}
        onPassphrase={setPassphrase}
        onConfirm={setConfirm}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      {done && <p className="text-sm">{done}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? "Recovering…" : "Recover"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setMode("menu")}>
          Back
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 6: Implement `encryption-settings.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCrypto } from "./crypto-provider";
import { runChangePassphrase, runRegenerateRecovery } from "./flows";
import { MIN_PASSPHRASE_LENGTH } from "./setup-screen";

export function EncryptionSettings() {
  const { state, status, keys, lock, refresh, showRecoveryKit } = useCrypto();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (state === "off" || !status) {
    return (
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Encryption</h2>
        <p className="text-sm text-muted-foreground">
          Encryption: off — set by this deployment.
        </p>
      </section>
    );
  }

  async function changePassphrase(e: React.FormEvent) {
    e.preventDefault();
    if (!status) return;
    setError(null);
    setMessage(null);
    if (next.length < MIN_PASSPHRASE_LENGTH) {
      return setError(`Use at least ${MIN_PASSPHRASE_LENGTH} characters.`);
    }
    if (next !== confirm) return setError("The passphrases do not match.");
    setBusy(true);
    try {
      await runChangePassphrase(status, current, next);
      await refresh();
      setCurrent("");
      setNext("");
      setConfirm("");
      setMessage("Passphrase changed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change passphrase");
    } finally {
      setBusy(false);
    }
  }

  async function regenerate() {
    if (!status || !keys) return;
    setError(null);
    setBusy(true);
    try {
      const { recoveryCode } = await runRegenerateRecovery(status, keys);
      await refresh();
      showRecoveryKit(recoveryCode);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not regenerate the kit");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Encryption</h2>

      <form onSubmit={changePassphrase} className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="enc-current">Current passphrase</Label>
          <Input
            id="enc-current"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="enc-next">New passphrase</Label>
          <Input
            id="enc-next"
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="enc-confirm">Confirm new passphrase</Label>
          <Input
            id="enc-confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {message && <p className="text-sm">{message}</p>}
        <Button type="submit" disabled={busy}>
          Change passphrase
        </Button>
      </form>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => void lock()}>
          Lock this device
        </Button>
        {status.role === "owner" && (
          <Button type="button" variant="outline" disabled={busy} onClick={regenerate}>
            Regenerate recovery kit
          </Button>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        Locking clears the keys from this browser; you will need your
        passphrase next time. Regenerating the recovery kit replaces the old
        code — the old one stops working immediately.
      </p>
    </section>
  );
}
```

- [ ] **Step 7: Mount it on the settings page and shield the page test**

`src/app/settings/page.tsx`: add `import { EncryptionSettings } from "@/components/crypto/encryption-settings";` and, directly after `<h1 className="text-2xl font-semibold">Settings</h1>` (line 270), insert `<EncryptionSettings />`.

`src/app/settings/__tests__/settings-page.test.tsx`: the page now renders a `useCrypto()` consumer, and this test has no provider. Add, above `import SettingsPage from "../page";`:

```tsx
// The settings page mounts the encryption and household panels; they have
// their own tests and need a CryptoProvider, so stub them here.
vi.mock("@/components/crypto/encryption-settings", () => ({
  EncryptionSettings: () => null,
}));
```

- [ ] **Step 8: Run all tests, lint, typecheck, commit**

Run: `npx vitest run src/components/crypto src/app/settings && npm run lint && npm run typecheck && npm test`

```bash
git add src/components/crypto src/app/settings
git commit -m "feat(crypto): forgot-passphrase flows and encryption settings panel (#183)"
```

---
### Task 13: Invitations page and household settings panel

**Files:**
- Create: `src/app/invitations/page.tsx`
- Create: `src/components/household-settings.tsx`
- Modify: `src/app/settings/page.tsx` (mount `<HouseholdSettings />` after `<EncryptionSettings />`)
- Modify: `src/app/settings/__tests__/settings-page.test.tsx` (stub the panel)
- Test: `src/app/invitations/__tests__/invitations-page.test.tsx`, `src/components/__tests__/household-settings.test.tsx`

**Interfaces:**
- Consumes the Task 9 contract: `GET /api/invitations/mine` → `{ invitations: PendingInvitationForUser[] }` (dates arrive as ISO strings over JSON); `POST /api/invitations/:id/accept` → `{ householdId }`; `POST /api/invitations/decline` → `{ householdId }`; `GET /api/household/members` → `{ members: MemberSummary[], me: { userId, role } }`; `DELETE /api/household/members/:userId` → 204; `GET /api/invitations` → `{ invitations: [{ id, email, expiresAt, createdAt }] }` (owner only); `POST /api/invitations { email }` → 201; `DELETE /api/invitations/:id` → 204. Also `useCrypto()` (Task 11) for the "awaiting key" badge.
- Produces: the `/invitations` page (reachable without a household — Task 8's proxy allow-list) and `<HouseholdSettings />`.

- [ ] **Step 1: Write the failing invitations page test**

`src/app/invitations/__tests__/invitations-page.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const signOutMock = vi.fn();
vi.mock("next-auth/react", () => ({
  signOut: (...args: unknown[]) => signOutMock(...args),
}));

import InvitationsPage from "../page";

const fetchMock = vi.fn();
const assign = vi.fn();

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const invitation = {
  id: 7,
  householdName: "Relić household",
  invitedByName: "Ana",
  expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
};

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(window, "location", {
    value: { ...window.location, assign },
    configurable: true,
  });
  assign.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("InvitationsPage", () => {
  it("lists pending invitations with who invited you and when they expire", async () => {
    fetchMock.mockResolvedValue(jsonRes({ invitations: [invitation] }));
    render(<InvitationsPage />);
    expect(await screen.findByText("Relić household")).toBeInTheDocument();
    expect(screen.getByText(/Invited by Ana/)).toBeInTheDocument();
    expect(screen.getByText(/Expires/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/invitations/mine", expect.anything());
  });

  it("accepts an invitation and moves to the apartments page", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/invitations/mine") return jsonRes({ invitations: [invitation] });
      if (url === "/api/invitations/7/accept" && init?.method === "POST") {
        return jsonRes({ householdId: 3 });
      }
      return jsonRes({ error: `unexpected ${url}` }, 500);
    });
    render(<InvitationsPage />);
    await user.click(await screen.findByRole("button", { name: /^Accept$/i }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/apartments"));
  });

  it("shows the server's 409 when the current household cannot be abandoned", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/invitations/mine") return jsonRes({ invitations: [invitation] });
      return jsonRes({ error: "You already belong to a household" }, 409);
    });
    render(<InvitationsPage />);
    await user.click(await screen.findByRole("button", { name: /^Accept$/i }));
    expect(await screen.findByText("You already belong to a household")).toBeInTheDocument();
    expect(assign).not.toHaveBeenCalled();
  });

  it("'No thanks' starts an own household", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/invitations/mine") return jsonRes({ invitations: [invitation] });
      if (url === "/api/invitations/decline" && init?.method === "POST") {
        return jsonRes({ householdId: 9 });
      }
      return jsonRes({ error: `unexpected ${url}` }, 500);
    });
    render(<InvitationsPage />);
    await user.click(await screen.findByRole("button", { name: /No thanks/i }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/apartments"));
  });

  it("with no invitations, explains and offers to start a household or sign out", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(jsonRes({ invitations: [] }));
    render(<InvitationsPage />);
    expect(await screen.findByText(/no pending invitations/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Sign out/i }));
    expect(signOutMock).toHaveBeenCalledWith({ callbackUrl: "/" });
  });

  it("polls every 15 s", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(jsonRes({ invitations: [] }));
    render(<InvitationsPage />);
    await act(async () => {});
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Write the failing household-settings test**

`src/components/__tests__/household-settings.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CryptoContext, type CryptoContextValue } from "@/components/crypto/crypto-provider";
import { HouseholdSettings } from "../household-settings";

const fetchMock = vi.fn();

function jsonRes(body: unknown, status = 200) {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const members = [
  { userId: "o", name: "Ana", email: "ana@example.com", role: "owner", hasWrap: true },
  { userId: "m", name: null, email: "bob@example.com", role: "member", hasWrap: false },
];
const invites = [
  { id: 4, email: "cara@example.com", expiresAt: new Date(Date.now() + 86_400_000).toISOString(), createdAt: new Date().toISOString() },
];

function cryptoValue(state: CryptoContextValue["state"]): CryptoContextValue {
  return {
    state,
    status: null,
    keys: null,
    error: null,
    persistent: true,
    refresh: vi.fn(async () => {}),
    setup: vi.fn(async () => {}),
    unlock: vi.fn(async () => {}),
    lock: vi.fn(async () => {}),
    showRecoveryKit: vi.fn(),
  };
}

function renderAs(me: { userId: string; role: "owner" | "member" }, state: CryptoContextValue["state"] = "unlocked") {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (url === "/api/household/members") return jsonRes({ members, me });
    if (url === "/api/invitations" && method === "GET") return jsonRes({ invitations: invites });
    if (url === "/api/invitations" && method === "POST") {
      const body = JSON.parse(String(init?.body));
      if (body.email === "dup@example.com") {
        return jsonRes({ error: "An invitation is already pending for that email" }, 409);
      }
      return jsonRes({ id: 5, email: body.email, expiresAt: invites[0].expiresAt, createdAt: invites[0].createdAt }, 201);
    }
    if (url === "/api/invitations/4" && method === "DELETE") return jsonRes(null, 204);
    if (url === "/api/household/members/m" && method === "DELETE") return jsonRes(null, 204);
    return jsonRes({ error: `unexpected ${method} ${url}` }, 500);
  });
  return render(
    <CryptoContext.Provider value={cryptoValue(state)}>
      <HouseholdSettings />
    </CryptoContext.Provider>
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("HouseholdSettings", () => {
  it("lists members with an 'awaiting key' badge for those without a wrap", async () => {
    renderAs({ userId: "o", role: "owner" });
    expect(await screen.findByText("Ana")).toBeInTheDocument();
    const bob = screen.getByText("bob@example.com").closest("li")!;
    expect(within(bob).getByText(/awaiting key/i)).toBeInTheDocument();
    const ana = screen.getByText("Ana").closest("li")!;
    expect(within(ana).queryByText(/awaiting key/i)).not.toBeInTheDocument();
  });

  it("hides the badge when encryption is off", async () => {
    renderAs({ userId: "o", role: "owner" }, "off");
    await screen.findByText("Ana");
    expect(screen.queryByText(/awaiting key/i)).not.toBeInTheDocument();
  });

  it("a member sees no invite form, no pending list, and no remove buttons", async () => {
    renderAs({ userId: "m", role: "member" });
    await screen.findByText("Ana");
    expect(screen.queryByLabelText(/Email/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Remove/i })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith("/api/invitations", expect.anything());
  });

  it("owner invites by email and sees the pending list grow; duplicates show the 409", async () => {
    const user = userEvent.setup();
    renderAs({ userId: "o", role: "owner" });
    expect(await screen.findByText("cara@example.com")).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Email/i), "dave@example.com");
    await user.click(screen.getByRole("button", { name: /Invite/i }));
    expect(await screen.findByText("dave@example.com")).toBeInTheDocument();
    expect(screen.getByText(/sign in with that address/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Email/i), "dup@example.com");
    await user.click(screen.getByRole("button", { name: /Invite/i }));
    expect(await screen.findByText(/already pending/i)).toBeInTheDocument();
  });

  it("owner revokes a pending invitation", async () => {
    const user = userEvent.setup();
    renderAs({ userId: "o", role: "owner" });
    const row = (await screen.findByText("cara@example.com")).closest("li")!;
    await user.click(within(row).getByRole("button", { name: /Revoke/i }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/invitations/4", expect.objectContaining({ method: "DELETE" }))
    );
    await waitFor(() => expect(screen.queryByText("cara@example.com")).not.toBeInTheDocument());
  });

  it("owner removes a member after confirming, never themselves", async () => {
    const user = userEvent.setup();
    renderAs({ userId: "o", role: "owner" });
    const ana = (await screen.findByText("Ana")).closest("li")!;
    expect(within(ana).queryByRole("button", { name: /Remove/i })).not.toBeInTheDocument();
    const bob = screen.getByText("bob@example.com").closest("li")!;
    await user.click(within(bob).getByRole("button", { name: /Remove/i }));
    expect(window.confirm).toHaveBeenCalled();
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/household/members/m",
        expect.objectContaining({ method: "DELETE" })
      )
    );
  });
});
```

- [ ] **Step 3: Run both — expect FAIL (modules missing)**

Run: `npx vitest run src/app/invitations src/components/__tests__/household-settings.test.tsx`

- [ ] **Step 4: Implement the invitations page**

`src/app/invitations/page.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface PendingInvitation {
  id: number;
  householdName: string;
  invitedByName: string | null;
  expiresAt: string;
}

const POLL_MS = 15_000;

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

// Reachable without a household (src/proxy.ts allow-lists it). No NavBar:
// every link in it leads somewhere that would bounce back here.
export default function InvitationsPage() {
  const [invitations, setInvitations] = useState<PendingInvitation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/invitations/mine", { cache: "no-store" });
      if (!res.ok) throw new Error(await readError(res));
      const body = (await res.json()) as { invitations: PendingInvitation[] };
      setInvitations(body.invitations);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load invitations");
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  async function post(path: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(path, { method: "POST" });
      if (!res.ok) throw new Error(await readError(res));
      // The session cookie was refreshed server-side (unstable_update); a
      // full navigation makes the proxy read the new token.
      window.location.assign("/apartments");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-md flex-1 space-y-6 px-4 py-10">
      <h1 className="text-2xl font-semibold">Join a household</h1>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {invitations === null && !error && (
        <p className="text-sm text-muted-foreground">Loading…</p>
      )}
      {invitations?.map((inv) => (
        <Card key={inv.id}>
          <CardHeader>
            <CardTitle>{inv.householdName}</CardTitle>
            <CardDescription>
              {inv.invitedByName ? `Invited by ${inv.invitedByName}. ` : ""}
              Expires {new Date(inv.expiresAt).toLocaleDateString()}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button disabled={busy} onClick={() => post(`/api/invitations/${inv.id}/accept`)}>
              Accept
            </Button>
          </CardContent>
        </Card>
      ))}
      {invitations && invitations.length === 0 && (
        <p className="text-sm text-muted-foreground">
          You have no pending invitations. Ask the household owner to invite the
          email address you signed in with, or start your own household.
        </p>
      )}
      {invitations && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={busy} onClick={() => post("/api/invitations/decline")}>
            {invitations.length > 0 ? "No thanks, start my own household" : "Start my own household"}
          </Button>
          <Button variant="ghost" onClick={() => signOut({ callbackUrl: "/" })}>
            Sign out
          </Button>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        This page checks for new invitations every 15 seconds.
      </p>
    </main>
  );
}
```

- [ ] **Step 5: Implement `household-settings.tsx`**

`src/components/household-settings.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCrypto } from "@/components/crypto/crypto-provider";

interface Member {
  userId: string;
  name: string | null;
  email: string;
  role: "owner" | "member";
  hasWrap: boolean;
}

interface Invitation {
  id: number;
  email: string;
  expiresAt: string;
  createdAt: string;
}

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

export function HouseholdSettings() {
  const { state } = useCrypto();
  const encryptionOn = state !== "off";
  const [members, setMembers] = useState<Member[]>([]);
  const [me, setMe] = useState<{ userId: string; role: "owner" | "member" } | null>(null);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isOwner = me?.role === "owner";

  const loadMembers = useCallback(async () => {
    const res = await fetch("/api/household/members", { cache: "no-store" });
    if (!res.ok) throw new Error(await readError(res));
    const body = (await res.json()) as { members: Member[]; me: { userId: string; role: "owner" | "member" } };
    setMembers(body.members);
    setMe(body.me);
    return body.me;
  }, []);

  const loadInvitations = useCallback(async () => {
    const res = await fetch("/api/invitations", { cache: "no-store" });
    if (!res.ok) throw new Error(await readError(res));
    const body = (await res.json()) as { invitations: Invitation[] };
    setInvitations(body.invitations);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const who = await loadMembers();
        if (who.role === "owner") await loadInvitations();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load household");
      }
    })();
  }, [loadMembers, loadInvitations]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  function invite(e: React.FormEvent) {
    e.preventDefault();
    void run(async () => {
      const res = await fetch("/api/invitations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const created = (await res.json()) as Invitation;
      setInvitations((prev) => [...prev, created]);
      setEmail("");
    });
  }

  function revoke(id: number) {
    void run(async () => {
      const res = await fetch(`/api/invitations/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await readError(res));
      setInvitations((prev) => prev.filter((i) => i.id !== id));
    });
  }

  function remove(member: Member) {
    const label = member.name ?? member.email;
    if (!window.confirm(`Remove ${label} from the household? They lose access immediately.`)) {
      return;
    }
    void run(async () => {
      const res = await fetch(`/api/household/members/${member.userId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await readError(res));
      setMembers((prev) => prev.filter((m) => m.userId !== member.userId));
    });
  }

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Household</h2>
      {error && <p className="text-sm text-destructive">{error}</p>}

      <ul className="divide-y rounded-md border">
        {members.map((m) => (
          <li key={m.userId} className="flex items-center justify-between gap-2 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm">{m.name ?? m.email}</p>
              {m.name && <p className="truncate text-xs text-muted-foreground">{m.email}</p>}
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{m.role}</Badge>
              {encryptionOn && !m.hasWrap && <Badge variant="secondary">awaiting key</Badge>}
              {isOwner && m.userId !== me?.userId && (
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => remove(m)}>
                  Remove
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {isOwner && (
        <>
          <form onSubmit={invite} className="flex flex-wrap items-end gap-2">
            <div className="min-w-0 flex-1 space-y-1">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
              />
            </div>
            <Button type="submit" disabled={busy || email.trim().length === 0}>
              Invite
            </Button>
          </form>
          <p className="text-sm text-muted-foreground">
            No email is sent. Tell them to sign in with that address; the
            invitation is waiting for them there for 7 days.
          </p>
          {invitations.length > 0 && (
            <ul className="divide-y rounded-md border">
              {invitations.map((inv) => (
                <li key={inv.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm">{inv.email}</p>
                    <p className="text-xs text-muted-foreground">
                      Pending · expires {new Date(inv.expiresAt).toLocaleDateString()}
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => revoke(inv.id)}>
                    Revoke
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
```

`Badge` supports `variant="outline" | "secondary"` (`src/components/ui/badge.tsx`); `Button` supports `size="sm"` and `variant="ghost"`.

- [ ] **Step 6: Mount on the settings page and shield its test**

`src/app/settings/page.tsx`: add `import { HouseholdSettings } from "@/components/household-settings";` and insert `<HouseholdSettings />` directly after `<EncryptionSettings />`.

`src/app/settings/__tests__/settings-page.test.tsx`: next to the existing `EncryptionSettings` stub add:

```tsx
vi.mock("@/components/household-settings", () => ({
  HouseholdSettings: () => null,
}));
```

- [ ] **Step 7: Run all tests, lint, typecheck, commit**

Run: `npx vitest run src/app/invitations src/app/settings src/components && npm run lint && npm run typecheck && npm test`

```bash
git add src/app/invitations src/components/household-settings.tsx src/components/__tests__/household-settings.test.tsx src/app/settings
git commit -m "feat(invitations): invitations page and household settings panel (#197)"
```

---
### Task 14: Documentation, env plumbing, final gate, and backlog

**Files:**
- Modify: `AGENTS.md` (Auth, Database, new "Encryption" section, Architecture checks)
- Modify: `docs/security-notes.md` (new "Encryption model" section)
- Modify: `.env.example`, `docker-compose.yml`
- Create: nothing in `src/`

**Interfaces:** none — this task records what Tasks 1–13 built and runs the whole gate once more.

- [ ] **Step 1: `.env.example` and `docker-compose.yml`**

In `.env.example`, after the `LOCAL_DB_URL` block, add:

```bash
# End-to-end encryption. Unset (or "on") means on; "off" disables the client
# key setup entirely. The value is stamped into the database on first boot and
# the app refuses to start if it later disagrees — changing it means a fresh
# database. See docs/security-notes.md.
# FLATPARE_ENCRYPTION=on
```

In `docker-compose.yml`, in the `environment:` list, after `- BLOB_READ_WRITE_TOKEN=`:

```yaml
      # Pass the encryption mode through unchanged; leave it unset for "on".
      - FLATPARE_ENCRYPTION=${FLATPARE_ENCRYPTION:-}
```

- [ ] **Step 2: AGENTS.md**

Under `## Database`, append one bullet:

```markdown
- **Migration 0013 stamps the encryption mode** into the `settings` table on first boot (`stampEncryptionMode` in `src/lib/db/migrate.ts`) and throws on every later boot if `FLATPARE_ENCRYPTION` disagrees with the stamp. Changing mode means a fresh database. Tests that need a specific mode use `applyMigrations(client, { encryptionMode })` on an in-memory client.
```

Under `## Auth`, replace the bullet that begins `There is no shared \`requireUser()\` helper` with:

```markdown
- There is no shared `requireUser()` helper distinct from `requireHousehold()`. **The one exception:** `GET /api/invitations/mine`, `POST /api/invitations/:id/accept` and `POST /api/invitations/decline` read `auth()` directly and only require a user id, because their caller has no household yet. `src/proxy.ts` allow-lists exactly those three routes plus the `/invitations` page (`NO_HOUSEHOLD_ALLOWED`) for a signed-in user without a household; everywhere else such a user gets `403 { error: "No household" }` on `/api/*` and a redirect to `/invitations` on pages.
- **`session.householdId` and `session.role` are nullable** (`src/types/next-auth.d.ts`). `resolveHouseholdForUser` returns `null` — instead of auto-creating a household — while a pending, unexpired invitation matches the user's email and they belong to no household. The `jwt` callback re-resolves whenever `householdId` is unset or `trigger === "update"`, which is what `unstable_update({})` in the accept/decline handlers triggers; the client then does a full navigation so the proxy reads the refreshed cookie.
```

Add a new top-level section before `## PWA`:

```markdown
## Encryption (E2)

- **Mode:** `FLATPARE_ENCRYPTION=on|off`, read once server-side by `readEncryptionMode()` (`src/lib/encryption-mode.ts`); unset is `on`, anything else fails boot. Reaches the client only as the `mode` prop of `<CryptoProvider>`, passed by the server component `src/components/crypto/crypto-gate.tsx` from the four signed-in layouts. Never read `process.env.FLATPARE_ENCRYPTION` in a `"use client"` file.
- **Layering rule, enforced by ESLint (`cryptoLayering` in `eslint.config.mjs`):** `crypto.subtle`, `globalThis.crypto.subtle`, `window.crypto.subtle` and `hash-wasm` may appear only under `src/lib/crypto/**`. Everything else imports named functions from `@/lib/crypto`. Tests under `src/lib/crypto/__tests__/` are inside the allowed tree.
- **Key material:** RSA-OAEP-3072 member key pair (private half wrapped under an Argon2id-derived AES-256-GCM KEK, `member_keys`), one AES-256-GCM household data key wrapped to each member's public key (`household_key_wraps`), and a recovery kit (data key wrapped under a KEK derived from a 25-character base32 code, `households.recovery_*`). Stored keys on the device are non-extractable `CryptoKey`s in IndexedDB (`src/lib/crypto/store.ts`, memory fallback when IndexedDB is unavailable). Wrapping needs an extractable key, so flows that wrap unwrap a transient extractable copy and never persist it.
- **Server store:** `src/lib/member-keys.ts` (status, setup, wraps, reset, recover, recovery regeneration; all state errors are `CryptoStateError` with 400/403/409) behind `src/app/api/crypto/*`. Every handler: `requireHousehold()` → `requireEncryptionOn()` (409 when off; `status` is the one route that answers in off mode) → `assertMembership` → `parseBody`. Shared error mapping lives in `src/lib/api-route.ts` (`apiErrorResponse`, `parseBody`); `ApiError` in `src/lib/api-error.ts` has no imports so any layer can throw it.
- **Client:** `src/components/crypto/flows.ts` is the only place that sequences crypto + fetch; `crypto-provider.tsx` derives `off | needs-setup | pending-wrap | locked | unlocked` from `GET /api/crypto/status` plus the device store and renders the matching screen instead of the page. Pages under the four gated layouts may assume `useCrypto().keys.dataKey` is non-null when `state === "unlocked"` — E3 builds on that.
- **Argon2id parameters are pinned by test** (`src/lib/crypto/__tests__/kdf.test.ts`): password "correct horse battery staple", salt `00..0f`, 65536 KiB / 3 / 1 → a fixed 32-byte digest. Changing `DEFAULT_KDF_PARAMS` must change that vector on purpose. Tests derive with `TEST_KDF_PARAMS` (1024 KiB / 1 / 1) to stay fast.
- **Accepted limits** (details in `docs/security-notes.md`): an actively malicious host could substitute a public key during a wrap; XSS on the origin can use (not export) unlocked keys; removed members keep decryptable cached keys until data-key rotation exists (backlog).
```

Under `## Architecture checks (enola)`, append:

```markdown
- E2 re-pinned the baseline after adding `src/lib/crypto/**`, `src/components/crypto/**`, `src/lib/api-error.ts`, `src/lib/api-route.ts`, `src/lib/member-keys.ts`, `src/lib/invitations.ts` and the `/api/crypto`, `/api/invitations`, `/api/household` route trees. The intended layering is `src/components/crypto → src/lib/crypto` (and types only from `src/lib/member-keys` / `src/lib/encryption-mode`); `src/lib/crypto` imports nothing from the app.
```

- [ ] **Step 3: `docs/security-notes.md`**

Append a new section at the end:

```markdown
## Encryption model — reviewed 2026-09-06 (E2 crypto core)

Spec: `docs/superpowers/specs/2026-09-06-e2-crypto-core-design.md`. What is stored
server-side is ciphertext or public keys only: the wrapped member private key, the
household data key wrapped to each member's public key, and the recovery-wrapped data
key. Passphrases and recovery codes never leave the browser.

### Accepted: the host is honest-but-curious, not actively malicious

A host that substitutes its own public key for a member's during a wrap
(`POST /api/crypto/wraps` reads the target's public key from `member_keys`) would
receive the household data key. Any end-to-end scheme without out-of-band key
verification has this property. The mitigation that would close it — key fingerprints
shown in the UI for members to compare — is a backlog issue, not part of E2.

### Accepted: XSS can use unlocked keys

Unlocked keys are non-extractable `CryptoKey`s in IndexedDB, so a script on the origin
can decrypt with them while the device is unlocked but cannot read the key bytes. That
is the price of once-per-device unlock. *Lock this device* in settings and sign-out both
clear the store.

### Accepted: removed members keep a usable cached key

Removal deletes the wrap row and membership. A removed member who still has the data key
in their device store can decrypt ciphertext they can still fetch during the 24h JWT
window (see the auth section above). E3's ciphertext reads re-check membership against
the database; rotating the data key on removal is a backlog item.

### Accepted: the encryption mode is a property of the database

`FLATPARE_ENCRYPTION` is stamped into `settings` on first boot and compared on every
later boot. `on → off` would leave rows the server cannot read; `off → on` would leave
plaintext the server is supposed to reject. Both are discovered after the deploy, by
users, so the app refuses to boot instead. Changing mode means a fresh database or, once
#191 lands, an export and re-import.

### Accepted: recovery is a single point of loss

A sole member who loses both the passphrase and the recovery code has lost the data;
nobody, including Flatpare, can recover it. The setup screen says so and the recovery
kit requires an explicit acknowledgement before continuing.
```

- [ ] **Step 4: Full gate**

Run: `npm run lint && npm run typecheck && npm run test:coverage`

All three must pass; the coverage floors (lines/statements ≥ 80, functions ≥ 78, branches ≥ 75) apply to the covered set, which now includes every new file. If a floor is breached, the numbers name the file — add a test to that file's suite rather than excluding it.

The boot-time stamp/refuse behaviour is covered by Task 1's in-memory migration tests; there is no manual dev-server check, and the dev server must never be started against `.env.local`'s Turso URL.

- [ ] **Step 5: enola**

Run: `enola check --fail-on=cycles`

Expected: PASS with no new cycle. The new import edges are `src/components/crypto → src/lib/crypto`, `src/app/api/crypto → src/lib/member-keys → src/lib/db`, `src/app/api/invitations → src/lib/invitations → src/lib/household`, and `src/lib/session → src/auth` (unchanged, accepted). If a *new* cycle is reported, fix the import (most likely a value import of `@/lib/member-keys` from a client file that should be `import type`), do not re-pin over it. Once clean:

```bash
enola baseline pin
```

- [ ] **Step 6: Commit and backlog**

```bash
git add AGENTS.md docs/security-notes.md .env.example docker-compose.yml
git commit -m "docs: encryption model, mode env var, nullable session household (#183 #184 #197)"
```

Open the three backlog issues the spec defers, so they exist before the PR is reviewed:

```bash
gh issue create --title "Key fingerprints in the members list" \
  --body "E2 accepts that an actively malicious host could substitute a public key during a wrap (docs/security-notes.md, Encryption model). Show each member's public-key fingerprint on the settings page so members can compare out of band."
gh issue create --title "Rotate the household data key when a member is removed" \
  --body "E2 removal deletes the wrap and membership but a removed member's device store still holds the data key. Rotate: generate a new data key, re-wrap to every remaining member, re-encrypt rows (needs E3). See docs/security-notes.md."
gh issue create --title "A member can leave a household" \
  --body "E2 ships owner-initiated removal only. Add a self-service leave (delete own wrap + membership; refuse for the owner), then land on /invitations."
```

- [ ] **Step 7: Open the PR**

Push `feat/e2-crypto-core` and open one PR titled `feat: E2 crypto core, member key wrapping, and invitations (#183, #184, #197)`. The body lists the mode env var, the fresh-database note for anyone upgrading a deployment with existing `member_keys` (none exist yet — this is the first release with the tables), and links the spec and this plan. Merge on green GitHub Actions.

---

## Self-review notes

- **Spec coverage.** Encryption mode + stamp: Task 1. Crypto library incl. pinned vector, envelope with AAD, `assertEnvelopeMode`, non-extractable store with memory fallback: Tasks 2–3. Lint gate: Task 4. Server store, route handlers, who-may-wrap rule, atomic setup: Tasks 5–6. Invitations lifecycle, abandon rule, member removal, nullable household, proxy allow-list, JWT self-heal: Tasks 7–9. Client state machine, setup with once-only kit and acknowledgement, unlock with client-side wrong-passphrase, pending polling at 15 s, fulfilling wraps on unlock with an announcement, lock on sign-out and from settings, change passphrase requiring the current one, reset, recover with a new kit, regenerate (owner): Tasks 10–12. Invitations page (Accept / No thanks) and owner UI with revoke and "sign in with that address" copy: Task 13. Docs, security notes, env, backlog: Task 14.
- **Deliberate deviations from the spec text.** `mode` is passed from the four signed-in layouts via `<CryptoGate>` rather than the root layout (reason in Task 11). The pending-wrap member whose wrap has arrived adopts it with the stored private key and no passphrase prompt (`runAdoptWrap`) — the spec's unlock path covers a device with nothing stored; this is the same operation minus a KEK derivation.
- **Type consistency checked:** `StoredKeys.dataKey: CryptoKey | null` everywhere (store, flows, provider, tests); `CryptoStatus` (server) vs `StatusResponse = CryptoStatus & { mode }` (client); `runFulfilPendingWraps` returns `{ count, names }` in flows, provider, and both tests; `PendingWrap.name: string | null`; `MemberSummary.hasWrap`; every route's response shape in Task 6/9 matches what Tasks 10/13 parse.
