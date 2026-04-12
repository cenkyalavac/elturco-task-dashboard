-- Migration: Add vendor_availability table for availability calendar feature
CREATE TABLE IF NOT EXISTS vendor_availability (
  id SERIAL PRIMARY KEY,
  vendor_id INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  status VARCHAR(20) DEFAULT 'available',
  hours_available INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(vendor_id, date)
);

CREATE INDEX IF NOT EXISTS idx_vendor_avail_vendor ON vendor_availability(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_avail_date ON vendor_availability(date);
