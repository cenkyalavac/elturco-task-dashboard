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
import { eq, and, sql, desc, gte, lte, asc } from "drizzle-orm";
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
  vendorInvoices,
  paymentQueue,
  paymentReminders,
  taxCodes,
  customers,
} from "@shared/schema";
import { wiseService } from "../services/wise";
import { qboService } from "../services/qbo";
import {
  requireAuth,
  requireRole,
  validate,
  param,
  safeError,
  logAudit,
  getClientIp,
  createNotificationV2,
  sendEmail,
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

// ============================================
// FAZ 5: ENTITY FINANCIAL SETTINGS
// ============================================

router.patch("/entities/:id/financial-settings", requireAuth, requireFinanceRole, async (req: Request, res: Response) => {
  try {
    const id = +param(req, "id");
    const schema = z.object({
      taxId: z.string().optional(),
      billingAddress: z.string().optional(),
      bankDetails: z.any().optional(),
      invoicePrefix: z.string().optional(),
      invoiceNextNumber: z.number().optional(),
      defaultPaymentTerms: z.number().optional(),
      logoUrl: z.string().optional(),
      wiseProfileId: z.string().optional(),
      qboCompanyId: z.string().optional(),
    });
    const body = validate(schema, req.body, res);
    if (!body) return;
    const [updated] = await db.update(entities).set(body).where(eq(entities.id, id)).returning();
    if (!updated) return res.status(404).json({ error: "Entity not found" });
    await logAudit((req as any).pmUserId, "update", "entity_financial_settings", id, null, body, getClientIp(req));
    res.json(updated);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to update entity financial settings", e) });
  }
});

// ============================================
// FAZ 5: AUTO-INVOICE FROM PROJECT
// ============================================

router.post("/projects/:projectId/auto-invoice", requireAuth, requireFinanceRole, async (req: Request, res: Response) => {
  try {
    const projectId = +param(req, "projectId");
    const project = await storage.getProject(projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const jobList = await storage.getJobs(projectId);
    if (jobList.length === 0) return res.status(400).json({ error: "No jobs in project" });

    // Look up entity for prefix
    let invoiceNumber = `INV-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`;
    let entityId = project.entityId;
    if (entityId) {
      const entity = await storage.getEntity(entityId);
      if (entity) {
        const prefix = (entity as any).invoicePrefix || "INV";
        const nextNum = (entity as any).invoiceNextNumber || 1;
        invoiceNumber = `${prefix}-${new Date().getFullYear()}-${String(nextNum).padStart(4, "0")}`;
        // Increment the next number
        await db.execute(sql`UPDATE entities SET invoice_next_number = COALESCE(invoice_next_number, 1) + 1 WHERE id = ${entityId}`);
      }
    }

    // Resolve currency
    let currency = project.currency || "EUR";
    if (!project.currency && entityId) {
      const entity = await storage.getEntity(entityId);
      if (entity) currency = entity.defaultCurrency || entity.currency || "EUR";
    }

    // Calculate totals from jobs
    const lineItems = jobList.map(j => ({
      description: `${j.jobName || j.jobCode || "Job"} — ${j.sourceLanguage || ""}→${j.targetLanguage || ""} (${j.serviceType || "Translation"})`,
      quantity: parseFloat(j.unitCount || "1") || 1,
      unitPrice: parseFloat(j.clientRate || j.unitRate || "0") || 0,
      amount: parseFloat(j.clientTotal || j.totalRevenue || "0") || 0,
    }));

    const subtotal = Math.round(lineItems.reduce((s, l) => s + l.amount, 0) * 100) / 100;

    // Create the invoice
    const [invoice] = await db.insert(clientInvoices).values({
      entityId,
      customerId: project.customerId,
      invoiceNumber,
      invoiceDate: new Date().toISOString().split("T")[0],
      dueDate: new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0],
      subtotal: String(subtotal),
      taxAmount: "0",
      total: String(subtotal),
      currency,
      status: "draft",
      paymentTerms: "net_30",
      notes: `Auto-generated from project: ${project.projectName}`,
    } as any).returning();

    // Add projectId
    await db.execute(sql`UPDATE client_invoices SET project_id = ${projectId} WHERE id = ${invoice.id}`);

    // Create line items
    for (const li of lineItems) {
      await db.insert(clientInvoiceLines).values({
        invoiceId: invoice.id,
        description: li.description,
        quantity: String(li.quantity),
        unitPrice: String(li.unitPrice),
        amount: String(li.amount),
      });
    }

    await logAudit((req as any).pmUserId, "auto_invoice", "client_invoice", invoice.id, null, { projectId, subtotal }, getClientIp(req));
    res.json({ ...invoice, lineItems });
  } catch (e: any) {
    res.status(500).json({ error: safeError("Auto-invoice generation failed", e) });
  }
});

// ============================================
// FAZ 5: INVOICE APPROVAL WORKFLOW
// ============================================

router.post("/invoices/:id/approve", requireAuth, requireFinanceRole, async (req: Request, res: Response) => {
  try {
    const id = +param(req, "id");
    const [invoice] = await db.select().from(clientInvoices).where(eq(clientInvoices.id, id));
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });

    await db.execute(sql`UPDATE client_invoices SET approval_status = 'approved', approved_by = ${(req as any).pmUserId}, approved_at = NOW() WHERE id = ${id}`);
    await logAudit((req as any).pmUserId, "approve", "client_invoice", id, null, { approvalStatus: "approved" }, getClientIp(req));
    const [updated] = await db.select().from(clientInvoices).where(eq(clientInvoices.id, id));
    res.json(updated);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Invoice approval failed", e) });
  }
});

// ============================================
// FAZ 5: INVOICE PDF GENERATION (HTML-based)
// ============================================

router.post("/invoices/:id/pdf", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = +param(req, "id");
    const [invoice] = await db.select().from(clientInvoices).where(eq(clientInvoices.id, id));
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });

    const lines = await db.select().from(clientInvoiceLines).where(eq(clientInvoiceLines.invoiceId, id));
    const [customer] = invoice.customerId ? await db.select().from(customers).where(eq(customers.id, invoice.customerId)) : [null];
    let entity: any = null;
    if (invoice.entityId) {
      [entity] = await db.select().from(entities).where(eq(entities.id, invoice.entityId));
    }

    const symbol = invoice.currency === "GBP" ? "£" : invoice.currency === "EUR" ? "€" : "$";

    // Generate HTML invoice
    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Invoice ${invoice.invoiceNumber}</title>
<style>
  body { font-family: 'Helvetica Neue', Arial, sans-serif; margin: 0; padding: 40px; color: #1a1a1a; font-size: 14px; }
  .header { display: flex; justify-content: space-between; margin-bottom: 40px; }
  .company { font-size: 24px; font-weight: bold; color: #333; }
  .invoice-title { font-size: 32px; font-weight: bold; color: #4F46E5; text-align: right; }
  .meta { display: flex; justify-content: space-between; margin-bottom: 30px; }
  .meta-block { }
  .meta-label { font-size: 11px; color: #888; text-transform: uppercase; }
  .meta-value { font-size: 14px; font-weight: 500; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  th { background: #f7f7f7; padding: 10px; text-align: left; font-size: 12px; color: #666; border-bottom: 2px solid #e5e5e5; }
  td { padding: 10px; border-bottom: 1px solid #eee; }
  .totals { text-align: right; }
  .totals td { border: none; padding: 6px 10px; }
  .totals .total-row { font-weight: bold; font-size: 18px; }
  .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; color: #888; font-size: 12px; }
</style></head>
<body>
  <div class="header">
    <div>
      <div class="company">${entity?.name || "El Turco Translation Services"}</div>
      ${entity?.billingAddress ? `<div style="color:#888;margin-top:4px;white-space:pre-line">${(entity as any).billingAddress}</div>` : ""}
      ${(entity as any)?.taxId ? `<div style="color:#888;margin-top:4px">Tax ID: ${(entity as any).taxId}</div>` : ""}
    </div>
    <div>
      <div class="invoice-title">INVOICE</div>
      <div style="text-align:right;margin-top:8px">
        <div class="meta-label">Invoice Number</div>
        <div class="meta-value">${invoice.invoiceNumber || "—"}</div>
      </div>
    </div>
  </div>
  <div class="meta">
    <div class="meta-block">
      <div class="meta-label">Bill To</div>
      <div class="meta-value">${customer?.name || "—"}</div>
      ${customer?.email ? `<div style="color:#888">${customer.email}</div>` : ""}
    </div>
    <div class="meta-block">
      <div class="meta-label">Invoice Date</div>
      <div class="meta-value">${invoice.invoiceDate || "—"}</div>
      <div class="meta-label" style="margin-top:8px">Due Date</div>
      <div class="meta-value">${invoice.dueDate || "—"}</div>
    </div>
    <div class="meta-block">
      <div class="meta-label">Currency</div>
      <div class="meta-value">${invoice.currency || "EUR"}</div>
      <div class="meta-label" style="margin-top:8px">Payment Terms</div>
      <div class="meta-value">${invoice.paymentTerms || "Net 30"}</div>
    </div>
  </div>
  <table>
    <thead><tr><th>Description</th><th style="text-align:right">Qty</th><th style="text-align:right">Unit Price</th><th style="text-align:right">Amount</th></tr></thead>
    <tbody>
      ${lines.map(l => `<tr><td>${l.description || "—"}</td><td style="text-align:right">${l.quantity || 1}</td><td style="text-align:right">${symbol}${Number(l.unitPrice || 0).toFixed(2)}</td><td style="text-align:right">${symbol}${Number(l.amount || 0).toFixed(2)}</td></tr>`).join("")}
    </tbody>
  </table>
  <table class="totals"><tbody>
    <tr><td>Subtotal</td><td>${symbol}${Number(invoice.subtotal || 0).toFixed(2)}</td></tr>
    <tr><td>Tax</td><td>${symbol}${Number(invoice.taxAmount || 0).toFixed(2)}</td></tr>
    <tr class="total-row"><td>Total</td><td>${symbol}${Number(invoice.total || 0).toFixed(2)}</td></tr>
  </tbody></table>
  ${invoice.notes ? `<div class="footer"><strong>Notes:</strong> ${invoice.notes}</div>` : ""}
  ${entity?.bankDetails ? `<div class="footer"><strong>Bank Details:</strong><br/>${JSON.stringify(entity.bankDetails)}</div>` : ""}
</body></html>`;

    res.setHeader("Content-Type", "text/html");
    res.setHeader("Content-Disposition", `inline; filename=invoice-${invoice.invoiceNumber || id}.html`);
    res.send(html);
  } catch (e: any) {
    res.status(500).json({ error: safeError("PDF generation failed", e) });
  }
});

// ============================================
// FAZ 5: VENDOR INVOICES (AP)
// ============================================

router.get("/vendor-invoices", requireAuth, async (req: Request, res: Response) => {
  try {
    const status = req.query.status as string | undefined;
    const vendorId = req.query.vendorId ? +req.query.vendorId : undefined;
    const entityId = req.query.entityId ? +req.query.entityId : undefined;

    let conditions: any[] = [];
    if (status) conditions.push(eq(vendorInvoices.status, status));
    if (vendorId) conditions.push(eq(vendorInvoices.vendorId, vendorId));
    if (entityId) conditions.push(eq(vendorInvoices.entityId, entityId));

    const data = await db.select({
      vendorInvoice: vendorInvoices,
      vendorName: vendors.fullName,
    }).from(vendorInvoices)
      .leftJoin(vendors, eq(vendorInvoices.vendorId, vendors.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(vendorInvoices.createdAt));

    res.json({ vendorInvoices: data, total: data.length });
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to list vendor invoices", e) });
  }
});

router.post("/vendor-invoices", requireAuth, async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      vendorId: z.number().int().positive(),
      poId: z.number().optional(),
      invoiceNumber: z.string().min(1),
      invoiceDate: z.string().min(1),
      dueDate: z.string().optional(),
      amount: z.any(),
      currency: z.string().max(3).optional(),
      taxAmount: z.any().optional(),
      totalAmount: z.any(),
      notes: z.string().optional(),
      fileUrl: z.string().optional(),
      entityId: z.number().optional(),
    });
    const body = validate(schema, req.body, res);
    if (!body) return;

    const [created] = await db.insert(vendorInvoices).values({
      ...body,
      amount: String(body.amount),
      taxAmount: String(body.taxAmount || 0),
      totalAmount: String(body.totalAmount),
    } as any).returning();

    await logAudit((req as any).pmUserId, "create", "vendor_invoice", created.id, null, created, getClientIp(req));
    res.json(created);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to create vendor invoice", e) });
  }
});

router.patch("/vendor-invoices/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = +param(req, "id");
    const updates: any = { ...req.body, updatedAt: new Date() };
    if (updates.amount) updates.amount = String(updates.amount);
    if (updates.taxAmount) updates.taxAmount = String(updates.taxAmount);
    if (updates.totalAmount) updates.totalAmount = String(updates.totalAmount);
    const [updated] = await db.update(vendorInvoices).set(updates).where(eq(vendorInvoices.id, id)).returning();
    if (!updated) return res.status(404).json({ error: "Vendor invoice not found" });
    await logAudit((req as any).pmUserId, "update", "vendor_invoice", id, null, updates, getClientIp(req));
    res.json(updated);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to update vendor invoice", e) });
  }
});

router.post("/vendor-invoices/:id/approve", requireAuth, requireFinanceRole, async (req: Request, res: Response) => {
  try {
    const id = +param(req, "id");
    const [vi] = await db.select().from(vendorInvoices).where(eq(vendorInvoices.id, id));
    if (!vi) return res.status(404).json({ error: "Vendor invoice not found" });

    const [updated] = await db.update(vendorInvoices).set({
      status: "approved",
      reviewedBy: (req as any).pmUserId,
      reviewedAt: new Date(),
    } as any).where(eq(vendorInvoices.id, id)).returning();

    // Add to payment queue
    const [queueEntry] = await db.insert(paymentQueue).values({
      vendorInvoiceId: id,
      vendorId: vi.vendorId,
      amount: vi.totalAmount,
      currency: vi.currency || "EUR",
      entityId: vi.entityId,
      createdBy: (req as any).pmUserId,
    } as any).returning();

    await logAudit((req as any).pmUserId, "approve", "vendor_invoice", id, null, { status: "approved", queueEntryId: queueEntry.id }, getClientIp(req));
    res.json({ vendorInvoice: updated, queueEntry });
  } catch (e: any) {
    res.status(500).json({ error: safeError("Vendor invoice approval failed", e) });
  }
});

router.post("/vendor-invoices/:id/reject", requireAuth, requireFinanceRole, async (req: Request, res: Response) => {
  try {
    const id = +param(req, "id");
    const notes = req.body.notes || "";
    const [updated] = await db.update(vendorInvoices).set({
      status: "rejected",
      reviewedBy: (req as any).pmUserId,
      reviewedAt: new Date(),
      notes,
    } as any).where(eq(vendorInvoices.id, id)).returning();
    if (!updated) return res.status(404).json({ error: "Vendor invoice not found" });
    await logAudit((req as any).pmUserId, "reject", "vendor_invoice", id, null, { status: "rejected" }, getClientIp(req));
    res.json(updated);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Vendor invoice rejection failed", e) });
  }
});

// ============================================
// FAZ 5: PAYMENT QUEUE
// ============================================

router.get("/payment-queue", requireAuth, requireFinanceRole, async (req: Request, res: Response) => {
  try {
    const status = req.query.status as string | undefined;
    let conditions: any[] = [];
    if (status) conditions.push(eq(paymentQueue.status, status));

    const data = await db.select({
      queue: paymentQueue,
      vendorName: vendors.fullName,
    }).from(paymentQueue)
      .leftJoin(vendors, eq(paymentQueue.vendorId, vendors.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(paymentQueue.createdAt));

    res.json({ queue: data, total: data.length });
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to list payment queue", e) });
  }
});

router.post("/payment-queue/:id/process", requireAuth, requireFinanceRole, async (req: Request, res: Response) => {
  try {
    const id = +param(req, "id");
    const { paymentMethod, paymentReference } = req.body;

    const [entry] = await db.select().from(paymentQueue).where(eq(paymentQueue.id, id));
    if (!entry) return res.status(404).json({ error: "Payment queue entry not found" });

    // If Wise transfer requested and vendor has wise recipient ID
    if (paymentMethod === "wise" && entry.vendorId) {
      const [vendor] = await db.select().from(vendors).where(eq(vendors.id, entry.vendorId));
      if (vendor && (vendor as any).wiseRecipientId) {
        const result = await wiseService.createTransfer(
          (vendor as any).wiseRecipientId,
          parseFloat(entry.amount),
          entry.currency || "EUR",
          paymentReference,
        );
        await logAudit((req as any).pmUserId, "wise_transfer", "payment_queue", id, null, result, getClientIp(req));
      }
    }

    const [updated] = await db.update(paymentQueue).set({
      status: "completed",
      paymentMethod: paymentMethod || entry.paymentMethod,
      paymentReference: paymentReference || entry.paymentReference,
      processedAt: new Date(),
    } as any).where(eq(paymentQueue.id, id)).returning();

    // Also update the vendor invoice to paid
    if (entry.vendorInvoiceId) {
      await db.update(vendorInvoices).set({ status: "paid", paymentDate: new Date().toISOString().split("T")[0] } as any).where(eq(vendorInvoices.id, entry.vendorInvoiceId));
    }

    await logAudit((req as any).pmUserId, "process", "payment_queue", id, null, { paymentMethod, paymentReference }, getClientIp(req));
    res.json(updated);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Payment processing failed", e) });
  }
});

router.post("/payment-queue/batch-process", requireAuth, requireFinanceRole, async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      ids: z.array(z.number()),
      paymentMethod: z.string().optional(),
    });
    const body = validate(schema, req.body, res);
    if (!body) return;

    const results: any[] = [];
    for (const id of body.ids) {
      try {
        const [updated] = await db.update(paymentQueue).set({
          status: "completed",
          paymentMethod: body.paymentMethod || "bank_transfer",
          processedAt: new Date(),
        } as any).where(eq(paymentQueue.id, id)).returning();
        if (updated) {
          if (updated.vendorInvoiceId) {
            await db.update(vendorInvoices).set({ status: "paid", paymentDate: new Date().toISOString().split("T")[0] } as any).where(eq(vendorInvoices.id, updated.vendorInvoiceId));
          }
          results.push({ id, status: "completed" });
        }
      } catch (err: any) {
        results.push({ id, status: "failed", error: err.message });
      }
    }

    await logAudit((req as any).pmUserId, "batch_process", "payment_queue", 0, null, { ids: body.ids, results }, getClientIp(req));
    res.json({ results });
  } catch (e: any) {
    res.status(500).json({ error: safeError("Batch processing failed", e) });
  }
});

// ============================================
// FAZ 5: ENHANCED P&L
// ============================================

router.get("/financial/pnl/export", requireAuth, requireFinanceRole, async (req: Request, res: Response) => {
  try {
    const entityId = req.query.entityId ? +req.query.entityId : undefined;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;

    let conditions: any[] = [];
    if (entityId) conditions.push(eq(clientInvoices.entityId, entityId));
    if (startDate) conditions.push(gte(clientInvoices.invoiceDate, startDate));
    if (endDate) conditions.push(lte(clientInvoices.invoiceDate, endDate));

    const invoicesData = await db.select().from(clientInvoices).where(conditions.length > 0 ? and(...conditions) : undefined);
    const revenue = invoicesData.reduce((sum, inv) => sum + parseFloat(inv.total || "0"), 0);

    let poConds: any[] = [];
    if (entityId) poConds.push(eq(purchaseOrders.entityId, entityId));
    const posData = await db.select().from(purchaseOrders).where(poConds.length > 0 ? and(...poConds) : undefined);
    const vendorCost = posData.reduce((sum, po) => sum + parseFloat(po.amount || "0"), 0);

    const grossMargin = revenue - vendorCost;
    const marginPct = revenue > 0 ? (grossMargin / revenue) * 100 : 0;

    const rows = [
      { category: "Revenue", amount: revenue.toFixed(2) },
      { category: "Vendor Costs", amount: vendorCost.toFixed(2) },
      { category: "Gross Margin", amount: grossMargin.toFixed(2) },
      { category: "Margin %", amount: marginPct.toFixed(1) + "%" },
    ];

    const headers = ["category", "amount"];
    const csv = [headers.join(","), ...rows.map(r => headers.map(h => `"${String((r as any)[h] || "")}"`).join(","))].join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=pnl-report.csv");
    res.send(csv);
  } catch (e: any) {
    res.status(500).json({ error: safeError("P&L export failed", e) });
  }
});

// ============================================
// FAZ 5: CASH FLOW FORECAST
// ============================================

router.get("/financial/cash-forecast", requireAuth, requireFinanceRole, async (req: Request, res: Response) => {
  try {
    const days = req.query.days ? +req.query.days : 90;
    const entityId = req.query.entityId ? +req.query.entityId : undefined;

    const today = new Date();
    const endDate = new Date(today.getTime() + days * 86400000);

    // Get all unpaid invoices (expected AR inflows)
    let arConds: any[] = [sql`${clientInvoices.status} IN ('sent', 'draft')`];
    if (entityId) arConds.push(eq(clientInvoices.entityId, entityId));
    const unpaidInvoices = await db.select().from(clientInvoices).where(and(...arConds));

    // Get all pending vendor invoices (expected AP outflows)
    let apConds: any[] = [sql`${vendorInvoices.status} IN ('submitted', 'approved')`];
    if (entityId) apConds.push(eq(vendorInvoices.entityId, entityId));
    const pendingVendorInvoices = await db.select().from(vendorInvoices).where(and(...apConds));

    // Get pending payment queue
    const pendingPayments = await db.select().from(paymentQueue).where(eq(paymentQueue.status, "pending"));

    // Build daily forecast
    const forecast: Array<{ date: string; expectedInflow: number; expectedOutflow: number; balance: number }> = [];
    let runningBalance = 0;

    // Aggregate by date
    const inflowsByDate: Record<string, number> = {};
    const outflowsByDate: Record<string, number> = {};

    for (const inv of unpaidInvoices) {
      const dueDate = inv.dueDate || inv.invoiceDate;
      if (dueDate) {
        inflowsByDate[dueDate] = (inflowsByDate[dueDate] || 0) + parseFloat(inv.total || "0");
      }
    }

    for (const vi of pendingVendorInvoices) {
      const dueDate = vi.dueDate || vi.invoiceDate;
      if (dueDate) {
        outflowsByDate[dueDate] = (outflowsByDate[dueDate] || 0) + parseFloat(vi.totalAmount || "0");
      }
    }

    for (const pq of pendingPayments) {
      const schedDate = pq.scheduledDate || new Date().toISOString().split("T")[0];
      outflowsByDate[schedDate] = (outflowsByDate[schedDate] || 0) + parseFloat(pq.amount || "0");
    }

    // Generate daily entries for next N days
    for (let i = 0; i < days; i++) {
      const d = new Date(today.getTime() + i * 86400000);
      const dateStr = d.toISOString().split("T")[0];
      const inflow = inflowsByDate[dateStr] || 0;
      const outflow = outflowsByDate[dateStr] || 0;
      runningBalance += inflow - outflow;
      if (inflow > 0 || outflow > 0 || i === 0 || i === days - 1 || i % 7 === 0) {
        forecast.push({ date: dateStr, expectedInflow: Math.round(inflow * 100) / 100, expectedOutflow: Math.round(outflow * 100) / 100, balance: Math.round(runningBalance * 100) / 100 });
      }
    }

    // Scenario analysis
    const totalAR = unpaidInvoices.reduce((s, i) => s + parseFloat(i.total || "0"), 0);
    const totalAP = pendingVendorInvoices.reduce((s, i) => s + parseFloat(i.totalAmount || "0"), 0) + pendingPayments.reduce((s, p) => s + parseFloat(p.amount || "0"), 0);

    res.json({
      forecast,
      scenarios: {
        best: { label: "Best case (all AR paid on time)", netPosition: Math.round((totalAR - totalAP) * 100) / 100 },
        worst: { label: "Worst case (30% AR late)", netPosition: Math.round((totalAR * 0.7 - totalAP) * 100) / 100 },
        likely: { label: "Likely (85% AR on time)", netPosition: Math.round((totalAR * 0.85 - totalAP) * 100) / 100 },
      },
      summary: { totalExpectedInflow: Math.round(totalAR * 100) / 100, totalExpectedOutflow: Math.round(totalAP * 100) / 100, days },
    });
  } catch (e: any) {
    res.status(500).json({ error: safeError("Cash forecast failed", e) });
  }
});

// ============================================
// FAZ 5: PAYMENT REMINDERS
// ============================================

router.post("/invoices/:id/send-reminder", requireAuth, requireFinanceRole, async (req: Request, res: Response) => {
  try {
    const id = +param(req, "id");
    const [invoice] = await db.select().from(clientInvoices).where(eq(clientInvoices.id, id));
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });

    const [customer] = await db.select().from(customers).where(eq(customers.id, invoice.customerId));
    if (!customer || !customer.email) return res.status(400).json({ error: "Customer has no email" });

    // Determine reminder type based on existing reminders
    const existingReminders = await db.select().from(paymentReminders).where(eq(paymentReminders.invoiceId, id));
    const reminderTypes = ["first", "second", "third", "final"];
    const reminderType = reminderTypes[Math.min(existingReminders.length, reminderTypes.length - 1)];

    const symbol = invoice.currency === "GBP" ? "£" : invoice.currency === "EUR" ? "€" : "$";
    const subject = `Payment Reminder — Invoice ${invoice.invoiceNumber || id}`;
    const body = `<p>Dear ${customer.name},</p>
<p>This is a ${reminderType} reminder that invoice <strong>${invoice.invoiceNumber}</strong> for <strong>${symbol}${Number(invoice.total || 0).toFixed(2)}</strong> was due on <strong>${invoice.dueDate || "N/A"}</strong>.</p>
<p>Please arrange payment at your earliest convenience.</p>
<p>Thank you,<br/>El Turco Translation Services</p>`;

    try {
      await sendEmail([customer.email], subject, body);
    } catch {
      // Email send failure is non-fatal
    }

    const [reminder] = await db.insert(paymentReminders).values({
      invoiceId: id,
      customerId: invoice.customerId,
      reminderType,
      sentBy: (req as any).pmUserId,
      emailSentTo: customer.email,
    }).returning();

    await logAudit((req as any).pmUserId, "send_reminder", "client_invoice", id, null, { reminderType, email: customer.email }, getClientIp(req));
    res.json(reminder);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Send reminder failed", e) });
  }
});

router.get("/invoices/:id/reminders", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = +param(req, "id");
    const reminders = await db.select().from(paymentReminders).where(eq(paymentReminders.invoiceId, id)).orderBy(desc(paymentReminders.sentAt));
    res.json({ reminders });
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to get reminders", e) });
  }
});

router.post("/invoices/auto-reminders", requireAuth, requireFinanceRole, async (req: Request, res: Response) => {
  try {
    // Find overdue invoices
    const today = new Date().toISOString().split("T")[0];
    const overdueInvoices = await db.select().from(clientInvoices).where(
      and(
        sql`${clientInvoices.status} IN ('sent', 'draft')`,
        sql`${clientInvoices.dueDate} < ${today}`,
      )
    );

    const results: any[] = [];
    for (const inv of overdueInvoices) {
      try {
        const [customer] = await db.select().from(customers).where(eq(customers.id, inv.customerId));
        if (!customer?.email) continue;

        const dueDate = new Date(inv.dueDate!);
        const overdueDays = Math.floor((Date.now() - dueDate.getTime()) / 86400000);

        // Check if we should send based on 7/14/30 day schedule
        const existingReminders = await db.select().from(paymentReminders).where(eq(paymentReminders.invoiceId, inv.id));
        if (existingReminders.length === 0 && overdueDays >= 7) {
          // Send first reminder
        } else if (existingReminders.length === 1 && overdueDays >= 14) {
          // Send second
        } else if (existingReminders.length === 2 && overdueDays >= 30) {
          // Send third
        } else {
          continue; // Not time yet
        }

        const reminderTypes = ["first", "second", "third", "final"];
        const reminderType = reminderTypes[Math.min(existingReminders.length, 3)];

        const symbol = inv.currency === "GBP" ? "£" : inv.currency === "EUR" ? "€" : "$";
        const subject = `Payment Reminder (${reminderType}) — Invoice ${inv.invoiceNumber || inv.id}`;
        const html = `<p>Dear ${customer.name},</p><p>This is a ${reminderType} reminder for invoice <strong>${inv.invoiceNumber}</strong> of <strong>${symbol}${Number(inv.total || 0).toFixed(2)}</strong> (due: ${inv.dueDate}). Now ${overdueDays} days overdue.</p><p>Please arrange payment promptly.</p>`;

        try { await sendEmail([customer.email], subject, html); } catch { /* non-fatal */ }

        const [reminder] = await db.insert(paymentReminders).values({
          invoiceId: inv.id,
          customerId: inv.customerId,
          reminderType,
          sentBy: (req as any).pmUserId,
          emailSentTo: customer.email,
        }).returning();

        results.push({ invoiceId: inv.id, reminderType, sent: true });
      } catch {
        results.push({ invoiceId: inv.id, sent: false });
      }
    }

    await logAudit((req as any).pmUserId, "auto_reminders", "client_invoice", 0, null, { count: results.filter(r => r.sent).length }, getClientIp(req));
    res.json({ processed: results.length, sent: results.filter(r => r.sent).length, results });
  } catch (e: any) {
    res.status(500).json({ error: safeError("Auto-reminders failed", e) });
  }
});

// ============================================
// FAZ 5: TAX CODE MANAGEMENT
// ============================================

router.get("/tax-codes", requireAuth, async (_req: Request, res: Response) => {
  try {
    const codes = await db.select().from(taxCodes).orderBy(asc(taxCodes.code));
    res.json({ taxCodes: codes });
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to list tax codes", e) });
  }
});

router.post("/tax-codes", requireAuth, requireFinanceRole, async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      code: z.string().min(1).max(50),
      name: z.string().min(1).max(200),
      rate: z.any(),
      country: z.string().max(3).optional(),
      description: z.string().optional(),
      entityId: z.number().optional(),
    });
    const body = validate(schema, req.body, res);
    if (!body) return;
    const [created] = await db.insert(taxCodes).values({ ...body, rate: String(body.rate) } as any).returning();
    await logAudit((req as any).pmUserId, "create", "tax_code", created.id, null, created, getClientIp(req));
    res.json(created);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to create tax code", e) });
  }
});

router.patch("/tax-codes/:id", requireAuth, requireFinanceRole, async (req: Request, res: Response) => {
  try {
    const id = +param(req, "id");
    const updates: any = { ...req.body };
    if (updates.rate !== undefined) updates.rate = String(updates.rate);
    const [updated] = await db.update(taxCodes).set(updates).where(eq(taxCodes.id, id)).returning();
    if (!updated) return res.status(404).json({ error: "Tax code not found" });
    await logAudit((req as any).pmUserId, "update", "tax_code", id, null, updates, getClientIp(req));
    res.json(updated);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to update tax code", e) });
  }
});

router.delete("/tax-codes/:id", requireAuth, requireFinanceRole, async (req: Request, res: Response) => {
  try {
    const id = +param(req, "id");
    await db.delete(taxCodes).where(eq(taxCodes.id, id));
    await logAudit((req as any).pmUserId, "delete", "tax_code", id, null, null, getClientIp(req));
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: safeError("Failed to delete tax code", e) });
  }
});

// ============================================
// FAZ 5: QBO SYNC STATUS
// ============================================

router.post("/invoices/:id/qbo-sync", requireAuth, requireFinanceRole, async (req: Request, res: Response) => {
  try {
    const id = +param(req, "id");
    const [invoice] = await db.select().from(clientInvoices).where(eq(clientInvoices.id, id));
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });

    const result = await qboService.syncInvoice(id, invoice);
    if (result.synced) {
      await db.update(clientInvoices).set({
        qboInvoiceId: result.qboInvoiceId,
        qboSyncStatus: "synced",
        qboLastSynced: new Date(),
      }).where(eq(clientInvoices.id, id));
    }
    await logAudit((req as any).pmUserId, "qbo_sync", "client_invoice", id, null, result, getClientIp(req));
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: safeError("QBO sync failed", e) });
  }
});

// ============================================
// FAZ 5: ENHANCED DASHBOARD KPIs
// ============================================

router.get("/dashboard/finance-kpis", requireAuth, async (_req: Request, res: Response) => {
  try {
    // Overdue invoices
    const today = new Date().toISOString().split("T")[0];
    const overdueInvoices = await db.select().from(clientInvoices).where(
      and(sql`${clientInvoices.status} IN ('sent', 'draft')`, sql`${clientInvoices.dueDate} < ${today}`)
    );
    const overdueTotal = overdueInvoices.reduce((s, i) => s + parseFloat(i.total || "0"), 0);

    // Payment queue summary
    const pendingQueue = await db.select().from(paymentQueue).where(eq(paymentQueue.status, "pending"));
    const queueTotal = pendingQueue.reduce((s, p) => s + parseFloat(p.amount || "0"), 0);

    // Top 5 customers by revenue (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
    const recentInvoices = await db.select({
      customerId: clientInvoices.customerId,
      total: clientInvoices.total,
    }).from(clientInvoices).where(gte(clientInvoices.invoiceDate, thirtyDaysAgo));

    const customerRevMap: Record<number, number> = {};
    for (const inv of recentInvoices) {
      customerRevMap[inv.customerId] = (customerRevMap[inv.customerId] || 0) + parseFloat(inv.total || "0");
    }
    const topCustomerIds = Object.entries(customerRevMap)
      .sort(([, a], [, b]) => b - a).slice(0, 5);

    const topCustomers: Array<{ id: number; name: string; revenue: number }> = [];
    for (const [cid, rev] of topCustomerIds) {
      const [c] = await db.select().from(customers).where(eq(customers.id, +cid));
      topCustomers.push({ id: +cid, name: c?.name || `Customer #${cid}`, revenue: Math.round(rev * 100) / 100 });
    }

    // Top 5 vendors by cost
    const recentPOs = await db.select({
      vendorId: purchaseOrders.vendorId,
      amount: purchaseOrders.amount,
    }).from(purchaseOrders).where(gte(purchaseOrders.createdAt, new Date(Date.now() - 30 * 86400000)));

    const vendorCostMap: Record<number, number> = {};
    for (const po of recentPOs) {
      vendorCostMap[po.vendorId] = (vendorCostMap[po.vendorId] || 0) + parseFloat(po.amount || "0");
    }
    const topVendorIds = Object.entries(vendorCostMap)
      .sort(([, a], [, b]) => b - a).slice(0, 5);

    const topVendors: Array<{ id: number; name: string; cost: number }> = [];
    for (const [vid, cost] of topVendorIds) {
      const [v] = await db.select().from(vendors).where(eq(vendors.id, +vid));
      topVendors.push({ id: +vid, name: (v as any)?.fullName || `Vendor #${vid}`, cost: Math.round(cost * 100) / 100 });
    }

    res.json({
      overdueInvoices: { count: overdueInvoices.length, total: Math.round(overdueTotal * 100) / 100 },
      paymentQueue: { count: pendingQueue.length, total: Math.round(queueTotal * 100) / 100 },
      topCustomers,
      topVendors,
    });
  } catch (e: any) {
    res.status(500).json({ error: safeError("Finance KPIs failed", e) });
  }
});

// ============================================
// FAZ 5: WISE SERVICE STATUS
// ============================================

router.get("/integrations/wise/status", requireAuth, requireFinanceRole, async (_req: Request, res: Response) => {
  try {
    res.json({ live: wiseService.isLive(), message: wiseService.isLive() ? "Wise API connected" : "Wise running in stub mode — set WISE_API_KEY to enable" });
  } catch (e: any) {
    res.status(500).json({ error: safeError("Wise status check failed", e) });
  }
});

router.get("/integrations/qbo/status", requireAuth, requireFinanceRole, async (_req: Request, res: Response) => {
  try {
    res.json({ live: qboService.isLive(), message: qboService.isLive() ? "QuickBooks Online connected" : "QBO running in stub mode — set QBO_CLIENT_ID and QBO_CLIENT_SECRET to enable" });
  } catch (e: any) {
    res.status(500).json({ error: safeError("QBO status check failed", e) });
  }
});

export default router;
