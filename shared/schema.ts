import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// PM users who can log in
export const pmUsers = sqliteTable("pm_users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  initial: text("initial").default(""), // Short code written to sheet on self-assign (e.g. "CY", "AK")
  password: text("password").notNull().default(""),
  role: text("role").notNull().default("pm"), // "pm" | "admin"
  defaultFilter: text("default_filter").default("ongoing"), // "ongoing" | "unassigned" | "needs_tr" | "needs_rev" | "assigned" | "all"
  defaultMyProjects: integer("default_my_projects").default(0), // 0 or 1
});

// Magic link tokens for authentication
export const authTokens = sqliteTable("auth_tokens", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  token: text("token").notNull().unique(),
  email: text("email").notNull(),
  expiresAt: text("expires_at").notNull(),
  used: integer("used").notNull().default(0),
  clientBaseUrl: text("client_base_url"), // The frontend URL to redirect back to
});

// Sessions
export const sessions = sqliteTable("sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  token: text("token").notNull().unique(),
  pmUserId: integer("pm_user_id").notNull(),
  expiresAt: text("expires_at").notNull(),
});

// Task assignments - the core of the distribution system
export const assignments = sqliteTable("assignments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  // Task identification
  source: text("source").notNull(), // "Amazon" | "AppleCare"
  sheet: text("sheet").notNull(), // e.g., "non-AFT", "Assignments"
  projectId: text("project_id").notNull(),
  account: text("account").notNull(),
  // Task details (snapshot from sheet)
  taskDetails: text("task_details").notNull(), // JSON with all task fields
  // Assignment config
  assignmentType: text("assignment_type").notNull(), // "direct" | "sequence" | "broadcast"
  role: text("role").notNull(), // "translator" | "reviewer"
  // Status tracking
  status: text("status").notNull().default("pending"), // "pending" | "offered" | "accepted" | "completed" | "cancelled" | "expired"
  // Who
  assignedBy: integer("assigned_by").notNull(), // PM user id
  acceptedBy: text("accepted_by"), // freelancer resource_code
  acceptedByName: text("accepted_by_name"),
  acceptedByEmail: text("accepted_by_email"),
  // Sequence config (JSON array of freelancer codes in order)
  sequenceList: text("sequence_list"), // JSON: ["CY1", "MP", "BS"]
  currentSequenceIndex: integer("current_sequence_index").default(0),
  sequenceTimeoutMinutes: integer("sequence_timeout_minutes").default(60),
  // Broadcast config (JSON array of all freelancers notified)
  broadcastList: text("broadcast_list"), // JSON: ["CY1", "MP", "BS"]
  // Auto-review config
  autoAssignReviewer: integer("auto_assign_reviewer").default(0),
  reviewerAssignmentType: text("reviewer_assignment_type"), // same options
  reviewerSequenceList: text("reviewer_sequence_list"), // JSON
  // Review type selected by PM at assignment time
  reviewType: text("review_type"), // "Full Review" | "Self-Edit" | "LQA" | "QA"
  // Timestamps
  createdAt: text("created_at").notNull(),
  offeredAt: text("offered_at"),
  acceptedAt: text("accepted_at"),
  completedAt: text("completed_at"),
  // Linked reviewer assignment (created when translator completes)
  linkedReviewerAssignmentId: integer("linked_reviewer_assignment_id"),
});

// Individual offers sent to freelancers
export const offers = sqliteTable("offers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  assignmentId: integer("assignment_id").notNull(),
  freelancerCode: text("freelancer_code").notNull(),
  freelancerName: text("freelancer_name").notNull(),
  freelancerEmail: text("freelancer_email").notNull(),
  // Token for accept/reject link
  token: text("token").notNull().unique(),
  status: text("status").notNull().default("pending"), // "pending" | "accepted" | "rejected" | "expired" | "withdrawn"
  sentAt: text("sent_at").notNull(),
  respondedAt: text("responded_at"),
  sequenceOrder: integer("sequence_order"), // position in sequence (null for broadcast)
  clientBaseUrl: text("client_base_url"), // The frontend URL for the respond page
});

// Email templates — editable by admin
export const emailTemplates = sqliteTable("email_templates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull().unique(), // "offer_translator", "offer_reviewer"
  subject: text("subject").notNull(),
  body: text("body").notNull(), // HTML with {{placeholders}}
});

// Sequence presets — saved freelancer sequences for quick reuse
export const sequencePresets = sqliteTable("sequence_presets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  pmEmail: text("pm_email").notNull(), // owner PM
  role: text("role").notNull(), // "translator" | "reviewer"
  freelancerCodes: text("freelancer_codes").notNull(), // JSON array of resource codes
  assignmentType: text("assignment_type").notNull().default("sequence"),
});

// Auto-assign rules
export const autoAssignRules = sqliteTable("auto_assign_rules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  source: text("source"), // null = any source
  account: text("account"), // null = any account  
  languagePair: text("language_pair"), // null = any
  role: text("role").notNull(), // "translator" | "reviewer"
  freelancerCodes: text("freelancer_codes").notNull(), // JSON array
  assignmentType: text("assignment_type").notNull().default("sequence"),
  maxWwc: integer("max_wwc"), // Only apply if WWC <= this (null = any)
  enabled: integer("enabled").notNull().default(1),
  createdBy: text("created_by").notNull(),
});

// Sheet config — language pairs per source/tab
export const sheetConfigs = sqliteTable("sheet_configs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  source: text("source").notNull(), // "Amazon" | "AppleCare" or custom name
  sheet: text("sheet").notNull(),   // Tab name in the spreadsheet
  languagePair: text("language_pair").notNull().default("EN>TR"),
  sheetDbId: text("sheetdb_id"),    // SheetDB API ID (e.g. "mukq6ww3ssuk0")
  googleSheetUrl: text("google_sheet_url"), // Original Google Sheet URL for reference
  assignedPms: text("assigned_pms"), // JSON array of PM emails, e.g. ["cenk@eltur.co"]. null = visible to all.
});

// PM internal notes on tasks (stored in DB, not sheet)
export const taskNotes = sqliteTable("task_notes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  source: text("source").notNull(),
  sheet: text("sheet").notNull(),
  projectId: text("project_id").notNull(),
  pmEmail: text("pm_email").notNull(),
  note: text("note").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// PM favorite freelancers
export const pmFavorites = sqliteTable("pm_favorites", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  pmEmail: text("pm_email").notNull(),
  freelancerCode: text("freelancer_code").notNull(),
  createdAt: text("created_at").notNull(),
});

// Schemas
export const insertPmUserSchema = createInsertSchema(pmUsers).omit({ id: true });
export const insertSheetConfigSchema = createInsertSchema(sheetConfigs).omit({ id: true });
export const insertEmailTemplateSchema = createInsertSchema(emailTemplates).omit({ id: true });
export const insertSequencePresetSchema = createInsertSchema(sequencePresets).omit({ id: true });
export const insertAutoAssignRuleSchema = createInsertSchema(autoAssignRules).omit({ id: true });
export const insertAssignmentSchema = createInsertSchema(assignments).omit({ id: true });
export const insertOfferSchema = createInsertSchema(offers).omit({ id: true });
export const insertAuthTokenSchema = createInsertSchema(authTokens).omit({ id: true });
export const insertSessionSchema = createInsertSchema(sessions).omit({ id: true });

// Types
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
