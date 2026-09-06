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
