-- Faz 2: Vendor Enhancements
-- Creates vendor_applications, vendor_stage_history, vendor_filter_presets
-- Adds document management columns to vendor_file_uploads

CREATE TABLE IF NOT EXISTS vendor_applications (
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
);

CREATE INDEX IF NOT EXISTS idx_vendor_applications_email ON vendor_applications(email);
CREATE INDEX IF NOT EXISTS idx_vendor_applications_status ON vendor_applications(status);

CREATE TABLE IF NOT EXISTS vendor_stage_history (
  id SERIAL PRIMARY KEY,
  vendor_id INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  from_stage VARCHAR(50),
  to_stage VARCHAR(50) NOT NULL,
  changed_by INTEGER REFERENCES users(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vendor_stage_history_vendor ON vendor_stage_history(vendor_id);

CREATE TABLE IF NOT EXISTS vendor_filter_presets (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  filters JSONB NOT NULL,
  created_by INTEGER REFERENCES users(id),
  is_shared BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add document management enhancement columns to existing vendor_file_uploads
ALTER TABLE vendor_file_uploads ADD COLUMN IF NOT EXISTS document_status VARCHAR(50) DEFAULT 'pending';
ALTER TABLE vendor_file_uploads ADD COLUMN IF NOT EXISTS expiry_date DATE;
ALTER TABLE vendor_file_uploads ADD COLUMN IF NOT EXISTS uploaded_by INTEGER REFERENCES users(id);
ALTER TABLE vendor_file_uploads ADD COLUMN IF NOT EXISTS notes TEXT;
