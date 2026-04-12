import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  varchar,
  decimal,
  jsonb,
  date,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ============================================
// EXISTING TABLES (converted from SQLite)
// ============================================

// PM users who can log in (kept for backward compat, new "users" table is the primary)
export const pmUsers = pgTable("pm_users", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 200 }).notNull(),
  initial: varchar("initial", { length: 10 }).default(""),
  password: text("password").notNull().default(""),
  role: varchar("role", { length: 50 }).notNull().default("pm"),
  defaultFilter: varchar("default_filter", { length: 50 }).default("ongoing"),
  defaultMyProjects: integer("default_my_projects").default(0),
  defaultSource: varchar("default_source", { length: 50 }).default("all"),
  defaultAccount: varchar("default_account", { length: 50 }).default("all"),
});

// Magic link tokens for authentication
export const authTokens = pgTable("auth_tokens", {
  id: serial("id").primaryKey(),
  token: text("token").notNull().unique(),
  email: varchar("email", { length: 255 }).notNull(),
  expiresAt: text("expires_at").notNull(),
  used: integer("used").notNull().default(0),
  clientBaseUrl: text("client_base_url"),
});

// Sessions
export const sessions = pgTable("sessions", {
  id: serial("id").primaryKey(),
  token: text("token").notNull().unique(),
  pmUserId: integer("pm_user_id").notNull(),
  expiresAt: text("expires_at").notNull(),
});

// Task assignments - the core of the distribution system
export const assignments = pgTable("assignments", {
  id: serial("id").primaryKey(),
  source: text("source").notNull(),
  sheet: text("sheet").notNull(),
  projectId: text("project_id").notNull(),
  account: text("account").notNull(),
  taskDetails: text("task_details").notNull(),
  assignmentType: text("assignment_type").notNull(),
  role: text("role").notNull(),
  status: text("status").notNull().default("pending"),
  assignedBy: integer("assigned_by").notNull(),
  acceptedBy: text("accepted_by"),
  acceptedByName: text("accepted_by_name"),
  acceptedByEmail: text("accepted_by_email"),
  sequenceList: text("sequence_list"),
  currentSequenceIndex: integer("current_sequence_index").default(0),
  sequenceTimeoutMinutes: integer("sequence_timeout_minutes").default(60),
  broadcastList: text("broadcast_list"),
  autoAssignReviewer: integer("auto_assign_reviewer").default(0),
  reviewerAssignmentType: text("reviewer_assignment_type"),
  reviewerSequenceList: text("reviewer_sequence_list"),
  reviewType: text("review_type"),
  createdAt: text("created_at").notNull(),
  offeredAt: text("offered_at"),
  acceptedAt: text("accepted_at"),
  completedAt: text("completed_at"),
  linkedReviewerAssignmentId: integer("linked_reviewer_assignment_id"),
});

// Individual offers sent to freelancers
export const offers = pgTable("offers", {
  id: serial("id").primaryKey(),
  assignmentId: integer("assignment_id").notNull(),
  freelancerCode: text("freelancer_code").notNull(),
  freelancerName: text("freelancer_name").notNull(),
  freelancerEmail: text("freelancer_email").notNull(),
  token: text("token").notNull().unique(),
  status: text("status").notNull().default("pending"),
  sentAt: text("sent_at").notNull(),
  respondedAt: text("responded_at"),
  sequenceOrder: integer("sequence_order"),
  clientBaseUrl: text("client_base_url"),
});

// Email templates
export const emailTemplates = pgTable("email_templates", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
});

// Sequence presets
export const sequencePresets = pgTable("sequence_presets", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  pmEmail: text("pm_email").notNull(),
  role: text("role").notNull(),
  freelancerCodes: text("freelancer_codes").notNull(),
  assignmentType: text("assignment_type").notNull().default("sequence"),
});

// Auto-assign rules (existing)
export const autoAssignRules = pgTable("auto_assign_rules", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  source: text("source"),
  account: text("account"),
  languagePair: text("language_pair"),
  role: text("role").notNull(),
  freelancerCodes: text("freelancer_codes").notNull(),
  assignmentType: text("assignment_type").notNull().default("sequence"),
  maxWwc: integer("max_wwc"),
  enabled: integer("enabled").notNull().default(1),
  createdBy: text("created_by").notNull(),
});

// Sheet config
export const sheetConfigs = pgTable("sheet_configs", {
  id: serial("id").primaryKey(),
  source: text("source").notNull(),
  sheet: text("sheet").notNull(),
  languagePair: text("language_pair").notNull().default("EN>TR"),
  sheetDbId: text("sheetdb_id"),
  googleSheetUrl: text("google_sheet_url"),
  assignedPms: text("assigned_pms"),
  googleSheetId: text("google_sheet_id"),
  worksheetId: integer("worksheet_id"),
});

// PM internal notes on tasks
export const taskNotes = pgTable("task_notes", {
  id: serial("id").primaryKey(),
  source: text("source").notNull(),
  sheet: text("sheet").notNull(),
  projectId: text("project_id").notNull(),
  pmEmail: text("pm_email").notNull(),
  note: text("note").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// PM favorite freelancers
export const pmFavorites = pgTable("pm_favorites", {
  id: serial("id").primaryKey(),
  pmEmail: text("pm_email").notNull(),
  freelancerCode: text("freelancer_code").notNull(),
  createdAt: text("created_at").notNull(),
});

// Notifications for PM dashboard
export const notifications = pgTable("notifications_legacy", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  metadata: text("metadata"),
  read: integer("read").notNull().default(0),
  createdAt: text("created_at").notNull(),
});

// Freelancer sessions (magic link based)
export const freelancerSessions = pgTable("freelancer_sessions", {
  id: serial("id").primaryKey(),
  token: text("token").notNull().unique(),
  freelancerCode: text("freelancer_code").notNull(),
  freelancerName: text("freelancer_name").notNull(),
  freelancerEmail: text("freelancer_email").notNull(),
  expiresAt: text("expires_at").notNull(),
});

// ============================================
// NEW DISPATCH 2.0 TABLES
// ============================================

// Entities (company legal entities)
export const entities = pgTable("entities", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  code: varchar("code", { length: 50 }).notNull().unique(),
  jurisdiction: varchar("jurisdiction", { length: 100 }),
  currency: varchar("currency", { length: 3 }).default("GBP"),
  defaultCurrency: varchar("default_currency", { length: 3 }).default("EUR"),
  qboEnabled: boolean("qbo_enabled").default(false),
  bankDetails: jsonb("bank_details"),
  wiseEnabled: boolean("wise_enabled").default(false),
  smartcatAccountId: varchar("smartcat_account_id", { length: 200 }),
  smartcatApiKey: varchar("smartcat_api_key", { length: 200 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// Users (internal staff - all roles) - replaces pm_users as primary
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 200 }).notNull(),
  initial: varchar("initial", { length: 10 }),
  passwordHash: varchar("password_hash", { length: 255 }),
  role: varchar("role", { length: 50 }).notNull(),
  entityId: integer("entity_id").references(() => entities.id),
  avatarUrl: varchar("avatar_url", { length: 500 }),
  isActive: boolean("is_active").default(true),
  defaultFilter: varchar("default_filter", { length: 50 }).default("ongoing"),
  defaultSource: varchar("default_source", { length: 50 }).default("all"),
  preferences: jsonb("preferences").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// Vendors (freelancers/linguists) - THE BIG ONE
export const vendors = pgTable("vendors", {
  id: serial("id").primaryKey(),
  resourceCode: varchar("resource_code", { length: 50 }).unique(),
  fullName: varchar("full_name", { length: 200 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  email2: varchar("email2", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  phone2: varchar("phone2", { length: 50 }),
  phone3: varchar("phone3", { length: 50 }),
  address: jsonb("address"),
  location: varchar("location", { length: 200 }),
  website: varchar("website", { length: 500 }),
  skype: varchar("skype", { length: 100 }),
  gender: varchar("gender", { length: 20 }),
  companyName: varchar("company_name", { length: 200 }),
  profilePictureUrl: varchar("profile_picture_url", { length: 500 }),
  resourceType: varchar("resource_type", { length: 50 }).default("Freelancer"),

  // Languages & Skills
  nativeLanguage: varchar("native_language", { length: 50 }),
  languagePreference: varchar("language_preference", { length: 50 }),
  translationSpecializations: text("translation_specializations").array(),
  otherProfessionalSkills: text("other_professional_skills").array(),
  technicalSkills: text("technical_skills").array(),
  serviceTypes: text("service_types").array(),
  software: text("software").array(),
  experienceYears: integer("experience_years"),
  education: text("education"),
  certifications: text("certifications").array(),

  // Rates & Payment
  rates: jsonb("rates").default([]),
  catDiscounts: jsonb("cat_discounts"),
  currency: varchar("currency", { length: 3 }).default("EUR"),
  minimumFee: decimal("minimum_fee", { precision: 10, scale: 2 }),
  minimumProjectFee: decimal("minimum_project_fee", { precision: 10, scale: 2 }),
  paymentInfo: jsonb("payment_info"),
  taxInfo: jsonb("tax_info"),

  // Pipeline & Status
  status: varchar("status", { length: 50 }).default("New Application"),
  stageChangedDate: timestamp("stage_changed_date", { withTimezone: true }),
  assignedTo: integer("assigned_to").references(() => users.id),
  followUpDate: date("follow_up_date"),
  followUpNote: text("follow_up_note"),

  // Quality Scores
  combinedQualityScore: decimal("combined_quality_score", { precision: 5, scale: 2 }),
  averageLqaScore: decimal("average_lqa_score", { precision: 5, scale: 2 }),
  averageQsScore: decimal("average_qs_score", { precision: 5, scale: 2 }),
  totalReviewsCount: integer("total_reviews_count").default(0),
  accountQualityScores: jsonb("account_quality_scores").default([]),
  resourceRating: decimal("resource_rating", { precision: 5, scale: 2 }),
  valueIndex: decimal("value_index", { precision: 10, scale: 4 }),
  needsQualityReview: boolean("needs_quality_review").default(false),
  qualityReviewReason: text("quality_review_reason"),

  // Documents
  cvFileUrl: varchar("cv_file_url", { length: 500 }),
  blindCvUrl: varchar("blind_cv_url", { length: 500 }),
  ndaFileUrl: varchar("nda_file_url", { length: 500 }),
  portfolioFileUrl: varchar("portfolio_file_url", { length: 500 }),
  ndaSigned: boolean("nda_signed").default(false),
  tested: boolean("tested").default(false),
  certified: boolean("certified").default(false),

  // Availability
  availability: varchar("availability", { length: 50 }),
  availableOn: date("available_on"),
  googleCalendarId: varchar("google_calendar_id", { length: 200 }),

  // Smartcat
  smartcatSupplierId: varchar("smartcat_supplier_id", { length: 200 }),

  // Accounts/Clients
  accounts: text("accounts").array(),
  specializations: text("specializations").array(),
  tags: text("tags").array(),

  // Approval
  approvedBy: integer("approved_by").references(() => users.id),
  approvedDate: timestamp("approved_date", { withTimezone: true }),

  // LQA
  canDoLqa: boolean("can_do_lqa").default(false),
  lqaLanguages: jsonb("lqa_languages"),
  lqaSpecializations: text("lqa_specializations").array(),

  // Vendor Tier (Phase 6) - premium, standard, economy, probation, blacklisted
  tier: varchar("tier", { length: 50 }).default("standard"),

  notes: text("notes"),
  specialInstructions: text("special_instructions"),

  availableFrom: date("available_from"),
  availableUntil: date("available_until"),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// Vendor Language Pairs
export const vendorLanguagePairs = pgTable("vendor_language_pairs", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull().references(() => vendors.id, { onDelete: "cascade" }),
  sourceLanguage: varchar("source_language", { length: 10 }).notNull(),
  targetLanguage: varchar("target_language", { length: 10 }).notNull(),
  isPrimary: boolean("is_primary").default(false),
}, (table) => [
  uniqueIndex("vendor_lang_pair_unique").on(table.vendorId, table.sourceLanguage, table.targetLanguage),
]);

// Vendor Rate Cards
export const vendorRateCards = pgTable("vendor_rate_cards", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull().references(() => vendors.id, { onDelete: "cascade" }),
  sourceLanguage: varchar("source_language", { length: 10 }),
  targetLanguage: varchar("target_language", { length: 10 }),
  serviceType: varchar("service_type", { length: 100 }),
  rateType: varchar("rate_type", { length: 50 }),
  rateValue: decimal("rate_value", { precision: 10, scale: 4 }).notNull(),
  ratePerWord: decimal("rate_per_word", { precision: 8, scale: 4 }),
  ratePerHour: decimal("rate_per_hour", { precision: 8, scale: 2 }),
  minimumCharge: decimal("minimum_charge", { precision: 8, scale: 2 }),
  currency: varchar("currency", { length: 3 }).default("EUR"),
  specialization: varchar("specialization", { length: 200 }),
  account: varchar("account", { length: 200 }),
  effectiveFrom: date("effective_from"),
  effectiveUntil: date("effective_until"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});

// Quality Reports
export const qualityReports = pgTable("quality_reports", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull().references(() => vendors.id),
  reviewerId: integer("reviewer_id").references(() => users.id),
  reviewerName: varchar("reviewer_name", { length: 200 }),
  reportType: varchar("report_type", { length: 20 }).notNull(),
  qsScore: decimal("qs_score", { precision: 3, scale: 1 }),
  lqaScore: decimal("lqa_score", { precision: 5, scale: 2 }),
  projectName: varchar("project_name", { length: 200 }),
  jobId: varchar("job_id", { length: 100 }),
  wordCount: integer("word_count"),
  reportDate: date("report_date"),
  contentType: varchar("content_type", { length: 100 }),
  jobType: varchar("job_type", { length: 100 }),
  clientAccount: varchar("client_account", { length: 200 }),
  sourceLanguage: varchar("source_language", { length: 10 }),
  targetLanguage: varchar("target_language", { length: 10 }),
  lqaWordsReviewed: integer("lqa_words_reviewed"),
  lqaErrors: jsonb("lqa_errors"),
  lqaEntries: jsonb("lqa_entries"),
  status: varchar("status", { length: 50 }).default("draft"),
  reviewerComments: text("reviewer_comments"),
  vendorFeedback: text("vendor_feedback"),
  translatorComments: text("translator_comments"),
  finalReviewerComments: text("final_reviewer_comments"),
  submissionDate: timestamp("submission_date", { withTimezone: true }),
  reviewDeadline: timestamp("review_deadline", { withTimezone: true }),
  finalizationDate: timestamp("finalization_date", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// Vendor Documents (compliance)
export const vendorDocuments = pgTable("vendor_documents", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 200 }).notNull(),
  docType: varchar("doc_type", { length: 100 }),
  description: text("description"),
  fileUrl: varchar("file_url", { length: 500 }),
  isActive: boolean("is_active").default(true),
  version: integer("version").default(1),
  requiresSignature: boolean("requires_signature").default(false),
  requiredForApproval: boolean("required_for_approval").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// Vendor Files (per-vendor uploaded documents: CV, NDA, certificates, etc.)
export const vendorFiles = pgTable("vendor_files", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull().references(() => vendors.id, { onDelete: "cascade" }),
  documentType: varchar("document_type", { length: 50 }), // cv, nda, certificate, test_result, contract, other
  fileName: varchar("file_name", { length: 500 }).notNull(),
  fileUrl: text("file_url"),
  fileSize: integer("file_size"),
  uploadedBy: integer("uploaded_by").references(() => users.id),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).defaultNow(),
});

// Vendor File Uploads (per-vendor uploaded files like CV, NDA, certificates)
export const vendorFileUploads = pgTable("vendor_file_uploads", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull().references(() => vendors.id, { onDelete: "cascade" }),
  fileName: varchar("file_name", { length: 500 }).notNull(),
  fileUrl: varchar("file_url", { length: 500 }).notNull(),
  docType: varchar("doc_type", { length: 100 }).notNull(),
  fileSize: integer("file_size"),
  mimeType: varchar("mime_type", { length: 200 }),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).defaultNow(),
  // Faz 2 enhancements
  documentStatus: varchar("document_status", { length: 50 }).default("pending"), // pending, approved, expired, rejected
  expiryDate: date("expiry_date"),
  uploadedBy: integer("uploaded_by").references(() => users.id),
  notes: text("notes"),
});

// Document Signatures
export const vendorDocumentSignatures = pgTable("vendor_document_signatures", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull().references(() => vendorDocuments.id),
  vendorId: integer("vendor_id").notNull().references(() => vendors.id),
  status: varchar("status", { length: 50 }).default("pending"),
  signedDate: timestamp("signed_date", { withTimezone: true }),
  signatureFileUrl: varchar("signature_file_url", { length: 500 }),
}, (table) => [
  uniqueIndex("doc_vendor_unique").on(table.documentId, table.vendorId),
]);

// Vendor Activity Log
export const vendorActivities = pgTable("vendor_activities", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull().references(() => vendors.id),
  activityType: varchar("activity_type", { length: 100 }).notNull(),
  description: text("description"),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  performedBy: integer("performed_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// Vendor Notes
export const vendorNotes = pgTable("vendor_notes", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull().references(() => vendors.id),
  content: text("content").notNull(),
  noteType: varchar("note_type", { length: 50 }).default("note"),
  visibility: varchar("visibility", { length: 50 }).default("team"),
  createdBy: integer("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// Customers (clients)
export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  entityId: integer("entity_id").references(() => entities.id),
  name: varchar("name", { length: 200 }).notNull(),
  code: varchar("code", { length: 50 }).unique(),
  clientType: varchar("client_type", { length: 50 }).default("CLIENT"),
  status: varchar("status", { length: 50 }).default("ACTIVE"),
  address: jsonb("address"),
  phone: varchar("phone", { length: 50 }),
  email: varchar("email", { length: 255 }),
  currency: varchar("currency", { length: 3 }).default("EUR"),
  paymentTermsType: varchar("payment_terms_type", { length: 50 }),
  paymentTermsDays: integer("payment_terms_days").default(30),
  vatNumber: varchar("vat_number", { length: 100 }),
  taxId: varchar("tax_id", { length: 100 }),
  minimumFee: decimal("minimum_fee", { precision: 10, scale: 2 }),
  notes: text("notes"),
  tags: text("tags").array(),
  primaryPmId: integer("primary_pm_id").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// Customer Contacts
export const customerContacts = pgTable("customer_contacts", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 200 }).notNull(),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  role: varchar("role", { length: 100 }),
  isPrimary: boolean("is_primary").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// Customer Sub-Accounts
export const customerSubAccounts = pgTable("customer_sub_accounts", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 200 }).notNull(),
  code: varchar("code", { length: 100 }),
  assignedPmId: integer("assigned_pm_id").references(() => users.id),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// PM-Customer Assignments
export const pmCustomerAssignments = pgTable("pm_customer_assignments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  customerId: integer("customer_id").notNull().references(() => customers.id),
  subAccountId: integer("sub_account_id").references(() => customerSubAccounts.id),
  isPrimary: boolean("is_primary").default(true),
  assignmentType: varchar("assignment_type", { length: 20 }).default("primary"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  uniqueIndex("pm_customer_assign_unique").on(table.userId, table.customerId, table.subAccountId),
]);

// Projects
export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  entityId: integer("entity_id").references(() => entities.id),
  customerId: integer("customer_id").notNull().references(() => customers.id),
  subAccountId: integer("sub_account_id").references(() => customerSubAccounts.id),
  projectCode: varchar("project_code", { length: 100 }),
  projectName: varchar("project_name", { length: 500 }).notNull(),
  source: varchar("source", { length: 100 }),
  externalId: varchar("external_id", { length: 200 }),
  externalUrl: varchar("external_url", { length: 500 }),
  pmId: integer("pm_id").references(() => users.id),
  status: varchar("status", { length: 50 }).default("active"),
  currency: varchar("currency", { length: 3 }).default("EUR"),
  startDate: date("start_date"),
  deadline: timestamp("deadline", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  notes: text("notes"),
  tags: text("tags").array(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// Jobs (within projects)
export const jobs = pgTable("jobs", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  jobCode: varchar("job_code", { length: 100 }),
  jobName: varchar("job_name", { length: 500 }),
  sourceLanguage: varchar("source_language", { length: 10 }),
  targetLanguage: varchar("target_language", { length: 10 }),
  serviceType: varchar("service_type", { length: 100 }),
  unitType: varchar("unit_type", { length: 50 }),
  unitCount: decimal("unit_count", { precision: 12, scale: 2 }),
  unitRate: decimal("unit_rate", { precision: 10, scale: 4 }),
  totalRevenue: decimal("total_revenue", { precision: 12, scale: 2 }),
  totalCost: decimal("total_cost", { precision: 12, scale: 2 }),
  status: varchar("status", { length: 50 }).default("unassigned"),
  deadline: timestamp("deadline", { withTimezone: true }),
  vendorId: integer("vendor_id").references(() => vendors.id),
  assignmentId: integer("assignment_id"),
  assignedAt: timestamp("assigned_at", { withTimezone: true }),
  assignedBy: integer("assigned_by"),
  vendorRate: decimal("vendor_rate", { precision: 10, scale: 4 }),
  vendorTotal: decimal("vendor_total", { precision: 12, scale: 2 }),
  clientRate: decimal("client_rate", { precision: 10, scale: 4 }),
  clientTotal: decimal("client_total", { precision: 12, scale: 2 }),
  wordCount: integer("word_count"),
  weightedWordCount: integer("weighted_word_count"),
  poId: integer("po_id"),
  invoiceId: integer("invoice_id"),
  instructions: text("instructions"),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  notes: text("notes"),
  catAnalysis: jsonb("cat_analysis"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// Purchase Orders
export const purchaseOrders = pgTable("purchase_orders", {
  id: serial("id").primaryKey(),
  entityId: integer("entity_id").references(() => entities.id),
  vendorId: integer("vendor_id").notNull().references(() => vendors.id),
  jobId: integer("job_id").references(() => jobs.id),
  projectId: integer("project_id").references(() => projects.id),
  poNumber: varchar("po_number", { length: 100 }),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("EUR"),
  status: varchar("status", { length: 50 }).default("draft"),
  paymentMethod: varchar("payment_method", { length: 50 }),
  paymentDate: date("payment_date"),
  paymentTerms: varchar("payment_terms", { length: 20 }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// Client Invoices
export const clientInvoices = pgTable("client_invoices", {
  id: serial("id").primaryKey(),
  entityId: integer("entity_id").references(() => entities.id),
  customerId: integer("customer_id").notNull().references(() => customers.id),
  invoiceNumber: varchar("invoice_number", { length: 100 }),
  invoiceDate: date("invoice_date").notNull(),
  dueDate: date("due_date"),
  subtotal: decimal("subtotal", { precision: 12, scale: 2 }),
  taxAmount: decimal("tax_amount", { precision: 12, scale: 2 }).default("0"),
  total: decimal("total", { precision: 12, scale: 2 }),
  currency: varchar("currency", { length: 3 }).default("EUR"),
  status: varchar("status", { length: 50 }).default("draft"),
  externalInvoiceUrl: varchar("external_invoice_url", { length: 500 }),
  paymentReceivedDate: date("payment_received_date"),
  paymentTerms: varchar("payment_terms", { length: 20 }).default("net_30"),
  taxRate: decimal("tax_rate", { precision: 5, scale: 2 }).default("0"),
  creditNoteFor: integer("credit_note_for"), // references another invoice for credit notes
  notes: text("notes"),
  // QBO Integration fields (Verbato Ltd only)
  qboInvoiceId: varchar("qbo_invoice_id", { length: 200 }),
  qboCustomerId: varchar("qbo_customer_id", { length: 200 }),
  qboSyncStatus: varchar("qbo_sync_status", { length: 50 }),
  qboLastSynced: timestamp("qbo_last_synced", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// Invoice Line Items
export const clientInvoiceLines = pgTable("client_invoice_lines", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").notNull().references(() => clientInvoices.id, { onDelete: "cascade" }),
  projectId: integer("project_id").references(() => projects.id),
  jobId: integer("job_id").references(() => jobs.id),
  description: text("description"),
  quantity: decimal("quantity", { precision: 12, scale: 2 }),
  unit: varchar("unit", { length: 20 }), // words, hours, pages, fixed
  unitPrice: decimal("unit_price", { precision: 10, scale: 4 }),
  amount: decimal("amount", { precision: 12, scale: 2 }),
  taxRate: decimal("tax_rate", { precision: 5, scale: 2 }).default("0"),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// Payments (tracks payments against invoices and POs)
export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  type: varchar("type", { length: 20 }).notNull(), // 'receivable' (client payment) or 'payable' (vendor payment)
  invoiceId: integer("invoice_id").references(() => clientInvoices.id),
  purchaseOrderId: integer("purchase_order_id").references(() => purchaseOrders.id),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("EUR"),
  paymentDate: date("payment_date").notNull(),
  paymentMethod: varchar("payment_method", { length: 50 }),
  reference: varchar("reference", { length: 200 }),
  notes: text("notes"),
  entityId: integer("entity_id").references(() => entities.id),
  recordedBy: integer("recorded_by"), // pmUserId who recorded it
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// PO Line Items
export const poLineItems = pgTable("po_line_items", {
  id: serial("id").primaryKey(),
  purchaseOrderId: integer("purchase_order_id").notNull().references(() => purchaseOrders.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  quantity: decimal("quantity", { precision: 12, scale: 2 }).notNull(),
  unit: varchar("unit", { length: 20 }), // words, hours, pages, fixed
  unitPrice: decimal("unit_price", { precision: 8, scale: 4 }).notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// Auto-Accept Rules — Phase 2 (replaces BeLazy)
export const autoAcceptRules = pgTable("auto_accept_rules", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  portalSource: varchar("portal_source", { length: 50 }).notNull(),
  conditions: jsonb("conditions").notNull(), // Array of {field, operator, value}
  action: varchar("action", { length: 20 }).notNull().default("approve"), // approve, ignore, manual_review
  priority: integer("priority").notNull().default(100),
  enabled: boolean("enabled").default(true),
  createdBy: varchar("created_by", { length: 100 }),
  lastModifiedBy: varchar("last_modified_by", { length: 100 }),
  lastModifiedAt: timestamp("last_modified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  matchCount: integer("match_count").default(0),
  lastMatchedAt: timestamp("last_matched_at", { withTimezone: true }),
});

// Auto-Accept Log — match history
export const autoAcceptLog = pgTable("auto_accept_log", {
  id: serial("id").primaryKey(),
  ruleId: integer("rule_id").references(() => autoAcceptRules.id),
  taskId: varchar("task_id", { length: 255 }),
  portalSource: varchar("portal_source", { length: 50 }),
  taskData: jsonb("task_data"),
  actionTaken: varchar("action_taken", { length: 20 }),
  matchedAt: timestamp("matched_at", { withTimezone: true }).defaultNow(),
});

// Portal Credentials — store connection info for external portals (APS, Symfonie, etc.)
export const portalCredentials = pgTable("portal_credentials", {
  id: serial("id").primaryKey(),
  portalSource: varchar("portal_source", { length: 50 }).notNull(),
  credentials: jsonb("credentials").notNull(),
  entityId: integer("entity_id").references(() => entities.id),
  status: varchar("status", { length: 50 }).default("disconnected"), // connected, disconnected, error
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// Portal Tasks — tasks fetched from external portals
export const portalTasks = pgTable("portal_tasks", {
  id: serial("id").primaryKey(),
  portalSource: varchar("portal_source", { length: 50 }).notNull(),
  externalId: varchar("external_id", { length: 255 }).notNull(),
  externalUrl: varchar("external_url", { length: 500 }),
  taskData: jsonb("task_data").notNull(), // Raw task data from portal
  status: varchar("status", { length: 50 }).default("pending"), // pending, auto_accepted, manually_accepted, rejected, expired
  autoAcceptRuleId: integer("auto_accept_rule_id").references(() => autoAcceptRules.id),
  projectId: integer("project_id").references(() => projects.id),
  acceptedBy: integer("accepted_by"),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  rejectionReason: text("rejection_reason"),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// Audit Log
export const auditLog = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  action: varchar("action", { length: 100 }).notNull(),
  entityType: varchar("entity_type", { length: 100 }),
  entityId: integer("entity_id"),
  oldData: jsonb("old_data"),
  newData: jsonb("new_data"),
  ipAddress: varchar("ip_address", { length: 50 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// Settings (key-value)
export const settings = pgTable("settings", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 200 }).notNull().unique(),
  value: jsonb("value").notNull(),
  category: varchar("category", { length: 100 }),
  description: text("description"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// Vendor Sessions (magic link for linguist portal)
export const vendorSessions = pgTable("vendor_sessions", {
  id: serial("id").primaryKey(),
  token: varchar("token", { length: 255 }).notNull().unique(),
  vendorId: integer("vendor_id").notNull().references(() => vendors.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// Notifications (new version with user/vendor targeting)
export const notificationsV2 = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  pmUserId: integer("pm_user_id"),
  vendorId: integer("vendor_id").references(() => vendors.id),
  type: varchar("type", { length: 100 }).notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  message: text("message"),
  link: varchar("link", { length: 500 }),
  metadata: jsonb("metadata"),
  read: boolean("read").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// Customer Rate Cards
export const customerRateCards = pgTable("customer_rate_cards", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  sourceLanguage: varchar("source_language", { length: 10 }),
  targetLanguage: varchar("target_language", { length: 10 }),
  serviceType: varchar("service_type", { length: 100 }),
  rateType: varchar("rate_type", { length: 50 }),
  rateValue: decimal("rate_value", { precision: 10, scale: 4 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("EUR"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// Vendor Availability Calendar
export const vendorAvailability = pgTable("vendor_availability", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull().references(() => vendors.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  status: varchar("status", { length: 20 }).default("available"), // available, unavailable, limited
  hoursAvailable: integer("hours_available"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  uniqueIndex("vendor_avail_date_unique").on(table.vendorId, table.date),
]);

// ============================================
// QUIZ SYSTEM (Faz 2)
// ============================================
export const quizzes = pgTable("quizzes", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 300 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 100 }),
  timeLimit: integer("time_limit"), // minutes
  passingScore: integer("passing_score").default(70),
  isActive: boolean("is_active").default(true),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const quizQuestions = pgTable("quiz_questions", {
  id: serial("id").primaryKey(),
  quizId: integer("quiz_id").notNull().references(() => quizzes.id, { onDelete: "cascade" }),
  questionText: text("question_text").notNull(),
  questionType: varchar("question_type", { length: 50 }).notNull().default("multiple_choice"), // multiple_choice, true_false
  options: jsonb("options").default([]), // array of {label, value}
  correctAnswers: text("correct_answers").array(), // array of correct option values
  points: integer("points").default(1),
  orderIndex: integer("order_index").default(0),
});

export const quizAssignments = pgTable("quiz_assignments", {
  id: serial("id").primaryKey(),
  quizId: integer("quiz_id").notNull().references(() => quizzes.id, { onDelete: "cascade" }),
  vendorId: integer("vendor_id").notNull().references(() => vendors.id, { onDelete: "cascade" }),
  assignedBy: integer("assigned_by").references(() => users.id),
  assignedAt: timestamp("assigned_at", { withTimezone: true }).defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  status: varchar("status", { length: 50 }).default("assigned"), // assigned, in_progress, completed, expired
  token: varchar("token", { length: 255 }).notNull().unique(),
});

export const quizAttempts = pgTable("quiz_attempts", {
  id: serial("id").primaryKey(),
  assignmentId: integer("assignment_id").notNull().references(() => quizAssignments.id, { onDelete: "cascade" }),
  vendorId: integer("vendor_id").notNull().references(() => vendors.id, { onDelete: "cascade" }),
  quizId: integer("quiz_id").notNull().references(() => quizzes.id, { onDelete: "cascade" }),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  score: integer("score"),
  maxScore: integer("max_score"),
  passed: boolean("passed"),
  answers: jsonb("answers").default([]), // array of {questionId, selectedAnswers, correct}
});

// ============================================
// VENDOR APPLICATIONS (Faz 2)
// ============================================
export const vendorApplications = pgTable("vendor_applications", {
  id: serial("id").primaryKey(),
  // Personal Info
  fullName: varchar("full_name", { length: 200 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 50 }),
  location: varchar("location", { length: 200 }),
  timezone: varchar("timezone", { length: 100 }),
  website: varchar("website", { length: 500 }),
  linkedin: varchar("linkedin", { length: 500 }),
  // Languages
  nativeLanguage: varchar("native_language", { length: 50 }),
  languagePairs: jsonb("language_pairs").default([]), // [{source, target, proficiency}]
  // Services & Skills
  serviceTypes: text("service_types").array(),
  specializations: text("specializations").array(),
  software: jsonb("software").default([]), // [{name, proficiency}]
  // Experience
  experienceYears: integer("experience_years"),
  education: text("education"),
  certifications: text("certifications").array(),
  cvFileUrl: text("cv_file_url"),
  // Rates
  ratePerWord: decimal("rate_per_word", { precision: 8, scale: 4 }),
  ratePerHour: decimal("rate_per_hour", { precision: 8, scale: 2 }),
  minimumFee: decimal("minimum_fee", { precision: 10, scale: 2 }),
  currency: varchar("currency", { length: 3 }).default("EUR"),
  // Status
  status: varchar("status", { length: 50 }).default("pending"), // pending, reviewed, accepted, rejected
  vendorId: integer("vendor_id").references(() => vendors.id), // linked vendor once created
  reviewedBy: integer("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  notes: text("notes"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ============================================
// VENDOR STAGE HISTORY (Faz 2)
// ============================================
export const vendorStageHistory = pgTable("vendor_stage_history", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull().references(() => vendors.id, { onDelete: "cascade" }),
  fromStage: varchar("from_stage", { length: 50 }),
  toStage: varchar("to_stage", { length: 50 }).notNull(),
  changedBy: integer("changed_by").references(() => users.id),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ============================================
// FILTER PRESETS (Faz 2)
// ============================================
export const vendorFilterPresets = pgTable("vendor_filter_presets", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  filters: jsonb("filters").notNull(), // serialized filter state
  createdBy: integer("created_by").references(() => users.id),
  isShared: boolean("is_shared").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ============================================
// INSERT SCHEMAS (Zod)
// ============================================
export const insertPmUserSchema = createInsertSchema(pmUsers).omit({ id: true });
export const insertSheetConfigSchema = createInsertSchema(sheetConfigs).omit({ id: true });
export const insertEmailTemplateSchema = createInsertSchema(emailTemplates).omit({ id: true });
export const insertSequencePresetSchema = createInsertSchema(sequencePresets).omit({ id: true });
export const insertAutoAssignRuleSchema = createInsertSchema(autoAssignRules).omit({ id: true });
export const insertAssignmentSchema = createInsertSchema(assignments).omit({ id: true });
export const insertOfferSchema = createInsertSchema(offers).omit({ id: true });
export const insertAuthTokenSchema = createInsertSchema(authTokens).omit({ id: true });
export const insertSessionSchema = createInsertSchema(sessions).omit({ id: true });
export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true });
export const insertFreelancerSessionSchema = createInsertSchema(freelancerSessions).omit({ id: true });

// New table schemas
export const insertEntitySchema = createInsertSchema(entities).omit({ id: true });
export const insertUserSchema = createInsertSchema(users).omit({ id: true });
export const insertVendorSchema = createInsertSchema(vendors).omit({ id: true });
export const insertVendorLanguagePairSchema = createInsertSchema(vendorLanguagePairs).omit({ id: true });
export const insertVendorRateCardSchema = createInsertSchema(vendorRateCards).omit({ id: true });
export const insertQualityReportSchema = createInsertSchema(qualityReports).omit({ id: true });
export const insertVendorDocumentSchema = createInsertSchema(vendorDocuments).omit({ id: true });
export const insertVendorFileUploadSchema = createInsertSchema(vendorFileUploads).omit({ id: true });
export const insertVendorDocumentSignatureSchema = createInsertSchema(vendorDocumentSignatures).omit({ id: true });
export const insertVendorActivitySchema = createInsertSchema(vendorActivities).omit({ id: true });
export const insertVendorNoteSchema = createInsertSchema(vendorNotes).omit({ id: true });
export const insertCustomerSchema = createInsertSchema(customers).omit({ id: true });
export const insertCustomerContactSchema = createInsertSchema(customerContacts).omit({ id: true });
export const insertCustomerSubAccountSchema = createInsertSchema(customerSubAccounts).omit({ id: true });
export const insertPmCustomerAssignmentSchema = createInsertSchema(pmCustomerAssignments).omit({ id: true });
export const insertProjectSchema = createInsertSchema(projects).omit({ id: true });
export const insertJobSchema = createInsertSchema(jobs).omit({ id: true });
export const insertPurchaseOrderSchema = createInsertSchema(purchaseOrders).omit({ id: true });
export const insertClientInvoiceSchema = createInsertSchema(clientInvoices).omit({ id: true });
export const insertClientInvoiceLineSchema = createInsertSchema(clientInvoiceLines).omit({ id: true });
export const insertPaymentSchema = createInsertSchema(payments).omit({ id: true });
export const insertAutoAcceptRuleSchema = createInsertSchema(autoAcceptRules).omit({ id: true });
export const insertAutoAcceptLogSchema = createInsertSchema(autoAcceptLog).omit({ id: true });
export const insertPortalCredentialSchema = createInsertSchema(portalCredentials).omit({ id: true });
export const insertPortalTaskSchema = createInsertSchema(portalTasks).omit({ id: true });
export const insertAuditLogSchema = createInsertSchema(auditLog).omit({ id: true });
export const insertSettingSchema = createInsertSchema(settings).omit({ id: true });
export const insertVendorSessionSchema = createInsertSchema(vendorSessions).omit({ id: true });
export const insertCustomerRateCardSchema = createInsertSchema(customerRateCards).omit({ id: true });
export const insertVendorFileSchema = createInsertSchema(vendorFiles).omit({ id: true });
export const insertPoLineItemSchema = createInsertSchema(poLineItems).omit({ id: true });
export const insertVendorAvailabilitySchema = createInsertSchema(vendorAvailability).omit({ id: true });

// Faz 2 insert schemas
export const insertQuizSchema = createInsertSchema(quizzes).omit({ id: true });
export const insertQuizQuestionSchema = createInsertSchema(quizQuestions).omit({ id: true });
export const insertQuizAssignmentSchema = createInsertSchema(quizAssignments).omit({ id: true });
export const insertQuizAttemptSchema = createInsertSchema(quizAttempts).omit({ id: true });
export const insertVendorApplicationSchema = createInsertSchema(vendorApplications).omit({ id: true });
export const insertVendorStageHistorySchema = createInsertSchema(vendorStageHistory).omit({ id: true });
export const insertVendorFilterPresetSchema = createInsertSchema(vendorFilterPresets).omit({ id: true });

// ============================================
// TYPES
// ============================================
export type PmUser = typeof pmUsers.$inferSelect;
export type InsertPmUser = z.infer<typeof insertPmUserSchema>;
export type Assignment = typeof assignments.$inferSelect;
export type InsertAssignment = z.infer<typeof insertAssignmentSchema>;
export type Offer = typeof offers.$inferSelect;
export type InsertOffer = z.infer<typeof insertOfferSchema>;
export type AuthToken = typeof authTokens.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type SheetConfig = typeof sheetConfigs.$inferSelect;
export type InsertSheetConfig = z.infer<typeof insertSheetConfigSchema>;
export type EmailTemplate = typeof emailTemplates.$inferSelect;
export type InsertEmailTemplate = z.infer<typeof insertEmailTemplateSchema>;
export type SequencePreset = typeof sequencePresets.$inferSelect;
export type InsertSequencePreset = z.infer<typeof insertSequencePresetSchema>;
export type AutoAssignRule = typeof autoAssignRules.$inferSelect;
export type InsertAutoAssignRule = z.infer<typeof insertAutoAssignRuleSchema>;
export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type FreelancerSession = typeof freelancerSessions.$inferSelect;

// New types
export type Entity = typeof entities.$inferSelect;
export type InsertEntity = z.infer<typeof insertEntitySchema>;
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Vendor = typeof vendors.$inferSelect;
export type InsertVendor = z.infer<typeof insertVendorSchema>;
export type VendorLanguagePair = typeof vendorLanguagePairs.$inferSelect;
export type VendorRateCard = typeof vendorRateCards.$inferSelect;
export type QualityReport = typeof qualityReports.$inferSelect;
export type VendorDocument = typeof vendorDocuments.$inferSelect;
export type VendorFileUpload = typeof vendorFileUploads.$inferSelect;
export type VendorDocumentSignature = typeof vendorDocumentSignatures.$inferSelect;
export type VendorActivity = typeof vendorActivities.$inferSelect;
export type VendorNote = typeof vendorNotes.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type CustomerContact = typeof customerContacts.$inferSelect;
export type CustomerSubAccount = typeof customerSubAccounts.$inferSelect;
export type PmCustomerAssignment = typeof pmCustomerAssignments.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type ClientInvoice = typeof clientInvoices.$inferSelect;
export type ClientInvoiceLine = typeof clientInvoiceLines.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type AutoAcceptRule = typeof autoAcceptRules.$inferSelect;
export type AutoAcceptLogEntry = typeof autoAcceptLog.$inferSelect;
export type PortalCredential = typeof portalCredentials.$inferSelect;
export type PortalTask = typeof portalTasks.$inferSelect;
export type AuditLogEntry = typeof auditLog.$inferSelect;
export type Setting = typeof settings.$inferSelect;
export type VendorSession = typeof vendorSessions.$inferSelect;
export type NotificationV2 = typeof notificationsV2.$inferSelect;
export type CustomerRateCard = typeof customerRateCards.$inferSelect;
export type VendorFile = typeof vendorFiles.$inferSelect;
export type PoLineItem = typeof poLineItems.$inferSelect;
export type VendorAvailability = typeof vendorAvailability.$inferSelect;

// Faz 2 types
export type Quiz = typeof quizzes.$inferSelect;
export type InsertQuiz = z.infer<typeof insertQuizSchema>;
export type QuizQuestion = typeof quizQuestions.$inferSelect;
export type InsertQuizQuestion = z.infer<typeof insertQuizQuestionSchema>;
export type QuizAssignment = typeof quizAssignments.$inferSelect;
export type InsertQuizAssignment = z.infer<typeof insertQuizAssignmentSchema>;
export type QuizAttempt = typeof quizAttempts.$inferSelect;
export type InsertQuizAttempt = z.infer<typeof insertQuizAttemptSchema>;
export type VendorApplication = typeof vendorApplications.$inferSelect;
export type InsertVendorApplication = z.infer<typeof insertVendorApplicationSchema>;
export type VendorStageHistory = typeof vendorStageHistory.$inferSelect;
export type VendorFilterPreset = typeof vendorFilterPresets.$inferSelect;
