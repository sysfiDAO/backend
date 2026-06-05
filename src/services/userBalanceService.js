// services/userBalanceService.js
import { getAdminDb } from "../lib/firebase.js";
import { FieldValue } from "firebase-admin/firestore";
import logger from "../utils/logger.js";

// ─── Balance resolution ───────────────────────────────────────────────────────

/**
 * Resolve the effective mintable balance from a Firestore user document.
 *
 * Priority order:
 *   1. networkbalance  — newest field; represents balance + point + current season
 *   2. balance + point — epoch 1 sum + epoch 2 sum (both fields must be present)
 *   3. balance alone   — epoch 1 only (oldest users who never earned points)
 *   4. 0              — no mintable balance
 *
 * "Present" means the field is not null and not undefined.
 * A field that is present but equal to 0 is considered present (not absent).
 * This distinction matters for the balance+point branch: if both fields exist
 * but sum to 0 we still fall through correctly.
 *
 * Returns { amount: number, source: string }
 * Exported as a pure function so it can be unit-tested independently.
 */
export const resolveEffectiveBalance = (userDoc) => {
  const toNum = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  const isPresent = (v) => v !== null && v !== undefined;

  const networkbalance = toNum(userDoc.networkbalance);
  const balance = toNum(userDoc.balance);
  const point = toNum(userDoc.point);

  // Priority 1 — networkbalance
  if (isPresent(userDoc.networkbalance) && networkbalance > 0) {
    return { amount: networkbalance, source: "networkbalance" };
  }

  // Priority 2 — balance + point (both fields must be present)
  if (isPresent(userDoc.balance) && isPresent(userDoc.point)) {
    const sum = balance + point;
    if (sum > 0) {
      return { amount: sum, source: "balance+point" };
    }
  }

  // Priority 3 — balance alone
  if (isPresent(userDoc.balance) && balance > 0) {
    return { amount: balance, source: "balance" };
  }

  // No mintable balance
  return { amount: 0, source: "none" };
};

// ─── Firestore reads ──────────────────────────────────────────────────────────

/**
 * Fetch only the balance-related fields from the user's Firestore document.
 * Returns null (not 0) for fields that are absent — this distinction is
 * required by resolveEffectiveBalance to handle the balance+point branch.
 */
export const getUserBalanceDoc = async (uid) => {
  const snap = await getAdminDb().doc(`users/${uid}`).get();

  if (!snap.exists) {
    return { balance: null, point: null, networkbalance: null };
  }

  const data = snap.data();
  return {
    balance: data.balance ?? null,
    point: data.point ?? null,
    networkbalance: data.networkbalance ?? null,
  };
};

/**
 * Fetch the user's canonical on-chain wallet address.
 * Checks /wallets/{uid} first (new structure), then falls back to the
 * legacy walletAddress field on /users/{uid} (old structure).
 * Returns null if no address is stored.
 */
export const getUserWalletAddress = async (uid) => {
  const walletSnap = await getAdminDb().doc(`wallets/${uid}`).get();
  if (walletSnap.exists) {
    return walletSnap.data().address ?? null;
  }

  const userSnap = await getAdminDb().doc(`users/${uid}`).get();
  if (userSnap.exists) {
    return userSnap.data().walletAddress ?? null;
  }

  return null;
};

// ─── Firestore write ──────────────────────────────────────────────────────────

/**
 * Zero out the balance fields that were consumed by the voucher,
 * and stamp an audit timestamp on the user document.
 *
 * IMPORTANT: call this only AFTER the voucher signature has been created
 * successfully. If signing throws, do NOT call this function.
 */
export const deductUserBalance = async (uid, source) => {
  const update = { mintVoucherIssuedAt: FieldValue.serverTimestamp() };

  switch (source) {
    case "networkbalance":
      update.networkbalance = 0;
      break;
    case "balance+point":
      update.balance = 0;
      update.point = 0;
      break;
    case "balance":
      update.balance = 0;
      break;
    default:
      break;
  }

  await getAdminDb().doc(`users/${uid}`).update(update);
  logger.info(`[userBalance] Deducted source="${source}" for uid=${uid}`);
};
