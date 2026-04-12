-- Faz 3: VM Experience
-- Creates vendor_email_templates, vendor_emails, vendor_onboarding_tasks

CREATE TABLE IF NOT EXISTS vendor_email_templates (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  category VARCHAR(100),
  is_active BOOLEAN DEFAULT TRUE,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vendor_emails (
  id SERIAL PRIMARY KEY,
  vendor_id INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  template_id INTEGER REFERENCES vendor_email_templates(id),
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  sent_by INTEGER REFERENCES users(id),
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  status VARCHAR(50) DEFAULT 'sent',
  resend_message_id VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_vendor_emails_vendor ON vendor_emails(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_emails_sent_at ON vendor_emails(sent_at);

CREATE TABLE IF NOT EXISTS vendor_onboarding_tasks (
  id SERIAL PRIMARY KEY,
  vendor_id INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  task_name VARCHAR(200) NOT NULL,
  task_type VARCHAR(50) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  completed_at TIMESTAMPTZ,
  due_date DATE,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_vendor_onboarding_vendor ON vendor_onboarding_tasks(vendor_id);

-- Seed default email templates
INSERT INTO vendor_email_templates (name, subject, body, category) VALUES
  ('Welcome / Onboarding', 'Welcome to El Turco Translation Services!', '<h2>Welcome {{vendor_name}}!</h2><p>We are pleased to welcome you to our team of professional linguists. Your account has been activated and you can now access the vendor portal.</p><p>Next steps:</p><ul><li>Complete your profile</li><li>Sign the NDA</li><li>Submit tax documentation</li></ul><p>Best regards,<br>El Turco Translation Services</p>', 'onboarding'),
  ('Quiz Assignment Notification', 'Assessment Quiz Assigned — {{company_name}}', '<h2>Hello {{vendor_name}},</h2><p>A new assessment quiz has been assigned to you. Please complete it within the specified deadline.</p><p>You can access the quiz through your vendor portal or the link provided in a separate email.</p><p>Best regards,<br>{{company_name}}</p>', 'assessment'),
  ('NDA Request', 'NDA Signature Required — {{company_name}}', '<h2>Hello {{vendor_name}},</h2><p>Please review and sign the Non-Disclosure Agreement (NDA) at your earliest convenience. This is required before we can assign projects to you.</p><p>Best regards,<br>{{company_name}}</p>', 'compliance'),
  ('Profile Update Request', 'Please Update Your Profile — {{company_name}}', '<h2>Hello {{vendor_name}},</h2><p>We noticed your vendor profile is incomplete. Please update your profile with the latest information including language pairs, rates, and certifications.</p><p>Best regards,<br>{{company_name}}</p>', 'admin'),
  ('Availability Check', 'Availability Check — {{company_name}}', '<h2>Hello {{vendor_name}},</h2><p>We would like to check your availability for upcoming projects. Please update your availability status in the vendor portal or reply to this email.</p><p>Best regards,<br>{{company_name}}</p>', 'operations'),
  ('Rate Negotiation', 'Rate Discussion — {{company_name}}', '<h2>Hello {{vendor_name}},</h2><p>We would like to discuss rates for upcoming projects. Please review the proposed rates and share your feedback.</p><p>Best regards,<br>{{company_name}}</p>', 'finance'),
  ('General Announcement', 'Important Update — {{company_name}}', '<h2>Hello {{vendor_name}},</h2><p>We have an important update to share with you. Please read the details below carefully.</p><p>Best regards,<br>{{company_name}}</p>', 'general')
ON CONFLICT DO NOTHING;
