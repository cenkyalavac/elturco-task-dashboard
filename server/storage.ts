import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, and, desc, or, sql } from "drizzle-orm";
import {
  pmUsers, authTokens, sessions, assignments, offers, sheetConfigs, emailTemplates, sequencePresets,
  type PmUser, type InsertPmUser,
  type Assignment, type InsertAssignment,
  type Offer, type InsertOffer,
  type SheetConfig, type InsertSheetConfig,
  type EmailTemplate, type InsertEmailTemplate,
  type SequencePreset, type InsertSequencePreset,
} from "@shared/schema";

const sqlite = new Database("data.db");
sqlite.pragma("journal_mode = WAL");
export const db = drizzle(sqlite);

export interface IStorage {
  // PM Users
  getPmUserByEmail(email: string): PmUser | undefined;
  createPmUser(data: InsertPmUser): PmUser;
  getAllPmUsers(): PmUser[];

  // Auth
  createAuthToken(token: string, email: string, expiresAt: string, clientBaseUrl?: string): void;
  getAuthToken(token: string): { token: string; email: string; expiresAt: string; used: number; clientBaseUrl: string | null } | undefined;
  markAuthTokenUsed(token: string): void;
  createSession(token: string, pmUserId: number, expiresAt: string): void;
  getSession(token: string): { token: string; pmUserId: number; expiresAt: string } | undefined;
  deleteSession(token: string): void;

  // Assignments
  createAssignment(data: InsertAssignment): Assignment;
  getAssignment(id: number): Assignment | undefined;
  getAssignmentsByStatus(status: string): Assignment[];
  getAllAssignments(): Assignment[];
  updateAssignment(id: number, data: Partial<Assignment>): Assignment | undefined;

  // SheetConfigs
  getAllSheetConfigs(): SheetConfig[];
  upsertSheetConfig(source: string, sheet: string, languagePair: string, sheetDbId?: string, googleSheetUrl?: string, assignedPms?: string): SheetConfig;
  deleteSheetConfig(id: number): void;

  // Offers
  createOffer(data: InsertOffer): Offer;
  getOffer(id: number): Offer | undefined;
  getOfferByToken(token: string): Offer | undefined;
  getOffersByAssignment(assignmentId: number): Offer[];
  updateOffer(id: number, data: Partial<Offer>): Offer | undefined;

  // Email Templates
  getAllEmailTemplates(): EmailTemplate[];
  getEmailTemplate(key: string): EmailTemplate | undefined;
  upsertEmailTemplate(key: string, subject: string, body: string): EmailTemplate;

  // Sequence Presets
  getPresetsByPm(pmEmail: string): SequencePreset[];
  createPreset(data: InsertSequencePreset): SequencePreset;
  deletePreset(id: number): void;
}

export class DatabaseStorage implements IStorage {
  constructor() {
    // Seed default PM user
    // Seed default admin users with passwords
    const seeds = [
      { email: "perplexity@eltur.co", name: "Cenk Yalavaç", password: "elturco2026", role: "admin" },
      { email: "cenk@eltur.co", name: "Cenk Yalavaç", password: "elturco2026", role: "admin" },
    ];
    for (const s of seeds) {
      const existing = db.select().from(pmUsers).where(eq(pmUsers.email, s.email)).get();
      if (!existing) {
        db.insert(pmUsers).values(s).run();
      } else if (!existing.password) {
        db.update(pmUsers).set({ password: s.password }).where(eq(pmUsers.email, s.email)).run();
      }
    }

    // Seed default sheet configs with language pairs and SheetDB IDs
    const defaultConfigs = [
      { source: "Amazon", sheet: "non-AFT", languagePair: "EN>TR", sheetDbId: "mukq6ww3ssuk0", assignedPms: null, googleSheetUrl: null },
      { source: "Amazon", sheet: "TPT", languagePair: "EN>TR", sheetDbId: "mukq6ww3ssuk0", assignedPms: null, googleSheetUrl: null },
      { source: "Amazon", sheet: "AFT", languagePair: "EN>TR", sheetDbId: "mukq6ww3ssuk0", assignedPms: null, googleSheetUrl: null },
      { source: "Amazon", sheet: "Non-EN", languagePair: "Multi", sheetDbId: "mukq6ww3ssuk0", assignedPms: null, googleSheetUrl: null },
      { source: "Amazon", sheet: "DPX", languagePair: "EN>TR", sheetDbId: "mukq6ww3ssuk0", assignedPms: null, googleSheetUrl: null },
      { source: "AppleCare", sheet: "Assignments", languagePair: "EN>TR", sheetDbId: "v6i82rdrqa34n", assignedPms: null, googleSheetUrl: null },
      { source: "AppleCare", sheet: "RU Assignments", languagePair: "EN>RU", sheetDbId: "v6i82rdrqa34n", assignedPms: null, googleSheetUrl: null },
      { source: "AppleCare", sheet: "AR Assignments", languagePair: "EN>AR", sheetDbId: "v6i82rdrqa34n", assignedPms: null, googleSheetUrl: null },
    ];
    for (const c of defaultConfigs) {
      const existing = db.select().from(sheetConfigs)
        .where(and(eq(sheetConfigs.source, c.source), eq(sheetConfigs.sheet, c.sheet))).get();
      if (!existing) {
        db.insert(sheetConfigs).values(c).run();
      } else if (!existing.sheetDbId) {
        db.update(sheetConfigs).set({ sheetDbId: c.sheetDbId }).where(eq(sheetConfigs.id, existing.id)).run();
      }
    }

    // Seed default email templates
    const defaultTemplates = [
      {
        key: "offer_translator",
        subject: "Translation Task — {{account}} — {{projectId}}",
        body: `<p>Hello <strong>{{freelancerName}}</strong>,</p>
<p>We'd like to know if you're available for the following translation task.</p>
<table style="width:100%;border-collapse:collapse;margin:16px 0">
<tr><td style="padding:8px 12px;background:#f8f9fa;font-weight:600;color:#666;border-bottom:1px solid #eee;width:140px">Account</td><td style="padding:8px 12px;background:#f8f9fa;border-bottom:1px solid #eee">{{account}}</td></tr>
<tr><td style="padding:8px 12px;font-weight:600;color:#666;border-bottom:1px solid #eee">Source / Tab</td><td style="padding:8px 12px;border-bottom:1px solid #eee">{{source}} / {{sheet}}</td></tr>
<tr><td style="padding:8px 12px;background:#f8f9fa;font-weight:600;color:#666;border-bottom:1px solid #eee">Project ID</td><td style="padding:8px 12px;background:#f8f9fa;border-bottom:1px solid #eee">{{projectId}}</td></tr>
<tr><td style="padding:8px 12px;font-weight:600;color:#666;border-bottom:1px solid #eee">Deadline</td><td style="padding:8px 12px;color:#e74c3c;font-weight:600;border-bottom:1px solid #eee">{{deadline}}</td></tr>
<tr><td style="padding:8px 12px;background:#f8f9fa;font-weight:600;color:#666;border-bottom:1px solid #eee">Total / WWC</td><td style="padding:8px 12px;background:#f8f9fa;border-bottom:1px solid #eee">{{total}} / {{wwc}}</td></tr>
</table>`,
      },
      {
        key: "offer_reviewer",
        subject: "Review Task — {{account}} — {{projectId}}",
        body: `<p>Hello <strong>{{freelancerName}}</strong>,</p>
<p>We'd like to know if you're available for the following review task.</p>
<table style="width:100%;border-collapse:collapse;margin:16px 0">
<tr><td style="padding:8px 12px;background:#f8f9fa;font-weight:600;color:#666;border-bottom:1px solid #eee;width:140px">Account</td><td style="padding:8px 12px;background:#f8f9fa;border-bottom:1px solid #eee">{{account}}</td></tr>
<tr><td style="padding:8px 12px;font-weight:600;color:#666;border-bottom:1px solid #eee">Source / Tab</td><td style="padding:8px 12px;border-bottom:1px solid #eee">{{source}} / {{sheet}}</td></tr>
<tr><td style="padding:8px 12px;background:#f8f9fa;font-weight:600;color:#666;border-bottom:1px solid #eee">Project ID</td><td style="padding:8px 12px;background:#f8f9fa;border-bottom:1px solid #eee">{{projectId}}</td></tr>
<tr><td style="padding:8px 12px;font-weight:600;color:#666;border-bottom:1px solid #eee">Deadline</td><td style="padding:8px 12px;color:#e74c3c;font-weight:600;border-bottom:1px solid #eee">{{deadline}}</td></tr>
<tr><td style="padding:8px 12px;background:#f8f9fa;font-weight:600;color:#666;border-bottom:1px solid #eee">Total / WWC</td><td style="padding:8px 12px;background:#f8f9fa;border-bottom:1px solid #eee">{{total}} / {{wwc}}</td></tr>
</table>`,
      },
    ];
    const existingTemplates = db.select().from(emailTemplates).all();
    if (existingTemplates.length === 0) {
      for (const t of defaultTemplates) {
        db.insert(emailTemplates).values(t).run();
      }
    }
  }

  // PM Users
  getPmUserByEmail(email: string) {
    return db.select().from(pmUsers).where(eq(pmUsers.email, email)).get();
  }
  createPmUser(data: InsertPmUser) {
    return db.insert(pmUsers).values(data).returning().get();
  }
  getAllPmUsers() {
    return db.select().from(pmUsers).all();
  }

  // Auth
  createAuthToken(token: string, email: string, expiresAt: string, clientBaseUrl?: string) {
    db.insert(authTokens).values({ token, email, expiresAt, used: 0, clientBaseUrl: clientBaseUrl || null }).run();
  }
  getAuthToken(token: string) {
    return db.select().from(authTokens).where(eq(authTokens.token, token)).get();
  }
  markAuthTokenUsed(token: string) {
    db.update(authTokens).set({ used: 1 }).where(eq(authTokens.token, token)).run();
  }
  createSession(token: string, pmUserId: number, expiresAt: string) {
    db.insert(sessions).values({ token, pmUserId, expiresAt }).run();
  }
  getSession(token: string) {
    return db.select().from(sessions).where(eq(sessions.token, token)).get();
  }
  deleteSession(token: string) {
    db.delete(sessions).where(eq(sessions.token, token)).run();
  }

  // Assignments
  createAssignment(data: InsertAssignment) {
    return db.insert(assignments).values(data).returning().get();
  }
  getAssignment(id: number) {
    return db.select().from(assignments).where(eq(assignments.id, id)).get();
  }
  getAssignmentsByStatus(status: string) {
    return db.select().from(assignments).where(eq(assignments.status, status)).orderBy(desc(assignments.id)).all();
  }
  getAllAssignments() {
    return db.select().from(assignments).orderBy(desc(assignments.id)).all();
  }
  updateAssignment(id: number, data: Partial<Assignment>) {
    db.update(assignments).set(data).where(eq(assignments.id, id)).run();
    return db.select().from(assignments).where(eq(assignments.id, id)).get();
  }

  // SheetConfigs
  getAllSheetConfigs() {
    return db.select().from(sheetConfigs).all();
  }
  upsertSheetConfig(source: string, sheet: string, languagePair: string, sheetDbId?: string, googleSheetUrl?: string, assignedPms?: string) {
    const existing = db.select().from(sheetConfigs)
      .where(and(eq(sheetConfigs.source, source), eq(sheetConfigs.sheet, sheet))).get();
    const data: any = { languagePair };
    if (sheetDbId !== undefined) data.sheetDbId = sheetDbId;
    if (googleSheetUrl !== undefined) data.googleSheetUrl = googleSheetUrl;
    if (assignedPms !== undefined) data.assignedPms = assignedPms;
    if (existing) {
      db.update(sheetConfigs).set(data).where(eq(sheetConfigs.id, existing.id)).run();
      return db.select().from(sheetConfigs).where(eq(sheetConfigs.id, existing.id)).get()!;
    }
    return db.insert(sheetConfigs).values({ source, sheet, ...data }).returning().get();
  }
  deleteSheetConfig(id: number) {
    db.delete(sheetConfigs).where(eq(sheetConfigs.id, id)).run();
  }

  // Offers
  createOffer(data: InsertOffer) {
    return db.insert(offers).values(data).returning().get();
  }
  getOffer(id: number) {
    return db.select().from(offers).where(eq(offers.id, id)).get();
  }
  getOfferByToken(token: string) {
    return db.select().from(offers).where(eq(offers.token, token)).get();
  }
  getOffersByAssignment(assignmentId: number) {
    return db.select().from(offers).where(eq(offers.assignmentId, assignmentId)).all();
  }
  updateOffer(id: number, data: Partial<Offer>) {
    db.update(offers).set(data).where(eq(offers.id, id)).run();
    return db.select().from(offers).where(eq(offers.id, id)).get();
  }

  // Email Templates
  getAllEmailTemplates() {
    return db.select().from(emailTemplates).all();
  }
  getEmailTemplate(key: string) {
    return db.select().from(emailTemplates).where(eq(emailTemplates.key, key)).get();
  }
  upsertEmailTemplate(key: string, subject: string, body: string) {
    const existing = db.select().from(emailTemplates).where(eq(emailTemplates.key, key)).get();
    if (existing) {
      db.update(emailTemplates).set({ subject, body }).where(eq(emailTemplates.id, existing.id)).run();
      return db.select().from(emailTemplates).where(eq(emailTemplates.id, existing.id)).get()!;
    }
    return db.insert(emailTemplates).values({ key, subject, body }).returning().get();
  }

  // Sequence Presets
  getPresetsByPm(pmEmail: string) {
    return db.select().from(sequencePresets).where(eq(sequencePresets.pmEmail, pmEmail)).all();
  }
  createPreset(data: InsertSequencePreset) {
    return db.insert(sequencePresets).values(data).returning().get();
  }
  deletePreset(id: number) {
    db.delete(sequencePresets).where(eq(sequencePresets.id, id)).run();
  }
}

export const storage = new DatabaseStorage();
