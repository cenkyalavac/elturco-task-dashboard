/**
 * Google Sheets API direct write module.
 * Bypasses SheetDB's column prefix-matching bug by using A1 notation (cell addresses).
 * Uses a service account for authentication — works on Railway without external-tool CLI.
 */

let sheetsApi: any = null;
let authClient: any = null;

// Lazy-init Google Sheets API
async function getSheets() {
  if (sheetsApi) return sheetsApi;
  try {
    const { google } = require("googleapis");
    let key: any = null;
    // Try env var first (Railway), then file (local dev)
    const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    if (keyJson) {
      key = JSON.parse(keyJson);
    } else {
      try {
        const fs = require("fs");
        const path = require("path");
        const filePath = path.join(process.cwd(), "service-account.json");
        if (fs.existsSync(filePath)) {
          key = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        }
      } catch {}
    }
    if (!key) {
      console.log("GSheets: No service account key found, writes disabled");
      return null;
    }
    authClient = new google.auth.GoogleAuth({
      credentials: key,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    sheetsApi = google.sheets({ version: "v4", auth: authClient });
    console.log("GSheets: Initialized with service account", key.client_email);
    return sheetsApi;
  } catch (e: any) {
    console.error("GSheets: Init failed:", e.message);
    return null;
  }
}

// Convert 0-based column index to letter(s): 0=A, 25=Z, 26=AA
function colLetter(index: number): string {
  let s = "";
  let n = index;
  while (n >= 0) {
    s = String.fromCharCode((n % 26) + 65) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

// Cache headers per spreadsheet+tab (they rarely change)
const headerCache = new Map<string, { headers: string[]; ts: number }>();
const HEADER_CACHE_TTL = 600000; // 10 min

/**
 * Get header row for a given spreadsheet + tab.
 * Returns array of column names in order.
 */
async function getHeaders(spreadsheetId: string, tabName: string): Promise<string[] | null> {
  const cacheKey = `${spreadsheetId}|${tabName}`;
  const cached = headerCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < HEADER_CACHE_TTL) return cached.headers;

  const sheets = await getSheets();
  if (!sheets) return null;
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${tabName}'!A1:BZ1`,
    });
    const headers = res.data.values?.[0] || [];
    headerCache.set(cacheKey, { headers, ts: Date.now() });
    return headers;
  } catch (e: any) {
    console.error(`GSheets: Failed to read headers for ${tabName}:`, e.message?.slice(0, 100));
    return null;
  }
}

/**
 * Find the row number for a given ID value in a column.
 * Returns 1-based row number or null.
 */
async function findRow(spreadsheetId: string, tabName: string, idColLetter: string, idValue: string): Promise<number | null> {
  const sheets = await getSheets();
  if (!sheets) return null;
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${tabName}'!${idColLetter}:${idColLetter}`,
    });
    const rows = res.data.values || [];
    for (let i = 0; i < rows.length; i++) {
      if (rows[i][0] === idValue) return i + 1; // 1-based
    }
    return null;
  } catch (e: any) {
    console.error(`GSheets: findRow error:`, e.message?.slice(0, 100));
    return null;
  }
}

/**
 * Read a single cell value.
 */
async function readCell(spreadsheetId: string, tabName: string, cell: string): Promise<string> {
  const sheets = await getSheets();
  if (!sheets) return "";
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${tabName}'!${cell}`,
    });
    return res.data.values?.[0]?.[0] || "";
  } catch {
    return "";
  }
}

/**
 * Write a single cell value.
 */
async function writeCell(spreadsheetId: string, tabName: string, cell: string, value: string): Promise<boolean> {
  const sheets = await getSheets();
  if (!sheets) return false;
  try {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${tabName}'!${cell}`,
      valueInputOption: "RAW",
      requestBody: { values: [[value]] },
    });
    return true;
  } catch (e: any) {
    console.error(`GSheets: writeCell ${cell} failed:`, e.message?.slice(0, 100));
    return false;
  }
}

/**
 * Find a column by name in headers (exact match).
 * Returns { index, letter } or null.
 */
function findColumn(headers: string[], ...candidates: string[]): { index: number; letter: string; name: string } | null {
  for (const c of candidates) {
    const idx = headers.indexOf(c);
    if (idx >= 0) return { index: idx, letter: colLetter(idx), name: headers[idx] };
  }
  // Fuzzy: normalize and try
  const normalize = (s: string) => s.replace(/[\s\n\r]+/g, "").toLowerCase().replace(/[^a-z0-9%]/g, "");
  const normalizedHeaders = headers.map(h => ({ orig: h, norm: normalize(h) }));
  for (const c of candidates) {
    const cn = normalize(c);
    const match = normalizedHeaders.find(h => h.norm === cn);
    if (match) {
      const idx = headers.indexOf(match.orig);
      return { index: idx, letter: colLetter(idx), name: match.orig };
    }
  }
  return null;
}

// ============================================
// PUBLIC API — used by routes.ts
// ============================================

export interface SheetWriteConfig {
  googleSheetId: string;
  tabName: string;
  projectId: string;
}

/**
 * Write a value to a column in a sheet row, identified by project ID.
 * The column is found by name from the header row.
 * Only writes if the cell is empty or "XX".
 */
export async function gsWriteToColumn(
  config: SheetWriteConfig,
  columnCandidates: string[],
  value: string,
  { skipSafetyCheck = false } = {}
): Promise<{ ok: boolean; message: string }> {
  const { googleSheetId, tabName, projectId } = config;
  if (!googleSheetId) return { ok: false, message: "No googleSheetId" };

  // 1. Get headers
  const headers = await getHeaders(googleSheetId, tabName);
  if (!headers) return { ok: false, message: "Failed to read headers" };

  // 2. Find ID column
  const idCol = findColumn(headers, "Project ID", "ProjectID", "ID", "ATMS ID", "Project code", "Job ID", "Job Code", "Task Name");
  if (!idCol) return { ok: false, message: "No ID column found" };

  // 3. Find target column
  const targetCol = findColumn(headers, ...columnCandidates);
  if (!targetCol) return { ok: false, message: `No column found for candidates: ${columnCandidates.join(", ")}` };

  // 4. Find the row
  const rowNum = await findRow(googleSheetId, tabName, idCol.letter, projectId);
  if (!rowNum) return { ok: false, message: `Row not found for ${projectId}` };

  // 5. Safety check: read current value
  const cellRef = `${targetCol.letter}${rowNum}`;
  if (!skipSafetyCheck) {
    const current = await readCell(googleSheetId, tabName, cellRef);
    if (current && current.toUpperCase() !== "XX") {
      return { ok: false, message: `BLOCKED: ${targetCol.name} already has '${current}' for ${projectId}` };
    }
  }

  // 6. Write
  const ok = await writeCell(googleSheetId, tabName, cellRef, value);
  if (ok) {
    return { ok: true, message: `GS OK: ${targetCol.name}(${cellRef})=${value} for ${projectId}` };
  }
  return { ok: false, message: `GS write failed for ${cellRef}` };
}

/**
 * Check if Google Sheets API is available.
 */
export async function gsIsAvailable(): Promise<boolean> {
  const sheets = await getSheets();
  return !!sheets;
}

/**
 * Read all rows from a sheet tab and return as array of objects
 * (same format as SheetDB: { "Column Name": "value", ... }).
 * Returns null if GS API is unavailable.
 */
export async function gsReadSheet(googleSheetId: string, tabName: string): Promise<Record<string, string>[] | null> {
  const sheets = await getSheets();
  if (!sheets) return null;
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: googleSheetId,
      range: `'${tabName}'!A:BZ`,
      valueRenderOption: "FORMATTED_VALUE",
    });
    const rows = res.data.values;
    if (!rows || rows.length < 2) return [];
    const headers = rows[0] as string[];
    const result: Record<string, string>[] = [];
    for (let i = 1; i < rows.length; i++) {
      const obj: Record<string, string> = {};
      for (let j = 0; j < headers.length; j++) {
        const key = headers[j] || "";
        if (key) obj[key] = (rows[i]?.[j] ?? "").toString();
      }
      result.push(obj);
    }
    return result;
  } catch (e: any) {
    console.error(`GSheets: readSheet ${tabName} failed:`, e.message?.slice(0, 120));
    return null;
  }
}
