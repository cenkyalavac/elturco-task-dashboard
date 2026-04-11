-- ============================================================
-- Dispatch 2.0 TBMS — Initial Database Schema
-- El Turco Translation Services
-- Created: 2026-04-11
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";    -- fuzzy text search
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- encryption utilities

-- ============================================================
-- ENUM TYPES
-- ============================================================

CREATE TYPE project_state AS ENUM (
    'draft', 'quoted', 'ordered', 'in_progress', 'completed', 
    'approved', 'canceled', 'on_hold'
);

CREATE TYPE task_state AS ENUM (
    'draft', 'heads_up', 'ordered', 'in_progress', 'completed',
    'approved', 'canceled', 'rejected', 'on_hold'
);

CREATE TYPE task_type AS ENUM (
    'translation', 'review', 'mtpe', 'engineering', 'dtp',
    'arbitration', 'bug_fixing', 'custom'
);

CREATE TYPE file_type AS ENUM (
    'source', 'target', 'reference', 'analysis', 'other'
);

CREATE TYPE po_state AS ENUM (
    'draft', 'sent', 'accepted', 'rejected', 'completed', 'paid'
);

CREATE TYPE invoice_state AS ENUM (
    'draft', 'pending', 'approved', 'sent', 'paid', 'disputed'
);

CREATE TYPE sync_source AS ENUM (
    'symfonie', 'belazy', 'manual', 'dispatch'
);

CREATE TYPE vendor_status AS ENUM (
    'active', 'inactive', 'blacklisted', 'pending'
);

-- ============================================================
-- 1. CUSTOMERS (Müşteriler — Symfonie üzerinden gelen)
-- ============================================================

CREATE TABLE customers (
    id              SERIAL PRIMARY KEY,
    symfonie_id     INTEGER UNIQUE,          -- Symfonie customer ID
    name            VARCHAR(255) NOT NULL,
    code            VARCHAR(50),             -- Symfonie customer code (e.g. Z02314)
    email           VARCHAR(255),
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_customers_symfonie ON customers(symfonie_id);
CREATE INDEX idx_customers_name ON customers USING gin(name gin_trgm_ops);

-- ============================================================
-- 2. PROJECTS (Projeler)
-- ============================================================

CREATE TABLE projects (
    id              SERIAL PRIMARY KEY,
    symfonie_id     INTEGER UNIQUE,          -- Symfonie project ID
    belazy_id       VARCHAR(100),            -- BeLazy project ID (geçiş dönemi)
    customer_id     INTEGER REFERENCES customers(id),
    name            VARCHAR(500) NOT NULL,
    code            VARCHAR(50),             -- Symfonie project code
    state           project_state DEFAULT 'ordered',
    source_language VARCHAR(10),             -- e.g. 'en-US', 'en'
    target_languages TEXT[],                 -- array of target language codes
    notes           TEXT,
    pm_user_id      INTEGER,                -- internal PM user ID
    sync_source     sync_source DEFAULT 'symfonie',
    symfonie_data   JSONB,                  -- raw Symfonie project data
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_projects_symfonie ON projects(symfonie_id);
CREATE INDEX idx_projects_belazy ON projects(belazy_id);
CREATE INDEX idx_projects_customer ON projects(customer_id);
CREATE INDEX idx_projects_state ON projects(state);
CREATE INDEX idx_projects_name ON projects USING gin(name gin_trgm_ops);

-- ============================================================
-- 3. JOBS (İşler — Symfonie Job seviyesi)
-- ============================================================

CREATE TABLE jobs (
    id              SERIAL PRIMARY KEY,
    symfonie_id     INTEGER UNIQUE,          -- Symfonie job ID
    project_id      INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    name            VARCHAR(500) NOT NULL,
    external_id     VARCHAR(255),            -- ATMS ID, etc.
    state           VARCHAR(50),             -- Symfonie job state
    source_language VARCHAR(10),
    target_languages TEXT[],
    description     TEXT,
    start_date      TIMESTAMPTZ,
    due_date        TIMESTAMPTZ,
    completed_date  TIMESTAMPTZ,
    symfonie_data   JSONB,                  -- raw data for fields we don't map
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_jobs_symfonie ON jobs(symfonie_id);
CREATE INDEX idx_jobs_project ON jobs(project_id);
CREATE INDEX idx_jobs_state ON jobs(state);
CREATE INDEX idx_jobs_due_date ON jobs(due_date);

-- ============================================================
-- 4. VENDORS / FREELANCERS (Çevirmenler)
-- ============================================================

CREATE TABLE vendors (
    id              SERIAL PRIMARY KEY,
    symfonie_id     INTEGER UNIQUE,          -- Symfonie user ID
    elts_id         VARCHAR(100),            -- ELTS/Base44 ID
    name            VARCHAR(255) NOT NULL,
    email           VARCHAR(255),
    company_name    VARCHAR(255),            -- e.g. "Verbato Ltd"
    company_code    VARCHAR(50),
    status          vendor_status DEFAULT 'active',
    languages       TEXT[],                  -- language pairs
    specializations TEXT[],                  -- domain expertise
    rate_per_word   DECIMAL(10,5),           -- default rate
    currency        VARCHAR(3) DEFAULT 'EUR',
    notes           TEXT,
    -- ATMS/Phrase credentials mapping
    atms_username   VARCHAR(255),            -- Amazon ATMS username
    phrase_uid      VARCHAR(255),            -- Phrase user ID
    symfonie_login  VARCHAR(255),            -- e.g. "MNET\\CeYalavac"
    symfonie_data   JSONB,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_vendors_symfonie ON vendors(symfonie_id);
CREATE INDEX idx_vendors_elts ON vendors(elts_id);
CREATE INDEX idx_vendors_email ON vendors(email);
CREATE INDEX idx_vendors_name ON vendors USING gin(name gin_trgm_ops);
CREATE INDEX idx_vendors_status ON vendors(status);

-- ============================================================
-- 5. TASKS (Görevler — ana iş birimi)
-- ============================================================

CREATE TABLE tasks (
    id              SERIAL PRIMARY KEY,
    symfonie_id     INTEGER UNIQUE,          -- Symfonie task ID
    belazy_id       VARCHAR(100),
    job_id          INTEGER REFERENCES jobs(id) ON DELETE CASCADE,
    project_id      INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    vendor_id       INTEGER REFERENCES vendors(id),
    name            VARCHAR(500) NOT NULL,
    task_type       task_type DEFAULT 'translation',
    state           task_state DEFAULT 'ordered',
    source_language VARCHAR(10),
    target_language VARCHAR(10),             -- single target per task
    description     TEXT,
    instructions    TEXT,                    -- task-specific instructions
    -- Dates
    start_date      TIMESTAMPTZ,
    due_date        TIMESTAMPTZ,
    accepted_date   TIMESTAMPTZ,
    completed_date  TIMESTAMPTZ,
    approved_date   TIMESTAMPTZ,
    -- Word counts
    total_words     INTEGER DEFAULT 0,
    weighted_words  DECIMAL(10,2) DEFAULT 0,
    -- Tags & metadata
    tags            TEXT[],                  -- Symfonie tags
    service_tag     VARCHAR(255),
    -- External references
    atms_url        VARCHAR(500),            -- Amazon ATMS link
    atms_external_id VARCHAR(100),           -- ATMS project ID
    phrase_job_url  VARCHAR(500),            -- Phrase/MemSource link
    -- Custom fields from Symfonie (flexible storage)
    custom_fields   JSONB DEFAULT '{}',
    symfonie_data   JSONB,
    sync_source     sync_source DEFAULT 'symfonie',
    -- Tracking
    deadline_changed_at TIMESTAMPTZ,         -- son deadline değişikliği
    previous_due_date   TIMESTAMPTZ,         -- önceki deadline
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tasks_symfonie ON tasks(symfonie_id);
CREATE INDEX idx_tasks_belazy ON tasks(belazy_id);
CREATE INDEX idx_tasks_job ON tasks(job_id);
CREATE INDEX idx_tasks_project ON tasks(project_id);
CREATE INDEX idx_tasks_vendor ON tasks(vendor_id);
CREATE INDEX idx_tasks_state ON tasks(state);
CREATE INDEX idx_tasks_due_date ON tasks(due_date);
CREATE INDEX idx_tasks_target_lang ON tasks(target_language);
CREATE INDEX idx_tasks_type ON tasks(task_type);
CREATE INDEX idx_tasks_tags ON tasks USING gin(tags);
CREATE INDEX idx_tasks_custom_fields ON tasks USING gin(custom_fields);

-- ============================================================
-- 6. TASK ATTACHMENTS (Dosyalar)
-- ============================================================

CREATE TABLE task_attachments (
    id              SERIAL PRIMARY KEY,
    symfonie_id     INTEGER UNIQUE,          -- Symfonie attachment ID
    task_id         INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
    file_name       VARCHAR(500) NOT NULL,
    file_type       file_type DEFAULT 'other',
    mime_type       VARCHAR(100),
    file_size       BIGINT,                  -- bytes
    checksum        VARCHAR(128),
    download_url    VARCHAR(1000),           -- Symfonie download URL
    -- TMS integration
    tms_name        VARCHAR(100),            -- e.g. "MemSource"
    tms_file_id     INTEGER,
    tms_status      VARCHAR(50),             -- Ready, InProgress, Downloaded, etc.
    -- Local storage (opsiyonel — dosyayı kendimiz de saklayabiliriz)
    local_path      VARCHAR(500),
    symfonie_data   JSONB,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_attachments_symfonie ON task_attachments(symfonie_id);
CREATE INDEX idx_attachments_task ON task_attachments(task_id);
CREATE INDEX idx_attachments_file_type ON task_attachments(file_type);

-- ============================================================
-- 7. WORD COUNT ANALYSES (Kelime Sayısı Analizleri)
-- ============================================================

CREATE TABLE word_count_analyses (
    id              SERIAL PRIMARY KEY,
    symfonie_id     INTEGER UNIQUE,
    task_id         INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
    attachment_id   INTEGER REFERENCES task_attachments(id),
    parser          VARCHAR(50),             -- MemSource, TradosStudio, etc.
    -- Breakdown
    total_words     INTEGER DEFAULT 0,
    context_tm      INTEGER DEFAULT 0,       -- 101% / Context TM
    repetitions     INTEGER DEFAULT 0,
    match_100       INTEGER DEFAULT 0,       -- 100%
    match_95_99     INTEGER DEFAULT 0,       -- 95-99%
    match_85_94     INTEGER DEFAULT 0,       -- 85-94%
    match_75_84     INTEGER DEFAULT 0,       -- 75-84%
    match_50_74     INTEGER DEFAULT 0,       -- 50-74%
    no_match        INTEGER DEFAULT 0,       -- New words
    -- Weighted
    weighted_total  DECIMAL(10,2) DEFAULT 0,
    -- Raw data
    raw_data        JSONB,                   -- full breakdown from Symfonie
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_wca_task ON word_count_analyses(task_id);
CREATE INDEX idx_wca_symfonie ON word_count_analyses(symfonie_id);

-- ============================================================
-- 8. FINANCIALS — PURCHASE ORDERS (Satın Alma)
-- ============================================================

CREATE TABLE purchase_orders (
    id              SERIAL PRIMARY KEY,
    symfonie_id     INTEGER UNIQUE,          -- Symfonie TaskAmount ID
    task_id         INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
    vendor_id       INTEGER REFERENCES vendors(id),
    -- PO Details
    po_number       VARCHAR(100),
    state           po_state DEFAULT 'draft',
    billing_unit    VARCHAR(20) DEFAULT 'word', -- word, hour, page, etc.
    quantity        DECIMAL(12,5) DEFAULT 0,
    weighted_quantity DECIMAL(12,5) DEFAULT 0,
    unit_cost       DECIMAL(10,5) DEFAULT 0,
    currency        VARCHAR(3) DEFAULT 'EUR',
    total_cost      DECIMAL(12,2) DEFAULT 0,
    total_cost_usd  DECIMAL(12,2) DEFAULT 0,
    discount        DECIMAL(5,2) DEFAULT 0,
    is_billable     BOOLEAN DEFAULT TRUE,
    -- Segment & activity
    segment_id      INTEGER,
    activity_no     VARCHAR(20),
    -- Dates
    approved_at     TIMESTAMPTZ,
    post_date       TIMESTAMPTZ,
    -- Error tracking
    error_message   TEXT,
    -- TER / Updated financials
    ter_score       DECIMAL(5,2),            -- TER result
    original_cost   DECIMAL(12,2),           -- cost before TER adjustment
    adjusted_cost   DECIMAL(12,2),           -- cost after TER adjustment
    -- Raw
    symfonie_data   JSONB,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_po_task ON purchase_orders(task_id);
CREATE INDEX idx_po_vendor ON purchase_orders(vendor_id);
CREATE INDEX idx_po_state ON purchase_orders(state);
CREATE INDEX idx_po_symfonie ON purchase_orders(symfonie_id);

-- ============================================================
-- 9. FINANCIALS — SALES ORDERS (Satış / Fatura tarafı)
-- ============================================================

CREATE TABLE sales_orders (
    id              SERIAL PRIMARY KEY,
    symfonie_id     INTEGER UNIQUE,
    task_id         INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
    so_number       VARCHAR(100),
    state           VARCHAR(50) DEFAULT 'draft',
    unit_cost       DECIMAL(10,5) DEFAULT 0,
    total_price     DECIMAL(12,2) DEFAULT 0,
    currency        VARCHAR(3) DEFAULT 'EUR',
    is_billable     BOOLEAN DEFAULT TRUE,
    segment_id      INTEGER,
    activity_no     VARCHAR(20),
    approved_at     TIMESTAMPTZ,
    post_date       TIMESTAMPTZ,
    symfonie_data   JSONB,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_so_task ON sales_orders(task_id);
CREATE INDEX idx_so_symfonie ON sales_orders(symfonie_id);

-- ============================================================
-- 10. INVOICES (Faturalar — Dispatch tarafından oluşturulan)
-- ============================================================

CREATE TABLE invoices (
    id              SERIAL PRIMARY KEY,
    invoice_number  VARCHAR(50) UNIQUE NOT NULL,
    vendor_id       INTEGER REFERENCES vendors(id),
    state           invoice_state DEFAULT 'draft',
    currency        VARCHAR(3) DEFAULT 'EUR',
    subtotal        DECIMAL(12,2) DEFAULT 0,
    tax_rate        DECIMAL(5,2) DEFAULT 0,
    tax_amount      DECIMAL(12,2) DEFAULT 0,
    total           DECIMAL(12,2) DEFAULT 0,
    -- Period
    period_start    DATE,
    period_end      DATE,
    issue_date      DATE,
    due_date        DATE,
    paid_date       DATE,
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_invoices_vendor ON invoices(vendor_id);
CREATE INDEX idx_invoices_state ON invoices(state);
CREATE INDEX idx_invoices_period ON invoices(period_start, period_end);

-- ============================================================
-- 11. INVOICE LINES (Fatura kalemleri)
-- ============================================================

CREATE TABLE invoice_lines (
    id              SERIAL PRIMARY KEY,
    invoice_id      INTEGER REFERENCES invoices(id) ON DELETE CASCADE,
    task_id         INTEGER REFERENCES tasks(id),
    po_id           INTEGER REFERENCES purchase_orders(id),
    description     VARCHAR(500),
    quantity        DECIMAL(12,5) DEFAULT 0,
    unit_price      DECIMAL(10,5) DEFAULT 0,
    total           DECIMAL(12,2) DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_invoice_lines_invoice ON invoice_lines(invoice_id);
CREATE INDEX idx_invoice_lines_task ON invoice_lines(task_id);

-- ============================================================
-- 12. COMMENTS (Yorum/Mesaj geçmişi)
-- ============================================================

CREATE TABLE comments (
    id              SERIAL PRIMARY KEY,
    symfonie_id     INTEGER UNIQUE,
    task_id         INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
    job_id          INTEGER REFERENCES jobs(id),
    author_name     VARCHAR(255),
    author_email    VARCHAR(255),
    author_company  VARCHAR(100),
    message         TEXT,
    category        VARCHAR(50),             -- Comment, TechnicalIssue, LinguisticIssue, etc.
    is_from_us      BOOLEAN DEFAULT FALSE,   -- bizden mi gitti?
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_comments_task ON comments(task_id);
CREATE INDEX idx_comments_symfonie ON comments(symfonie_id);
CREATE INDEX idx_comments_job ON comments(job_id);

-- ============================================================
-- 13. SYNC LOG (Senkronizasyon geçmişi)
-- ============================================================

CREATE TABLE sync_log (
    id              SERIAL PRIMARY KEY,
    source          sync_source NOT NULL,
    entity_type     VARCHAR(50) NOT NULL,    -- project, task, job, etc.
    entity_id       INTEGER,
    symfonie_id     INTEGER,
    action          VARCHAR(20) NOT NULL,    -- created, updated, deleted
    changes         JSONB,                   -- what changed
    error_message   TEXT,
    synced_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sync_log_source ON sync_log(source);
CREATE INDEX idx_sync_log_entity ON sync_log(entity_type, entity_id);
CREATE INDEX idx_sync_log_time ON sync_log(synced_at DESC);

-- ============================================================
-- 14. DEADLINE CHANGES (Deadline değişiklik takibi)
-- ============================================================

CREATE TABLE deadline_changes (
    id              SERIAL PRIMARY KEY,
    task_id         INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
    previous_date   TIMESTAMPTZ,
    new_date        TIMESTAMPTZ,
    changed_by      VARCHAR(255),
    reason          TEXT,
    detected_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_deadline_changes_task ON deadline_changes(task_id);
CREATE INDEX idx_deadline_changes_detected ON deadline_changes(detected_at DESC);

-- ============================================================
-- 15. APP SETTINGS (Uygulama ayarları)
-- ============================================================

CREATE TABLE app_settings (
    key             VARCHAR(100) PRIMARY KEY,
    value           TEXT,
    description     TEXT,
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Default settings
INSERT INTO app_settings (key, value, description) VALUES
    ('symfonie_client_id', '63daa91c-b470-4fb5-94a0-b79fa35e9272', 'Symfonie Azure AD Client ID'),
    ('symfonie_tenant_id', 'ead220ab-1743-4c57-83ae-e055f3401f19', 'Azure AD Tenant ID'),
    ('symfonie_scope', 'api://c2e8870d-faef-45ea-919c-b603f97bd0cc/.default', 'Symfonie API scope'),
    ('symfonie_api_base', 'https://projects.moravia.com/Api/V5', 'Symfonie API base URL'),
    ('symfonie_company_id', '9565', 'Verbato Ltd company ID in Symfonie'),
    ('symfonie_user_id', '85202', 'Cenk Yalavac user ID in Symfonie'),
    ('sync_interval_minutes', '5', 'Symfonie polling interval'),
    ('belazy_account_id', 'ac0Nma5pUNt17vE5', 'BeLazy account ID (legacy)'),
    ('default_currency', 'EUR', 'Default currency for financials'),
    ('company_name', 'El Turco Translation Services', 'Company display name');

-- ============================================================
-- TRIGGER: auto-update updated_at timestamps
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN 
        SELECT table_name FROM information_schema.columns 
        WHERE column_name = 'updated_at' AND table_schema = 'public'
    LOOP
        EXECUTE format(
            'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON %I 
             FOR EACH ROW EXECUTE FUNCTION update_updated_at()',
            t, t
        );
    END LOOP;
END;
$$;

-- ============================================================
-- TRIGGER: track deadline changes
-- ============================================================

CREATE OR REPLACE FUNCTION track_deadline_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.due_date IS DISTINCT FROM NEW.due_date THEN
        INSERT INTO deadline_changes (task_id, previous_date, new_date, detected_at)
        VALUES (NEW.id, OLD.due_date, NEW.due_date, NOW());
        
        NEW.previous_due_date = OLD.due_date;
        NEW.deadline_changed_at = NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tasks_deadline_change
    BEFORE UPDATE ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION track_deadline_change();

-- ============================================================
-- VIEW: Active tasks overview (PM dashboard)
-- ============================================================

CREATE VIEW v_active_tasks AS
SELECT 
    t.id,
    t.symfonie_id,
    t.name AS task_name,
    t.task_type,
    t.state,
    t.target_language,
    t.due_date,
    t.total_words,
    t.weighted_words,
    t.tags,
    t.atms_url,
    p.name AS project_name,
    p.code AS project_code,
    c.name AS customer_name,
    v.name AS vendor_name,
    v.email AS vendor_email,
    j.name AS job_name,
    t.custom_fields,
    t.created_at,
    t.updated_at
FROM tasks t
LEFT JOIN projects p ON t.project_id = p.id
LEFT JOIN customers c ON p.customer_id = c.id
LEFT JOIN vendors v ON t.vendor_id = v.id
LEFT JOIN jobs j ON t.job_id = j.id
WHERE t.state IN ('ordered', 'in_progress', 'heads_up')
ORDER BY t.due_date ASC;

-- ============================================================
-- VIEW: Financial summary per vendor per month
-- ============================================================

CREATE VIEW v_vendor_monthly_financials AS
SELECT 
    v.id AS vendor_id,
    v.name AS vendor_name,
    DATE_TRUNC('month', t.completed_date) AS month,
    COUNT(DISTINCT t.id) AS task_count,
    SUM(t.total_words) AS total_words,
    SUM(po.total_cost) AS total_po_cost,
    po.currency,
    COUNT(DISTINCT p.id) AS project_count
FROM vendors v
JOIN tasks t ON t.vendor_id = v.id
LEFT JOIN purchase_orders po ON po.task_id = t.id
LEFT JOIN projects p ON t.project_id = p.id
WHERE t.completed_date IS NOT NULL
GROUP BY v.id, v.name, DATE_TRUNC('month', t.completed_date), po.currency
ORDER BY month DESC, v.name;

-- ============================================================
-- VIEW: Deadline alerts
-- ============================================================

CREATE VIEW v_deadline_alerts AS
SELECT 
    t.id,
    t.symfonie_id,
    t.name AS task_name,
    t.state,
    t.due_date,
    t.due_date - NOW() AS time_remaining,
    p.name AS project_name,
    c.name AS customer_name,
    v.name AS vendor_name,
    dc.previous_date AS previous_deadline,
    dc.detected_at AS deadline_changed_at
FROM tasks t
LEFT JOIN projects p ON t.project_id = p.id
LEFT JOIN customers c ON p.customer_id = c.id
LEFT JOIN vendors v ON t.vendor_id = v.id
LEFT JOIN LATERAL (
    SELECT previous_date, detected_at 
    FROM deadline_changes 
    WHERE task_id = t.id 
    ORDER BY detected_at DESC 
    LIMIT 1
) dc ON TRUE
WHERE t.state IN ('ordered', 'in_progress')
  AND t.due_date < NOW() + INTERVAL '48 hours'
ORDER BY t.due_date ASC;
