/**
 * QA Seed Script — Seeds test data for Dispatch 2.0 visual verification.
 * Pure ESM version that runs without tsx compilation.
 *
 * Run: node script/seed-qa-run.mjs
 * Requires: DATABASE_URL environment variable
 */

import pgModule from "pg";
const { Pool } = pgModule;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL environment variable is required");
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL, ssl: false });

async function seed() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // ── 1. Ensure we have a customer ──
    let customerId;
    const existingCustomer = await client.query(`SELECT id FROM customers LIMIT 1`);
    if (existingCustomer.rows.length > 0) {
      customerId = existingCustomer.rows[0].id;
      console.log(`Using existing customer id=${customerId}`);
    } else {
      const newCustomer = await client.query(
        `INSERT INTO customers (name, code, status, currency) VALUES ('Test Client Corp', 'TEST-001', 'ACTIVE', 'EUR') RETURNING id`
      );
      customerId = newCustomer.rows[0].id;
      console.log(`Created customer id=${customerId}`);
    }

    // ── 2. Ensure we have an entity ──
    let entityId;
    const existingEntity = await client.query(`SELECT id FROM entities LIMIT 1`);
    if (existingEntity.rows.length > 0) {
      entityId = existingEntity.rows[0].id;
    } else {
      const newEntity = await client.query(
        `INSERT INTO entities (name, code, currency) VALUES ('Verbato Ltd', 'VB', 'EUR') RETURNING id`
      );
      entityId = newEntity.rows[0].id;
    }
    console.log(`Using entity id=${entityId}`);

    // ── 3. Clean up previous seed data ──
    await client.query(`DELETE FROM quality_reports WHERE vendor_id IN (SELECT id FROM vendors WHERE email LIKE '%@example.com')`);
    await client.query(`DELETE FROM vendor_language_pairs WHERE vendor_id IN (SELECT id FROM vendors WHERE email LIKE '%@example.com')`);
    await client.query(`DELETE FROM vendor_rate_cards WHERE vendor_id IN (SELECT id FROM vendors WHERE email LIKE '%@example.com')`);
    await client.query(`DELETE FROM vendors WHERE email LIKE '%@example.com'`);
    console.log("Cleaned up previous seed vendors");

    // ── 4. Seed 8 vendors ──
    const vendorData = [
      { rc: "VND-001", name: "Ayşe Kaya", email: "ayse.kaya@example.com", phone: "+90 532 111 2233", loc: "Istanbul, Turkey", native: "Turkish", specs: "{Technology,Legal}", services: "{Translation,MTPE,Review}", status: "Approved", cqs: 85.00, alqa: null, aqs: 4.20, trc: 12, vi: 14.1667, tier: "premium", rates: JSON.stringify([{type:"per_word",value:0.06,currency:"EUR",service:"Translation"}]), exp: 8 },
      { rc: "VND-002", name: "Hans Müller", email: "hans.muller@example.com", phone: "+49 170 222 3344", loc: "Berlin, Germany", native: "German", specs: "{Automotive,Technology}", services: "{Translation,Review}", status: "Approved", cqs: 78.00, alqa: null, aqs: 3.80, trc: 8, vi: 9.75, tier: "standard", rates: JSON.stringify([{type:"per_word",value:0.08,currency:"EUR",service:"Translation"}]), exp: 12 },
      { rc: "VND-003", name: "Marie Dupont", email: "marie.dupont@example.com", phone: "+33 6 33 44 55 66", loc: "Paris, France", native: "French", specs: "{Marketing,Fashion}", services: "{Translation,MTPE}", status: "Approved", cqs: 92.00, alqa: 92.00, aqs: 4.60, trc: 15, vi: 13.1429, tier: "premium", rates: JSON.stringify([{type:"per_word",value:0.07,currency:"EUR",service:"Translation"}]), exp: 10 },
      { rc: "VND-004", name: "Carlos García", email: "carlos.garcia@example.com", phone: "+34 612 445 566", loc: "Madrid, Spain", native: "Spanish", specs: "{Entertainment,Media}", services: "{Translation,Subtitling}", status: "Approved", cqs: 80.00, alqa: null, aqs: 4.00, trc: 10, vi: 12.3077, tier: "standard", rates: JSON.stringify([{type:"per_word",value:0.065,currency:"EUR",service:"Translation"}]), exp: 6 },
      { rc: "VND-005", name: "Ana Silva", email: "ana.silva@example.com", phone: "+351 912 556 677", loc: "Lisbon, Portugal", native: "Portuguese", specs: "{Technology,E-commerce}", services: "{Translation,MTPE}", status: "Approved", cqs: 88.00, alqa: null, aqs: 4.50, trc: 11, vi: 16.0, tier: "premium", rates: JSON.stringify([{type:"per_word",value:0.055,currency:"EUR",service:"Translation"}]), exp: 7 },
      { rc: "VND-006", name: "Mehmet Yılmaz", email: "mehmet.yilmaz@example.com", phone: "+90 533 667 7888", loc: "Ankara, Turkey", native: "Turkish", specs: "{Gaming,Technology}", services: "{Translation,LQA}", status: "Test Sent", cqs: 70.00, alqa: null, aqs: 3.50, trc: 3, vi: 14.0, tier: "economy", rates: JSON.stringify([{type:"per_word",value:0.05,currency:"EUR",service:"Translation"}]), exp: 3 },
      { rc: "VND-007", name: "Sophie Weber", email: "sophie.weber@example.com", phone: "+49 171 778 8999", loc: "Munich, Germany", native: "German", specs: "{Medical,Pharma}", services: "{Translation,Review,LQA}", status: "Price Negotiation", cqs: null, alqa: null, aqs: null, trc: 0, vi: null, tier: "standard", rates: JSON.stringify([{type:"per_word",value:0.10,currency:"EUR",service:"Translation"}]), exp: 15 },
      { rc: "VND-008", name: "Pierre Martin", email: "pierre.martin@example.com", phone: "+33 6 88 99 00 11", loc: "Lyon, France", native: "French", specs: "{Legal,Finance}", services: "{Translation}", status: "New Application", cqs: null, alqa: null, aqs: null, trc: 0, vi: null, tier: "standard", rates: JSON.stringify([{type:"per_word",value:0.09,currency:"EUR",service:"Translation"}]), exp: 5 },
    ];

    const vendorIds = {};
    for (const v of vendorData) {
      const result = await client.query(
        `INSERT INTO vendors (
          resource_code, full_name, email, phone, location, native_language,
          translation_specializations, service_types, status,
          combined_quality_score, average_lqa_score, average_qs_score,
          total_reviews_count, value_index, tier, currency,
          rates, experience_years, resource_type, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'EUR',$16,$17,'Freelancer',NOW(),NOW())
        RETURNING id`,
        [v.rc, v.name, v.email, v.phone, v.loc, v.native, v.specs, v.services, v.status,
         v.cqs, v.alqa, v.aqs, v.trc, v.vi, v.tier, v.rates, v.exp]
      );
      vendorIds[v.name] = result.rows[0].id;
      console.log(`  Vendor: ${v.name} (id=${result.rows[0].id}, status=${v.status})`);
    }
    console.log(`Seeded ${vendorData.length} vendors`);

    // ── 5. Seed language pairs ──
    const langPairs = [
      { name: "Ayşe Kaya", pairs: [["EN","TR",true],["TR","EN",false]] },
      { name: "Hans Müller", pairs: [["EN","DE",true],["DE","EN",false]] },
      { name: "Marie Dupont", pairs: [["EN","FR",true],["FR","EN",false]] },
      { name: "Carlos García", pairs: [["EN","ES",true],["ES","EN",false]] },
      { name: "Ana Silva", pairs: [["EN","PT",true],["PT","EN",false]] },
      { name: "Mehmet Yılmaz", pairs: [["EN","TR",true]] },
      { name: "Sophie Weber", pairs: [["EN","DE",true]] },
      { name: "Pierre Martin", pairs: [["EN","FR",true]] },
    ];
    for (const lp of langPairs) {
      for (const [src, tgt, primary] of lp.pairs) {
        await client.query(
          `INSERT INTO vendor_language_pairs (vendor_id, source_language, target_language, is_primary) VALUES ($1,$2,$3,$4)`,
          [vendorIds[lp.name], src, tgt, primary]
        );
      }
    }
    console.log("Seeded vendor language pairs");

    // ── 6. Seed rate cards ──
    const rateCards = [
      { name: "Ayşe Kaya", cards: [["EN","TR","Translation","per_word","0.0600","0.0600"],["EN","TR","MTPE","per_word","0.0400","0.0400"],["TR","EN","Translation","per_word","0.0650","0.0650"]] },
      { name: "Hans Müller", cards: [["EN","DE","Translation","per_word","0.0800","0.0800"],["DE","EN","Translation","per_word","0.0850","0.0850"]] },
      { name: "Marie Dupont", cards: [["EN","FR","Translation","per_word","0.0700","0.0700"],["EN","FR","MTPE","per_word","0.0500","0.0500"]] },
      { name: "Carlos García", cards: [["EN","ES","Translation","per_word","0.0650","0.0650"]] },
      { name: "Ana Silva", cards: [["EN","PT","Translation","per_word","0.0550","0.0550"],["EN","PT","MTPE","per_word","0.0380","0.0380"]] },
      { name: "Mehmet Yılmaz", cards: [["EN","TR","Translation","per_word","0.0500","0.0500"]] },
      { name: "Sophie Weber", cards: [["EN","DE","Translation","per_word","0.1000","0.1000"],["EN","DE","Review","per_word","0.0500","0.0500"]] },
      { name: "Pierre Martin", cards: [["EN","FR","Translation","per_word","0.0900","0.0900"]] },
    ];
    for (const rc of rateCards) {
      for (const [src, tgt, svc, rType, rVal, rpw] of rc.cards) {
        await client.query(
          `INSERT INTO vendor_rate_cards (vendor_id, source_language, target_language, service_type, rate_type, rate_value, rate_per_word, currency, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,'EUR',NOW())`,
          [vendorIds[rc.name], src, tgt, svc, rType, rVal, rpw]
        );
      }
    }
    console.log("Seeded vendor rate cards");

    // ── 7. Seed portal tasks ──
    const now = new Date();
    const in1day = new Date(now.getTime() + 86400000);
    const in2days = new Date(now.getTime() + 2 * 86400000);
    const in5days = new Date(now.getTime() + 5 * 86400000);

    await client.query(`DELETE FROM portal_tasks WHERE external_id IN ('SYM-2026-0412','SYM-2026-0413','APS-LB-4521')`);

    await client.query(
      `INSERT INTO portal_tasks (portal_source, external_id, task_data, status, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$5)`,
      ["symfonie","SYM-2026-0412",JSON.stringify({projectName:"Amazon Product Listings EN>DE",name:"Amazon Product Listings EN>DE",sourceLanguage:"English",targetLanguages:["German"],wordCount:2500,deadline:in2days.toISOString(),client_name:"Amazon/Centific"}),"pending",now]
    );
    await client.query(
      `INSERT INTO portal_tasks (portal_source, external_id, task_data, status, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$5)`,
      ["symfonie","SYM-2026-0413",JSON.stringify({projectName:"Microsoft Azure Docs EN>TR,FR",name:"Microsoft Azure Docs EN>TR,FR",sourceLanguage:"English",targetLanguages:["Turkish","French"],wordCount:8000,deadline:in5days.toISOString(),client_name:"Microsoft/RWS"}),"pending",now]
    );
    await client.query(
      `INSERT INTO portal_tasks (portal_source, external_id, task_data, status, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$5)`,
      ["aps","APS-LB-4521",JSON.stringify({projectName:"Lionbridge Legal Review DE>EN",name:"Lionbridge Legal Review DE>EN",sourceLanguage:"German",targetLanguages:["English"],wordCount:1200,deadline:in1day.toISOString(),client_name:"Lionbridge (LCX)"}),"pending",now]
    );
    console.log("Seeded 3 portal tasks");

    // ── 8. Seed projects with jobs (with rates) ──
    await client.query(`DELETE FROM projects WHERE project_name IN ('Samsung Mobile App Localization','Netflix Subtitle Translation')`);

    const p1 = await client.query(
      `INSERT INTO projects (entity_id, customer_id, project_name, project_code, source, status, deadline, created_at, updated_at)
       VALUES ($1,$2,'Samsung Mobile App Localization','MAN-2026-0050','manual','in_progress',$3,$4,$4) RETURNING id`,
      [entityId, customerId, in5days, now]
    );
    const project1Id = p1.rows[0].id;
    console.log(`Created Samsung project id=${project1Id}`);

    // EN>TR job - assigned to Ayşe Kaya with rates
    await client.query(
      `INSERT INTO jobs (project_id, job_code, job_name, source_language, target_language, service_type, status,
        word_count, vendor_id, assigned_at, vendor_rate, client_rate, vendor_total, client_total, deadline, created_at, updated_at)
       VALUES ($1,'MAN-2026-0050-TR','EN>TR Translation','EN','TR','Translation','assigned',
        2500,$2,$3,'0.0600','0.1000','150.00','250.00',$4,$3,$3)`,
      [project1Id, vendorIds["Ayşe Kaya"], now, in5days]
    );
    // EN>DE job
    await client.query(
      `INSERT INTO jobs (project_id, job_code, job_name, source_language, target_language, service_type, status,
        word_count, vendor_rate, client_rate, vendor_total, client_total, deadline, created_at, updated_at)
       VALUES ($1,'MAN-2026-0050-DE','EN>DE Translation','EN','DE','Translation','unassigned',
        2500,'0.0800','0.1200','200.00','300.00',$2,$3,$3)`,
      [project1Id, in5days, now]
    );
    // EN>FR job
    await client.query(
      `INSERT INTO jobs (project_id, job_code, job_name, source_language, target_language, service_type, status,
        word_count, vendor_rate, client_rate, vendor_total, client_total, deadline, created_at, updated_at)
       VALUES ($1,'MAN-2026-0050-FR','EN>FR Translation','EN','FR','Translation','unassigned',
        2500,'0.0700','0.1100','175.00','275.00',$2,$3,$3)`,
      [project1Id, in5days, now]
    );
    console.log("  Created 3 Samsung jobs with rates (EN>TR assigned to Ayşe Kaya)");

    const p2 = await client.query(
      `INSERT INTO projects (entity_id, customer_id, project_name, project_code, source, external_id, status, deadline, created_at, updated_at)
       VALUES ($1,$2,'Netflix Subtitle Translation','SYM-2026-0399','symfonie','SYM-2026-0399','confirmed',$3,$4,$4) RETURNING id`,
      [entityId, customerId, in5days, now]
    );
    const project2Id = p2.rows[0].id;
    console.log(`Created Netflix project id=${project2Id}`);

    // EN>ES job
    await client.query(
      `INSERT INTO jobs (project_id, job_code, job_name, source_language, target_language, service_type, status,
        word_count, vendor_rate, client_rate, vendor_total, client_total, deadline, created_at, updated_at)
       VALUES ($1,'SYM-2026-0399-ES','EN>ES Translation','EN','ES','Translation','unassigned',
        2500,'0.0650','0.1000','162.50','250.00',$2,$3,$3)`,
      [project2Id, in5days, now]
    );
    // EN>PT job
    await client.query(
      `INSERT INTO jobs (project_id, job_code, job_name, source_language, target_language, service_type, status,
        word_count, vendor_rate, client_rate, vendor_total, client_total, deadline, created_at, updated_at)
       VALUES ($1,'SYM-2026-0399-PT','EN>PT Translation','EN','PT','Translation','unassigned',
        2500,'0.0550','0.0900','137.50','225.00',$2,$3,$3)`,
      [project2Id, in5days, now]
    );
    console.log("  Created 2 Netflix jobs with rates");

    // ── 9. Seed notifications ──
    await client.query(`DELETE FROM notifications WHERE title LIKE 'New Symfonie task: Amazon%' OR title LIKE 'Deadline approaching: Lionbridge%'`);
    await client.query(
      `INSERT INTO notifications (pm_user_id, type, title, message, read, created_at) VALUES ($1,$2,$3,$4,$5,$6)`,
      [5, "task_incoming", "New Symfonie task: Amazon Product Listings", "A new task from Symfonie portal is awaiting your review.", false, now]
    );
    await client.query(
      `INSERT INTO notifications (pm_user_id, type, title, message, read, created_at) VALUES ($1,$2,$3,$4,$5,$6)`,
      [5, "deadline_warning", "Deadline approaching: Lionbridge Legal Review (tomorrow)", "The Lionbridge Legal Review DE>EN task deadline is tomorrow.", false, now]
    );
    console.log("Seeded 2 notifications");

    // ── 10. Seed activity feed (audit_log) ──
    let auditUserId = null;
    const existingUser = await client.query(`SELECT id FROM users LIMIT 1`);
    if (existingUser.rows.length > 0) auditUserId = existingUser.rows[0].id;

    await client.query(
      `DELETE FROM audit_log WHERE entity_type IN ('vendor','project','job','portal_task')
       AND action IN ('vendor_created','vendor_approved','project_created','job_assigned','portal_task_received','vendor_stage_changed','quality_report_submitted')`
    );

    const auditEntries = [
      { action: "portal_task_received", eType: "portal_task", eId: null, newData: { externalId: "SYM-2026-0412", portal: "symfonie", task: "Amazon Product Listings EN>DE" }, ago: 1 },
      { action: "vendor_created", eType: "vendor", eId: vendorIds["Pierre Martin"], newData: { fullName: "Pierre Martin", email: "pierre.martin@example.com", status: "New Application" }, ago: 2 },
      { action: "job_assigned", eType: "job", eId: null, newData: { jobCode: "MAN-2026-0050-TR", vendorName: "Ayşe Kaya", project: "Samsung Mobile App Localization" }, ago: 3 },
      { action: "vendor_approved", eType: "vendor", eId: vendorIds["Ayşe Kaya"], oldData: { status: "Test Sent" }, newData: { status: "Approved", fullName: "Ayşe Kaya" }, ago: 4 },
      { action: "project_created", eType: "project", eId: project2Id, newData: { projectName: "Netflix Subtitle Translation", source: "symfonie", status: "confirmed" }, ago: 5 },
      { action: "project_created", eType: "project", eId: project1Id, newData: { projectName: "Samsung Mobile App Localization", source: "manual", status: "in_progress" }, ago: 6 },
      { action: "vendor_stage_changed", eType: "vendor", eId: vendorIds["Mehmet Yılmaz"], oldData: { status: "New Application" }, newData: { status: "Test Sent", fullName: "Mehmet Yılmaz" }, ago: 8 },
      { action: "quality_report_submitted", eType: "vendor", eId: vendorIds["Marie Dupont"], newData: { vendorName: "Marie Dupont", reportType: "LQA", lqaScore: 92, account: "Netflix" }, ago: 12 },
    ];

    for (const entry of auditEntries) {
      await client.query(
        `INSERT INTO audit_log (user_id, action, entity_type, entity_id, old_data, new_data, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [auditUserId, entry.action, entry.eType, entry.eId, entry.oldData ? JSON.stringify(entry.oldData) : null, JSON.stringify(entry.newData), new Date(now.getTime() - entry.ago * 3600000)]
      );
    }
    console.log(`Seeded ${auditEntries.length} audit_log entries for activity feed`);

    // ── 11. Seed quality reports ──
    const qReports = [
      { vid: vendorIds["Ayşe Kaya"], type: "QS", qs: 4.2, lqa: null, proj: "Samsung Mobile App Localization", acct: "Samsung", src: "EN", tgt: "TR", wc: 3500, content: "Technology", job: "Translation", comment: "Excellent terminology consistency. Minor style preferences noted.", daysAgo: 7 },
      { vid: vendorIds["Hans Müller"], type: "QS", qs: 3.8, lqa: null, proj: "Samsung Mobile App Localization", acct: "Samsung", src: "EN", tgt: "DE", wc: 3500, content: "Technology", job: "Translation", comment: "Good accuracy but some inconsistency in UI string translation.", daysAgo: 5 },
      { vid: vendorIds["Marie Dupont"], type: "LQA", qs: null, lqa: 92.0, proj: "Netflix Subtitle Translation", acct: "Netflix", src: "EN", tgt: "FR", wc: 5000, content: "Entertainment", job: "Translation", comment: "Outstanding quality. Very natural-sounding French subtitles.", daysAgo: 3 },
      { vid: vendorIds["Carlos García"], type: "QS", qs: 4.0, lqa: null, proj: "Netflix Subtitle Translation", acct: "Netflix", src: "EN", tgt: "ES", wc: 5000, content: "Entertainment", job: "Translation", comment: "Solid work on subtitle timing and idiomatic expressions.", daysAgo: 2 },
      { vid: vendorIds["Ana Silva"], type: "QS", qs: 4.5, lqa: null, proj: "Netflix Subtitle Translation", acct: "Netflix", src: "EN", tgt: "PT", wc: 5000, content: "Entertainment", job: "Translation", comment: "Exceptional quality. Flawless Portuguese.", daysAgo: 1 },
    ];

    for (const qr of qReports) {
      const reportDate = new Date(now.getTime() - qr.daysAgo * 86400000).toISOString().split("T")[0];
      await client.query(
        `INSERT INTO quality_reports (vendor_id, report_type, qs_score, lqa_score, project_name, client_account,
          source_language, target_language, word_count, content_type, job_type, status, reviewer_comments, report_date,
          created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'completed',$12,$13,NOW(),NOW())`,
        [qr.vid, qr.type, qr.qs, qr.lqa, qr.proj, qr.acct, qr.src, qr.tgt, qr.wc, qr.content, qr.job, qr.comment, reportDate]
      );
    }
    console.log(`Seeded ${qReports.length} quality reports`);

    // Update vendor account quality scores
    await client.query(`UPDATE vendors SET account_quality_scores = $1 WHERE id = $2`, [JSON.stringify([{account:"Samsung",qsAvg:4.2,reportCount:1}]), vendorIds["Ayşe Kaya"]]);
    await client.query(`UPDATE vendors SET account_quality_scores = $1 WHERE id = $2`, [JSON.stringify([{account:"Samsung",qsAvg:3.8,reportCount:1}]), vendorIds["Hans Müller"]]);
    await client.query(`UPDATE vendors SET account_quality_scores = $1 WHERE id = $2`, [JSON.stringify([{account:"Netflix",lqaAvg:92.0,reportCount:1}]), vendorIds["Marie Dupont"]]);
    await client.query(`UPDATE vendors SET account_quality_scores = $1 WHERE id = $2`, [JSON.stringify([{account:"Netflix",qsAvg:4.0,reportCount:1}]), vendorIds["Carlos García"]]);
    await client.query(`UPDATE vendors SET account_quality_scores = $1 WHERE id = $2`, [JSON.stringify([{account:"Netflix",qsAvg:4.5,reportCount:1}]), vendorIds["Ana Silva"]]);
    console.log("Updated vendor account quality scores");

    // ── 12. Fix any existing projects with null customer_id ──
    await client.query(`UPDATE projects SET customer_id = $1 WHERE customer_id IS NULL`, [customerId]);
    console.log("Fixed any projects with null customer_id");

    await client.query("COMMIT");
    console.log("\n✓ QA seed data inserted successfully!");
    console.log(`  - 8 vendors with language pairs and rate cards`);
    console.log(`  - 3 portal tasks`);
    console.log(`  - 2 projects with 5 jobs (with rates, EN>TR assigned to Ayşe Kaya)`);
    console.log(`  - 2 notifications`);
    console.log(`  - ${auditEntries.length} activity feed entries`);
    console.log(`  - ${qReports.length} quality reports`);
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
