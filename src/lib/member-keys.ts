import { db } from "@/lib/db";
import {
  householdKeyWraps,
  householdMembers,
  households,
  memberKeys,
} from "@/lib/db/schema";
import { users } from "@/lib/db/schema-auth";
import { and, eq, isNull, ne, sql } from "drizzle-orm";
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
  const [keys, wrap, wrapCount, otherWrapCount, recovery] = await Promise.all([
    loadMemberKeys(db, userId),
    loadWrap(db, householdId, userId),
    countWraps(db, householdId),
    countOtherWraps(db, householdId, userId),
    loadRecovery(db, householdId),
  ]);
  return {
    userId,
    householdId,
    role,
    memberKeys: keys,
    wrap,
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
