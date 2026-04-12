/**
 * Finance Router — handles all finance-related routes.
 * Extracted from the monolithic routes.ts.
 *
 * Routes:
 *   POST /jobs/:jobId/generate-po
 *   POST /projects/:projectId/generate-invoice
 *   GET  /purchase-orders
 *   POST /purchase-orders
 *   PATCH /purchase-orders/:id
 *   GET  /purchase-orders/:id
 *   POST /purchase-orders/:id/send
 *   POST /purchase-orders/:id/accept
 *   POST /purchase-orders/:id/mark-paid
 *   GET  /purchase-orders/:id/line-items
 *   POST /purchase-orders/:id/line-items
 *   PATCH /purchase-orders/:id/line-items/:liId
 *   DELETE /purchase-orders/:id/line-items/:liId
 *   POST /purchase-orders/:id/recalculate
 *   GET  /invoices
 *   GET  /invoices/uninvoiced-jobs
 *   GET  /invoices/:id
 *   POST /invoices
 *   PATCH /invoices/:id
 *   POST /invoices/:id/send
 *   POST /invoices/:id/mark-paid
 *   GET  /invoices/:id/line-items
 *   POST /invoices/:id/line-items
 *   PATCH /invoices/:id/line-items/:liId
 *   DELETE /invoices/:id/line-items/:liId
 *   POST /invoices/:id/recalculate
 *   GET  /payments
 *   POST /payments
 *   GET  /payments/summary
 *   GET  /payments/cash-flow
 *   GET  /payments/:id
 *   DELETE /payments/:id
 *   GET  /financial/summary
 *   GET  /financial/ar-aging
 *   GET  /financial/revenue-by-customer
 *   GET  /financial/cost-by-vendor
 *   GET  /financial/monthly-trend
 *   GET  /financial/revenue-by-entity
 *   GET  /financial/ap-aging
 *   GET  /financial/pnl
 *   GET  /financial/entity-comparison
 *   GET  /projects/:id/financials
 *   PATCH /customers/:id/rate-card/:rcId
 *   GET  /rate-cards/lookup
 *   GET  /dashboard/kpis
 *   GET  /dashboard/activity
 *   GET  /dashboard/deadlines
 *   GET  /dashboard/project-pipeline
 *   GET  /export/invoices
 *   GET  /export/purchase-orders
 *   GET  /export/payments
 *   GET  /export/vendors
 */
import { Router, Request, Response } from "express";
import { z } from "zod";
import { eq, and, sql, desc } from "drizzle-orm";
import { storage, db } from "../storage";
import {
  purchaseOrders,
  clientInvoices,
  clientInvoiceLines,
  poLineItems,
  payments,
  entities,
  vendors,
  vendorRateCards,
  customerRateCards,
  jobs,
  projects,
  qualityReports,
} from "@shared/schema";
import {
  requireAuth,
  requireRole,
  validate,
  param,
  safeError,
  logAudit,
  getClientIp,
  createNotificationV2,
} from "./shared";

const router = Router();

// ============================================
// ZOD VALIDATION SCHEMAS
// ============================================
const createInvoiceSchema = z.object({
  customerId: z.number().int().positive(),
  invoiceDate: z.string().min(1),
  lines: z.array(z.object({
    description: z.string().optional(),
    quantity: z.any().optional(),
    unitPrice: z.any().optional(),
    amount: z.any().optional(),
  })).optional(),
}).passthrough();

const createPurchaseOrderSchema = z.object({
  vendorId: z.number().int().positive(),
  amount: z.any(),
}).passthrough();

const createPaymentSchema = z.object({
  type: z.enum(["receivable", "payable"]),
  amount: z.any(),
  paymentDate: z.string().min(1),
}).passthrough();

const createRateCardSchema = z.object({
  rateValue: z.any(),
  sourceLanguage: z.string().max(10).optional().nullable(),
  targetLanguage: z.string().max(10).optional().nullable(),
  serviceType: z.string().max(100).optional().nullable(),
  rateType: z.string().max(50).optional().nullable(),
  currency: z.string().max(3).optional(),
});

// ============================================
// MIDDLEWARE
// ============================================
const requireFinanceRole = requireRole("gm", "operations_manager", "pm_team_lead", "admin");

// ============================================
// HELPER FUNCTIONS
// ============================================

// Atomic sequence number generation using MAX to avoid count-based race conditions
async function getNextSequenceNumber(table: typeof purchaseOrders | typeof clientInvoices, prefix: string, year: number, numberCol: any): Promise<string> {
  const pattern = `${prefix}-${year}-%`;
  const [result] = await db.select({
    maxNum: sql<string>`MAX(${numberCol})`,
  }).from(table).where(sql`${numberCol} LIKE ${pattern}`);
  let seq = 1;
  if (result?.maxNum) {
    // Extract the trailing sequence number after the last dash
    const parts = result.maxNum.split("-");
    const lastPart = parts[parts.length - 1];
    const parsed = parseInt(lastPart, 10);
    if (!isNaN(parsed)) seq = parsed + 1;
  }
  return `${prefix}-${year}-${String(seq).padStart(4, "0")}`;
}

async function autoGeneratePO(jobId: number, projectId: number, vendorId: number) {
  const jobList = await storage.getJobs(projectId);
  const job = jobList.find((j: any) => j.id === jobId);
  if (!job) return;
  // Skip if job already has a PO
  if (job.poId) return;
  const project = await storage.getProject(projectId);
  if (!project) return;
  // Look up rate — prefer most specific match (with both source + target language)
  const rateCards = await db.select().from(vendorRateCards).where(
    and(eq(vendorRateCards.vendorId, vendorId),
      job.sourceLanguage ? eq(vendorRateCards.sourceLanguage, job.sourceLanguage) : undefined,
      job.targetLanguage ? eq(vendorRateCards.targetLanguage, job.targetLanguage) : undefined,
    )
  ).orderBy(desc(vendorRateCards.createdAt));
  const rate = rateCards.length > 0 ? parseFloat(rateCards[0].rateValue) : 0;
  const units = parseFloat(job.unitCount || "0") || parseInt(String(job.wordCount || 0)) || 0;
  // Round financial amount to 2 decimal places
  const amount = Math.round(rate * units * 100) / 100;
  if (amount <= 0) return;
  // Generate PO number using MAX-based sequence
  const year = new Date().getFullYear();
  const entityCode = project.entityId ? (await db.select().from(entities).where(eq(entities.id, project.entityId)))?.[0]?.code?.toUpperCase() || "VRB" : "VRB";
  const poNumber = await getNextSequenceNumber(purchaseOrders, `${entityCode}-PO`, year, purchaseOrders.poNumber);
  // Resolve currency: project > entity defaultCurrency > entity currency > "EUR"
  let poCurrency = project.currency;
  if (!poCurrency && project.entityId) {
    const entity = await storage.getEntity(project.entityId);
    if (entity) poCurrency = entity.defaultCurrency || entity.currency;
  }
  const po = await storage.createPurchaseOrder({
    vendorId,
    entityId: project.entityId || undefined,
    projectId,
    jobId,
    poNumber,
    amount: String(amount),
    currency: poCurrency || "EUR",
    status: "draft",
  } as any);
  // Link PO to job
  await storage.updateJob(jobId, { poId: po.id, vendorRate: String(rate), vendorTotal: String(amount) } as any);
  // Create PO line item
  await db.insert(poLineItems).values({
    purchaseOrderId: po.id,
    description: `${job.sourceLanguage} → ${job.targetLanguage} ${job.serviceType || "translation"}`,
    quantity: String(units),
    unit: job.unitType || "words",
    unitPrice: String(rate),
    amount: String(amount),
  });
  return po;
}

// ============================================
// AUTO-PO / AUTO-INVOICE (Phase C)
// ============================================

router.post("/jobs/:jobId/generate-po", requireAuth, async (req: Request, res: Response) => {
  try {
    const jobId = +param(req, "jobId");
    // Find the job's project and vendor
    const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId));
    if (!job) return res.status(404).json({ error: "Job not found" });
    if (!job.vendorId) return res.status(400).json({ error: "Job has no vendor assigned" });
    const po = await autoGeneratePO(jobId, job.projectId, job.vendorId);
    res.json({ success: true, po });
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to generate PO", e) });
  }
});

router.post("/projects/:projectId/generate-invoice", requireAuth, async (req: Request, res: Response) => {
  try {
    const projectId = +param(req, "projectId");
    const project = await storage.getProject(projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });
    const jobList = await storage.getJobs(projectId);
    // Calculate totals from jobs
    let subtotal = 0;
    const lines: any[] = [];
    for (const job of jobList) {
      // Look up client rate
      const clientRateCards = await db.select().from(customerRateCards).where(
        and(eq(customerRateCards.customerId, project.customerId),
          job.sourceLanguage ? eq(customerRateCards.sourceLanguage, job.sourceLanguage) : undefined,
          job.targetLanguage ? eq(customerRateCards.targetLanguage, job.targetLanguage) : undefined,
        )
      );
      const rate = clientRateCards.length > 0 ? parseFloat(clientRateCards[0].rateValue) : parseFloat(job.clientRate || job.unitRate || "0") || 0;
      const units = parseFloat(job.unitCount || "0") || parseInt(String(job.wordCount || 0)) || 0;
      // Round financial amount to 2 decimal places
      const amount = Math.round(rate * units * 100) / 100;
      subtotal += amount;
      lines.push({
        projectId,
        jobId: job.id,
        description: `${job.sourceLanguage} → ${job.targetLanguage} ${job.serviceType || "translation"}`,
        quantity: String(units),
        unit: job.unitType || "words",
        unitPrice: String(rate),
        amount: String(amount),
      });
      // Update job with client rate
      await storage.updateJob(job.id, { clientRate: String(rate), clientTotal: String(amount) } as any);
    }
    // Round subtotal to 2 decimal places
    subtotal = Math.round(subtotal * 100) / 100;
    // Generate invoice number using MAX-based sequence
    const year = new Date().getFullYear();
    const entityCode = project.entityId ? (await db.select().from(entities).where(eq(entities.id, project.entityId)))?.[0]?.code?.toUpperCase() || "VRB" : "VRB";
    const invoiceNumber = await getNextSequenceNumber(clientInvoices, `${entityCode}-INV`, year, clientInvoices.invoiceNumber);
    // Resolve currency: project > entity defaultCurrency > entity currency > "EUR"
    let invCurrency = project.currency;
    if (!invCurrency && project.entityId) {
      const entityForCurrency = await storage.getEntity(project.entityId);
      if (entityForCurrency) invCurrency = entityForCurrency.defaultCurrency || entityForCurrency.currency;
    }
    const invoice = await storage.createInvoice({
      customerId: project.customerId,
      entityId: project.entityId || undefined,
      invoiceNumber,
      invoiceDate: new Date().toISOString().split("T")[0],
      subtotal: String(subtotal),
      total: String(subtotal),
      currency: invCurrency || "EUR",
      status: "draft",
    } as any);
    // Create line items
    for (const line of lines) {
      await db.insert(clientInvoiceLines).values({ invoiceId: invoice.id, ...line });
    }
    // Update jobs with invoice reference
    for (const job of jobList) {
      await storage.updateJob(job.id, { invoiceId: invoice.id } as any);
    }
    await logAudit((req as any).pmUserId, "auto_generate_invoice", "invoice", invoice.id, null, { projectId, subtotal }, getClientIp(req));
    await createNotificationV2((req as any).pmUserId, "invoice_generated", `Invoice ${invoiceNumber} generated`, `Auto-generated invoice for project`, `/invoices`);
    res.json({ success: true, invoice });
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to generate invoice", e) });
  }
});

// ============================================
// PURCHASE ORDERS
// ============================================

router.get("/purchase-orders", requireAuth, async (req: Request, res: Response) => {
  try {
    const filters: any = {};
    if (req.query.vendorId) filters.vendorId = +req.query.vendorId;
    if (req.query.entityId) filters.entityId = +req.query.entityId;
    if (req.query.status) filters.status = req.query.status;
    if (req.query.page) filters.page = +req.query.page;
    if (req.query.limit) filters.limit = +req.query.limit;
    const [data, total] = await Promise.all([
      storage.getPurchaseOrders(filters),
      storage.getPurchaseOrderCount(filters),
    ]);
    res.json({ data, total, page: filters.page || 1, limit: filters.limit || 50 });
  } catch (e: any) {
    res.status(500).json({ error: safeError("Internal server error", e) });
  }
});

router.post("/purchase-orders", requireAuth, async (req: Request, res: Response) => {
  try {
    const body = validate(createPurchaseOrderSchema, req.body, res);
    if (!body) return;
    const data: any = { ...body };
    // Auto-generate PO number if not provided
    if (!data.poNumber && data.entityId) {
      const entity = await storage.getEntity(data.entityId);
      if (entity) {
        const year = new Date().getFullYear();
        data.poNumber = await storage.getNextPoNumber(entity.code, year);
      }
    }
    // Fall back to entity defaultCurrency if no currency specified
    if (!data.currency && data.entityId) {
      const entity = await storage.getEntity(data.entityId);
      if (entity) data.currency = entity.defaultCurrency || entity.currency || "EUR";
    }
    if (!data.currency) data.currency = "EUR";
    const order = await storage.createPurchaseOrder(data);
    await logAudit((req as any).pmUserId, "create", "purchase_order", order.id, null, order, getClientIp(req));
    res.status(201).json(order);
  } catch (e: any) {
    console.error("Create purchase order error:", e);
    res.status(500).json({ error: "Failed to create purchase order" });
  }
});

router.patch("/purchase-orders/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = +param(req, "id");
    const oldOrder = await storage.getPurchaseOrder(id);
    const order = await storage.updatePurchaseOrder(id, req.body);
    await logAudit((req as any).pmUserId, "update", "purchase_order", id, oldOrder, order, getClientIp(req));
    res.json(order);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Internal server error", e) });
  }
});

// ---- ENHANCED PURCHASE ORDERS ----
router.get("/purchase-orders/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const po = await storage.getPurchaseOrder(+param(req, "id"));
    if (!po) return res.status(404).json({ error: "PO not found" });
    const vendor = po.vendorId ? await storage.getVendor(po.vendorId) : null;
    const entity = po.entityId ? await storage.getEntity(po.entityId) : null;
    res.json({ ...po, vendor, entity });
  } catch (e: any) {
    res.status(500).json({ error: safeError("Internal server error", e) });
  }
});

router.post("/purchase-orders/:id/send", requireAuth, async (req: Request, res: Response) => {
  try {
    const po = await storage.updatePurchaseOrder(+param(req, "id"), { status: "sent" });
    await logAudit((req as any).pmUserId, "update", "purchase_order", +param(req, "id"), null, po, getClientIp(req));
    res.json(po);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Internal server error", e) });
  }
});

router.post("/purchase-orders/:id/accept", requireAuth, async (req: Request, res: Response) => {
  try {
    const po = await storage.updatePurchaseOrder(+param(req, "id"), { status: "accepted" });
    await logAudit((req as any).pmUserId, "update", "purchase_order", +param(req, "id"), null, po, getClientIp(req));
    res.json(po);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Internal server error", e) });
  }
});

router.post("/purchase-orders/:id/mark-paid", requireAuth, async (req: Request, res: Response) => {
  try {
    const { paymentDate, paymentMethod, reference } = req.body;
    const po = await storage.updatePurchaseOrder(+param(req, "id"), {
      status: "paid",
      paymentDate: paymentDate || new Date().toISOString().split("T")[0],
      paymentMethod: paymentMethod || null,
    });
    // Record payment
    if (po) {
      await storage.createPayment({
        type: "payable",
        purchaseOrderId: po.id,
        amount: po.amount,
        currency: po.currency,
        paymentDate: paymentDate || new Date().toISOString().split("T")[0],
        paymentMethod: paymentMethod || null,
        reference: reference || null,
      });
    }
    res.json(po);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Internal server error", e) });
  }
});

// ---- PO LINE ITEMS CRUD ----
router.get("/purchase-orders/:id/line-items", requireAuth, async (req: Request, res: Response) => {
  try {
    const lines = await storage.getPoLineItems(+param(req, "id"));
    res.json(lines);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Internal server error", e) });
  }
});

router.post("/purchase-orders/:id/line-items", requireAuth, async (req: Request, res: Response) => {
  try {
    const purchaseOrderId = +param(req, "id");
    const line = await storage.createPoLineItem({ ...req.body, purchaseOrderId });
    res.status(201).json(line);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to create PO line item", e) });
  }
});

router.patch("/purchase-orders/:id/line-items/:liId", requireAuth, async (req: Request, res: Response) => {
  try {
    const liId = +param(req, "liId");
    const line = await storage.updatePoLineItem(liId, req.body);
    res.json(line);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to update PO line item", e) });
  }
});

router.delete("/purchase-orders/:id/line-items/:liId", requireAuth, async (req: Request, res: Response) => {
  try {
    const liId = +param(req, "liId");
    await storage.deletePoLineItem(liId);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to delete PO line item", e) });
  }
});

// PO recalculate totals from line items
router.post("/purchase-orders/:id/recalculate", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = +param(req, "id");
    const po = await storage.getPurchaseOrder(id);
    if (!po) return res.status(404).json({ error: "PO not found" });
    const lines = await storage.getPoLineItems(id);
    const total = lines.reduce((sum, l) => sum + parseFloat(String(l.amount) || "0"), 0);
    const updated = await storage.updatePurchaseOrder(id, { amount: String(total) });
    res.json(updated);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to recalculate PO", e) });
  }
});

// ============================================
// CLIENT INVOICES
// ============================================

router.get("/invoices", requireAuth, async (req: Request, res: Response) => {
  try {
    const filters: any = {};
    if (req.query.customerId) filters.customerId = +req.query.customerId;
    if (req.query.entityId) filters.entityId = +req.query.entityId;
    if (req.query.status) filters.status = req.query.status;
    if (req.query.page) filters.page = +req.query.page;
    if (req.query.limit) filters.limit = +req.query.limit;
    const [data, total] = await Promise.all([
      storage.getInvoices(filters),
      storage.getInvoiceCount(filters),
    ]);
    res.json({ data, total, page: filters.page || 1, limit: filters.limit || 50 });
  } catch (e: any) {
    res.status(500).json({ error: safeError("Internal server error", e) });
  }
});

// IMPORTANT: specific sub-routes must be registered BEFORE the parametric /:id route
router.get("/invoices/uninvoiced-jobs", requireAuth, async (req: Request, res: Response) => {
  try {
    const customerId = req.query.customerId ? +req.query.customerId : undefined;
    const data = await storage.getUninvoicedJobs(customerId);
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Internal server error", e) });
  }
});

router.get("/invoices/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const invoice = await storage.getInvoice(+param(req, "id"));
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });
    const lines = await storage.getInvoiceLines(invoice.id);
    const customer = invoice.customerId ? await storage.getCustomer(invoice.customerId) : null;
    const entity = invoice.entityId ? await storage.getEntity(invoice.entityId) : null;
    res.json({ ...invoice, lines, customer, entity });
  } catch (e: any) {
    res.status(500).json({ error: safeError("Internal server error", e) });
  }
});

router.post("/invoices", requireAuth, async (req: Request, res: Response) => {
  try {
    const body = validate(createInvoiceSchema, req.body, res);
    if (!body) return;
    const { lines, ...invoiceData } = body as any;
    // Auto-generate invoice number if not provided
    if (!invoiceData.invoiceNumber && invoiceData.entityId) {
      const entity = await storage.getEntity(invoiceData.entityId);
      if (entity) {
        const year = new Date().getFullYear();
        invoiceData.invoiceNumber = await storage.getNextInvoiceNumber(entity.code, year);
      }
    }
    // Fall back to entity defaultCurrency if no currency specified
    if (!invoiceData.currency && invoiceData.entityId) {
      const entity = await storage.getEntity(invoiceData.entityId);
      if (entity) invoiceData.currency = entity.defaultCurrency || entity.currency || "EUR";
    }
    if (!invoiceData.currency) invoiceData.currency = "EUR";
    // Calculate totals from lines
    if (lines && lines.length > 0) {
      const subtotal = lines.reduce((sum: number, l: any) => sum + (parseFloat(l.amount) || 0), 0);
      invoiceData.subtotal = String(subtotal);
      invoiceData.taxAmount = invoiceData.taxAmount || "0";
      invoiceData.total = String(subtotal + parseFloat(invoiceData.taxAmount || "0"));
    }
    const invoice = await storage.createInvoice(invoiceData);
    // Create line items
    if (lines && lines.length > 0) {
      for (const line of lines) {
        await storage.createInvoiceLine({ ...line, invoiceId: invoice.id });
      }
    }
    const createdLines = await storage.getInvoiceLines(invoice.id);
    await logAudit((req as any).pmUserId, "create", "invoice", invoice.id, null, { ...invoice, lines: createdLines }, getClientIp(req));
    res.status(201).json({ ...invoice, lines: createdLines });
  } catch (e: any) {
    console.error("Create invoice error:", e);
    res.status(500).json({ error: "Failed to create invoice" });
  }
});

router.patch("/invoices/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = +param(req, "id");
    const oldInvoice = await storage.getInvoice(id);
    const { lines, ...updateData } = req.body;
    const invoice = await storage.updateInvoice(id, updateData);
    if (lines) {
      await storage.deleteInvoiceLines(invoice!.id);
      for (const line of lines) {
        await storage.createInvoiceLine({ ...line, invoiceId: invoice!.id });
      }
    }
    await logAudit((req as any).pmUserId, "update", "invoice", id, oldInvoice, invoice, getClientIp(req));
    res.json(invoice);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Internal server error", e) });
  }
});

router.post("/invoices/:id/send", requireAuth, async (req: Request, res: Response) => {
  try {
    const invoice = await storage.updateInvoice(+param(req, "id"), { status: "sent" });
    res.json(invoice);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Internal server error", e) });
  }
});

router.post("/invoices/:id/mark-paid", requireAuth, async (req: Request, res: Response) => {
  try {
    const { paymentDate, paymentMethod, reference } = req.body;
    const invoice = await storage.updateInvoice(+param(req, "id"), {
      status: "paid",
      paymentReceivedDate: paymentDate || new Date().toISOString().split("T")[0],
    });
    // Record payment
    if (invoice) {
      await storage.createPayment({
        type: "receivable",
        invoiceId: invoice.id,
        amount: invoice.total,
        currency: invoice.currency,
        paymentDate: paymentDate || new Date().toISOString().split("T")[0],
        paymentMethod: paymentMethod || null,
        reference: reference || null,
      });
    }
    res.json(invoice);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Internal server error", e) });
  }
});

// ---- INVOICE LINE ITEMS CRUD ----
router.get("/invoices/:id/line-items", requireAuth, async (req: Request, res: Response) => {
  try {
    const lines = await storage.getInvoiceLines(+param(req, "id"));
    res.json(lines);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Internal server error", e) });
  }
});

router.post("/invoices/:id/line-items", requireAuth, async (req: Request, res: Response) => {
  try {
    const invoiceId = +param(req, "id");
    const line = await storage.createInvoiceLine({ ...req.body, invoiceId });
    res.status(201).json(line);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to create line item", e) });
  }
});

router.patch("/invoices/:id/line-items/:liId", requireAuth, async (req: Request, res: Response) => {
  try {
    const liId = +param(req, "liId");
    const line = await storage.updateInvoiceLine(liId, req.body);
    res.json(line);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to update line item", e) });
  }
});

router.delete("/invoices/:id/line-items/:liId", requireAuth, async (req: Request, res: Response) => {
  try {
    const liId = +param(req, "liId");
    await storage.deleteInvoiceLine(liId);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to delete line item", e) });
  }
});

// Invoice recalculate totals from line items
router.post("/invoices/:id/recalculate", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = +param(req, "id");
    const invoice = await storage.getInvoice(id);
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });
    const lines = await storage.getInvoiceLines(id);
    const subtotal = lines.reduce((sum, l) => sum + parseFloat(String(l.amount) || "0"), 0);
    const taxRate = parseFloat(String(invoice.taxRate) || "0");
    const taxAmount = subtotal * (taxRate / 100);
    const total = subtotal + taxAmount;
    const updated = await storage.updateInvoice(id, {
      subtotal: String(subtotal),
      taxAmount: String(taxAmount),
      total: String(total),
    });
    res.json(updated);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to recalculate invoice", e) });
  }
});

// ============================================
// PAYMENTS
// ============================================

router.get("/payments", requireAuth, async (req: Request, res: Response) => {
  try {
    const filters: any = {};
    if (req.query.invoiceId) filters.invoiceId = +req.query.invoiceId;
    if (req.query.purchaseOrderId) filters.purchaseOrderId = +req.query.purchaseOrderId;
    if (req.query.type) filters.type = req.query.type;
    const data = await storage.getPayments(filters);
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Internal server error", e) });
  }
});

router.post("/payments", requireAuth, async (req: Request, res: Response) => {
  try {
    const body = validate(createPaymentSchema, req.body, res);
    if (!body) return;
    const payment = await storage.createPayment(body);
    res.status(201).json(payment);
  } catch (e: any) {
    console.error("Create payment error:", e);
    res.status(500).json({ error: "Failed to create payment" });
  }
});

// ---- ENHANCED PAYMENTS ----
// Note: /summary and /cash-flow MUST be registered before /:id
router.get("/payments/summary", requireAuth, async (req: Request, res: Response) => {
  try {
    const filters: any = {};
    if (req.query.type) filters.type = req.query.type;
    if (req.query.entityId) filters.entityId = +req.query.entityId;
    if (req.query.startDate) filters.startDate = req.query.startDate;
    if (req.query.endDate) filters.endDate = req.query.endDate;
    const summary = await storage.getPaymentsSummary(filters);
    res.json(summary);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Internal server error", e) });
  }
});

router.get("/payments/cash-flow", requireAuth, requireFinanceRole, async (req: Request, res: Response) => {
  try {
    const months = req.query.months ? +req.query.months : 12;
    const entityId = req.query.entityId ? +req.query.entityId : undefined;
    const data = await storage.getCashFlow(months, entityId);
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Internal server error", e) });
  }
});

router.get("/payments/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const payment = await storage.getPayment(+param(req, "id"));
    if (!payment) return res.status(404).json({ error: "Payment not found" });
    res.json(payment);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Internal server error", e) });
  }
});

router.delete("/payments/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = +param(req, "id");
    const payment = await storage.getPayment(id);
    if (!payment) return res.status(404).json({ error: "Payment not found" });
    await storage.deletePayment(id);
    await logAudit((req as any).pmUserId, "delete", "payment", id, payment, null, getClientIp(req));
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: safeError("Internal server error", e) });
  }
});

// ============================================
// FINANCIAL DASHBOARD
// ============================================

router.get("/financial/summary", requireAuth, requireFinanceRole, async (req: Request, res: Response) => {
  try {
    const filters: any = {};
    if (req.query.entityId) filters.entityId = +req.query.entityId;
    if (req.query.startDate) filters.startDate = req.query.startDate;
    if (req.query.endDate) filters.endDate = req.query.endDate;
    const summary = await storage.getFinancialSummary(filters);
    res.json(summary);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Internal server error", e) });
  }
});

router.get("/financial/ar-aging", requireAuth, requireFinanceRole, async (req: Request, res: Response) => {
  try {
    const entityId = req.query.entityId ? +req.query.entityId : undefined;
    const aging = await storage.getARAgingReport(entityId);
    res.json(aging);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Internal server error", e) });
  }
});

router.get("/financial/revenue-by-customer", requireAuth, requireFinanceRole, async (req: Request, res: Response) => {
  try {
    const entityId = req.query.entityId ? +req.query.entityId : undefined;
    const limit = req.query.limit ? +req.query.limit : 10;
    const data = await storage.getRevenueByCustomer(limit, entityId);
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Internal server error", e) });
  }
});

router.get("/financial/cost-by-vendor", requireAuth, requireFinanceRole, async (req: Request, res: Response) => {
  try {
    const entityId = req.query.entityId ? +req.query.entityId : undefined;
    const limit = req.query.limit ? +req.query.limit : 10;
    const data = await storage.getCostByVendor(limit, entityId);
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Internal server error", e) });
  }
});

router.get("/financial/monthly-trend", requireAuth, requireFinanceRole, async (req: Request, res: Response) => {
  try {
    const entityId = req.query.entityId ? +req.query.entityId : undefined;
    const months = req.query.months ? +req.query.months : 12;
    const data = await storage.getMonthlyTrend(months, entityId);
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Internal server error", e) });
  }
});

router.get("/financial/revenue-by-entity", requireAuth, requireFinanceRole, async (_req: Request, res: Response) => {
  try {
    const data = await storage.getRevenueByEntity();
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Internal server error", e) });
  }
});

router.get("/financial/ap-aging", requireAuth, requireFinanceRole, async (req: Request, res: Response) => {
  try {
    const entityId = req.query.entityId ? +req.query.entityId : undefined;
    const aging = await storage.getAPAgingReport(entityId);
    res.json(aging);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Internal server error", e) });
  }
});

router.get("/financial/pnl", requireAuth, requireFinanceRole, async (req: Request, res: Response) => {
  try {
    const filters: any = {};
    if (req.query.entityId) filters.entityId = +req.query.entityId;
    if (req.query.startDate) filters.startDate = req.query.startDate;
    if (req.query.endDate) filters.endDate = req.query.endDate;
    const data = await storage.getPnlReport(filters);
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Internal server error", e) });
  }
});

router.get("/financial/entity-comparison", requireAuth, requireFinanceRole, async (req: Request, res: Response) => {
  try {
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;
    const data = await storage.getEntityComparison(startDate, endDate);
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Internal server error", e) });
  }
});

// ============================================
// PROJECT FINANCIALS
// ============================================

router.get("/projects/:id/financials", requireAuth, async (req: Request, res: Response) => {
  try {
    const financials = await storage.getProjectFinancials(+param(req, "id"));
    res.json(financials);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Internal server error", e) });
  }
});

// ============================================
// CUSTOMER RATE CARDS (enhanced)
// ============================================

router.patch("/customers/:id/rate-card/:rcId", requireAuth, async (req: Request, res: Response) => {
  try {
    const rcId = +param(req, "rcId");
    const rc = await storage.updateCustomerRateCard(rcId, req.body);
    res.json(rc);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to update customer rate card", e) });
  }
});

// ============================================
// RATE CARD LOOKUP
// ============================================

router.get("/rate-cards/lookup", requireAuth, async (req: Request, res: Response) => {
  try {
    const { customerId, vendorId, sourceLang, targetLang, serviceType } = req.query;
    const result = await storage.lookupRateCards({
      customerId: customerId ? +customerId : undefined,
      vendorId: vendorId ? +vendorId : undefined,
      sourceLang: sourceLang as string,
      targetLang: targetLang as string,
      serviceType: serviceType as string,
    });
    const customerRate = result.customerRate ? parseFloat(String(result.customerRate.rateValue)) : null;
    const vendorRate = result.vendorRate ? parseFloat(String(result.vendorRate.rateValue)) : null;
    const margin = customerRate && vendorRate ? ((customerRate - vendorRate) / customerRate) * 100 : null;
    res.json({ customerRate: result.customerRate, vendorRate: result.vendorRate, margin });
  } catch (e: any) {
    res.status(500).json({ error: safeError("Internal server error", e) });
  }
});

// ============================================
// DASHBOARD KPIs
// ============================================

router.get("/dashboard/kpis", requireAuth, async (_req: Request, res: Response) => {
  try {
    const kpis = await storage.getDashboardKpis();
    res.json(kpis);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Internal server error", e) });
  }
});

router.get("/dashboard/activity", requireAuth, async (req: Request, res: Response) => {
  try {
    const limit = req.query.limit ? +req.query.limit : 20;
    const activity = await storage.getDashboardActivity(limit);
    res.json(activity);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Internal server error", e) });
  }
});

router.get("/dashboard/deadlines", requireAuth, async (_req: Request, res: Response) => {
  try {
    const deadlines = await storage.getDashboardDeadlines();
    res.json(deadlines);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Internal server error", e) });
  }
});

router.get("/dashboard/project-pipeline", requireAuth, async (_req: Request, res: Response) => {
  try {
    const pipeline = await storage.getProjectPipeline();
    res.json(pipeline);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Internal server error", e) });
  }
});

// ============================================
// CSV EXPORTS
// ============================================

router.get("/export/invoices", requireAuth, async (req: Request, res: Response) => {
  try {
    const entityId = req.query.entityId ? +req.query.entityId : undefined;
    const data = await storage.getAllInvoicesForExport(entityId);
    const rows = data.map((r: any) => ({
      invoice_number: r.invoice.invoiceNumber || "",
      date: r.invoice.invoiceDate || "",
      due_date: r.invoice.dueDate || "",
      customer: r.customerName || "",
      entity: r.entityName || "",
      subtotal: r.invoice.subtotal || "",
      tax: r.invoice.taxAmount || "",
      total: r.invoice.total || "",
      currency: r.invoice.currency || "",
      status: r.invoice.status || "",
      payment_terms: r.invoice.paymentTerms || "",
    }));
    const headers = Object.keys(rows[0] || {});
    const csv = [headers.join(","), ...rows.map((r: any) => headers.map(h => `"${String(r[h] || "").replace(/"/g, '""')}"`).join(","))].join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=invoices.csv");
    res.send(csv);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Export failed", e) });
  }
});

router.get("/export/purchase-orders", requireAuth, async (req: Request, res: Response) => {
  try {
    const entityId = req.query.entityId ? +req.query.entityId : undefined;
    const data = await storage.getAllPurchaseOrdersForExport(entityId);
    const rows = data.map((r: any) => ({
      po_number: r.po.poNumber || "",
      vendor: r.vendorName || "",
      entity: r.entityName || "",
      amount: r.po.amount || "",
      currency: r.po.currency || "",
      status: r.po.status || "",
      payment_method: r.po.paymentMethod || "",
      payment_date: r.po.paymentDate || "",
      payment_terms: r.po.paymentTerms || "",
      created: r.po.createdAt || "",
    }));
    const headers = Object.keys(rows[0] || {});
    const csv = [headers.join(","), ...rows.map((r: any) => headers.map(h => `"${String(r[h] || "").replace(/"/g, '""')}"`).join(","))].join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=purchase-orders.csv");
    res.send(csv);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Export failed", e) });
  }
});

router.get("/export/payments", requireAuth, async (req: Request, res: Response) => {
  try {
    const entityId = req.query.entityId ? +req.query.entityId : undefined;
    const data = await storage.getAllPaymentsForExport(entityId);
    const rows = data.map((p: any) => ({
      type: p.type || "",
      amount: p.amount || "",
      currency: p.currency || "",
      payment_date: p.paymentDate || "",
      payment_method: p.paymentMethod || "",
      reference: p.reference || "",
      notes: p.notes || "",
      created: p.createdAt || "",
    }));
    const headers = Object.keys(rows[0] || {});
    const csv = [headers.join(","), ...rows.map((r: any) => headers.map(h => `"${String(r[h] || "").replace(/"/g, '""')}"`).join(","))].join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=payments.csv");
    res.send(csv);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Export failed", e) });
  }
});

router.get("/export/vendors", requireAuth, async (_req: Request, res: Response) => {
  try {
    const data = await storage.getAllVendorsForExport();
    const rows = data.map((v: any) => ({
      resource_code: v.resourceCode || "",
      full_name: v.fullName || "",
      email: v.email || "",
      phone: v.phone || "",
      status: v.status || "",
      tier: v.tier || "",
      native_language: v.nativeLanguage || "",
      location: v.location || "",
      resource_type: v.resourceType || "",
      currency: v.currency || "",
      availability: v.availability || "",
      combined_quality_score: v.combinedQualityScore || "",
      average_lqa_score: v.averageLqaScore || "",
      average_qs_score: v.averageQsScore || "",
      nda_signed: v.ndaSigned ? "Yes" : "No",
      tested: v.tested ? "Yes" : "No",
      certified: v.certified ? "Yes" : "No",
      service_types: (v.serviceTypes || []).join("; "),
      specializations: (v.specializations || []).join("; "),
      tags: (v.tags || []).join("; "),
    }));
    const headers = Object.keys(rows[0] || {});
    const csv = [headers.join(","), ...rows.map((r: any) => headers.map(h => `"${String(r[h] || "").replace(/"/g, '""')}"`).join(","))].join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=vendors.csv");
    res.send(csv);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Export failed", e) });
  }
});

export default router;
