-- Migration: Add default_currency column to entities table
-- Used as the fallback currency for financial records (POs, invoices) when no currency is specified
ALTER TABLE entities ADD COLUMN IF NOT EXISTS default_currency VARCHAR(3) DEFAULT 'EUR';
