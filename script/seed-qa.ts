/**
 * QA Seed Script — Seeds test data for Dispatch 2.0 visual verification.
 *
 * Run: npx tsx script/seed-qa.ts
 * Requires: DATABASE_URL environment variable
 */

import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL environment variable is required");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: DATABASE_URL, ssl: false });

async function seed() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // ── 1. Ensure we have a customer to link projects to ──
    let customerId: number;
    const existingCustomer = await client.query(
      `SELECT id FROM customers LIMIT 1`
    );
    if (existingCustomer.rows.length > 0) {
      customerId = existingCustomer.rows[0].id;
      console.log(`Using existing customer id=${customerId}`);
    } else {
      const newCustomer = await client.query(
        `INSERT INTO customers (name, code, status, currency)
         VALUES ('Test Client Corp', 'TEST-001', 'ACTIVE', 'EUR')
         RETURNING id`
      );
      customerId = newCustomer.rows[0].id;
      console.log(`Created customer id=${customerId}`);
    }

    // ── 2. Ensure we have an entity ──
    let entityId: number;
    const existingEntity = await client.query(`SELECT id FROM entities LIMIT 1`);
    if (existingEntity.rows.length > 0) {
      entityId = existingEntity.rows[0].id;
    } else {
      const newEntity = await client.query(
        `INSERT INTO entities (name, code, currency)
         VALUES ('Verbato Ltd', 'VB', 'EUR')
         RETURNING id`
      );
      entityId = newEntity.rows[0].id;
    }
    console.log(`Using entity id=${entityId}`);

    // ── 3. Seed 8 realistic vendors ──
    // Delete any existing seeded vendors (by email pattern)
    await client.query(
      `DELETE FROM vendor_language_pairs WHERE vendor_id IN (SELECT id FROM vendors WHERE email LIKE '%@example.com')`
    );
    await client.query(
      `DELETE FROM vendor_rate_cards WHERE vendor_id IN (SELECT id FROM vendors WHERE email LIKE '%@example.com')`
    );
    await client.query(
      `DELETE FROM quality_reports WHERE vendor_id IN (SELECT id FROM vendors WHERE email LIKE '%@example.com')`
    );
    await client.query(
      `DELETE FROM vendors WHERE email LIKE '%@example.com'`
    );

    const vendorData = [
      {
        resourceCode: "VND-001",
        fullName: "Ayşe Kaya",
        email: "ayse.kaya@example.com",
        phone: "+90 532 111 2233",
        location: "Istanbul, Turkey",
        nativeLanguage: "Turkish",
        translationSpecializations: ["Technology", "Legal"],
        serviceTypes: ["Translation", "MTPE", "Review"],
        status: "Approved",
        combinedQualityScore: "85.00",
        averageQsScore: "4.20",
        totalReviewsCount: 12,
        valueIndex: "14.1667",
        tier: "premium",
        currency: "EUR",
        rates: [{ type: "per_word", value: 0.06, currency: "EUR", service: "Translation" }],
        experienceYears: 8,
        langPairs: [
          { source: "EN", target: "TR", isPrimary: true },
          { source: "TR", target: "EN", isPrimary: false },
        ],
        rateCards: [
          { source: "EN", target: "TR", service: "Translation", rateType: "per_word", rateValue: "0.0600", ratePerWord: "0.0600" },
          { source: "EN", target: "TR", service: "MTPE", rateType: "per_word", rateValue: "0.0400", ratePerWord: "0.0400" },
          { source: "TR", target: "EN", service: "Translation", rateType: "per_word", rateValue: "0.0650", ratePerWord: "0.0650" },
        ],
      },
      {
        resourceCode: "VND-002",
        fullName: "Hans Müller",
        email: "hans.muller@example.com",
        phone: "+49 170 222 3344",
        location: "Berlin, Germany",
        nativeLanguage: "German",
        translationSpecializations: ["Automotive", "Technology"],
        serviceTypes: ["Translation", "Review"],
        status: "Approved",
        combinedQualityScore: "78.00",
        averageQsScore: "3.80",
        totalReviewsCount: 8,
        valueIndex: "9.7500",
        tier: "standard",
        currency: "EUR",
        rates: [{ type: "per_word", value: 0.08, currency: "EUR", service: "Translation" }],
        experienceYears: 12,
        langPairs: [
          { source: "EN", target: "DE", isPrimary: true },
          { source: "DE", target: "EN", isPrimary: false },
        ],
        rateCards: [
          { source: "EN", target: "DE", service: "Translation", rateType: "per_word", rateValue: "0.0800", ratePerWord: "0.0800" },
          { source: "DE", target: "EN", service: "Translation", rateType: "per_word", rateValue: "0.0850", ratePerWord: "0.0850" },
        ],
      },
      {
        resourceCode: "VND-003",
        fullName: "Marie Dupont",
        email: "marie.dupont@example.com",
        phone: "+33 6 33 44 55 66",
        location: "Paris, France",
        nativeLanguage: "French",
        translationSpecializations: ["Marketing", "Fashion"],
        serviceTypes: ["Translation", "MTPE"],
        status: "Approved",
        combinedQualityScore: "92.00",
        averageLqaScore: "92.00",
        averageQsScore: "4.60",
        totalReviewsCount: 15,
        valueIndex: "13.1429",
        tier: "premium",
        currency: "EUR",
        rates: [{ type: "per_word", value: 0.07, currency: "EUR", service: "Translation" }],
        experienceYears: 10,
        langPairs: [
          { source: "EN", target: "FR", isPrimary: true },
          { source: "FR", target: "EN", isPrimary: false },
        ],
        rateCards: [
          { source: "EN", target: "FR", service: "Translation", rateType: "per_word", rateValue: "0.0700", ratePerWord: "0.0700" },
          { source: "EN", target: "FR", service: "MTPE", rateType: "per_word", rateValue: "0.0500", ratePerWord: "0.0500" },
        ],
      },
      {
        resourceCode: "VND-004",
        fullName: "Carlos García",
        email: "carlos.garcia@example.com",
        phone: "+34 612 445 566",
        location: "Madrid, Spain",
        nativeLanguage: "Spanish",
        translationSpecializations: ["Entertainment", "Media"],
        serviceTypes: ["Translation", "Subtitling"],
        status: "Approved",
        combinedQualityScore: "80.00",
        averageQsScore: "4.00",
        totalReviewsCount: 10,
        valueIndex: "12.3077",
        tier: "standard",
        currency: "EUR",
        rates: [{ type: "per_word", value: 0.065, currency: "EUR", service: "Translation" }],
        experienceYears: 6,
        langPairs: [
          { source: "EN", target: "ES", isPrimary: true },
          { source: "ES", target: "EN", isPrimary: false },
        ],
        rateCards: [
          { source: "EN", target: "ES", service: "Translation", rateType: "per_word", rateValue: "0.0650", ratePerWord: "0.0650" },
          { source: "EN", target: "ES", service: "Subtitling", rateType: "per_minute", rateValue: "6.5000", ratePerWord: null },
        ],
      },
      {
        resourceCode: "VND-005",
        fullName: "Ana Silva",
        email: "ana.silva@example.com",
        phone: "+351 912 556 677",
        location: "Lisbon, Portugal",
        nativeLanguage: "Portuguese",
        translationSpecializations: ["Technology", "E-commerce"],
        serviceTypes: ["Translation", "MTPE"],
        status: "Approved",
        combinedQualityScore: "88.00",
        averageQsScore: "4.50",
        totalReviewsCount: 11,
        valueIndex: "16.0000",
        tier: "premium",
        currency: "EUR",
        rates: [{ type: "per_word", value: 0.055, currency: "EUR", service: "Translation" }],
        experienceYears: 7,
        langPairs: [
          { source: "EN", target: "PT", isPrimary: true },
          { source: "PT", target: "EN", isPrimary: false },
        ],
        rateCards: [
          { source: "EN", target: "PT", service: "Translation", rateType: "per_word", rateValue: "0.0550", ratePerWord: "0.0550" },
          { source: "EN", target: "PT", service: "MTPE", rateType: "per_word", rateValue: "0.0380", ratePerWord: "0.0380" },
        ],
      },
      {
        resourceCode: "VND-006",
        fullName: "Mehmet Yılmaz",
        email: "mehmet.yilmaz@example.com",
        phone: "+90 533 667 7888",
        location: "Ankara, Turkey",
        nativeLanguage: "Turkish",
        translationSpecializations: ["Gaming", "Technology"],
        serviceTypes: ["Translation", "LQA"],
        status: "Test Sent",
        combinedQualityScore: "70.00",
        averageQsScore: "3.50",
        totalReviewsCount: 3,
        valueIndex: "14.0000",
        tier: "economy",
        currency: "EUR",
        rates: [{ type: "per_word", value: 0.05, currency: "EUR", service: "Translation" }],
        experienceYears: 3,
        langPairs: [
          { source: "EN", target: "TR", isPrimary: true },
        ],
        rateCards: [
          { source: "EN", target: "TR", service: "Translation", rateType: "per_word", rateValue: "0.0500", ratePerWord: "0.0500" },
          { source: "EN", target: "TR", service: "LQA", rateType: "per_hour", rateValue: "25.0000", ratePerWord: null },
        ],
      },
      {
        resourceCode: "VND-007",
        fullName: "Sophie Weber",
        email: "sophie.weber@example.com",
        phone: "+49 171 778 8999",
        location: "Munich, Germany",
        nativeLanguage: "German",
        translationSpecializations: ["Medical", "Pharma"],
        serviceTypes: ["Translation", "Review", "LQA"],
        status: "Price Negotiation",
        combinedQualityScore: null,
        averageQsScore: null,
        totalReviewsCount: 0,
        valueIndex: null,
        tier: "standard",
        currency: "EUR",
        rates: [{ type: "per_word", value: 0.10, currency: "EUR", service: "Translation" }],
        experienceYears: 15,
        langPairs: [
          { source: "EN", target: "DE", isPrimary: true },
        ],
        rateCards: [
          { source: "EN", target: "DE", service: "Translation", rateType: "per_word", rateValue: "0.1000", ratePerWord: "0.1000" },
          { source: "EN", target: "DE", service: "Review", rateType: "per_word", rateValue: "0.0500", ratePerWord: "0.0500" },
        ],
      },
      {
        resourceCode: "VND-008",
        fullName: "Pierre Martin",
        email: "pierre.martin@example.com",
        phone: "+33 6 88 99 00 11",
        location: "Lyon, France",
        nativeLanguage: "French",
        translationSpecializations: ["Legal", "Finance"],
        serviceTypes: ["Translation"],
        status: "New Application",
        combinedQualityScore: null,
        averageQsScore: null,
        totalReviewsCount: 0,
        valueIndex: null,
        tier: "standard",
        currency: "EUR",
        rates: [{ type: "per_word", value: 0.09, currency: "EUR", service: "Translation" }],
        experienceYears: 5,
        langPairs: [
          { source: "EN", target: "FR", isPrimary: true },
        ],
        rateCards: [
          { source: "EN", target: "FR", service: "Translation", rateType: "per_word", rateValue: "0.0900", ratePerWord: "0.0900" },
        ],
      },
    ];

    const vendorIds: { [key: string]: number } = {};

    for (const v of vendorData) {
      const result = await client.query(
        `INSERT INTO vendors (
          resource_code, full_name, email, phone, location, native_language,
          translation_specializations, service_types, status,
          combined_quality_score, average_lqa_score, average_qs_score,
          total_reviews_count, value_index, tier, currency,
          rates, experience_years, resource_type, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, NOW(), NOW())
        RETURNING id`,
        [
          v.resourceCode, v.fullName, v.email, v.phone, v.location, v.nativeLanguage,
          v.translationSpecializations, v.serviceTypes, v.status,
          v.combinedQualityScore, (v as any).averageLqaScore || null, v.averageQsScore,
          v.totalReviewsCount, v.valueIndex, v.tier, v.currency,
          JSON.stringify(v.rates), v.experienceYears, "Freelancer",
        ]
      );
      vendorIds[v.fullName] = result.rows[0].id;
      console.log(`  Created vendor: ${v.fullName} (id=${result.rows[0].id}, status=${v.status})`);

      // Insert language pairs
      for (const lp of v.langPairs) {
        await client.query(
          `INSERT INTO vendor_language_pairs (vendor_id, source_language, target_language, is_primary)
           VALUES ($1, $2, $3, $4)`,
          [result.rows[0].id, lp.source, lp.target, lp.isPrimary]
        );
      }

      // Insert rate cards
      for (const rc of v.rateCards) {
        await client.query(
          `INSERT INTO vendor_rate_cards (vendor_id, source_language, target_language, service_type, rate_type, rate_value, rate_per_word, currency, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
          [result.rows[0].id, rc.source, rc.target, rc.service, rc.rateType, rc.rateValue, rc.ratePerWord, "EUR"]
        );
      }
    }
    console.log(`Seeded ${vendorData.length} vendors with language pairs and rate cards`);

    // ── 4. Seed portal_tasks (3 pending tasks) ──
    const now = new Date();
    const in1day = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000);
    const in2days = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
    const in5days = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);

    // Delete any existing seed portal tasks (by external_id prefix)
    await client.query(
      `DELETE FROM portal_tasks WHERE external_id IN ('SYM-2026-0412', 'SYM-2026-0413', 'APS-LB-4521')`
    );

    await client.query(
      `INSERT INTO portal_tasks (portal_source, external_id, task_data, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $5)`,
      [
        "symfonie",
        "SYM-2026-0412",
        JSON.stringify({
          projectName: "Amazon Product Listings EN>DE",
          name: "Amazon Product Listings EN>DE",
          sourceLanguage: "English",
          targetLanguages: ["German"],
          wordCount: 2500,
          deadline: in2days.toISOString(),
          client_name: "Amazon/Centific",
        }),
        "pending",
        now,
      ]
    );

    await client.query(
      `INSERT INTO portal_tasks (portal_source, external_id, task_data, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $5)`,
      [
        "symfonie",
        "SYM-2026-0413",
        JSON.stringify({
          projectName: "Microsoft Azure Docs EN>TR,FR",
          name: "Microsoft Azure Docs EN>TR,FR",
          sourceLanguage: "English",
          targetLanguages: ["Turkish", "French"],
          wordCount: 8000,
          deadline: in5days.toISOString(),
          client_name: "Microsoft/RWS",
        }),
        "pending",
        now,
      ]
    );

    await client.query(
      `INSERT INTO portal_tasks (portal_source, external_id, task_data, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $5)`,
      [
        "aps",
        "APS-LB-4521",
        JSON.stringify({
          projectName: "Lionbridge Legal Review DE>EN",
          name: "Lionbridge Legal Review DE>EN",
          sourceLanguage: "German",
          targetLanguages: ["English"],
          wordCount: 1200,
          deadline: in1day.toISOString(),
          client_name: "Lionbridge (LCX)",
        }),
        "pending",
        now,
      ]
    );

    console.log("Seeded 3 portal_tasks (pending)");

    // ── 5. Seed projects with jobs (with proper rates) ──

    // Delete existing seed projects (by name)
    await client.query(
      `DELETE FROM projects WHERE project_name IN ('Samsung Mobile App Localization', 'Netflix Subtitle Translation')`
    );

    // Project 1: Samsung Mobile App Localization
    const p1 = await client.query(
      `INSERT INTO projects (entity_id, customer_id, project_name, project_code, source, status, deadline, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
       RETURNING id`,
      [entityId, customerId, "Samsung Mobile App Localization", "MAN-2026-0050", "manual", "in_progress", in5days, now]
    );
    const project1Id = p1.rows[0].id;
    console.log(`Created project 1: id=${project1Id} (Samsung)`);

    // Jobs for Project 1 — with rates and word counts
    // EN>TR: assigned to Ayşe Kaya
    const ayseId = vendorIds["Ayşe Kaya"];
    await client.query(
      `INSERT INTO jobs (project_id, job_code, job_name, source_language, target_language, service_type, status,
        word_count, vendor_id, assigned_at, vendor_rate, client_rate, vendor_total, client_total, deadline, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $16)`,
      [project1Id, "MAN-2026-0050-TR", "EN>TR Translation", "EN", "TR", "Translation", "assigned",
        2500, ayseId, now, "0.0600", "0.1000", "150.00", "250.00", in5days, now]
    );
    // EN>DE: unassigned
    await client.query(
      `INSERT INTO jobs (project_id, job_code, job_name, source_language, target_language, service_type, status,
        word_count, vendor_rate, client_rate, vendor_total, client_total, deadline, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $14)`,
      [project1Id, "MAN-2026-0050-DE", "EN>DE Translation", "EN", "DE", "Translation", "unassigned",
        2500, "0.0800", "0.1200", "200.00", "300.00", in5days, now]
    );
    // EN>FR: unassigned
    await client.query(
      `INSERT INTO jobs (project_id, job_code, job_name, source_language, target_language, service_type, status,
        word_count, vendor_rate, client_rate, vendor_total, client_total, deadline, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $14)`,
      [project1Id, "MAN-2026-0050-FR", "EN>FR Translation", "EN", "FR", "Translation", "unassigned",
        2500, "0.0700", "0.1100", "175.00", "275.00", in5days, now]
    );
    console.log("  Created 3 jobs for Samsung project (with rates, EN>TR assigned to Ayşe Kaya)");

    // Project 2: Netflix Subtitle Translation
    const p2 = await client.query(
      `INSERT INTO projects (entity_id, customer_id, project_name, project_code, source, external_id, status, deadline, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
       RETURNING id`,
      [entityId, customerId, "Netflix Subtitle Translation", "SYM-2026-0399", "symfonie", "SYM-2026-0399", "confirmed", in5days, now]
    );
    const project2Id = p2.rows[0].id;
    console.log(`Created project 2: id=${project2Id} (Netflix)`);

    // Jobs for Project 2 — with rates
    // EN>ES: unassigned
    await client.query(
      `INSERT INTO jobs (project_id, job_code, job_name, source_language, target_language, service_type, status,
        word_count, vendor_rate, client_rate, vendor_total, client_total, deadline, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $14)`,
      [project2Id, "SYM-2026-0399-ES", "EN>ES Translation", "EN", "ES", "Translation", "unassigned",
        2500, "0.0650", "0.1000", "162.50", "250.00", in5days, now]
    );
    // EN>PT: unassigned
    await client.query(
      `INSERT INTO jobs (project_id, job_code, job_name, source_language, target_language, service_type, status,
        word_count, vendor_rate, client_rate, vendor_total, client_total, deadline, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $14)`,
      [project2Id, "SYM-2026-0399-PT", "EN>PT Translation", "EN", "PT", "Translation", "unassigned",
        2500, "0.0550", "0.0900", "137.50", "225.00", in5days, now]
    );
    console.log("  Created 2 jobs for Netflix project (with rates)");

    // ── 6. Seed notifications ──
    await client.query(
      `DELETE FROM notifications WHERE title LIKE 'New Symfonie task: Amazon%' OR title LIKE 'Deadline approaching: Lionbridge%'`
    );

    await client.query(
      `INSERT INTO notifications (pm_user_id, type, title, message, read, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [5, "task_incoming", "New Symfonie task: Amazon Product Listings", "A new task from Symfonie portal is awaiting your review.", false, now]
    );
    await client.query(
      `INSERT INTO notifications (pm_user_id, type, title, message, read, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [5, "deadline_warning", "Deadline approaching: Lionbridge Legal Review (tomorrow)", "The Lionbridge Legal Review DE>EN task deadline is tomorrow. Please review.", false, now]
    );
    console.log("Seeded 2 notifications for pm_user_id=5");

    // ── 7. Seed activity feed (audit_log entries) ──
    // Find an existing user for the audit log, or use null
    let auditUserId: number | null = null;
    const existingUser = await client.query(`SELECT id FROM users LIMIT 1`);
    if (existingUser.rows.length > 0) {
      auditUserId = existingUser.rows[0].id;
    }

    // Delete old seeded audit entries
    await client.query(
      `DELETE FROM audit_log WHERE entity_type IN ('vendor', 'project', 'job', 'portal_task')
       AND action IN ('vendor_created', 'vendor_approved', 'project_created', 'job_assigned', 'portal_task_received', 'vendor_stage_changed', 'quality_report_submitted')`
    );

    const auditEntries = [
      {
        action: "vendor_created",
        entityType: "vendor",
        entityId: vendorIds["Pierre Martin"],
        newData: { fullName: "Pierre Martin", email: "pierre.martin@example.com", status: "New Application" },
        createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000), // 2 hours ago
      },
      {
        action: "vendor_approved",
        entityType: "vendor",
        entityId: vendorIds["Ayşe Kaya"],
        oldData: { status: "Test Sent" },
        newData: { status: "Approved", fullName: "Ayşe Kaya" },
        createdAt: new Date(now.getTime() - 4 * 60 * 60 * 1000), // 4 hours ago
      },
      {
        action: "project_created",
        entityType: "project",
        entityId: project1Id,
        newData: { projectName: "Samsung Mobile App Localization", source: "manual", status: "in_progress" },
        createdAt: new Date(now.getTime() - 6 * 60 * 60 * 1000), // 6 hours ago
      },
      {
        action: "project_created",
        entityType: "project",
        entityId: project2Id,
        newData: { projectName: "Netflix Subtitle Translation", source: "symfonie", status: "confirmed" },
        createdAt: new Date(now.getTime() - 5 * 60 * 60 * 1000), // 5 hours ago
      },
      {
        action: "job_assigned",
        entityType: "job",
        entityId: null,
        newData: { jobCode: "MAN-2026-0050-TR", vendorName: "Ayşe Kaya", project: "Samsung Mobile App Localization" },
        createdAt: new Date(now.getTime() - 3 * 60 * 60 * 1000), // 3 hours ago
      },
      {
        action: "portal_task_received",
        entityType: "portal_task",
        entityId: null,
        newData: { externalId: "SYM-2026-0412", portal: "symfonie", task: "Amazon Product Listings EN>DE" },
        createdAt: new Date(now.getTime() - 1 * 60 * 60 * 1000), // 1 hour ago
      },
      {
        action: "vendor_stage_changed",
        entityType: "vendor",
        entityId: vendorIds["Mehmet Yılmaz"],
        oldData: { status: "New Application" },
        newData: { status: "Test Sent", fullName: "Mehmet Yılmaz" },
        createdAt: new Date(now.getTime() - 8 * 60 * 60 * 1000), // 8 hours ago
      },
      {
        action: "quality_report_submitted",
        entityType: "vendor",
        entityId: vendorIds["Marie Dupont"],
        newData: { vendorName: "Marie Dupont", reportType: "LQA", lqaScore: 92, account: "Netflix" },
        createdAt: new Date(now.getTime() - 12 * 60 * 60 * 1000), // 12 hours ago
      },
    ];

    for (const entry of auditEntries) {
      await client.query(
        `INSERT INTO audit_log (user_id, action, entity_type, entity_id, old_data, new_data, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          auditUserId,
          entry.action,
          entry.entityType,
          entry.entityId,
          (entry as any).oldData ? JSON.stringify((entry as any).oldData) : null,
          JSON.stringify(entry.newData),
          entry.createdAt,
        ]
      );
    }
    console.log(`Seeded ${auditEntries.length} audit_log entries for activity feed`);

    // ── 8. Seed quality reports ──
    const qualityReports = [
      {
        vendorId: vendorIds["Ayşe Kaya"],
        reportType: "QS",
        qsScore: "4.2",
        lqaScore: null,
        projectName: "Samsung Mobile App Localization",
        clientAccount: "Samsung",
        sourceLanguage: "EN",
        targetLanguage: "TR",
        wordCount: 3500,
        contentType: "Technology",
        jobType: "Translation",
        status: "completed",
        reviewerComments: "Excellent terminology consistency. Minor style preferences noted but overall very strong work.",
        reportDate: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0], // 7 days ago
      },
      {
        vendorId: vendorIds["Hans Müller"],
        reportType: "QS",
        qsScore: "3.8",
        lqaScore: null,
        projectName: "Samsung Mobile App Localization",
        clientAccount: "Samsung",
        sourceLanguage: "EN",
        targetLanguage: "DE",
        wordCount: 3500,
        contentType: "Technology",
        jobType: "Translation",
        status: "completed",
        reviewerComments: "Good accuracy but some inconsistency in UI string translation. Needs improvement in tech glossary adherence.",
        reportDate: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      },
      {
        vendorId: vendorIds["Marie Dupont"],
        reportType: "LQA",
        qsScore: null,
        lqaScore: "92.00",
        projectName: "Netflix Subtitle Translation",
        clientAccount: "Netflix",
        sourceLanguage: "EN",
        targetLanguage: "FR",
        wordCount: 5000,
        contentType: "Entertainment",
        jobType: "Translation",
        status: "completed",
        lqaWordsReviewed: 1500,
        lqaErrors: JSON.stringify([
          { category: "Accuracy", severity: "minor", count: 2 },
          { category: "Fluency", severity: "minor", count: 1 },
        ]),
        reviewerComments: "Outstanding quality. Very natural-sounding French subtitles with minimal errors.",
        reportDate: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      },
      {
        vendorId: vendorIds["Carlos García"],
        reportType: "QS",
        qsScore: "4.0",
        lqaScore: null,
        projectName: "Netflix Subtitle Translation",
        clientAccount: "Netflix",
        sourceLanguage: "EN",
        targetLanguage: "ES",
        wordCount: 5000,
        contentType: "Entertainment",
        jobType: "Translation",
        status: "completed",
        reviewerComments: "Solid work on subtitle timing and idiomatic expressions. Good cultural adaptation.",
        reportDate: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      },
      {
        vendorId: vendorIds["Ana Silva"],
        reportType: "QS",
        qsScore: "4.5",
        lqaScore: null,
        projectName: "Netflix Subtitle Translation",
        clientAccount: "Netflix",
        sourceLanguage: "EN",
        targetLanguage: "PT",
        wordCount: 5000,
        contentType: "Entertainment",
        jobType: "Translation",
        status: "completed",
        reviewerComments: "Exceptional quality. Flawless Portuguese with excellent register choices for the content type.",
        reportDate: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      },
    ];

    for (const qr of qualityReports) {
      await client.query(
        `INSERT INTO quality_reports (
          vendor_id, report_type, qs_score, lqa_score, project_name, client_account,
          source_language, target_language, word_count, content_type, job_type,
          status, lqa_words_reviewed, lqa_errors, reviewer_comments, report_date,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW(), NOW())`,
        [
          qr.vendorId, qr.reportType, qr.qsScore, qr.lqaScore, qr.projectName, qr.clientAccount,
          qr.sourceLanguage, qr.targetLanguage, qr.wordCount, qr.contentType, qr.jobType,
          qr.status, (qr as any).lqaWordsReviewed || null, (qr as any).lqaErrors || null,
          qr.reviewerComments, qr.reportDate,
        ]
      );
    }
    console.log(`Seeded ${qualityReports.length} quality reports`);

    // ── 9. Update vendor account_quality_scores based on seeded reports ──
    // Update Ayşe Kaya
    await client.query(
      `UPDATE vendors SET account_quality_scores = $1 WHERE id = $2`,
      [JSON.stringify([{ account: "Samsung", qsAvg: 4.2, reportCount: 1 }]), vendorIds["Ayşe Kaya"]]
    );
    // Update Hans Müller
    await client.query(
      `UPDATE vendors SET account_quality_scores = $1 WHERE id = $2`,
      [JSON.stringify([{ account: "Samsung", qsAvg: 3.8, reportCount: 1 }]), vendorIds["Hans Müller"]]
    );
    // Update Marie Dupont
    await client.query(
      `UPDATE vendors SET account_quality_scores = $1 WHERE id = $2`,
      [JSON.stringify([{ account: "Netflix", lqaAvg: 92.0, reportCount: 1 }]), vendorIds["Marie Dupont"]]
    );
    // Update Carlos García
    await client.query(
      `UPDATE vendors SET account_quality_scores = $1 WHERE id = $2`,
      [JSON.stringify([{ account: "Netflix", qsAvg: 4.0, reportCount: 1 }]), vendorIds["Carlos García"]]
    );
    // Update Ana Silva
    await client.query(
      `UPDATE vendors SET account_quality_scores = $1 WHERE id = $2`,
      [JSON.stringify([{ account: "Netflix", qsAvg: 4.5, reportCount: 1 }]), vendorIds["Ana Silva"]]
    );
    console.log("Updated vendor account_quality_scores");

    await client.query("COMMIT");
    console.log("\n✓ QA seed data inserted successfully!");
    console.log(`  - ${vendorData.length} vendors with language pairs and rate cards`);
    console.log(`  - 3 portal tasks`);
    console.log(`  - 2 projects with 5 jobs (with rates, 1 assigned)`);
    console.log(`  - 2 notifications`);
    console.log(`  - ${auditEntries.length} activity feed entries`);
    console.log(`  - ${qualityReports.length} quality reports`);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Seed failed:", error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
