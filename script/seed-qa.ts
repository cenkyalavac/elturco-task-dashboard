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

    // ── 3. Find a vendor (for job assignment) ──
    let vendorId: number | null = null;
    const existingVendor = await client.query(
      `SELECT id FROM vendors WHERE status = 'Active' LIMIT 1`
    );
    if (existingVendor.rows.length > 0) {
      vendorId = existingVendor.rows[0].id;
      console.log(`Using existing vendor id=${vendorId}`);
    } else {
      // Try any vendor
      const anyVendor = await client.query(`SELECT id FROM vendors LIMIT 1`);
      if (anyVendor.rows.length > 0) {
        vendorId = anyVendor.rows[0].id;
        console.log(`Using vendor id=${vendorId}`);
      } else {
        console.log("No vendors found — jobs will be unassigned");
      }
    }

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

    // ── 5. Seed projects with jobs ──

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

    // Jobs for Project 1
    await client.query(
      `INSERT INTO jobs (project_id, job_code, job_name, source_language, target_language, service_type, status, word_count, vendor_id, assigned_at, deadline, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12)`,
      [project1Id, "MAN-2026-0050-TR", "EN>TR Translation", "EN", "TR", "Translation", "assigned", 3500, vendorId, now, in5days, now]
    );
    await client.query(
      `INSERT INTO jobs (project_id, job_code, job_name, source_language, target_language, service_type, status, word_count, deadline, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)`,
      [project1Id, "MAN-2026-0050-DE", "EN>DE Translation", "EN", "DE", "Translation", "unassigned", 3500, in5days, now]
    );
    await client.query(
      `INSERT INTO jobs (project_id, job_code, job_name, source_language, target_language, service_type, status, word_count, deadline, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)`,
      [project1Id, "MAN-2026-0050-FR", "EN>FR Translation", "EN", "FR", "Translation", "unassigned", 3500, in5days, now]
    );
    console.log("  Created 3 jobs for Samsung project");

    // Project 2: Netflix Subtitle Translation
    const p2 = await client.query(
      `INSERT INTO projects (entity_id, customer_id, project_name, project_code, source, external_id, status, deadline, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
       RETURNING id`,
      [entityId, customerId, "Netflix Subtitle Translation", "SYM-2026-0399", "symfonie", "SYM-2026-0399", "confirmed", in5days, now]
    );
    const project2Id = p2.rows[0].id;
    console.log(`Created project 2: id=${project2Id} (Netflix)`);

    // Jobs for Project 2
    await client.query(
      `INSERT INTO jobs (project_id, job_code, job_name, source_language, target_language, service_type, status, word_count, deadline, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)`,
      [project2Id, "SYM-2026-0399-ES", "EN>ES Translation", "EN", "ES", "Translation", "unassigned", 5000, in5days, now]
    );
    await client.query(
      `INSERT INTO jobs (project_id, job_code, job_name, source_language, target_language, service_type, status, word_count, deadline, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)`,
      [project2Id, "SYM-2026-0399-PT", "EN>PT Translation", "EN", "PT", "Translation", "unassigned", 5000, in5days, now]
    );
    console.log("  Created 2 jobs for Netflix project");

    // ── 6. Seed notifications ──
    // Use pm_user_id = 5 as specified. The notifications table uses pm_user_id column.
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

    await client.query("COMMIT");
    console.log("\n✓ QA seed data inserted successfully!");
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
