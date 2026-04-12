/**
 * Wise API Integration — Stub/Live Service
 * If WISE_API_KEY env var is set, makes real API calls.
 * Otherwise uses stubs that log and return mock responses.
 */

const WISE_API_KEY = process.env.WISE_API_KEY;
const WISE_BASE_URL = process.env.WISE_BASE_URL || "https://api.transferwise.com";

function isLive(): boolean {
  return !!WISE_API_KEY;
}

export async function createTransfer(
  recipientId: string,
  amount: number,
  currency: string,
  reference?: string,
): Promise<{ id: string; status: string; amount: number; currency: string }> {
  if (!isLive()) {
    console.log(`[wise-stub] createTransfer: recipientId=${recipientId}, amount=${amount} ${currency}`);
    return {
      id: `stub-transfer-${Date.now()}`,
      status: "processing",
      amount,
      currency,
    };
  }

  const res = await fetch(`${WISE_BASE_URL}/v1/transfers`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${WISE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      targetAccount: recipientId,
      quoteUuid: null,
      customerTransactionId: `elturco-${Date.now()}`,
      details: { reference: reference || "Payment" },
    }),
  });
  return res.json();
}

export async function getBalance(
  profileId: string,
): Promise<{ balances: Array<{ amount: number; currency: string }> }> {
  if (!isLive()) {
    console.log(`[wise-stub] getBalance: profileId=${profileId}`);
    return {
      balances: [
        { amount: 10000, currency: "EUR" },
        { amount: 5000, currency: "GBP" },
        { amount: 3000, currency: "USD" },
      ],
    };
  }

  const res = await fetch(`${WISE_BASE_URL}/v4/profiles/${profileId}/balances?types=STANDARD`, {
    headers: { "Authorization": `Bearer ${WISE_API_KEY}` },
  });
  return res.json();
}

export async function getBatchPaymentStatus(
  batchId: string,
): Promise<{ id: string; status: string; payments: Array<{ id: string; status: string }> }> {
  if (!isLive()) {
    console.log(`[wise-stub] getBatchPaymentStatus: batchId=${batchId}`);
    return {
      id: batchId,
      status: "completed",
      payments: [{ id: "stub-1", status: "completed" }],
    };
  }

  const res = await fetch(`${WISE_BASE_URL}/v3/profiles/batch-payments/${batchId}`, {
    headers: { "Authorization": `Bearer ${WISE_API_KEY}` },
  });
  return res.json();
}

export const wiseService = { createTransfer, getBalance, getBatchPaymentStatus, isLive };
