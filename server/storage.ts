import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, and, desc, or, sql } from "drizzle-orm";
import {
  pmUsers, authTokens, sessions, assignments, offers, sheetConfigs, emailTemplates, sequencePresets, autoAssignRules, notifications, freelancerSessions,
  type PmUser, type InsertPmUser,
  type Assignment, type InsertAssignment,
  type Offer, type InsertOffer,
  type SheetConfig, type InsertSheetConfig,
  type EmailTemplate, type InsertEmailTemplate,
  type SequencePreset, type InsertSequencePreset,
  type AutoAssignRule, type InsertAutoAssignRule,
  type Notification, type InsertNotification,
  type FreelancerSession,
} from "@shared/schema";

const DB_PATH = process.env.DB_PATH || "data.db";
const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");

// Auto-create tables if they don't exist (for fresh deployments)
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS pm_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    initial TEXT DEFAULT '',
    password TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT 'pm',
    default_filter TEXT DEFAULT 'ongoing',
    default_my_projects INTEGER DEFAULT 0,
    default_source TEXT DEFAULT 'all',
    default_account TEXT DEFAULT 'all'
  );
  CREATE TABLE IF NOT EXISTS auth_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    client_base_url TEXT
  );
  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT NOT NULL UNIQUE,
    pm_user_id INTEGER NOT NULL,
    expires_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL, sheet TEXT NOT NULL, project_id TEXT NOT NULL, account TEXT NOT NULL,
    task_details TEXT NOT NULL, assignment_type TEXT NOT NULL, role TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    assigned_by INTEGER NOT NULL, accepted_by TEXT, accepted_by_name TEXT, accepted_by_email TEXT,
    sequence_list TEXT, current_sequence_index INTEGER DEFAULT 0, sequence_timeout_minutes INTEGER DEFAULT 60,
    broadcast_list TEXT, auto_assign_reviewer INTEGER DEFAULT 0,
    reviewer_assignment_type TEXT, reviewer_sequence_list TEXT, review_type TEXT,
    created_at TEXT NOT NULL, offered_at TEXT, accepted_at TEXT, completed_at TEXT,
    linked_reviewer_assignment_id INTEGER
  );
  CREATE TABLE IF NOT EXISTS offers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    assignment_id INTEGER NOT NULL, freelancer_code TEXT NOT NULL,
    freelancer_name TEXT NOT NULL, freelancer_email TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'pending',
    sent_at TEXT NOT NULL, responded_at TEXT, sequence_order INTEGER,
    client_base_url TEXT
  );
  CREATE TABLE IF NOT EXISTS email_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL UNIQUE, subject TEXT NOT NULL, body TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sequence_presets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL, pm_email TEXT NOT NULL, role TEXT NOT NULL,
    freelancer_codes TEXT NOT NULL, assignment_type TEXT NOT NULL DEFAULT 'sequence'
  );
  CREATE TABLE IF NOT EXISTS auto_assign_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL, source TEXT, account TEXT, language_pair TEXT,
    role TEXT NOT NULL, freelancer_codes TEXT NOT NULL,
    assignment_type TEXT NOT NULL DEFAULT 'sequence',
    max_wwc INTEGER, enabled INTEGER NOT NULL DEFAULT 1, created_by TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sheet_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL, sheet TEXT NOT NULL,
    language_pair TEXT NOT NULL DEFAULT 'EN>TR',
    sheetdb_id TEXT, google_sheet_url TEXT, assigned_pms TEXT
  );
  CREATE TABLE IF NOT EXISTS task_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL, sheet TEXT NOT NULL, project_id TEXT NOT NULL,
    pm_email TEXT NOT NULL, note TEXT NOT NULL,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS pm_favorites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pm_email TEXT NOT NULL, freelancer_code TEXT NOT NULL, created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL, title TEXT NOT NULL, message TEXT NOT NULL,
    metadata TEXT, read INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS freelancer_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT NOT NULL UNIQUE, freelancer_code TEXT NOT NULL,
    freelancer_name TEXT NOT NULL, freelancer_email TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
`);

// Migrate existing DB: add new columns if missing
try { sqlite.exec(`ALTER TABLE pm_users ADD COLUMN default_source TEXT DEFAULT 'all'`); } catch {}
try { sqlite.exec(`ALTER TABLE pm_users ADD COLUMN default_account TEXT DEFAULT 'all'`); } catch {}
try { sqlite.exec(`ALTER TABLE sheet_configs ADD COLUMN google_sheet_id TEXT`); } catch {}
try { sqlite.exec(`ALTER TABLE sheet_configs ADD COLUMN worksheet_id INTEGER`); } catch {}
// Fix Inditex config: was EN>TR, should be ES>TR
try { sqlite.exec(`UPDATE sheet_configs SET language_pair = 'ES>TR' WHERE source = 'Inditex' AND language_pair = 'EN>TR'`); } catch {}

// Google Sheet ID mapping — used by seed data and migration
const gsMapping: Record<string, { gsId: string; tabs: Record<string, number> }> = {
  "Amazon": { gsId: "1Un0dUbaacL7a13zniNtKfJwpFX5FlPYqbCtFmJCICo8", tabs: { "non-AFT": 0, "TPT": 1056910041, "AFT": 1971341819, "Non-EN": 704947960, "DPX": 217988936 } },
  "AppleCare": { gsId: "1Yeh8pYLEmVZOkYdUIDFurEFE-KfL8_8leZZXIm7lz0g", tabs: { "Assignments": 0, "RU Assignments": 393238430, "AR Assignments": 437911328 } },
  "Inditex": { gsId: "1yszjnsHgJdVTVdHpks1G8EYjFQap0_VdTb2zGS_Jv44", tabs: { "Assignments": 0 } },
  "Games": { gsId: "19cGmmmeZt6-hXt-e8dgP3wFdQEJdzPhMFSjaZ4vfavw", tabs: { "GamesTracker": 56737965 } },
  "SONY": { gsId: "1EaEMWv8WFfoRj7qb_zWhTLNVfi6GfktavtgQgA6rmTA", tabs: { "Sheet1": 0 } },
  "Facebook": { gsId: "16amViPdinvXOQKC2BkjZhHYl1aiASYDsfaNExB9JV1Q", tabs: { "JobTracker": 181660365, "CMS": 0, "Offline": 0 } },
  "Arabic": { gsId: "1jEXX9VPCGw-UoXe96j__Hn0DlqQrM75o71cJbxwIXa0", tabs: { "Translation": 745537975 } },
  "TikTok": { gsId: "1oyG0er-3tR1pyB0mTjul8BfZglyaGA6COjyj6-s0nwE", tabs: { "Assignments": 0 } },
  "WhatsApp": { gsId: "19dRyVr0kNbz0nLepsHHP1qP9fmYFEPpXF8p55beLetA", tabs: { "JobTracker": 0 } },
  "L-Google": { gsId: "1PJYeBDpkdeTzLQ1Psp2IqFUlyLqOwkV0VVnmqCWDhmk", tabs: { "JobTracker": 211892049 } },
};

// Helper: look up Google Sheet ID for a source+tab
function getGsId(source: string, tab: string): string | null {
  return gsMapping[source]?.gsId || null;
}
function getWsId(source: string, tab: string): number | null {
  return gsMapping[source]?.tabs?.[tab] ?? null;
}

export const db = drizzle(sqlite);

export interface IStorage {
  // PM Users
  getPmUserByEmail(email: string): PmUser | undefined;
  createPmUser(data: InsertPmUser): PmUser;
  getAllPmUsers(): PmUser[];
  updatePmUser(id: number, data: Partial<PmUser>): void;

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

  // Auto-assign Rules
  getAllAutoAssignRules(): AutoAssignRule[];
  createAutoAssignRule(data: InsertAutoAssignRule): AutoAssignRule;
  updateAutoAssignRule(id: number, data: Partial<AutoAssignRule>): void;
  deleteAutoAssignRule(id: number): void;

  // Notifications
  createNotification(data: InsertNotification): Notification;
  getRecentNotifications(limit?: number): Notification[];
  markNotificationRead(id: number): void;
  markAllNotificationsRead(): void;
  getUnreadCount(): number;

  // Freelancer Sessions
  createFreelancerSession(data: { token: string; freelancerCode: string; freelancerName: string; freelancerEmail: string; expiresAt: string }): void;
  getFreelancerSession(token: string): FreelancerSession | undefined;
  deleteFreelancerSession(token: string): void;
}

export class DatabaseStorage implements IStorage {
  constructor() {
    // Seed default PM user
    // Seed default admin users with passwords
    const seeds = [
      { email: "perplexity@eltur.co", name: "Cenk Yalavaç", initial: "CY", password: "elturco2026", role: "admin" },
      { email: "cenk@eltur.co", name: "Cenk Yalavaç", initial: "CY", password: "elturco2026", role: "admin" },
    ];
    for (const s of seeds) {
      const existing = db.select().from(pmUsers).where(eq(pmUsers.email, s.email)).get();
      if (!existing) {
        db.insert(pmUsers).values(s).run();
      } else {
        // Update password and initial if missing
        const updates: any = {};
        if (!existing.password) updates.password = s.password;
        if (!existing.initial && s.initial) updates.initial = s.initial;
        if (Object.keys(updates).length > 0) {
          db.update(pmUsers).set(updates).where(eq(pmUsers.email, s.email)).run();
        }
      }
    }

    // Seed default sheet configs with language pairs, SheetDB IDs, and Google Sheet IDs
    const defaultConfigs = [
      { source: "Amazon", sheet: "non-AFT", languagePair: "EN>TR", sheetDbId: "mukq6ww3ssuk0", assignedPms: null, googleSheetUrl: null, googleSheetId: getGsId("Amazon", "non-AFT"), worksheetId: getWsId("Amazon", "non-AFT") },
      { source: "Amazon", sheet: "TPT", languagePair: "EN>TR", sheetDbId: "mukq6ww3ssuk0", assignedPms: null, googleSheetUrl: null, googleSheetId: getGsId("Amazon", "TPT"), worksheetId: getWsId("Amazon", "TPT") },
      { source: "Amazon", sheet: "AFT", languagePair: "EN>TR", sheetDbId: "mukq6ww3ssuk0", assignedPms: null, googleSheetUrl: null, googleSheetId: getGsId("Amazon", "AFT"), worksheetId: getWsId("Amazon", "AFT") },
      { source: "Amazon", sheet: "Non-EN", languagePair: "Multi", sheetDbId: "mukq6ww3ssuk0", assignedPms: null, googleSheetUrl: null, googleSheetId: getGsId("Amazon", "Non-EN"), worksheetId: getWsId("Amazon", "Non-EN") },
      { source: "Amazon", sheet: "DPX", languagePair: "EN>TR", sheetDbId: "mukq6ww3ssuk0", assignedPms: null, googleSheetUrl: null, googleSheetId: getGsId("Amazon", "DPX"), worksheetId: getWsId("Amazon", "DPX") },
      { source: "AppleCare", sheet: "Assignments", languagePair: "EN>TR", sheetDbId: "v6i82rdrqa34n", assignedPms: null, googleSheetUrl: null, googleSheetId: getGsId("AppleCare", "Assignments"), worksheetId: getWsId("AppleCare", "Assignments") },
      { source: "AppleCare", sheet: "RU Assignments", languagePair: "EN>RU", sheetDbId: "v6i82rdrqa34n", assignedPms: null, googleSheetUrl: null, googleSheetId: getGsId("AppleCare", "RU Assignments"), worksheetId: getWsId("AppleCare", "RU Assignments") },
      { source: "AppleCare", sheet: "AR Assignments", languagePair: "EN>AR", sheetDbId: "v6i82rdrqa34n", assignedPms: null, googleSheetUrl: null, googleSheetId: getGsId("AppleCare", "AR Assignments"), worksheetId: getWsId("AppleCare", "AR Assignments") },
      { source: "Inditex", sheet: "Assignments", languagePair: "ES>TR", sheetDbId: "ayv4m7o5lbe1r", assignedPms: null, googleSheetUrl: null, googleSheetId: getGsId("Inditex", "Assignments"), worksheetId: getWsId("Inditex", "Assignments") },
      { source: "Games", sheet: "GamesTracker", languagePair: "EN>TR", sheetDbId: "qyg6b74ds65hd", assignedPms: null, googleSheetUrl: null, googleSheetId: getGsId("Games", "GamesTracker"), worksheetId: getWsId("Games", "GamesTracker") },
      { source: "SONY", sheet: "Sheet1", languagePair: "EN>TR", sheetDbId: "puf2i6du3igu9", assignedPms: null, googleSheetUrl: null, googleSheetId: getGsId("SONY", "Sheet1"), worksheetId: getWsId("SONY", "Sheet1") },
      { source: "Facebook", sheet: "JobTracker", languagePair: "EN>TR", sheetDbId: "t3acsw7tx8tan", assignedPms: null, googleSheetUrl: null, googleSheetId: getGsId("Facebook", "JobTracker"), worksheetId: getWsId("Facebook", "JobTracker") },
      { source: "Facebook", sheet: "CMS", languagePair: "EN>TR", sheetDbId: "t3acsw7tx8tan", assignedPms: null, googleSheetUrl: null, googleSheetId: getGsId("Facebook", "CMS"), worksheetId: getWsId("Facebook", "CMS") },
      { source: "Facebook", sheet: "Offline", languagePair: "EN>TR", sheetDbId: "t3acsw7tx8tan", assignedPms: null, googleSheetUrl: null, googleSheetId: getGsId("Facebook", "Offline"), worksheetId: getWsId("Facebook", "Offline") },
      { source: "Arabic", sheet: "Translation", languagePair: "EN>AR", sheetDbId: "sl3nyrnj8lbsg", assignedPms: null, googleSheetUrl: null, googleSheetId: getGsId("Arabic", "Translation"), worksheetId: getWsId("Arabic", "Translation") },
      { source: "TikTok", sheet: "Assignments", languagePair: "EN>TR", sheetDbId: "37qdu0ciovlrp", assignedPms: null, googleSheetUrl: null, googleSheetId: getGsId("TikTok", "Assignments"), worksheetId: getWsId("TikTok", "Assignments") },
      { source: "WhatsApp", sheet: "JobTracker", languagePair: "EN>TR", sheetDbId: "xb3a5ry6aiks1", assignedPms: null, googleSheetUrl: null, googleSheetId: getGsId("WhatsApp", "JobTracker"), worksheetId: getWsId("WhatsApp", "JobTracker") },
      { source: "L-Google", sheet: "JobTracker", languagePair: "EN>TR", sheetDbId: "nyv5veup2tabu", assignedPms: null, googleSheetUrl: null, googleSheetId: getGsId("L-Google", "JobTracker"), worksheetId: getWsId("L-Google", "JobTracker") },
    ];
    for (const c of defaultConfigs) {
      const existing = db.select().from(sheetConfigs)
        .where(and(eq(sheetConfigs.source, c.source), eq(sheetConfigs.sheet, c.sheet))).get();
      if (!existing) {
        db.insert(sheetConfigs).values(c).run();
      } else {
        // Always update googleSheetId if missing (fixes existing DBs from before migration)
        const updates: any = {};
        if (!existing.sheetDbId && c.sheetDbId) updates.sheetDbId = c.sheetDbId;
        if (!existing.googleSheetId && c.googleSheetId) updates.googleSheetId = c.googleSheetId;
        if (existing.worksheetId == null && c.worksheetId != null) updates.worksheetId = c.worksheetId;
        if (Object.keys(updates).length > 0) {
          db.update(sheetConfigs).set(updates).where(eq(sheetConfigs.id, existing.id)).run();
        }
      }
    }

    // Seed default email templates (upsert — always ensure they exist)
    const defaultTemplates = [
      {
        key: "offer_translator",
        subject: "Translation Task — {{account}} — {{projectId}}",
        body: `<p>Hello <strong>{{freelancerName}}</strong>,</p>
<p>We'd like to know if you're available for the following translation task.</p>
<table style="width:100%;border-collapse:collapse;margin:16px 0;border:1px solid #eee">
<tr><td style="padding:10px 14px;background:#f8f9fa;font-weight:600;color:#555;border-bottom:1px solid #eee;width:140px">Account</td><td style="padding:10px 14px;background:#f8f9fa;border-bottom:1px solid #eee">{{account}}</td></tr>
<tr><td style="padding:10px 14px;font-weight:600;color:#555;border-bottom:1px solid #eee">Project</td><td style="padding:10px 14px;border-bottom:1px solid #eee">{{projectTitle}}</td></tr>
<tr><td style="padding:10px 14px;background:#f8f9fa;font-weight:600;color:#555;border-bottom:1px solid #eee">Project ID</td><td style="padding:10px 14px;background:#f8f9fa;border-bottom:1px solid #eee">{{projectId}}</td></tr>
<tr><td style="padding:10px 14px;font-weight:600;color:#555;border-bottom:1px solid #eee">TR Deadline</td><td style="padding:10px 14px;color:#e74c3c;font-weight:700;border-bottom:1px solid #eee">{{deadline}}</td></tr>
<tr><td style="padding:10px 14px;background:#f8f9fa;font-weight:600;color:#555;border-bottom:1px solid #eee">Total / WWC</td><td style="padding:10px 14px;background:#f8f9fa;border-bottom:1px solid #eee">{{total}} / {{wwc}}</td></tr>
<tr><td style="padding:10px 14px;font-weight:600;color:#555;border-bottom:1px solid #eee">ICE/CM</td><td style="padding:10px 14px;border-bottom:1px solid #eee">{{ice}}</td></tr>
<tr><td style="padding:10px 14px;background:#f8f9fa;font-weight:600;color:#555;border-bottom:1px solid #eee">Repetitions</td><td style="padding:10px 14px;background:#f8f9fa;border-bottom:1px solid #eee">{{rep}}</td></tr>
<tr><td style="padding:10px 14px;font-weight:600;color:#555;border-bottom:1px solid #eee">100%</td><td style="padding:10px 14px;border-bottom:1px solid #eee">{{match100}}</td></tr>
<tr><td style="padding:10px 14px;background:#f8f9fa;font-weight:600;color:#555;border-bottom:1px solid #eee">95-99%</td><td style="padding:10px 14px;background:#f8f9fa;border-bottom:1px solid #eee">{{fuzzy95}}</td></tr>
<tr><td style="padding:10px 14px;font-weight:600;color:#555;border-bottom:1px solid #eee">85-94%</td><td style="padding:10px 14px;border-bottom:1px solid #eee">{{fuzzy85}}</td></tr>
<tr><td style="padding:10px 14px;background:#f8f9fa;font-weight:600;color:#555;border-bottom:1px solid #eee">75-84%</td><td style="padding:10px 14px;background:#f8f9fa;border-bottom:1px solid #eee">{{fuzzy75}}</td></tr>
<tr><td style="padding:10px 14px;font-weight:600;color:#555;border-bottom:1px solid #eee">No Match</td><td style="padding:10px 14px;border-bottom:1px solid #eee">{{noMatch}}</td></tr>
<tr><td style="padding:10px 14px;background:#f8f9fa;font-weight:600;color:#555;border-bottom:1px solid #eee">MT</td><td style="padding:10px 14px;background:#f8f9fa;border-bottom:1px solid #eee">{{mt}}</td></tr>
</table>`,
      },
      {
        key: "offer_reviewer",
        subject: "Review Task — {{account}} — {{projectId}}",
        body: `<p>Hello <strong>{{freelancerName}}</strong>,</p>
<p>We'd like to know if you're available for the following review task.</p>
<table style="width:100%;border-collapse:collapse;margin:16px 0;border:1px solid #eee">
<tr><td style="padding:10px 14px;background:#f8f9fa;font-weight:600;color:#555;border-bottom:1px solid #eee;width:140px">Account</td><td style="padding:10px 14px;background:#f8f9fa;border-bottom:1px solid #eee">{{account}}</td></tr>
<tr><td style="padding:10px 14px;font-weight:600;color:#555;border-bottom:1px solid #eee">Project</td><td style="padding:10px 14px;border-bottom:1px solid #eee">{{projectTitle}}</td></tr>
<tr><td style="padding:10px 14px;background:#f8f9fa;font-weight:600;color:#555;border-bottom:1px solid #eee">Project ID</td><td style="padding:10px 14px;background:#f8f9fa;border-bottom:1px solid #eee">{{projectId}}</td></tr>
<tr><td style="padding:10px 14px;font-weight:600;color:#555;border-bottom:1px solid #eee">Review Deadline</td><td style="padding:10px 14px;color:#e74c3c;font-weight:700;border-bottom:1px solid #eee">{{deadline}}</td></tr>
<tr><td style="padding:10px 14px;background:#f8f9fa;font-weight:600;color:#555;border-bottom:1px solid #eee">Total WC</td><td style="padding:10px 14px;background:#f8f9fa;border-bottom:1px solid #eee">{{total}}</td></tr>
<tr><td style="padding:10px 14px;font-weight:600;color:#555;border-bottom:1px solid #eee">Review Type</td><td style="padding:10px 14px;border-bottom:1px solid #eee">{{revType}}</td></tr>
</table>`,
      },
    ];
    for (const t of defaultTemplates) {
      const existing = db.select().from(emailTemplates).where(eq(emailTemplates.key, t.key)).get();
      if (!existing) {
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
  updatePmUser(id: number, data: Partial<PmUser>) {
    db.update(pmUsers).set(data).where(eq(pmUsers.id, id)).run();
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

  // Auto-assign Rules
  getAllAutoAssignRules() {
    return db.select().from(autoAssignRules).all();
  }
  createAutoAssignRule(data: InsertAutoAssignRule) {
    return db.insert(autoAssignRules).values(data).returning().get();
  }
  updateAutoAssignRule(id: number, data: Partial<AutoAssignRule>) {
    db.update(autoAssignRules).set(data).where(eq(autoAssignRules.id, id)).run();
  }
  deleteAutoAssignRule(id: number) {
    db.delete(autoAssignRules).where(eq(autoAssignRules.id, id)).run();
  }

  // Notifications
  createNotification(data: InsertNotification) {
    return db.insert(notifications).values(data).returning().get();
  }
  getRecentNotifications(limit = 50) {
    return db.select().from(notifications).orderBy(desc(notifications.id)).limit(limit).all();
  }
  markNotificationRead(id: number) {
    db.update(notifications).set({ read: 1 }).where(eq(notifications.id, id)).run();
  }
  markAllNotificationsRead() {
    db.update(notifications).set({ read: 1 }).where(eq(notifications.read, 0)).run();
  }
  getUnreadCount() {
    const result = db.select({ count: sql<number>`count(*)` }).from(notifications).where(eq(notifications.read, 0)).get();
    return result?.count || 0;
  }

  // Freelancer Sessions
  createFreelancerSession(data: { token: string; freelancerCode: string; freelancerName: string; freelancerEmail: string; expiresAt: string }) {
    db.insert(freelancerSessions).values(data).run();
  }
  getFreelancerSession(token: string) {
    return db.select().from(freelancerSessions).where(eq(freelancerSessions.token, token)).get();
  }
  deleteFreelancerSession(token: string) {
    db.delete(freelancerSessions).where(eq(freelancerSessions.token, token)).run();
  }
}

export const storage = new DatabaseStorage();
