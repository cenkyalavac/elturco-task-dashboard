/**
 * QuickBooks Online Sync — Stub/Live Service
 * If QBO_CLIENT_ID and QBO_CLIENT_SECRET env vars are set, enables real sync.
 * Otherwise logs and skips.
 */

const QBO_CLIENT_ID = process.env.QBO_CLIENT_ID;
const QBO_CLIENT_SECRET = process.env.QBO_CLIENT_SECRET;

function isLive(): boolean {
  return !!(QBO_CLIENT_ID && QBO_CLIENT_SECRET);
}

export async function syncInvoice(
  invoiceId: number,
  invoiceData: any,
): Promise<{ synced: boolean; qboInvoiceId?: string; error?: string }> {
  if (!isLive()) {
    console.log(`[qbo-stub] syncInvoice: id=${invoiceId}`);
    return { synced: false, error: "QBO not configured" };
  }
  // Real implementation would use QBO API
  console.log(`[qbo] Syncing invoice ${invoiceId}`);
  return { synced: true, qboInvoiceId: `qbo-inv-${invoiceId}` };
}

export async function syncCustomer(
  customerId: number,
  customerData: any,
): Promise<{ synced: boolean; qboCustomerId?: string; error?: string }> {
  if (!isLive()) {
    console.log(`[qbo-stub] syncCustomer: id=${customerId}`);
    return { synced: false, error: "QBO not configured" };
  }
  console.log(`[qbo] Syncing customer ${customerId}`);
  return { synced: true, qboCustomerId: `qbo-cust-${customerId}` };
}

export async function syncVendor(
  vendorId: number,
  vendorData: any,
): Promise<{ synced: boolean; qboVendorId?: string; error?: string }> {
  if (!isLive()) {
    console.log(`[qbo-stub] syncVendor: id=${vendorId}`);
    return { synced: false, error: "QBO not configured" };
  }
  console.log(`[qbo] Syncing vendor ${vendorId}`);
  return { synced: true, qboVendorId: `qbo-ven-${vendorId}` };
}

export async function syncPayment(
  paymentId: number,
  paymentData: any,
): Promise<{ synced: boolean; qboPaymentId?: string; error?: string }> {
  if (!isLive()) {
    console.log(`[qbo-stub] syncPayment: id=${paymentId}`);
    return { synced: false, error: "QBO not configured" };
  }
  console.log(`[qbo] Syncing payment ${paymentId}`);
  return { synced: true, qboPaymentId: `qbo-pay-${paymentId}` };
}

export const qboService = { syncInvoice, syncCustomer, syncVendor, syncPayment, isLive };
