/**
 * Client Router — handles customer CRUD, contacts, sub-accounts, PM assignments, and rate cards.
 * Extracted from the monolithic routes.ts.
 *
 * Routes:
 *   GET    /customers
 *   GET    /customers/:id
 *   POST   /customers
 *   PATCH  /customers/:id
 *   GET    /customers/:id/contacts
 *   POST   /customers/:id/contacts
 *   DELETE /customers/:id/contacts/:contactId
 *   GET    /customers/:id/sub-accounts
 *   POST   /customers/:id/sub-accounts
 *   DELETE /customers/:id/sub-accounts/:subId
 *   GET    /customers/:id/pm-assignments
 *   POST   /customers/:id/pm-assignments
 *   DELETE /customers/:id/pm-assignments/:assignId
 *   GET    /customers/:id/rate-card
 *   POST   /customers/:id/rate-card
 *   DELETE /customers/:id/rate-card/:rateId
 */
import { Router, Request, Response } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { requireAuth, validate, param, safeError, logAudit, getClientIp } from "./shared";
import { storage, db } from "../storage";
import { customerRateCards, customerContacts, customerSubAccounts, pmCustomerAssignments } from "@shared/schema";

const router = Router();

// ============================================
// ZOD SCHEMAS
// ============================================
const createCustomerSchema = z.object({
  name: z.string().min(1).max(200),
  code: z.string().max(50).optional(),
  email: z.string().email().max(255).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  currency: z.string().max(3).optional(),
  status: z.string().max(50).optional(),
  clientType: z.string().max(50).optional(),
}).passthrough();

const createCustomerContactSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().max(255).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  role: z.string().max(100).optional().nullable(),
  isPrimary: z.boolean().optional(),
});

const createSubAccountSchema = z.object({
  name: z.string().min(1).max(200),
  code: z.string().max(100).optional().nullable(),
  assignedPmId: z.number().int().positive().optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
});

const createRateCardSchema = z.object({
  rateValue: z.any(),
  sourceLanguage: z.string().max(10).optional().nullable(),
  targetLanguage: z.string().max(10).optional().nullable(),
  serviceType: z.string().max(100).optional().nullable(),
  rateType: z.string().max(50).optional().nullable(),
  currency: z.string().max(3).optional(),
});

// ============================================
// CUSTOMERS CRUD
// ============================================

router.get("/customers", requireAuth, async (req: Request, res: Response) => {
  try {
    const { search, page, limit } = req.query;
    const filters = {
      search: search as string,
      page: page ? +page : 1,
      limit: limit ? +limit : 50,
    };
    const [customerList, total] = await Promise.all([
      storage.getCustomers(filters),
      storage.getCustomerCount(filters),
    ]);
    res.json({ data: customerList, total, page: filters.page, limit: filters.limit });
  } catch (e: any) {
    res.status(500).json({ error: safeError("Internal server error", e) });
  }
});

router.get("/customers/:id", requireAuth, async (req: Request, res: Response) => {
  const customer = await storage.getCustomer(+param(req, "id"));
  if (!customer) return res.status(404).json({ error: "Customer not found" });
  res.json(customer);
});

router.post("/customers", requireAuth, async (req: Request, res: Response) => {
  try {
    const body = validate(createCustomerSchema, req.body, res);
    if (!body) return;
    const customer = await storage.createCustomer(body);
    await logAudit((req as any).pmUserId, "create", "customer", customer.id, null, customer, getClientIp(req));
    res.json(customer);
  } catch (e: any) {
    console.error("Create customer error:", e);
    res.status(500).json({ error: "Failed to create customer" });
  }
});

router.patch("/customers/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = +param(req, "id");
    const oldCustomer = await storage.getCustomer(id);
    const customer = await storage.updateCustomer(id, req.body);
    await logAudit((req as any).pmUserId, "update", "customer", id, oldCustomer, customer, getClientIp(req));
    res.json(customer);
  } catch (e: any) {
    console.error("Update customer error:", e);
    res.status(500).json({ error: "Failed to update customer" });
  }
});

// ============================================
// CUSTOMER CONTACTS
// ============================================

router.get("/customers/:id/contacts", requireAuth, async (req: Request, res: Response) => {
  const contacts = await storage.getCustomerContacts(+param(req, "id"));
  res.json(contacts);
});

router.post("/customers/:id/contacts", requireAuth, async (req: Request, res: Response) => {
  try {
    const body = validate(createCustomerContactSchema, req.body, res);
    if (!body) return;
    const contact = await storage.createCustomerContact({ customerId: +param(req, "id"), ...body });
    res.json(contact);
  } catch (e: any) {
    console.error("Create customer contact error:", e);
    res.status(500).json({ error: "Failed to create customer contact" });
  }
});

router.delete("/customers/:id/contacts/:contactId", requireAuth, async (req: Request, res: Response) => {
  try {
    await storage.deleteCustomerContact(+param(req, "contactId"));
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: safeError("Internal server error", e) });
  }
});

// ============================================
// CUSTOMER SUB-ACCOUNTS
// ============================================

router.get("/customers/:id/sub-accounts", requireAuth, async (req: Request, res: Response) => {
  const subAccounts = await storage.getCustomerSubAccounts(+param(req, "id"));
  res.json(subAccounts);
});

router.post("/customers/:id/sub-accounts", requireAuth, async (req: Request, res: Response) => {
  try {
    const body = validate(createSubAccountSchema, req.body, res);
    if (!body) return;
    const subAccount = await storage.createCustomerSubAccount({ customerId: +param(req, "id"), ...body });
    res.json(subAccount);
  } catch (e: any) {
    console.error("Create sub-account error:", e);
    res.status(500).json({ error: "Failed to create sub-account" });
  }
});

router.delete("/customers/:id/sub-accounts/:subId", requireAuth, async (req: Request, res: Response) => {
  try {
    await storage.deleteCustomerSubAccount(+param(req, "subId"));
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: safeError("Internal server error", e) });
  }
});

// ============================================
// PM ASSIGNMENTS
// ============================================

router.get("/customers/:id/pm-assignments", requireAuth, async (req: Request, res: Response) => {
  const assignments = await storage.getPmCustomerAssignments(undefined, +param(req, "id"));
  res.json(assignments);
});

router.post("/customers/:id/pm-assignments", requireAuth, async (req: Request, res: Response) => {
  try {
    const assignment = await storage.createPmCustomerAssignment({ customerId: +param(req, "id"), ...req.body });
    res.json(assignment);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Internal server error", e) });
  }
});

router.delete("/customers/:id/pm-assignments/:assignId", requireAuth, async (req: Request, res: Response) => {
  try {
    await storage.deletePmCustomerAssignment(+param(req, "assignId"));
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: safeError("Internal server error", e) });
  }
});

// ============================================
// CUSTOMER RATE CARDS
// ============================================

router.get("/customers/:id/rate-card", requireAuth, async (req: Request, res: Response) => {
  try {
    const rows = await db.select().from(customerRateCards).where(eq(customerRateCards.customerId, +param(req, "id")));
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: safeError("Internal server error", e) });
  }
});

router.post("/customers/:id/rate-card", requireAuth, async (req: Request, res: Response) => {
  try {
    const body = validate(createRateCardSchema, req.body, res);
    if (!body) return;
    const [row] = await db.insert(customerRateCards).values({
      customerId: +param(req, "id"),
      sourceLanguage: body.sourceLanguage || null,
      targetLanguage: body.targetLanguage || null,
      serviceType: body.serviceType || null,
      rateType: body.rateType || null,
      rateValue: body.rateValue,
      currency: body.currency || "EUR",
    }).returning();
    res.json(row);
  } catch (e: any) {
    console.error("Create rate card error:", e);
    res.status(500).json({ error: "Failed to create rate card" });
  }
});

router.delete("/customers/:id/rate-card/:rateId", requireAuth, async (req: Request, res: Response) => {
  try {
    await db.delete(customerRateCards).where(eq(customerRateCards.id, +param(req, "rateId")));
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: safeError("Internal server error", e) });
  }
});

export default router;
