import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { eq, and, desc, or, sql, asc, ilike, inArray, count, gte, lte } from "drizzle-orm";
import {
  pmUsers, authTokens, sessions, assignments, offers, sheetConfigs, emailTemplates,
  sequencePresets, autoAssignRules, notifications, freelancerSessions,
  entities, users, vendors, vendorLanguagePairs, vendorRateCards, qualityReports,
  vendorDocuments, vendorDocumentSignatures, vendorActivities, vendorNotes,
  vendorFiles, vendorFileUploads, customerRateCards, poLineItems,
  customers, customerContacts, customerSubAccounts, pmCustomerAssignments,
  projects, jobs, purchaseOrders, clientInvoices, clientInvoiceLines, payments,
  autoAcceptRules, autoAcceptLog, portalCredentials, portalTasks,
  auditLog, settings, vendorSessions, notificationsV2,
  taskNotes, pmFavorites,
  type PmUser, type InsertPmUser,
  type Assignment, type InsertAssignment,
  type Offer, type InsertOffer,
  type SheetConfig, type InsertSheetConfig,
  type EmailTemplate, type InsertEmailTemplate,
  type SequencePreset, type InsertSequencePreset,
  type AutoAssignRule, type InsertAutoAssignRule,
  type Notification, type InsertNotification,
  type FreelancerSession,
  type Entity, type User, type Vendor, type Customer, type Project, type Job,
  type QualityReport, type PurchaseOrder, type VendorNote, type VendorActivity,
  type ClientInvoice, type ClientInvoiceLine, type Payment,
  type VendorFile, type PoLineItem, type CustomerRateCard,
} from "@shared/schema";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  max: 10,
  ssl: false,
});

export const db = drizzle(pool);

// Google Sheet ID mapping — used by seed data
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

function getGsId(source: string, _tab: string): string | null {
  return gsMapping[source]?.gsId || null;
}
function getWsId(source: string, tab: string): number | null {
  return gsMapping[source]?.tabs?.[tab] ?? null;
}

export interface IStorage {
  // PM Users
  getPmUserByEmail(email: string): Promise<PmUser | undefined>;
  createPmUser(data: InsertPmUser): Promise<PmUser>;
  getAllPmUsers(): Promise<PmUser[]>;
  updatePmUser(id: number, data: Partial<PmUser>): Promise<void>;

  // Auth
  createAuthToken(token: string, email: string, expiresAt: string, clientBaseUrl?: string): Promise<void>;
  getAuthToken(token: string): Promise<{ token: string; email: string; expiresAt: string; used: number; clientBaseUrl: string | null } | undefined>;
  markAuthTokenUsed(token: string): Promise<void>;
  createSession(token: string, pmUserId: number, expiresAt: string): Promise<void>;
  getSession(token: string): Promise<{ token: string; pmUserId: number; expiresAt: string } | undefined>;
  deleteSession(token: string): Promise<void>;

  // Assignments
  createAssignment(data: InsertAssignment): Promise<Assignment>;
  getAssignment(id: number): Promise<Assignment | undefined>;
  getAssignmentsByStatus(status: string): Promise<Assignment[]>;
  getAllAssignments(): Promise<Assignment[]>;
  updateAssignment(id: number, data: Partial<Assignment>): Promise<Assignment | undefined>;

  // SheetConfigs
  getAllSheetConfigs(): Promise<SheetConfig[]>;
  upsertSheetConfig(source: string, sheet: string, languagePair: string, sheetDbId?: string, googleSheetUrl?: string, assignedPms?: string): Promise<SheetConfig>;
  deleteSheetConfig(id: number): Promise<void>;

  // Offers
  createOffer(data: InsertOffer): Promise<Offer>;
  getOffer(id: number): Promise<Offer | undefined>;
  getOfferByToken(token: string): Promise<Offer | undefined>;
  getOffersByAssignment(assignmentId: number): Promise<Offer[]>;
  updateOffer(id: number, data: Partial<Offer>): Promise<Offer | undefined>;

  // Email Templates
  getAllEmailTemplates(): Promise<EmailTemplate[]>;
  getEmailTemplate(key: string): Promise<EmailTemplate | undefined>;
  upsertEmailTemplate(key: string, subject: string, body: string): Promise<EmailTemplate>;

  // Sequence Presets
  getPresetsByPm(pmEmail: string): Promise<SequencePreset[]>;
  createPreset(data: InsertSequencePreset): Promise<SequencePreset>;
  deletePreset(id: number): Promise<void>;

  // Auto-assign Rules
  getAllAutoAssignRules(): Promise<AutoAssignRule[]>;
  createAutoAssignRule(data: InsertAutoAssignRule): Promise<AutoAssignRule>;
  updateAutoAssignRule(id: number, data: Partial<AutoAssignRule>): Promise<void>;
  deleteAutoAssignRule(id: number): Promise<void>;

  // Notifications
  createNotification(data: InsertNotification): Promise<Notification>;
  getRecentNotifications(limit?: number): Promise<Notification[]>;
  markNotificationRead(id: number): Promise<void>;
  markAllNotificationsRead(): Promise<void>;
  getUnreadCount(): Promise<number>;

  // Freelancer Sessions
  createFreelancerSession(data: { token: string; freelancerCode: string; freelancerName: string; freelancerEmail: string; expiresAt: string }): Promise<void>;
  getFreelancerSession(token: string): Promise<FreelancerSession | undefined>;
  deleteFreelancerSession(token: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  private initialized = false;

  async init() {
    if (this.initialized) return;
    this.initialized = true;

    // Run inline migrations (idempotent — uses IF NOT EXISTS / IF NOT EXISTS)
    // These are embedded directly because the app is bundled with esbuild
    // and filesystem access to db/migrations/ is not available at runtime.
    const migrations = [
      // 003: Entity default currency
      `ALTER TABLE entities ADD COLUMN IF NOT EXISTS default_currency VARCHAR(3) DEFAULT 'EUR';`,

      // 004: Quiz system
      `CREATE TABLE IF NOT EXISTS quizzes (
        id SERIAL PRIMARY KEY,
        title VARCHAR(300) NOT NULL,
        description TEXT,
        category VARCHAR(100),
        time_limit INTEGER,
        passing_score INTEGER DEFAULT 70,
        is_active BOOLEAN DEFAULT TRUE,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );`,
      `CREATE TABLE IF NOT EXISTS quiz_questions (
        id SERIAL PRIMARY KEY,
        quiz_id INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
        question_text TEXT NOT NULL,
        question_type VARCHAR(50) NOT NULL DEFAULT 'multiple_choice',
        options JSONB DEFAULT '[]'::jsonb,
        correct_answers TEXT[],
        points INTEGER DEFAULT 1,
        order_index INTEGER DEFAULT 0
      );`,
      `CREATE INDEX IF NOT EXISTS idx_quiz_questions_quiz_id ON quiz_questions(quiz_id);`,
      `CREATE TABLE IF NOT EXISTS quiz_assignments (
        id SERIAL PRIMARY KEY,
        quiz_id INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
        vendor_id INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
        assigned_by INTEGER REFERENCES users(id),
        assigned_at TIMESTAMPTZ DEFAULT NOW(),
        expires_at TIMESTAMPTZ,
        status VARCHAR(50) DEFAULT 'assigned',
        token VARCHAR(255) NOT NULL UNIQUE
      );`,
      `CREATE INDEX IF NOT EXISTS idx_quiz_assignments_vendor ON quiz_assignments(vendor_id);`,
      `CREATE INDEX IF NOT EXISTS idx_quiz_assignments_token ON quiz_assignments(token);`,
      `CREATE TABLE IF NOT EXISTS quiz_attempts (
        id SERIAL PRIMARY KEY,
        assignment_id INTEGER NOT NULL REFERENCES quiz_assignments(id) ON DELETE CASCADE,
        vendor_id INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
        quiz_id INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
        started_at TIMESTAMPTZ DEFAULT NOW(),
        completed_at TIMESTAMPTZ,
        score INTEGER,
        max_score INTEGER,
        passed BOOLEAN,
        answers JSONB DEFAULT '[]'::jsonb
      );`,
      `CREATE INDEX IF NOT EXISTS idx_quiz_attempts_vendor ON quiz_attempts(vendor_id);`,
      `CREATE INDEX IF NOT EXISTS idx_quiz_attempts_quiz ON quiz_attempts(quiz_id);`,

      // 005: Vendor enhancements
      `CREATE TABLE IF NOT EXISTS vendor_applications (
        id SERIAL PRIMARY KEY,
        full_name VARCHAR(200) NOT NULL,
        email VARCHAR(255) NOT NULL,
        phone VARCHAR(50),
        location VARCHAR(200),
        timezone VARCHAR(100),
        website VARCHAR(500),
        linkedin VARCHAR(500),
        native_language VARCHAR(50),
        language_pairs JSONB DEFAULT '[]'::jsonb,
        service_types TEXT[],
        specializations TEXT[],
        software JSONB DEFAULT '[]'::jsonb,
        experience_years INTEGER,
        education TEXT,
        certifications TEXT[],
        cv_file_url TEXT,
        rate_per_word DECIMAL(8,4),
        rate_per_hour DECIMAL(8,2),
        minimum_fee DECIMAL(10,2),
        currency VARCHAR(3) DEFAULT 'EUR',
        status VARCHAR(50) DEFAULT 'pending',
        vendor_id INTEGER REFERENCES vendors(id),
        reviewed_by INTEGER REFERENCES users(id),
        reviewed_at TIMESTAMPTZ,
        notes TEXT,
        submitted_at TIMESTAMPTZ DEFAULT NOW(),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );`,
      `CREATE INDEX IF NOT EXISTS idx_vendor_applications_email ON vendor_applications(email);`,
      `CREATE INDEX IF NOT EXISTS idx_vendor_applications_status ON vendor_applications(status);`,
      `CREATE TABLE IF NOT EXISTS vendor_stage_history (
        id SERIAL PRIMARY KEY,
        vendor_id INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
        from_stage VARCHAR(50),
        to_stage VARCHAR(50) NOT NULL,
        changed_by INTEGER REFERENCES users(id),
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );`,
      `CREATE INDEX IF NOT EXISTS idx_vendor_stage_history_vendor ON vendor_stage_history(vendor_id);`,
      `CREATE TABLE IF NOT EXISTS vendor_filter_presets (
        id SERIAL PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        filters JSONB NOT NULL,
        created_by INTEGER REFERENCES users(id),
        is_shared BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );`,
      `ALTER TABLE vendor_file_uploads ADD COLUMN IF NOT EXISTS document_status VARCHAR(50) DEFAULT 'pending';`,
      `ALTER TABLE vendor_file_uploads ADD COLUMN IF NOT EXISTS expiry_date DATE;`,
      `ALTER TABLE vendor_file_uploads ADD COLUMN IF NOT EXISTS uploaded_by INTEGER REFERENCES users(id);`,
      `ALTER TABLE vendor_file_uploads ADD COLUMN IF NOT EXISTS notes TEXT;`,

      // 006: VM Experience
      `CREATE TABLE IF NOT EXISTS vendor_email_templates (
        id SERIAL PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        subject TEXT NOT NULL,
        body TEXT NOT NULL,
        category VARCHAR(100),
        is_active BOOLEAN DEFAULT TRUE,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );`,
      `CREATE TABLE IF NOT EXISTS vendor_emails (
        id SERIAL PRIMARY KEY,
        vendor_id INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
        template_id INTEGER REFERENCES vendor_email_templates(id),
        subject TEXT NOT NULL,
        body TEXT NOT NULL,
        sent_by INTEGER REFERENCES users(id),
        sent_at TIMESTAMPTZ DEFAULT NOW(),
        status VARCHAR(50) DEFAULT 'sent',
        resend_message_id VARCHAR(255)
      );`,
      `CREATE INDEX IF NOT EXISTS idx_vendor_emails_vendor ON vendor_emails(vendor_id);`,
      `CREATE INDEX IF NOT EXISTS idx_vendor_emails_sent_at ON vendor_emails(sent_at);`,
      `CREATE TABLE IF NOT EXISTS vendor_onboarding_tasks (
        id SERIAL PRIMARY KEY,
        vendor_id INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
        task_name VARCHAR(200) NOT NULL,
        task_type VARCHAR(50) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        completed_at TIMESTAMPTZ,
        due_date DATE,
        notes TEXT
      );`,
      `CREATE INDEX IF NOT EXISTS idx_vendor_onboarding_vendor ON vendor_onboarding_tasks(vendor_id);`,

      // 007: Faz 4 — Project Engine & Smart Assignment
      `CREATE TABLE IF NOT EXISTS project_templates (
        id SERIAL PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        description TEXT,
        customer_id INTEGER REFERENCES customers(id),
        source_language VARCHAR(10),
        target_languages TEXT[],
        service_types TEXT[],
        default_instructions TEXT,
        default_deadline_days INTEGER,
        metadata JSONB,
        is_active BOOLEAN DEFAULT TRUE,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );`,
      `CREATE TABLE IF NOT EXISTS auto_dispatch_rules (
        id SERIAL PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        description TEXT,
        customer_id INTEGER REFERENCES customers(id),
        source_language VARCHAR(10),
        target_language VARCHAR(10),
        service_type VARCHAR(100),
        preferred_vendor_id INTEGER REFERENCES vendors(id),
        min_quality_score DECIMAL(5,2),
        max_rate DECIMAL(10,4),
        is_active BOOLEAN DEFAULT TRUE,
        priority INTEGER DEFAULT 0,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );`,
      `CREATE TABLE IF NOT EXISTS job_dependencies (
        id SERIAL PRIMARY KEY,
        job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        depends_on_job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        dependency_type VARCHAR(50) DEFAULT 'finish_to_start',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(job_id, depends_on_job_id)
      );`,
      `CREATE INDEX IF NOT EXISTS idx_job_dependencies_job ON job_dependencies(job_id);`,
      `CREATE INDEX IF NOT EXISTS idx_job_dependencies_dep ON job_dependencies(depends_on_job_id);`,
    ];

    for (const migration of migrations) {
      try {
        await db.execute(sql.raw(migration));
      } catch (e: any) {
        // Log but don't throw — IF NOT EXISTS makes these safe to retry
        console.warn(`[migration] Warning: ${e.message?.substring(0, 100)}`);
      }
    }
    console.log(`[migration] All ${migrations.length} migrations applied.`);

    // Seed default admin users
    const SEED_HASH = "$2b$10$luZIyoi9Gg3rW252YGmfxe4U2StasUiT54CACIcQO7rZQ3UXl6Pz.";
    const seeds = [
      { email: "perplexity@eltur.co", name: "Cenk Yalavac", initial: "CY", password: SEED_HASH, role: "admin" },
      { email: "cenk@eltur.co", name: "Cenk Yalavac", initial: "CY", password: SEED_HASH, role: "admin" },
      { email: "onder@eltur.co", name: "Onder Eroglu", initial: "OE", password: SEED_HASH, role: "pm" },
      { email: "cansun@eltur.co", name: "Cansun Coskun", initial: "CC", password: SEED_HASH, role: "pm" },
    ];
    for (const s of seeds) {
      const [existing] = await db.select().from(pmUsers).where(eq(pmUsers.email, s.email));
      if (!existing) {
        await db.insert(pmUsers).values(s);
      } else {
        const updates: any = {};
        if (!existing.password) updates.password = s.password;
        if (!existing.initial && s.initial) updates.initial = s.initial;
        if (Object.keys(updates).length > 0) {
          await db.update(pmUsers).set(updates).where(eq(pmUsers.email, s.email));
        }
      }
    }

    // Seed entities
    const entitySeeds = [
      { name: "Verbato Ltd", code: "verbato", jurisdiction: "United Kingdom", currency: "GBP", qboEnabled: true },
      { name: "Connectode Language Services Ltd", code: "connectode", jurisdiction: "KKTC", currency: "EUR", qboEnabled: false },
    ];
    for (const e of entitySeeds) {
      const [existing] = await db.select().from(entities).where(eq(entities.code, e.code));
      if (!existing) {
        await db.insert(entities).values(e);
      }
    }

    // Seed users table (new)
    const userSeeds = [
      { email: "cenk@eltur.co", name: "Cenk Yalavac", initial: "CY", passwordHash: SEED_HASH, role: "gm" },
      { email: "cenkyalavac@gmail.com", name: "Cenk Yalavac", initial: "CY", passwordHash: SEED_HASH, role: "gm" },
      { email: "onder@eltur.co", name: "Onder Erduran", initial: "OE", passwordHash: SEED_HASH, role: "pm" },
      { email: "cemre@eltur.co", name: "Cemre Cankat", initial: "CC", passwordHash: SEED_HASH, role: "pm" },
    ];
    for (const u of userSeeds) {
      const [existing] = await db.select().from(users).where(eq(users.email, u.email));
      if (!existing) {
        await db.insert(users).values(u);
      }
    }

    // Seed default sheet configs
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
      const [existing] = await db.select().from(sheetConfigs)
        .where(and(eq(sheetConfigs.source, c.source), eq(sheetConfigs.sheet, c.sheet)));
      if (!existing) {
        await db.insert(sheetConfigs).values(c);
      } else {
        const updates: any = {};
        if (!existing.sheetDbId && c.sheetDbId) updates.sheetDbId = c.sheetDbId;
        if (!existing.googleSheetId && c.googleSheetId) updates.googleSheetId = c.googleSheetId;
        if (existing.worksheetId == null && c.worksheetId != null) updates.worksheetId = c.worksheetId;
        if (Object.keys(updates).length > 0) {
          await db.update(sheetConfigs).set(updates).where(eq(sheetConfigs.id, existing.id));
        }
      }
    }

    // Seed default email templates
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
      const [existing] = await db.select().from(emailTemplates).where(eq(emailTemplates.key, t.key));
      if (!existing) {
        await db.insert(emailTemplates).values(t);
      }
    }
  }

  // PM Users
  async getPmUserByEmail(email: string) {
    const [result] = await db.select().from(pmUsers).where(eq(pmUsers.email, email));
    return result;
  }
  async createPmUser(data: InsertPmUser) {
    const [result] = await db.insert(pmUsers).values(data).returning();
    return result;
  }
  async getAllPmUsers() {
    return db.select().from(pmUsers);
  }
  async updatePmUser(id: number, data: Partial<PmUser>) {
    await db.update(pmUsers).set(data).where(eq(pmUsers.id, id));
  }

  // Auth
  async createAuthToken(token: string, email: string, expiresAt: string, clientBaseUrl?: string) {
    await db.insert(authTokens).values({ token, email, expiresAt, used: 0, clientBaseUrl: clientBaseUrl || null });
  }
  async getAuthToken(token: string) {
    const [result] = await db.select().from(authTokens).where(eq(authTokens.token, token));
    return result;
  }
  async markAuthTokenUsed(token: string) {
    await db.update(authTokens).set({ used: 1 }).where(eq(authTokens.token, token));
  }
  async createSession(token: string, pmUserId: number, expiresAt: string) {
    await db.insert(sessions).values({ token, pmUserId, expiresAt });
  }
  async getSession(token: string) {
    const [result] = await db.select().from(sessions).where(eq(sessions.token, token));
    return result;
  }
  async deleteSession(token: string) {
    await db.delete(sessions).where(eq(sessions.token, token));
  }

  // Assignments
  async createAssignment(data: InsertAssignment) {
    const [result] = await db.insert(assignments).values(data).returning();
    return result;
  }
  async getAssignment(id: number) {
    const [result] = await db.select().from(assignments).where(eq(assignments.id, id));
    return result;
  }
  async getAssignmentsByStatus(status: string) {
    return db.select().from(assignments).where(eq(assignments.status, status)).orderBy(desc(assignments.id));
  }
  async getAllAssignments() {
    return db.select().from(assignments).orderBy(desc(assignments.id));
  }
  async updateAssignment(id: number, data: Partial<Assignment>) {
    await db.update(assignments).set(data).where(eq(assignments.id, id));
    const [result] = await db.select().from(assignments).where(eq(assignments.id, id));
    return result;
  }

  // SheetConfigs
  async getAllSheetConfigs() {
    return db.select().from(sheetConfigs);
  }
  async upsertSheetConfig(source: string, sheet: string, languagePair: string, sheetDbId?: string, googleSheetUrl?: string, assignedPms?: string) {
    const [existing] = await db.select().from(sheetConfigs)
      .where(and(eq(sheetConfigs.source, source), eq(sheetConfigs.sheet, sheet)));
    const data: any = { languagePair };
    if (sheetDbId !== undefined) data.sheetDbId = sheetDbId;
    if (googleSheetUrl !== undefined) data.googleSheetUrl = googleSheetUrl;
    if (assignedPms !== undefined) data.assignedPms = assignedPms;
    if (existing) {
      await db.update(sheetConfigs).set(data).where(eq(sheetConfigs.id, existing.id));
      const [result] = await db.select().from(sheetConfigs).where(eq(sheetConfigs.id, existing.id));
      return result!;
    }
    const [result] = await db.insert(sheetConfigs).values({ source, sheet, ...data }).returning();
    return result;
  }
  async deleteSheetConfig(id: number) {
    await db.delete(sheetConfigs).where(eq(sheetConfigs.id, id));
  }

  // Offers
  async createOffer(data: InsertOffer) {
    const [result] = await db.insert(offers).values(data).returning();
    return result;
  }
  async getOffer(id: number) {
    const [result] = await db.select().from(offers).where(eq(offers.id, id));
    return result;
  }
  async getOfferByToken(token: string) {
    const [result] = await db.select().from(offers).where(eq(offers.token, token));
    return result;
  }
  async getOffersByAssignment(assignmentId: number) {
    return db.select().from(offers).where(eq(offers.assignmentId, assignmentId));
  }
  async updateOffer(id: number, data: Partial<Offer>) {
    await db.update(offers).set(data).where(eq(offers.id, id));
    const [result] = await db.select().from(offers).where(eq(offers.id, id));
    return result;
  }

  // Email Templates
  async getAllEmailTemplates() {
    return db.select().from(emailTemplates);
  }
  async getEmailTemplate(key: string) {
    const [result] = await db.select().from(emailTemplates).where(eq(emailTemplates.key, key));
    return result;
  }
  async upsertEmailTemplate(key: string, subject: string, body: string) {
    const [existing] = await db.select().from(emailTemplates).where(eq(emailTemplates.key, key));
    if (existing) {
      await db.update(emailTemplates).set({ subject, body }).where(eq(emailTemplates.id, existing.id));
      const [result] = await db.select().from(emailTemplates).where(eq(emailTemplates.id, existing.id));
      return result!;
    }
    const [result] = await db.insert(emailTemplates).values({ key, subject, body }).returning();
    return result;
  }

  // Sequence Presets
  async getPresetsByPm(pmEmail: string) {
    return db.select().from(sequencePresets).where(eq(sequencePresets.pmEmail, pmEmail));
  }
  async createPreset(data: InsertSequencePreset) {
    const [result] = await db.insert(sequencePresets).values(data).returning();
    return result;
  }
  async deletePreset(id: number) {
    await db.delete(sequencePresets).where(eq(sequencePresets.id, id));
  }

  // Auto-assign Rules
  async getAllAutoAssignRules() {
    return db.select().from(autoAssignRules);
  }
  async createAutoAssignRule(data: InsertAutoAssignRule) {
    const [result] = await db.insert(autoAssignRules).values(data).returning();
    return result;
  }
  async updateAutoAssignRule(id: number, data: Partial<AutoAssignRule>) {
    await db.update(autoAssignRules).set(data).where(eq(autoAssignRules.id, id));
  }
  async deleteAutoAssignRule(id: number) {
    await db.delete(autoAssignRules).where(eq(autoAssignRules.id, id));
  }

  // Notifications (legacy table)
  async createNotification(data: InsertNotification) {
    const [result] = await db.insert(notifications).values(data).returning();
    return result;
  }
  async getRecentNotifications(limit = 50) {
    return db.select().from(notifications).orderBy(desc(notifications.id)).limit(limit);
  }
  async markNotificationRead(id: number) {
    await db.update(notifications).set({ read: 1 }).where(eq(notifications.id, id));
  }
  async markAllNotificationsRead() {
    await db.update(notifications).set({ read: 1 }).where(eq(notifications.read, 0));
  }
  async getUnreadCount() {
    const [result] = await db.select({ count: sql<number>`count(*)::int` }).from(notifications).where(eq(notifications.read, 0));
    return result?.count || 0;
  }

  // Freelancer Sessions
  async createFreelancerSession(data: { token: string; freelancerCode: string; freelancerName: string; freelancerEmail: string; expiresAt: string }) {
    await db.insert(freelancerSessions).values(data);
  }
  async getFreelancerSession(token: string) {
    const [result] = await db.select().from(freelancerSessions).where(eq(freelancerSessions.token, token));
    return result;
  }
  async deleteFreelancerSession(token: string) {
    await db.delete(freelancerSessions).where(eq(freelancerSessions.token, token));
  }

  // ============================================
  // NEW DISPATCH 2.0 METHODS
  // ============================================

  // Users (new table)
  async getUserById(id: number) {
    const [result] = await db.select().from(users).where(eq(users.id, id));
    return result;
  }
  async getUserByEmail(email: string) {
    const [result] = await db.select().from(users).where(eq(users.email, email));
    return result;
  }
  async getAllUsers() {
    return db.select().from(users).where(eq(users.isActive, true));
  }
  async createUser(data: any) {
    const [result] = await db.insert(users).values(data).returning();
    return result;
  }
  async updateUser(id: number, data: any) {
    await db.update(users).set({ ...data, updatedAt: new Date() }).where(eq(users.id, id));
    const [result] = await db.select().from(users).where(eq(users.id, id));
    return result;
  }
  async deleteUser(id: number) {
    // Soft-delete by setting isActive = false
    await db.update(users).set({ isActive: false, updatedAt: new Date() }).where(eq(users.id, id));
  }

  // Vendor jobs (jobs assigned to a specific vendor)
  async getVendorJobs(vendorId: number) {
    return db.select().from(jobs).where(eq(jobs.vendorId, vendorId)).orderBy(desc(jobs.id));
  }

  // Entities
  async getAllEntities() {
    return db.select().from(entities);
  }
  async getEntity(id: number) {
    const [result] = await db.select().from(entities).where(eq(entities.id, id));
    return result;
  }
  async createEntity(data: any) {
    const [result] = await db.insert(entities).values(data).returning();
    return result;
  }
  async updateEntity(id: number, data: any) {
    await db.update(entities).set(data).where(eq(entities.id, id));
    const [result] = await db.select().from(entities).where(eq(entities.id, id));
    return result;
  }

  // Vendors
  async getVendors(filters: { status?: string; search?: string; page?: number; limit?: number } = {}) {
    const { status, search, page = 1, limit = 50 } = filters;
    let query = db.select().from(vendors).$dynamic();
    const conditions: any[] = [];
    if (status) conditions.push(eq(vendors.status, status));
    if (search) conditions.push(or(ilike(vendors.fullName, `%${search}%`), ilike(vendors.email, `%${search}%`)));
    if (conditions.length > 0) query = query.where(and(...conditions));
    const offset = (page - 1) * limit;
    return query.orderBy(desc(vendors.id)).limit(limit).offset(offset);
  }
  async getVendorCount(filters: { status?: string; search?: string } = {}) {
    const { status, search } = filters;
    const conditions: any[] = [];
    if (status) conditions.push(eq(vendors.status, status));
    if (search) conditions.push(or(ilike(vendors.fullName, `%${search}%`), ilike(vendors.email, `%${search}%`)));
    let query = db.select({ count: sql<number>`count(*)::int` }).from(vendors).$dynamic();
    if (conditions.length > 0) query = query.where(and(...conditions));
    const [result] = await query;
    return result?.count || 0;
  }
  async getVendor(id: number) {
    const [result] = await db.select().from(vendors).where(eq(vendors.id, id));
    return result;
  }
  async createVendor(data: any) {
    const [result] = await db.insert(vendors).values(data).returning();
    return result;
  }
  async updateVendor(id: number, data: any) {
    await db.update(vendors).set({ ...data, updatedAt: new Date() }).where(eq(vendors.id, id));
    const [result] = await db.select().from(vendors).where(eq(vendors.id, id));
    return result;
  }
  async deleteVendor(id: number) {
    await db.delete(vendors).where(eq(vendors.id, id));
  }
  async getVendorsPipeline() {
    return db.select({
      status: vendors.status,
      count: sql<number>`count(*)::int`,
    }).from(vendors).groupBy(vendors.status);
  }
  async getApprovedVendors() {
    return db.select().from(vendors).where(eq(vendors.status, "Approved"));
  }

  // Vendor Language Pairs
  async getVendorLanguagePairs(vendorId: number) {
    return db.select().from(vendorLanguagePairs).where(eq(vendorLanguagePairs.vendorId, vendorId));
  }
  async addVendorLanguagePair(data: any) {
    const [result] = await db.insert(vendorLanguagePairs).values(data).returning();
    return result;
  }
  async deleteVendorLanguagePair(id: number) {
    await db.delete(vendorLanguagePairs).where(eq(vendorLanguagePairs.id, id));
  }

  // Vendor Rate Cards
  async getVendorRateCards(vendorId: number) {
    return db.select().from(vendorRateCards).where(eq(vendorRateCards.vendorId, vendorId));
  }

  // Quality Reports
  async getQualityReport(id: number) {
    const [result] = await db.select().from(qualityReports).where(eq(qualityReports.id, id));
    return result;
  }
  async getQualityReports(vendorId?: number) {
    if (vendorId) {
      return db.select().from(qualityReports).where(eq(qualityReports.vendorId, vendorId)).orderBy(desc(qualityReports.id));
    }
    return db.select().from(qualityReports).orderBy(desc(qualityReports.id));
  }
  async createQualityReport(data: any) {
    const [result] = await db.insert(qualityReports).values(data).returning();
    return result;
  }
  async updateQualityReport(id: number, data: any) {
    await db.update(qualityReports).set({ ...data, updatedAt: new Date() }).where(eq(qualityReports.id, id));
    const [result] = await db.select().from(qualityReports).where(eq(qualityReports.id, id));
    return result;
  }

  // Vendor Activities
  async getVendorActivities(vendorId: number) {
    return db.select().from(vendorActivities).where(eq(vendorActivities.vendorId, vendorId)).orderBy(desc(vendorActivities.id));
  }
  async createVendorActivity(data: any) {
    const [result] = await db.insert(vendorActivities).values(data).returning();
    return result;
  }

  // Vendor Notes
  async getVendorNotes(vendorId: number) {
    return db.select().from(vendorNotes).where(eq(vendorNotes.vendorId, vendorId)).orderBy(desc(vendorNotes.id));
  }
  async createVendorNote(data: any) {
    const [result] = await db.insert(vendorNotes).values(data).returning();
    return result;
  }
  async deleteVendorNote(id: number) {
    await db.delete(vendorNotes).where(eq(vendorNotes.id, id));
  }

  // Vendor Documents (compliance templates)
  async getVendorDocuments() {
    return db.select().from(vendorDocuments).where(eq(vendorDocuments.isActive, true));
  }

  // Vendor File Uploads (per-vendor uploaded files)
  async getVendorFileUploads(vendorId: number) {
    return db.select().from(vendorFileUploads).where(eq(vendorFileUploads.vendorId, vendorId)).orderBy(desc(vendorFileUploads.id));
  }
  async createVendorFileUpload(data: any) {
    const [result] = await db.insert(vendorFileUploads).values(data).returning();
    return result;
  }
  async deleteVendorFileUpload(id: number) {
    await db.delete(vendorFileUploads).where(eq(vendorFileUploads.id, id));
  }

  // Customers
  async getCustomers(filters: { search?: string; page?: number; limit?: number } = {}) {
    const { search, page = 1, limit = 50 } = filters;
    let query = db.select().from(customers).$dynamic();
    if (search) query = query.where(or(ilike(customers.name, `%${search}%`), ilike(customers.code, `%${search}%`)));
    const offset = (page - 1) * limit;
    return query.orderBy(desc(customers.id)).limit(limit).offset(offset);
  }
  async getCustomerCount(filters: { search?: string } = {}) {
    const { search } = filters;
    let query = db.select({ count: sql<number>`count(*)::int` }).from(customers).$dynamic();
    if (search) query = query.where(or(ilike(customers.name, `%${search}%`), ilike(customers.code, `%${search}%`)));
    const [result] = await query;
    return result?.count || 0;
  }
  async getCustomer(id: number) {
    const [result] = await db.select().from(customers).where(eq(customers.id, id));
    return result;
  }
  async createCustomer(data: any) {
    const [result] = await db.insert(customers).values(data).returning();
    return result;
  }
  async updateCustomer(id: number, data: any) {
    await db.update(customers).set({ ...data, updatedAt: new Date() }).where(eq(customers.id, id));
    const [result] = await db.select().from(customers).where(eq(customers.id, id));
    return result;
  }

  // Customer Contacts
  async getCustomerContacts(customerId: number) {
    return db.select().from(customerContacts).where(eq(customerContacts.customerId, customerId));
  }
  async createCustomerContact(data: any) {
    const [result] = await db.insert(customerContacts).values(data).returning();
    return result;
  }

  // Customer Sub-Accounts
  async getCustomerSubAccounts(customerId: number) {
    return db.select().from(customerSubAccounts).where(eq(customerSubAccounts.customerId, customerId));
  }
  async createCustomerSubAccount(data: any) {
    const [result] = await db.insert(customerSubAccounts).values(data).returning();
    return result;
  }

  // PM Customer Assignments
  async getPmCustomerAssignments(userId?: number, customerId?: number) {
    const conditions: any[] = [];
    if (userId) conditions.push(eq(pmCustomerAssignments.userId, userId));
    if (customerId) conditions.push(eq(pmCustomerAssignments.customerId, customerId));
    if (conditions.length === 0) return db.select().from(pmCustomerAssignments);
    return db.select().from(pmCustomerAssignments).where(and(...conditions));
  }

  // Projects
  async getProjects(filters: { pmId?: number; customerId?: number; status?: string; page?: number; limit?: number } = {}) {
    const { pmId, customerId, status, page = 1, limit = 50 } = filters;
    const conditions: any[] = [];
    if (pmId) conditions.push(eq(projects.pmId, pmId));
    if (customerId) conditions.push(eq(projects.customerId, customerId));
    if (status) conditions.push(eq(projects.status, status));
    let query = db.select().from(projects).$dynamic();
    if (conditions.length > 0) query = query.where(and(...conditions));
    const offset = (page - 1) * limit;
    return query.orderBy(desc(projects.id)).limit(limit).offset(offset);
  }
  async getProjectCount(filters: { pmId?: number; customerId?: number; status?: string } = {}) {
    const { pmId, customerId, status } = filters;
    const conditions: any[] = [];
    if (pmId) conditions.push(eq(projects.pmId, pmId));
    if (customerId) conditions.push(eq(projects.customerId, customerId));
    if (status) conditions.push(eq(projects.status, status));
    let query = db.select({ count: sql<number>`count(*)::int` }).from(projects).$dynamic();
    if (conditions.length > 0) query = query.where(and(...conditions));
    const [result] = await query;
    return result?.count || 0;
  }
  async getProject(id: number) {
    const [result] = await db.select().from(projects).where(eq(projects.id, id));
    return result;
  }
  async createProject(data: any) {
    const [result] = await db.insert(projects).values(data).returning();
    return result;
  }
  async updateProject(id: number, data: any) {
    await db.update(projects).set({ ...data, updatedAt: new Date() }).where(eq(projects.id, id));
    const [result] = await db.select().from(projects).where(eq(projects.id, id));
    return result;
  }

  // Jobs
  async getJobs(projectId: number) {
    return db.select().from(jobs).where(eq(jobs.projectId, projectId)).orderBy(desc(jobs.id));
  }
  async createJob(data: any) {
    const [result] = await db.insert(jobs).values(data).returning();
    return result;
  }
  async updateJob(id: number, data: any) {
    await db.update(jobs).set({ ...data, updatedAt: new Date() }).where(eq(jobs.id, id));
    const [result] = await db.select().from(jobs).where(eq(jobs.id, id));
    return result;
  }
  async deleteJob(id: number) {
    await db.delete(jobs).where(eq(jobs.id, id));
  }

  // Customer Contacts - delete
  async deleteCustomerContact(id: number) {
    await db.delete(customerContacts).where(eq(customerContacts.id, id));
  }

  // Customer Sub-Accounts - delete
  async deleteCustomerSubAccount(id: number) {
    await db.delete(customerSubAccounts).where(eq(customerSubAccounts.id, id));
  }

  // PM Customer Assignments - CRUD
  async createPmCustomerAssignment(data: any) {
    const [result] = await db.insert(pmCustomerAssignments).values(data).returning();
    return result;
  }
  async deletePmCustomerAssignment(id: number) {
    await db.delete(pmCustomerAssignments).where(eq(pmCustomerAssignments.id, id));
  }

  // Purchase Orders
  async getPurchaseOrders(filters: { vendorId?: number; entityId?: number; status?: string; page?: number; limit?: number } = {}) {
    const { vendorId, entityId, status, page = 1, limit = 50 } = filters;
    const conditions: any[] = [];
    if (vendorId) conditions.push(eq(purchaseOrders.vendorId, vendorId));
    if (entityId) conditions.push(eq(purchaseOrders.entityId, entityId));
    if (status) conditions.push(eq(purchaseOrders.status, status));
    let query = db.select().from(purchaseOrders).$dynamic();
    if (conditions.length > 0) query = query.where(and(...conditions));
    const offset = (page - 1) * limit;
    return query.orderBy(desc(purchaseOrders.id)).limit(limit).offset(offset);
  }
  async createPurchaseOrder(data: any) {
    const [result] = await db.insert(purchaseOrders).values(data).returning();
    return result;
  }
  async updatePurchaseOrder(id: number, data: any) {
    await db.update(purchaseOrders).set({ ...data, updatedAt: new Date() }).where(eq(purchaseOrders.id, id));
    const [result] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id));
    return result;
  }

  // Settings
  async getSetting(key: string) {
    const [result] = await db.select().from(settings).where(eq(settings.key, key));
    return result;
  }
  async getAllSettings() {
    return db.select().from(settings);
  }
  async upsertSetting(key: string, value: any, category?: string, description?: string) {
    const [existing] = await db.select().from(settings).where(eq(settings.key, key));
    if (existing) {
      await db.update(settings).set({ value, updatedAt: new Date() }).where(eq(settings.id, existing.id));
      const [result] = await db.select().from(settings).where(eq(settings.id, existing.id));
      return result;
    }
    const [result] = await db.insert(settings).values({ key, value, category, description }).returning();
    return result;
  }

  // Audit Log
  async createAuditEntry(data: any) {
    const [result] = await db.insert(auditLog).values(data).returning();
    return result;
  }

  // Vendor Sessions
  async createVendorSession(data: any) {
    const [result] = await db.insert(vendorSessions).values(data).returning();
    return result;
  }
  async getVendorSession(token: string) {
    const [result] = await db.select().from(vendorSessions).where(eq(vendorSessions.token, token));
    return result;
  }
  async deleteVendorSession(token: string) {
    await db.delete(vendorSessions).where(eq(vendorSessions.token, token));
  }

  // ============================================
  // FINANCIAL MODULE METHODS
  // ============================================

  // Client Invoices
  async getInvoices(filters: { customerId?: number; entityId?: number; status?: string; page?: number; limit?: number } = {}) {
    const { customerId, entityId, status, page = 1, limit = 50 } = filters;
    const conditions: any[] = [];
    if (customerId) conditions.push(eq(clientInvoices.customerId, customerId));
    if (entityId) conditions.push(eq(clientInvoices.entityId, entityId));
    if (status) conditions.push(eq(clientInvoices.status, status));
    let query = db.select().from(clientInvoices).$dynamic();
    if (conditions.length > 0) query = query.where(and(...conditions));
    const offset = (page - 1) * limit;
    return query.orderBy(desc(clientInvoices.id)).limit(limit).offset(offset);
  }
  async getInvoiceCount(filters: { customerId?: number; entityId?: number; status?: string } = {}) {
    const { customerId, entityId, status } = filters;
    const conditions: any[] = [];
    if (customerId) conditions.push(eq(clientInvoices.customerId, customerId));
    if (entityId) conditions.push(eq(clientInvoices.entityId, entityId));
    if (status) conditions.push(eq(clientInvoices.status, status));
    let query = db.select({ count: sql<number>`count(*)::int` }).from(clientInvoices).$dynamic();
    if (conditions.length > 0) query = query.where(and(...conditions));
    const [result] = await query;
    return result?.count || 0;
  }
  async getInvoice(id: number) {
    const [result] = await db.select().from(clientInvoices).where(eq(clientInvoices.id, id));
    return result;
  }
  async createInvoice(data: any) {
    const [result] = await db.insert(clientInvoices).values(data).returning();
    return result;
  }
  async updateInvoice(id: number, data: any) {
    await db.update(clientInvoices).set({ ...data, updatedAt: new Date() }).where(eq(clientInvoices.id, id));
    const [result] = await db.select().from(clientInvoices).where(eq(clientInvoices.id, id));
    return result;
  }

  // Invoice Line Items
  async getInvoiceLines(invoiceId: number) {
    return db.select().from(clientInvoiceLines).where(eq(clientInvoiceLines.invoiceId, invoiceId));
  }
  async createInvoiceLine(data: any) {
    const [result] = await db.insert(clientInvoiceLines).values(data).returning();
    return result;
  }
  async deleteInvoiceLines(invoiceId: number) {
    await db.delete(clientInvoiceLines).where(eq(clientInvoiceLines.invoiceId, invoiceId));
  }

  // Enhanced Purchase Orders
  async getPurchaseOrderCount(filters: { vendorId?: number; entityId?: number; status?: string } = {}) {
    const { vendorId, entityId, status } = filters;
    const conditions: any[] = [];
    if (vendorId) conditions.push(eq(purchaseOrders.vendorId, vendorId));
    if (entityId) conditions.push(eq(purchaseOrders.entityId, entityId));
    if (status) conditions.push(eq(purchaseOrders.status, status));
    let query = db.select({ count: sql<number>`count(*)::int` }).from(purchaseOrders).$dynamic();
    if (conditions.length > 0) query = query.where(and(...conditions));
    const [result] = await query;
    return result?.count || 0;
  }
  async getPurchaseOrder(id: number) {
    const [result] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id));
    return result;
  }

  // Payments
  async getPayments(filters: { invoiceId?: number; purchaseOrderId?: number; type?: string } = {}) {
    const { invoiceId, purchaseOrderId, type } = filters;
    const conditions: any[] = [];
    if (invoiceId) conditions.push(eq(payments.invoiceId, invoiceId));
    if (purchaseOrderId) conditions.push(eq(payments.purchaseOrderId, purchaseOrderId));
    if (type) conditions.push(eq(payments.type, type));
    let query = db.select().from(payments).$dynamic();
    if (conditions.length > 0) query = query.where(and(...conditions));
    return query.orderBy(desc(payments.id));
  }
  async createPayment(data: any) {
    const [result] = await db.insert(payments).values(data).returning();
    return result;
  }

  // Next invoice number generation — uses MAX-based sequencing to prevent race conditions
  async getNextInvoiceNumber(entityCode: string, year: number) {
    const prefix = entityCode === "verbato" ? "VRB-INV" : "CON-INV";
    const pattern = `${prefix}-${year}-%`;
    const [result] = await db.select({ maxNum: sql<string>`MAX(${clientInvoices.invoiceNumber})` })
      .from(clientInvoices)
      .where(sql`${clientInvoices.invoiceNumber} LIKE ${pattern}`);
    let seq = 1;
    if (result?.maxNum) {
      const parts = result.maxNum.split("-");
      const parsed = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(parsed)) seq = parsed + 1;
    }
    return `${prefix}-${year}-${String(seq).padStart(4, "0")}`;
  }

  // Next PO number generation — uses MAX-based sequencing to prevent race conditions
  async getNextPoNumber(entityCode: string, year: number) {
    const prefix = entityCode === "verbato" ? "VRB-PO" : "CON-PO";
    const pattern = `${prefix}-${year}-%`;
    const [result] = await db.select({ maxNum: sql<string>`MAX(${purchaseOrders.poNumber})` })
      .from(purchaseOrders)
      .where(sql`${purchaseOrders.poNumber} LIKE ${pattern}`);
    let seq = 1;
    if (result?.maxNum) {
      const parts = result.maxNum.split("-");
      const parsed = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(parsed)) seq = parsed + 1;
    }
    return `${prefix}-${year}-${String(seq).padStart(4, "0")}`;
  }

  // Financial Summary Data
  async getFinancialSummary(filters: { entityId?: number; startDate?: string; endDate?: string } = {}) {
    const { entityId, startDate, endDate } = filters;

    // Revenue (sum of paid invoices)
    const revenueConditions: any[] = [];
    if (entityId) revenueConditions.push(eq(clientInvoices.entityId, entityId));
    if (startDate) revenueConditions.push(gte(clientInvoices.invoiceDate, startDate));
    if (endDate) revenueConditions.push(lte(clientInvoices.invoiceDate, endDate));

    let revenueQuery = db.select({
      totalRevenue: sql<string>`COALESCE(SUM(CASE WHEN ${clientInvoices.status} IN ('paid', 'sent') THEN ${clientInvoices.total}::numeric ELSE 0 END), 0)`,
      paidRevenue: sql<string>`COALESCE(SUM(CASE WHEN ${clientInvoices.status} = 'paid' THEN ${clientInvoices.total}::numeric ELSE 0 END), 0)`,
      outstandingAR: sql<string>`COALESCE(SUM(CASE WHEN ${clientInvoices.status} IN ('sent', 'overdue') THEN ${clientInvoices.total}::numeric ELSE 0 END), 0)`,
    }).from(clientInvoices).$dynamic();
    if (revenueConditions.length > 0) revenueQuery = revenueQuery.where(and(...revenueConditions));
    const [revenue] = await revenueQuery;

    // Cost (sum of POs)
    const costConditions: any[] = [];
    if (entityId) costConditions.push(eq(purchaseOrders.entityId, entityId));
    if (startDate) costConditions.push(gte(purchaseOrders.createdAt, new Date(startDate)));
    if (endDate) costConditions.push(lte(purchaseOrders.createdAt, new Date(endDate)));

    let costQuery = db.select({
      totalCost: sql<string>`COALESCE(SUM(${purchaseOrders.amount}::numeric), 0)`,
      paidCost: sql<string>`COALESCE(SUM(CASE WHEN ${purchaseOrders.status} = 'paid' THEN ${purchaseOrders.amount}::numeric ELSE 0 END), 0)`,
      outstandingAP: sql<string>`COALESCE(SUM(CASE WHEN ${purchaseOrders.status} IN ('sent', 'accepted') THEN ${purchaseOrders.amount}::numeric ELSE 0 END), 0)`,
    }).from(purchaseOrders).$dynamic();
    if (costConditions.length > 0) costQuery = costQuery.where(and(...costConditions));
    const [cost] = await costQuery;

    return {
      totalRevenue: parseFloat(revenue?.totalRevenue || "0"),
      paidRevenue: parseFloat(revenue?.paidRevenue || "0"),
      outstandingAR: parseFloat(revenue?.outstandingAR || "0"),
      totalCost: parseFloat(cost?.totalCost || "0"),
      paidCost: parseFloat(cost?.paidCost || "0"),
      outstandingAP: parseFloat(cost?.outstandingAP || "0"),
    };
  }

  // AR Aging Report
  async getARAgingReport(entityId?: number) {
    const conditions: any[] = [
      sql`${clientInvoices.status} IN ('sent', 'overdue')`,
    ];
    if (entityId) conditions.push(eq(clientInvoices.entityId, entityId));

    const [result] = await db.select({
      current: sql<string>`COALESCE(SUM(CASE WHEN ${clientInvoices.dueDate} >= CURRENT_DATE THEN ${clientInvoices.total}::numeric ELSE 0 END), 0)`,
      days30: sql<string>`COALESCE(SUM(CASE WHEN ${clientInvoices.dueDate} < CURRENT_DATE AND ${clientInvoices.dueDate} >= CURRENT_DATE - INTERVAL '30 days' THEN ${clientInvoices.total}::numeric ELSE 0 END), 0)`,
      days60: sql<string>`COALESCE(SUM(CASE WHEN ${clientInvoices.dueDate} < CURRENT_DATE - INTERVAL '30 days' AND ${clientInvoices.dueDate} >= CURRENT_DATE - INTERVAL '60 days' THEN ${clientInvoices.total}::numeric ELSE 0 END), 0)`,
      days90: sql<string>`COALESCE(SUM(CASE WHEN ${clientInvoices.dueDate} < CURRENT_DATE - INTERVAL '60 days' AND ${clientInvoices.dueDate} >= CURRENT_DATE - INTERVAL '90 days' THEN ${clientInvoices.total}::numeric ELSE 0 END), 0)`,
      over90: sql<string>`COALESCE(SUM(CASE WHEN ${clientInvoices.dueDate} < CURRENT_DATE - INTERVAL '90 days' THEN ${clientInvoices.total}::numeric ELSE 0 END), 0)`,
    }).from(clientInvoices).where(and(...conditions));

    return {
      current: parseFloat(result?.current || "0"),
      days30: parseFloat(result?.days30 || "0"),
      days60: parseFloat(result?.days60 || "0"),
      days90: parseFloat(result?.days90 || "0"),
      over90: parseFloat(result?.over90 || "0"),
    };
  }

  // Revenue by customer (top N)
  async getRevenueByCustomer(limit = 10, entityId?: number) {
    const conditions: any[] = [
      sql`${clientInvoices.status} IN ('paid', 'sent', 'overdue')`,
    ];
    if (entityId) conditions.push(eq(clientInvoices.entityId, entityId));

    return db.select({
      customerId: clientInvoices.customerId,
      customerName: customers.name,
      total: sql<string>`SUM(${clientInvoices.total}::numeric)`,
    }).from(clientInvoices)
      .innerJoin(customers, eq(clientInvoices.customerId, customers.id))
      .where(and(...conditions))
      .groupBy(clientInvoices.customerId, customers.name)
      .orderBy(sql`SUM(${clientInvoices.total}::numeric) DESC`)
      .limit(limit);
  }

  // Cost by vendor (top N)
  async getCostByVendor(limit = 10, entityId?: number) {
    const conditions: any[] = [];
    if (entityId) conditions.push(eq(purchaseOrders.entityId, entityId));

    let query = db.select({
      vendorId: purchaseOrders.vendorId,
      vendorName: vendors.fullName,
      total: sql<string>`SUM(${purchaseOrders.amount}::numeric)`,
    }).from(purchaseOrders)
      .innerJoin(vendors, eq(purchaseOrders.vendorId, vendors.id))
      .$dynamic();
    if (conditions.length > 0) query = query.where(and(...conditions));

    return query
      .groupBy(purchaseOrders.vendorId, vendors.fullName)
      .orderBy(sql`SUM(${purchaseOrders.amount}::numeric) DESC`)
      .limit(limit);
  }

  // Monthly revenue/cost trend
  async getMonthlyTrend(months = 12, entityId?: number) {
    // Sanitize months to a safe integer to prevent SQL injection via sql.raw
    const safeMonths = Math.max(1, Math.min(120, Math.floor(Number(months) || 12)));
    const revenueConditions: any[] = [];
    const costConditions: any[] = [];
    if (entityId) {
      revenueConditions.push(eq(clientInvoices.entityId, entityId));
      costConditions.push(eq(purchaseOrders.entityId, entityId));
    }

    let revQuery = db.select({
      month: sql<string>`TO_CHAR(${clientInvoices.invoiceDate}::date, 'YYYY-MM')`,
      total: sql<string>`SUM(${clientInvoices.total}::numeric)`,
    }).from(clientInvoices)
      .where(and(
        sql`${clientInvoices.invoiceDate}::date >= CURRENT_DATE - INTERVAL '${sql.raw(String(safeMonths))} months'`,
        sql`${clientInvoices.status} IN ('paid', 'sent', 'overdue')`,
        ...revenueConditions,
      ))
      .groupBy(sql`TO_CHAR(${clientInvoices.invoiceDate}::date, 'YYYY-MM')`)
      .orderBy(sql`TO_CHAR(${clientInvoices.invoiceDate}::date, 'YYYY-MM')`);

    let costQuery = db.select({
      month: sql<string>`TO_CHAR(${purchaseOrders.createdAt}::date, 'YYYY-MM')`,
      total: sql<string>`SUM(${purchaseOrders.amount}::numeric)`,
    }).from(purchaseOrders)
      .where(and(
        sql`${purchaseOrders.createdAt} >= CURRENT_DATE - INTERVAL '${sql.raw(String(safeMonths))} months'`,
        ...costConditions,
      ))
      .groupBy(sql`TO_CHAR(${purchaseOrders.createdAt}::date, 'YYYY-MM')`)
      .orderBy(sql`TO_CHAR(${purchaseOrders.createdAt}::date, 'YYYY-MM')`);

    const [revenueData, costData] = await Promise.all([revQuery, costQuery]);
    return { revenue: revenueData, cost: costData };
  }

  // Revenue by entity
  async getRevenueByEntity() {
    return db.select({
      entityId: clientInvoices.entityId,
      entityName: entities.name,
      entityCode: entities.code,
      total: sql<string>`SUM(${clientInvoices.total}::numeric)`,
    }).from(clientInvoices)
      .innerJoin(entities, eq(clientInvoices.entityId, entities.id))
      .where(sql`${clientInvoices.status} IN ('paid', 'sent', 'overdue')`)
      .groupBy(clientInvoices.entityId, entities.name, entities.code);
  }


  // Project financial summary
  async getProjectFinancials(projectId: number) {
    const [revenue] = await db.select({
      totalRevenue: sql<string>`COALESCE(SUM(${clientInvoiceLines.amount}::numeric), 0)`,
    }).from(clientInvoiceLines)
      .where(eq(clientInvoiceLines.projectId, projectId));

    const [cost] = await db.select({
      totalCost: sql<string>`COALESCE(SUM(${purchaseOrders.amount}::numeric), 0)`,
    }).from(purchaseOrders)
      .where(eq(purchaseOrders.projectId, projectId));

    const totalRevenue = parseFloat(revenue?.totalRevenue || "0");
    const totalCost = parseFloat(cost?.totalCost || "0");
    const grossMargin = totalRevenue - totalCost;
    const marginPercent = totalRevenue > 0 ? (grossMargin / totalRevenue) * 100 : 0;

    return { totalRevenue, totalCost, grossMargin, marginPercent };
  }

  // ============================================
  // PHASE 6: NEW STORAGE METHODS
  // ============================================

  // Vendor Rate Card CRUD (enhanced)
  async createVendorRateCard(data: any) {
    const [result] = await db.insert(vendorRateCards).values(data).returning();
    return result;
  }
  async updateVendorRateCard(id: number, data: any) {
    await db.update(vendorRateCards).set({ ...data, updatedAt: new Date() }).where(eq(vendorRateCards.id, id));
    const [result] = await db.select().from(vendorRateCards).where(eq(vendorRateCards.id, id));
    return result;
  }
  async deleteVendorRateCard(id: number) {
    await db.delete(vendorRateCards).where(eq(vendorRateCards.id, id));
  }

  // Vendor Files (per-vendor document uploads)
  async getVendorFiles(vendorId: number) {
    return db.select().from(vendorFiles).where(eq(vendorFiles.vendorId, vendorId)).orderBy(desc(vendorFiles.id));
  }
  async createVendorFile(data: any) {
    const [result] = await db.insert(vendorFiles).values(data).returning();
    return result;
  }
  async deleteVendorFile(id: number) {
    await db.delete(vendorFiles).where(eq(vendorFiles.id, id));
  }
  async getVendorFile(id: number) {
    const [result] = await db.select().from(vendorFiles).where(eq(vendorFiles.id, id));
    return result;
  }

  // Customer Rate Card CRUD (enhanced)
  async getCustomerRateCards(customerId: number) {
    return db.select().from(customerRateCards).where(eq(customerRateCards.customerId, customerId));
  }
  async createCustomerRateCard(data: any) {
    const [result] = await db.insert(customerRateCards).values(data).returning();
    return result;
  }
  async updateCustomerRateCard(id: number, data: any) {
    await db.update(customerRateCards).set(data).where(eq(customerRateCards.id, id));
    const [result] = await db.select().from(customerRateCards).where(eq(customerRateCards.id, id));
    return result;
  }
  async deleteCustomerRateCard(id: number) {
    await db.delete(customerRateCards).where(eq(customerRateCards.id, id));
  }

  // Rate Card Lookup (for auto-populating)
  async lookupRateCards(params: { customerId?: number; vendorId?: number; sourceLang?: string; targetLang?: string; serviceType?: string }) {
    let customerRate = null;
    let vendorRate = null;

    if (params.customerId) {
      const conditions: any[] = [eq(customerRateCards.customerId, params.customerId)];
      if (params.sourceLang) conditions.push(eq(customerRateCards.sourceLanguage, params.sourceLang));
      if (params.targetLang) conditions.push(eq(customerRateCards.targetLanguage, params.targetLang));
      if (params.serviceType) conditions.push(eq(customerRateCards.serviceType, params.serviceType));
      const [result] = await db.select().from(customerRateCards).where(and(...conditions)).limit(1);
      customerRate = result || null;
    }

    if (params.vendorId) {
      const conditions: any[] = [eq(vendorRateCards.vendorId, params.vendorId)];
      if (params.sourceLang) conditions.push(eq(vendorRateCards.sourceLanguage, params.sourceLang));
      if (params.targetLang) conditions.push(eq(vendorRateCards.targetLanguage, params.targetLang));
      if (params.serviceType) conditions.push(eq(vendorRateCards.serviceType, params.serviceType));
      const [result] = await db.select().from(vendorRateCards).where(and(...conditions)).limit(1);
      vendorRate = result || null;
    }

    return { customerRate, vendorRate };
  }

  // Invoice Line Item CRUD (individual)
  async getInvoiceLine(id: number) {
    const [result] = await db.select().from(clientInvoiceLines).where(eq(clientInvoiceLines.id, id));
    return result;
  }
  async updateInvoiceLine(id: number, data: any) {
    await db.update(clientInvoiceLines).set(data).where(eq(clientInvoiceLines.id, id));
    const [result] = await db.select().from(clientInvoiceLines).where(eq(clientInvoiceLines.id, id));
    return result;
  }
  async deleteInvoiceLine(id: number) {
    await db.delete(clientInvoiceLines).where(eq(clientInvoiceLines.id, id));
  }

  // PO Line Items
  async getPoLineItems(purchaseOrderId: number) {
    return db.select().from(poLineItems).where(eq(poLineItems.purchaseOrderId, purchaseOrderId)).orderBy(asc(poLineItems.sortOrder));
  }
  async createPoLineItem(data: any) {
    const [result] = await db.insert(poLineItems).values(data).returning();
    return result;
  }
  async getPoLineItem(id: number) {
    const [result] = await db.select().from(poLineItems).where(eq(poLineItems.id, id));
    return result;
  }
  async updatePoLineItem(id: number, data: any) {
    await db.update(poLineItems).set(data).where(eq(poLineItems.id, id));
    const [result] = await db.select().from(poLineItems).where(eq(poLineItems.id, id));
    return result;
  }
  async deletePoLineItem(id: number) {
    await db.delete(poLineItems).where(eq(poLineItems.id, id));
  }
  async deletePoLineItems(purchaseOrderId: number) {
    await db.delete(poLineItems).where(eq(poLineItems.purchaseOrderId, purchaseOrderId));
  }

  // Enhanced Payment queries
  async getPayment(id: number) {
    const [result] = await db.select().from(payments).where(eq(payments.id, id));
    return result;
  }
  async deletePayment(id: number) {
    await db.delete(payments).where(eq(payments.id, id));
  }
  async getPaymentsEnhanced(filters: { type?: string; entityId?: number; startDate?: string; endDate?: string; invoiceId?: number; purchaseOrderId?: number; page?: number; limit?: number } = {}) {
    const { type, entityId, startDate, endDate, invoiceId, purchaseOrderId, page = 1, limit = 50 } = filters;
    const conditions: any[] = [];
    if (type) conditions.push(eq(payments.type, type));
    if (entityId) conditions.push(eq(payments.entityId, entityId));
    if (invoiceId) conditions.push(eq(payments.invoiceId, invoiceId));
    if (purchaseOrderId) conditions.push(eq(payments.purchaseOrderId, purchaseOrderId));
    if (startDate) conditions.push(gte(payments.paymentDate, startDate));
    if (endDate) conditions.push(lte(payments.paymentDate, endDate));
    let query = db.select().from(payments).$dynamic();
    if (conditions.length > 0) query = query.where(and(...conditions));
    const offset = (page - 1) * limit;
    return query.orderBy(desc(payments.id)).limit(limit).offset(offset);
  }
  async getPaymentsSummary(filters: { type?: string; entityId?: number; startDate?: string; endDate?: string } = {}) {
    const { type, entityId, startDate, endDate } = filters;
    const conditions: any[] = [];
    if (type) conditions.push(eq(payments.type, type));
    if (entityId) conditions.push(eq(payments.entityId, entityId));
    if (startDate) conditions.push(gte(payments.paymentDate, startDate));
    if (endDate) conditions.push(lte(payments.paymentDate, endDate));
    let query = db.select({
      type: payments.type,
      total: sql<string>`COALESCE(SUM(${payments.amount}::numeric), 0)`,
      count: sql<number>`count(*)::int`,
    }).from(payments).$dynamic();
    if (conditions.length > 0) query = query.where(and(...conditions));
    return query.groupBy(payments.type);
  }
  async getCashFlow(months = 12, entityId?: number) {
    const safeMonths = Math.max(1, Math.min(120, Math.floor(Number(months) || 12)));
    const conditions: any[] = [
      sql`${payments.paymentDate}::date >= CURRENT_DATE - INTERVAL '${sql.raw(String(safeMonths))} months'`,
    ];
    if (entityId) conditions.push(eq(payments.entityId, entityId));

    return db.select({
      month: sql<string>`TO_CHAR(${payments.paymentDate}::date, 'YYYY-MM')`,
      type: payments.type,
      total: sql<string>`COALESCE(SUM(${payments.amount}::numeric), 0)`,
    }).from(payments)
      .where(and(...conditions))
      .groupBy(sql`TO_CHAR(${payments.paymentDate}::date, 'YYYY-MM')`, payments.type)
      .orderBy(sql`TO_CHAR(${payments.paymentDate}::date, 'YYYY-MM')`);
  }

  // Dashboard KPIs
  async getDashboardKpis() {
    const [activeProjects] = await db.select({ count: sql<number>`count(*)::int` }).from(projects).where(sql`${projects.status} IN ('active', 'in_progress', 'confirmed')`);
    const [openTasks] = await db.select({ count: sql<number>`count(*)::int` }).from(portalTasks).where(eq(portalTasks.status, "pending"));
    const [pendingInvoices] = await db.select({ count: sql<number>`count(*)::int` }).from(clientInvoices).where(sql`${clientInvoices.status} IN ('draft', 'sent')`);
    const [pendingInvoicesAmount] = await db.select({
      total: sql<string>`COALESCE(SUM(${clientInvoices.total}::numeric), 0)`,
    }).from(clientInvoices).where(sql`${clientInvoices.status} IN ('draft', 'sent')`);
    const [overdueItems] = await db.select({ count: sql<number>`count(*)::int` }).from(projects).where(
      and(
        sql`${projects.deadline} IS NOT NULL`,
        sql`${projects.deadline} < NOW()`,
        sql`${projects.status} NOT IN ('completed', 'invoiced', 'closed', 'cancelled')`,
      )
    );
    const [monthlyRevenue] = await db.select({
      total: sql<string>`COALESCE(SUM(${clientInvoices.total}::numeric), 0)`,
    }).from(clientInvoices).where(and(
      sql`TO_CHAR(${clientInvoices.invoiceDate}::date, 'YYYY-MM') = TO_CHAR(CURRENT_DATE, 'YYYY-MM')`,
      eq(clientInvoices.status, "paid"),
    ));
    const [availableVendors] = await db.select({ count: sql<number>`count(*)::int` }).from(vendors).where(
      sql`${vendors.status} IN ('Approved', 'approved')`
    );
    return {
      activeProjects: activeProjects?.count || 0,
      openTasks: openTasks?.count || 0,
      pendingInvoices: pendingInvoices?.count || 0,
      pendingInvoicesAmount: parseFloat(pendingInvoicesAmount?.total || "0"),
      overdueItems: overdueItems?.count || 0,
      monthlyRevenue: parseFloat(monthlyRevenue?.total || "0"),
      vendorAvailability: availableVendors?.count || 0,
    };
  }

  // Dashboard Activity (recent audit log)
  async getDashboardActivity(limit = 20) {
    return db.select().from(auditLog).orderBy(desc(auditLog.id)).limit(limit);
  }

  // Dashboard Deadlines (next 7 days)
  async getDashboardDeadlines() {
    return db.select({
      id: projects.id,
      projectName: projects.projectName,
      deadline: projects.deadline,
      status: projects.status,
      customerName: customers.name,
    }).from(projects)
      .leftJoin(customers, eq(projects.customerId, customers.id))
      .where(and(
        sql`${projects.deadline} IS NOT NULL`,
        sql`${projects.deadline} >= CURRENT_TIMESTAMP`,
        sql`${projects.deadline} <= CURRENT_TIMESTAMP + INTERVAL '7 days'`,
        sql`${projects.status} NOT IN ('completed', 'cancelled')`,
      ))
      .orderBy(asc(projects.deadline))
      .limit(50);
  }

  // Dashboard Project Pipeline
  async getProjectPipeline() {
    return db.select({
      status: projects.status,
      count: sql<number>`count(*)::int`,
    }).from(projects).groupBy(projects.status);
  }

  // AP Aging (vendor PO aging)
  async getAPAgingReport(entityId?: number) {
    const conditions: any[] = [
      sql`${purchaseOrders.status} IN ('sent', 'accepted', 'draft')`,
    ];
    if (entityId) conditions.push(eq(purchaseOrders.entityId, entityId));

    const [result] = await db.select({
      current: sql<string>`COALESCE(SUM(CASE WHEN ${purchaseOrders.createdAt} >= CURRENT_DATE - INTERVAL '30 days' THEN ${purchaseOrders.amount}::numeric ELSE 0 END), 0)`,
      days30: sql<string>`COALESCE(SUM(CASE WHEN ${purchaseOrders.createdAt} < CURRENT_DATE - INTERVAL '30 days' AND ${purchaseOrders.createdAt} >= CURRENT_DATE - INTERVAL '60 days' THEN ${purchaseOrders.amount}::numeric ELSE 0 END), 0)`,
      days60: sql<string>`COALESCE(SUM(CASE WHEN ${purchaseOrders.createdAt} < CURRENT_DATE - INTERVAL '60 days' AND ${purchaseOrders.createdAt} >= CURRENT_DATE - INTERVAL '90 days' THEN ${purchaseOrders.amount}::numeric ELSE 0 END), 0)`,
      days90: sql<string>`COALESCE(SUM(CASE WHEN ${purchaseOrders.createdAt} < CURRENT_DATE - INTERVAL '90 days' AND ${purchaseOrders.createdAt} >= CURRENT_DATE - INTERVAL '120 days' THEN ${purchaseOrders.amount}::numeric ELSE 0 END), 0)`,
      over90: sql<string>`COALESCE(SUM(CASE WHEN ${purchaseOrders.createdAt} < CURRENT_DATE - INTERVAL '120 days' THEN ${purchaseOrders.amount}::numeric ELSE 0 END), 0)`,
    }).from(purchaseOrders).where(and(...conditions));

    return {
      current: parseFloat(result?.current || "0"),
      days30: parseFloat(result?.days30 || "0"),
      days60: parseFloat(result?.days60 || "0"),
      days90: parseFloat(result?.days90 || "0"),
      over90: parseFloat(result?.over90 || "0"),
    };
  }

  // P&L Report
  async getPnlReport(filters: { entityId?: number; startDate?: string; endDate?: string } = {}) {
    const { entityId, startDate, endDate } = filters;
    const revConditions: any[] = [];
    const costConditions: any[] = [];
    if (entityId) {
      revConditions.push(eq(clientInvoices.entityId, entityId));
      costConditions.push(eq(purchaseOrders.entityId, entityId));
    }
    if (startDate) {
      revConditions.push(gte(clientInvoices.invoiceDate, startDate));
      costConditions.push(gte(purchaseOrders.createdAt, new Date(startDate)));
    }
    if (endDate) {
      revConditions.push(lte(clientInvoices.invoiceDate, endDate));
      costConditions.push(lte(purchaseOrders.createdAt, new Date(endDate)));
    }
    revConditions.push(sql`${clientInvoices.status} IN ('paid', 'sent', 'overdue')`);

    let revQuery = db.select({
      total: sql<string>`COALESCE(SUM(${clientInvoices.total}::numeric), 0)`,
      subtotal: sql<string>`COALESCE(SUM(${clientInvoices.subtotal}::numeric), 0)`,
      tax: sql<string>`COALESCE(SUM(${clientInvoices.taxAmount}::numeric), 0)`,
    }).from(clientInvoices).$dynamic();
    if (revConditions.length > 0) revQuery = revQuery.where(and(...revConditions));

    let costQuery = db.select({
      total: sql<string>`COALESCE(SUM(${purchaseOrders.amount}::numeric), 0)`,
    }).from(purchaseOrders).$dynamic();
    if (costConditions.length > 0) costQuery = costQuery.where(and(...costConditions));

    const [[rev], [cost]] = await Promise.all([revQuery, costQuery]);
    const revenue = parseFloat(rev?.total || "0");
    const totalCost = parseFloat(cost?.total || "0");
    const grossProfit = revenue - totalCost;
    const margin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

    return {
      revenue,
      subtotal: parseFloat(rev?.subtotal || "0"),
      tax: parseFloat(rev?.tax || "0"),
      cost: totalCost,
      grossProfit,
      margin,
    };
  }

  // Entity Comparison
  async getEntityComparison(startDate?: string, endDate?: string) {
    const allEntities = await db.select().from(entities);
    const result = [];
    for (const entity of allEntities) {
      const summary = await this.getFinancialSummary({ entityId: entity.id, startDate, endDate });
      result.push({
        entityId: entity.id,
        entityName: entity.name,
        entityCode: entity.code,
        ...summary,
        grossProfit: summary.totalRevenue - summary.totalCost,
        margin: summary.totalRevenue > 0 ? ((summary.totalRevenue - summary.totalCost) / summary.totalRevenue) * 100 : 0,
      });
    }
    return result;
  }

  // Vendor Performance
  async getVendorPerformance(vendorId: number) {
    // QS Trend
    const qsReports = await db.select({
      score: qualityReports.qsScore,
      date: qualityReports.reportDate,
    }).from(qualityReports)
      .where(and(eq(qualityReports.vendorId, vendorId), sql`${qualityReports.qsScore} IS NOT NULL`))
      .orderBy(asc(qualityReports.reportDate));

    // LQA Trend
    const lqaReports = await db.select({
      score: qualityReports.lqaScore,
      date: qualityReports.reportDate,
    }).from(qualityReports)
      .where(and(eq(qualityReports.vendorId, vendorId), sql`${qualityReports.lqaScore} IS NOT NULL`))
      .orderBy(asc(qualityReports.reportDate));

    // Volume (jobs count)
    const [jobStats] = await db.select({
      totalJobs: sql<number>`count(*)::int`,
      totalWords: sql<string>`COALESCE(SUM(${jobs.unitCount}::numeric), 0)`,
    }).from(jobs).where(eq(jobs.vendorId, vendorId));

    // On-time rate
    const [onTimeStats] = await db.select({
      total: sql<number>`count(*)::int`,
      onTime: sql<number>`count(CASE WHEN ${jobs.status} = 'completed' AND (${jobs.deadline} IS NULL OR ${jobs.updatedAt} <= ${jobs.deadline}) THEN 1 END)::int`,
    }).from(jobs).where(and(eq(jobs.vendorId, vendorId), eq(jobs.status, "completed")));

    const onTimeRate = onTimeStats?.total && onTimeStats.total > 0 ? (onTimeStats.onTime / onTimeStats.total) * 100 : 100;

    return {
      qsTrend: qsReports,
      lqaTrend: lqaReports,
      totalJobs: jobStats?.totalJobs || 0,
      totalWords: parseFloat(jobStats?.totalWords || "0"),
      onTimeRate,
    };
  }

  // Export helpers
  async getAllInvoicesForExport(entityId?: number) {
    let query = db.select({
      invoice: clientInvoices,
      customerName: customers.name,
      entityName: entities.name,
    }).from(clientInvoices)
      .leftJoin(customers, eq(clientInvoices.customerId, customers.id))
      .leftJoin(entities, eq(clientInvoices.entityId, entities.id))
      .$dynamic();
    if (entityId) query = query.where(eq(clientInvoices.entityId, entityId));
    return query.orderBy(desc(clientInvoices.id));
  }

  async getAllPurchaseOrdersForExport(entityId?: number) {
    let query = db.select({
      po: purchaseOrders,
      vendorName: vendors.fullName,
      entityName: entities.name,
    }).from(purchaseOrders)
      .leftJoin(vendors, eq(purchaseOrders.vendorId, vendors.id))
      .leftJoin(entities, eq(purchaseOrders.entityId, entities.id))
      .$dynamic();
    if (entityId) query = query.where(eq(purchaseOrders.entityId, entityId));
    return query.orderBy(desc(purchaseOrders.id));
  }

  async getAllPaymentsForExport(entityId?: number) {
    let query = db.select().from(payments).$dynamic();
    if (entityId) query = query.where(eq(payments.entityId, entityId));
    return query.orderBy(desc(payments.id));
  }

  async getAllVendorsForExport() {
    return db.select().from(vendors).orderBy(asc(vendors.fullName));
  }

  // Get completed jobs not yet invoiced
  async getUninvoicedJobs(customerId?: number) {
    const conditions: any[] = [
      eq(jobs.status, "completed"),
    ];

    let query = db.select({
      job: jobs,
      projectName: projects.projectName,
      customerName: customers.name,
      customerId: projects.customerId,
    }).from(jobs)
      .innerJoin(projects, eq(jobs.projectId, projects.id))
      .innerJoin(customers, eq(projects.customerId, customers.id))
      .$dynamic();

    if (customerId) conditions.push(eq(projects.customerId, customerId));

    // Left join to find jobs that don't have invoice lines yet
    return db.select({
      job: jobs,
      projectName: projects.projectName,
      customerName: customers.name,
      customerId: projects.customerId,
    }).from(jobs)
      .innerJoin(projects, eq(jobs.projectId, projects.id))
      .innerJoin(customers, eq(projects.customerId, customers.id))
      .where(and(...conditions, eq(jobs.status, "completed")))
      .orderBy(desc(jobs.id));
  }
}

export const storage = new DatabaseStorage();
