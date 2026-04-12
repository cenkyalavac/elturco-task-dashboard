/**
 * Lionbridge APS Jira Client
 *
 * Connects to Lionbridge APS (which uses Jira) via Jira REST API.
 * Supports both v2 (server) and v3 (cloud) API versions.
 */

export interface ApsCredentials {
  jiraBaseUrl: string;
  jiraEmail: string;
  jiraApiToken: string;
  jiraProjectKey: string;
  boardId?: number | null;
  apiVersion?: "2" | "3";
}

export interface ApsTask {
  key: string;
  id: string;
  summary: string;
  status: string;
  reporter?: string;
  assignee?: string;
  created: string;
  updated: string;
  deadline?: string;
  sourceLanguage?: string;
  targetLanguages?: string[];
  wordCount?: number;
  description?: string;
  attachments?: ApsAttachment[];
  customFields?: Record<string, any>;
  url: string;
}

export interface ApsAttachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  url: string;
}

function buildAuthHeader(credentials: ApsCredentials): string {
  const encoded = Buffer.from(`${credentials.jiraEmail}:${credentials.jiraApiToken}`).toString("base64");
  return `Basic ${encoded}`;
}

function apiBase(credentials: ApsCredentials): string {
  const version = credentials.apiVersion || "3";
  return `${credentials.jiraBaseUrl.replace(/\/+$/, "")}/rest/api/${version}`;
}

function browseUrl(credentials: ApsCredentials, issueKey: string): string {
  return `${credentials.jiraBaseUrl.replace(/\/+$/, "")}/browse/${issueKey}`;
}

async function jiraFetch(
  credentials: ApsCredentials,
  path: string,
  options: RequestInit = {},
): Promise<any> {
  const url = `${apiBase(credentials)}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: buildAuthHeader(credentials),
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(options.headers as Record<string, string> || {}),
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Jira API error ${res.status}: ${text.slice(0, 200)}`);
  }

  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return res.json();
  }
  return null;
}

/**
 * Test the connection to APS Jira.
 */
export async function testConnection(credentials: ApsCredentials): Promise<{ success: boolean; message: string; serverInfo?: any }> {
  try {
    const info = await jiraFetch(credentials, "/serverInfo");
    return {
      success: true,
      message: `Connected to ${info.serverTitle || "Jira"} (${info.version || "unknown"})`,
      serverInfo: info,
    };
  } catch (e: any) {
    return {
      success: false,
      message: e.message || "Connection failed",
    };
  }
}

/**
 * Fetch open tasks from the APS Jira project.
 */
export async function fetchOpenTasks(credentials: ApsCredentials): Promise<ApsTask[]> {
  const jql = `project = "${credentials.jiraProjectKey}" AND status NOT IN (Done, Closed, Cancelled) ORDER BY created DESC`;
  const data = await jiraFetch(credentials, `/search?jql=${encodeURIComponent(jql)}&maxResults=100&fields=summary,status,reporter,assignee,created,updated,duedate,description,attachment,customfield_*`);

  if (!data?.issues || !Array.isArray(data.issues)) return [];

  return data.issues.map((issue: any) => mapJiraIssue(credentials, issue));
}

/**
 * Get detail for a single task.
 */
export async function getTaskDetail(credentials: ApsCredentials, issueKey: string): Promise<ApsTask> {
  const data = await jiraFetch(credentials, `/issue/${issueKey}`);
  return mapJiraIssue(credentials, data);
}

/**
 * Accept a task by transitioning its status to "Accepted" (or equivalent).
 */
export async function acceptTask(credentials: ApsCredentials, issueKey: string): Promise<void> {
  // First, get available transitions
  const transitions = await jiraFetch(credentials, `/issue/${issueKey}/transitions`);
  const acceptTransition = transitions.transitions?.find(
    (t: any) => /accept/i.test(t.name) || /in.progress/i.test(t.name) || /start/i.test(t.name),
  );

  if (!acceptTransition) {
    throw new Error(`No accept/start transition found for ${issueKey}. Available: ${transitions.transitions?.map((t: any) => t.name).join(", ") || "none"}`);
  }

  await jiraFetch(credentials, `/issue/${issueKey}/transitions`, {
    method: "POST",
    body: JSON.stringify({ transition: { id: acceptTransition.id } }),
  });
}

/**
 * Add a comment to an issue.
 */
export async function addComment(credentials: ApsCredentials, issueKey: string, comment: string): Promise<void> {
  const version = credentials.apiVersion || "3";
  const body = version === "3"
    ? { body: { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: comment }] }] } }
    : { body: comment };

  await jiraFetch(credentials, `/issue/${issueKey}/comment`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/**
 * Get attachments for an issue.
 */
export async function getAttachments(credentials: ApsCredentials, issueKey: string): Promise<ApsAttachment[]> {
  const data = await jiraFetch(credentials, `/issue/${issueKey}?fields=attachment`);
  return (data?.fields?.attachment || []).map((a: any) => ({
    id: a.id,
    filename: a.filename,
    mimeType: a.mimeType,
    size: a.size,
    url: a.content,
  }));
}

// ============================================
// HELPERS
// ============================================

function mapJiraIssue(credentials: ApsCredentials, issue: any): ApsTask {
  const fields = issue.fields || {};

  // Try to extract language info from custom fields
  const customFields: Record<string, any> = {};
  for (const [key, val] of Object.entries(fields)) {
    if (key.startsWith("customfield_") && val != null) {
      customFields[key] = val;
    }
  }

  // Extract source/target language from common custom field patterns
  let sourceLanguage: string | undefined;
  let targetLanguages: string[] | undefined;
  let wordCount: number | undefined;

  for (const [_key, val] of Object.entries(customFields)) {
    if (typeof val === "object" && val !== null) {
      const name = (val as any).name?.toLowerCase() || "";
      const value = (val as any).value || "";
      if (name.includes("source") && name.includes("lang")) sourceLanguage = value;
      if (name.includes("target") && name.includes("lang")) {
        targetLanguages = Array.isArray(value) ? value : [value];
      }
      if (name.includes("word") && name.includes("count")) wordCount = Number(value) || undefined;
    }
  }

  return {
    key: issue.key,
    id: issue.id,
    summary: fields.summary || "",
    status: fields.status?.name || "Unknown",
    reporter: fields.reporter?.displayName || fields.reporter?.name,
    assignee: fields.assignee?.displayName || fields.assignee?.name,
    created: fields.created,
    updated: fields.updated,
    deadline: fields.duedate || undefined,
    sourceLanguage,
    targetLanguages,
    wordCount,
    description: typeof fields.description === "string" ? fields.description : fields.description?.content?.map((c: any) => c.content?.map((t: any) => t.text).join("")).join("\n") || "",
    attachments: (fields.attachment || []).map((a: any) => ({
      id: a.id,
      filename: a.filename,
      mimeType: a.mimeType,
      size: a.size,
      url: a.content,
    })),
    customFields,
    url: browseUrl(credentials, issue.key),
  };
}

/**
 * Map an APS Jira task to the format expected by the auto-accept engine.
 */
export function mapToAutoAcceptFormat(task: ApsTask): Record<string, any> {
  return {
    project_name: task.summary,
    client: task.reporter || "",
    source_language: task.sourceLanguage || "",
    target_language: task.targetLanguages?.join(", ") || "",
    workflow: "",
    weighted_quantity: task.wordCount || 0,
    name: task.summary,
    deadline_offset: task.deadline ? computeDeadlineOffset(task.deadline) : "0d",
  };
}

function computeDeadlineOffset(deadlineStr: string): string {
  const deadline = new Date(deadlineStr);
  const now = new Date();
  const diffMs = deadline.getTime() - now.getTime();
  if (diffMs <= 0) return "0h";
  const hours = diffMs / (1000 * 60 * 60);
  if (hours >= 24) return `${Math.round(hours / 24)}d`;
  return `${Math.round(hours)}h`;
}
