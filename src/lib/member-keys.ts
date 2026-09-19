import { db } from "@/lib/db";
import {
  apartments,
  householdKeyWraps,
  householdMembers,
  households,
  locations,
  memberKeys,
  ratings,
} from "@/lib/db/schema";
import { users } from "@/lib/db/schema-auth";
import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { ApiError } from "@/lib/api-error";
import type { Role } from "@/lib/household";
import type {
  KdfParamsRow,
  MemberKeyMaterial,
  RecoveryMaterial,
  RotateRequest,
} from "@/lib/crypto-schemas";

export class CryptoStateError extends ApiError {
  constructor(
    message: string,
    status: 400 | 403 | 409,
    details: Record<string, unknown> = {}
  ) {
    super(message, status, details);
    this.name = "CryptoStateError";
  }
}

export interface CryptoStatus {
  userId: string;
  householdId: number;
  role: Role;
  memberKeys: MemberKeyMaterial | null;
  // This user's wrapped copy of the household data key, if any, and which
  // data-key version that wrap holds (#219). A device whose cached key is an
  // older version re-keys from the wrap without a passphrase.
  wrap: string | null;
  wrapKeyVersion: number | null;
  // The household's current data-key version, and whether a removal has
  // happened since the last rotation (the owner is warned while it is set).
  keyVersion: number;
  rotationDue: boolean;
  // Whether anyone in the household holds a wrap — i.e. the data key exists.
  householdHasWraps: boolean;
  // Whether anyone OTHER than this user holds a wrap. A reset only works if
  // somebody else can re-wrap the data key to the new public key, so the UI
  // uses this to decide whether "Reset my keys" is offered at all.
  othersHaveWraps: boolean;
  recovery: RecoveryMaterial | null;
}

export interface PendingWrap {
  userId: string;
  name: string | null;
  email: string;
  publicKey: string;
}

type Db = typeof db;
// Drizzle does not export the transaction parameter's type directly, so it is
// derived from the callback signature of `db.transaction` itself.
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

// The zod schema only ever admits KDF version 1 today (`kdfSchema`'s `version`
// is `z.literal(1)`), so a persisted value that isn't 1 means the row was
// written by something other than this schema — corrupt or from a future
// migration this code doesn't understand yet. Never silently coerce it.
function assertSupportedKdfVersion(column: string, version: number): 1 {
  if (version !== 1) {
    throw new CryptoStateError(
      `Unsupported ${column} value: ${version}`,
      409
    );
  }
  return version;
}

function kdfFromRow(
  row: {
    kdfSalt: string;
    kdfMemoryKib: number;
    kdfIterations: number;
    kdfParallelism: number;
    kdfVersion: number;
  },
  column: string
): KdfParamsRow {
  return {
    salt: row.kdfSalt,
    memoryKib: row.kdfMemoryKib,
    iterations: row.kdfIterations,
    parallelism: row.kdfParallelism,
    version: assertSupportedKdfVersion(column, row.kdfVersion),
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
    kdf: kdfFromRow(row, "kdf_version"),
  };
}

async function loadWrapRow(
  conn: Db | Tx,
  householdId: number,
  userId: string
): Promise<{ wrappedKey: string; keyVersion: number } | null> {
  const [row] = await conn
    .select({
      wrappedKey: householdKeyWraps.wrappedKey,
      keyVersion: householdKeyWraps.keyVersion,
    })
    .from(householdKeyWraps)
    .where(
      and(
        eq(householdKeyWraps.householdId, householdId),
        eq(householdKeyWraps.userId, userId)
      )
    )
    .limit(1);
  return row ?? null;
}

async function loadWrap(
  conn: Db | Tx,
  householdId: number,
  userId: string
): Promise<string | null> {
  return (await loadWrapRow(conn, householdId, userId))?.wrappedKey ?? null;
}

async function loadKeyState(
  conn: Db | Tx,
  householdId: number
): Promise<{ keyVersion: number; rotationDue: boolean }> {
  const [row] = await conn
    .select({ keyVersion: households.keyVersion, rotationDue: households.rotationDue })
    .from(households)
    .where(eq(households.id, householdId))
    .limit(1);
  return { keyVersion: row?.keyVersion ?? 1, rotationDue: row?.rotationDue ?? false };
}

async function countWraps(conn: Db | Tx, householdId: number): Promise<number> {
  const [row] = await conn
    .select({ n: sql<number>`count(*)` })
    .from(householdKeyWraps)
    .where(eq(householdKeyWraps.householdId, householdId));
  return Number(row?.n ?? 0);
}

async function countOtherWraps(
  conn: Db | Tx,
  householdId: number,
  userId: string
): Promise<number> {
  const [row] = await conn
    .select({ n: sql<number>`count(*)` })
    .from(householdKeyWraps)
    .where(
      and(
        eq(householdKeyWraps.householdId, householdId),
        ne(householdKeyWraps.userId, userId)
      )
    );
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
    h.recoveryKdfParallelism === null ||
    h.recoveryKdfVersion === null
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
      version: assertSupportedKdfVersion(
        "recovery_kdf_version",
        h.recoveryKdfVersion
      ),
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
  const [keys, wrap, wrapCount, otherWrapCount, recovery, keyState] = await Promise.all([
    loadMemberKeys(db, userId),
    loadWrapRow(db, householdId, userId),
    countWraps(db, householdId),
    countOtherWraps(db, householdId, userId),
    loadRecovery(db, householdId),
    loadKeyState(db, householdId),
  ]);
  return {
    userId,
    householdId,
    role,
    memberKeys: keys,
    wrap: wrap?.wrappedKey ?? null,
    wrapKeyVersion: wrap?.keyVersion ?? null,
    keyVersion: keyState.keyVersion,
    rotationDue: keyState.rotationDue,
    householdHasWraps: wrapCount > 0,
    othersHaveWraps: otherWrapCount > 0,
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
        keyVersion: (await loadKeyState(tx, householdId)).keyVersion,
      });
      await tx
        .update(households)
        .set(recoveryColumns(household.recovery))
        .where(eq(households.id, householdId));
    }
  });
}

// Household members who have a member_keys row (published a public key) but
// no household_key_wraps row (nobody has wrapped the data key to them yet).
// Shared by listPendingWraps (which needs the display fields) and fulfilWraps
// (which only needs to validate targets), so the "pending" definition lives
// in one place.
async function pendingUserIds(
  conn: Db | Tx,
  householdId: number
): Promise<string[]> {
  const rows = await conn
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
    );
  return rows.map((r) => r.userId);
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
//
// Each item carries the public key it was wrapped against. The client reads
// that key in one request and posts the wrap in another; in between, the
// target can reset or recover and install a fresh keypair. A wrap made for
// the old key is undecryptable garbage that would strand the target, so the
// binding is re-checked here, inside the same transaction as the pending
// check, and a mismatch rejects the whole batch.
export async function fulfilWraps(
  householdId: number,
  byUserId: string,
  wraps: { userId: string; wrappedKey: string; publicKey: string }[]
): Promise<number> {
  return db.transaction(async (tx) => {
    if (!(await loadWrap(tx, householdId, byUserId))) {
      throw new CryptoStateError("You do not hold the household key", 403);
    }
    const pending = new Set(await pendingUserIds(tx, householdId));
    for (const w of wraps) {
      if (!pending.has(w.userId)) {
        throw new CryptoStateError(
          `User ${w.userId} is not awaiting a wrap`,
          400
        );
      }
      const target = await loadMemberKeys(tx, w.userId);
      if (!target || target.publicKey !== w.publicKey) {
        throw new CryptoStateError(
          `User ${w.userId}'s public key has changed; refresh and try again`,
          409
        );
      }
    }
    const { keyVersion } = await loadKeyState(tx, householdId);
    for (const w of wraps) {
      await tx.insert(householdKeyWraps).values({
        householdId,
        userId: w.userId,
        wrappedKey: w.wrappedKey,
        wrappedBy: byUserId,
        keyVersion,
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
// No owner/membership role gate here by design: per spec, authorization for
// recovery is possession of the recovery code itself, not household role —
// the route handler (Task 6) still asserts the caller is a member of this
// household before calling in.
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
    const { keyVersion } = await loadKeyState(tx, householdId);
    await tx
      .insert(householdKeyWraps)
      .values({
        householdId,
        userId,
        wrappedKey: args.wrappedKey,
        wrappedBy: userId,
        keyVersion,
      })
      .onConflictDoUpdate({
        target: [householdKeyWraps.householdId, householdKeyWraps.userId],
        set: { wrappedKey: args.wrappedKey, wrappedBy: userId, keyVersion },
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

// ---- Data-key rotation (#219) --------------------------------------------

export interface RotationTarget {
  userId: string;
  publicKey: string;
}

async function rotationTargets(
  conn: Db | Tx,
  householdId: number
): Promise<RotationTarget[]> {
  return conn
    .select({ userId: memberKeys.userId, publicKey: memberKeys.publicKey })
    .from(householdMembers)
    .innerJoin(memberKeys, eq(memberKeys.userId, householdMembers.userId))
    .where(eq(householdMembers.householdId, householdId));
}

// What the owner's browser needs before it can rotate: the version it must
// re-seal from, and every member who has published a public key — pending or
// not, each gets a wrap of the new key. A member with no key pair yet gets
// nothing; when they set up they become pending and the sweep wraps the
// current key to them.
export async function listRotationTargets(
  householdId: number
): Promise<{ keyVersion: number; members: RotationTarget[] }> {
  const [{ keyVersion }, members] = await Promise.all([
    loadKeyState(db, householdId),
    rotationTargets(db, householdId),
  ]);
  return { keyVersion, members };
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return s.size === a.length && b.every((x) => s.has(x));
}

// Commits a rotation the owner's browser prepared, all or nothing: every wrap,
// the recovery kit, every re-sealed row, the version bump. Runs entirely on
// what the client sent — the server never sees a key — but refuses anything
// that would leave the household inconsistent:
//   - a version other than the current one (someone rotated first);
//   - a wrap set that is not exactly the members with public keys, or a wrap
//     made for a public key that has since changed (same check as
//     fulfilWraps);
//   - a row set that is not exactly the household's rows, or an apartment
//     whose version moved (a concurrent write); the client reloads, re-seals
//     and retries once;
//   - an envelope not sealed under the NEW version.
// A null envelope keeps the row as it is: it did not open under the old key,
// so it is already unreadable to everyone and must not block the rotation.
export async function rotateHouseholdKey(
  householdId: number,
  byUserId: string,
  req: RotateRequest
): Promise<{ keyVersion: number }> {
  return db.transaction(async (tx) => {
    const { keyVersion: current } = await loadKeyState(tx, householdId);
    if (current !== req.fromKeyVersion) {
      throw new CryptoStateError("Stale key", 409, { keyVersion: current });
    }
    const next = current + 1;

    const targets = await rotationTargets(tx, householdId);
    if (!sameSet(targets.map((t) => t.userId), req.wraps.map((w) => w.userId))) {
      throw new CryptoStateError("Wraps must cover every member with a key", 409);
    }
    const publicKeyOf = new Map(targets.map((t) => [t.userId, t.publicKey]));
    for (const w of req.wraps) {
      if (publicKeyOf.get(w.userId) !== w.publicKey) {
        throw new CryptoStateError(
          `User ${w.userId}'s public key has changed; refresh and try again`,
          409
        );
      }
    }

    const aRows = await tx
      .select({ id: apartments.id, version: apartments.version })
      .from(apartments)
      .where(eq(apartments.householdId, householdId));
    const rRows = await tx
      .select({ apartmentId: ratings.apartmentId, userId: ratings.userId })
      .from(ratings)
      .where(eq(ratings.householdId, householdId));
    const lRows = await tx
      .select({ id: locations.id })
      .from(locations)
      .where(eq(locations.householdId, householdId));
    const versionOf = new Map(aRows.map((a) => [a.id, a.version]));
    const stale =
      !sameSet(aRows.map((a) => a.id), req.apartments.map((a) => a.id)) ||
      req.apartments.some((a) => versionOf.get(a.id) !== a.version) ||
      !sameSet(
        rRows.map((r) => `${r.apartmentId}:${r.userId}`),
        req.ratings.map((r) => `${r.apartmentId}:${r.userId}`)
      ) ||
      !sameSet(lRows.map((l) => l.id), req.locations.map((l) => l.id));
    if (stale) throw new CryptoStateError("Stale rows", 409);

    const envelopes = [
      ...req.apartments.map((a) => a.envelope),
      ...req.ratings.map((r) => r.envelope),
      ...req.locations.map((l) => l.envelope),
    ];
    for (const e of envelopes) {
      if (e !== null && (e.v !== 1 || e.k !== next)) {
        throw new CryptoStateError("Every row must be sealed under the new key", 400);
      }
    }

    await tx
      .delete(householdKeyWraps)
      .where(eq(householdKeyWraps.householdId, householdId));
    for (const w of req.wraps) {
      await tx.insert(householdKeyWraps).values({
        householdId,
        userId: w.userId,
        wrappedKey: w.wrappedKey,
        wrappedBy: byUserId,
        keyVersion: next,
      });
    }
    await tx
      .update(households)
      .set({ ...recoveryColumns(req.recovery), keyVersion: next, rotationDue: false })
      .where(eq(households.id, householdId));

    const now = new Date();
    for (const a of req.apartments) {
      if (a.envelope === null) continue;
      await tx
        .update(apartments)
        .set({
          envelope: JSON.stringify(a.envelope),
          version: sql`${apartments.version} + 1`,
          updatedAt: now,
        })
        .where(and(eq(apartments.id, a.id), eq(apartments.householdId, householdId)));
    }
    for (const r of req.ratings) {
      if (r.envelope === null) continue;
      await tx
        .update(ratings)
        .set({ envelope: JSON.stringify(r.envelope), updatedAt: now })
        .where(
          and(
            eq(ratings.householdId, householdId),
            eq(ratings.apartmentId, r.apartmentId),
            eq(ratings.userId, r.userId)
          )
        );
    }
    for (const l of req.locations) {
      if (l.envelope === null) continue;
      await tx
        .update(locations)
        .set({ envelope: JSON.stringify(l.envelope), updatedAt: now })
        .where(and(eq(locations.id, l.id), eq(locations.householdId, householdId)));
    }
    return { keyVersion: next };
  });
}
