import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Bold, Italic, Link2, List, Type, Eye, Code, Undo2 } from "lucide-react";

interface VisualEmailEditorProps {
  subject: string;
  body: string;
  onSubjectChange: (v: string) => void;
  onBodyChange: (v: string) => void;
  placeholders?: string[];
  compact?: boolean;
}

// Convert simple markup to HTML
// Supports: **bold**, _italic_, [text](url), bullet lists, {{vars}}
function markupToHtml(text: string): string {
  if (!text) return "";
  // If it already looks like HTML, return as-is
  if (text.includes("<table") || text.includes("<tr") || text.includes("<div") || text.includes("<p style")) return text;
  
  let html = text
    // Escape HTML entities (but not existing HTML tags)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    // Bold: **text**
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    // Italic: _text_
    .replace(/_(.+?)_/g, "<em>$1</em>")
    // Links: [text](url)
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" style="color:#3b82f6">$1</a>')
    // Line breaks
    .replace(/\n/g, "<br>");
  
  // Bullet lists: lines starting with "- "
  html = html.replace(/((?:^|- ).*(?:<br>|$))+/gm, (match) => {
    const items = match.split("<br>").filter(l => l.trim().startsWith("- ")).map(l => `<li>${l.replace(/^- /, "")}</li>`);
    return items.length > 0 ? `<ul style="margin:8px 0;padding-left:20px">${items.join("")}</ul>` : match;
  });

  return html;
}

// Convert HTML back to simple markup for editing
function htmlToMarkup(html: string): string {
  if (!html) return "";
  // If it's already plain text (no HTML tags), return as-is
  if (!html.includes("<")) return html;
  
  let text = html
    .replace(/<strong>(.*?)<\/strong>/g, "**$1**")
    .replace(/<b>(.*?)<\/b>/g, "**$1**")
    .replace(/<em>(.*?)<\/em>/g, "_$1_")
    .replace(/<i>(.*?)<\/i>/g, "_$1_")
    .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/g, "[$2]($1)")
    .replace(/<br\s*\/?>/g, "\n")
    .replace(/<li>(.*?)<\/li>/g, "- $1\n")
    .replace(/<\/?(?:ul|ol|p|div|span|table|tr|td|th|h[1-6])[^>]*>/g, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text;
}

const COMMON_PLACEHOLDERS = [
  "freelancerName", "account", "projectId", "projectTitle",
  "deadline", "total", "wwc", "role", "source", "sheet",
];

export default function VisualEmailEditor({
  subject, body, onSubjectChange, onBodyChange, placeholders, compact,
}: VisualEmailEditorProps) {
  const [previewMode, setPreviewMode] = useState(false);
  const [showSource, setShowSource] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);
  
  // The body we edit is in simple markup format
  const [editBody, setEditBody] = useState(() => htmlToMarkup(body));
  
  // Sync markup → HTML on change
  const handleBodyChange = useCallback((newMarkup: string) => {
    setEditBody(newMarkup);
    onBodyChange(markupToHtml(newMarkup));
  }, [onBodyChange]);

  function insertAtCursor(before: string, after: string = "") {
    const ta = textRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = editBody.substring(start, end);
    const newText = editBody.substring(0, start) + before + (selected || "text") + after + editBody.substring(end);
    handleBodyChange(newText);
    setTimeout(() => {
      ta.focus();
      const newPos = start + before.length + (selected || "text").length;
      ta.setSelectionRange(start + before.length, newPos);
    }, 0);
  }

  function insertPlaceholder(name: string) {
    const ta = textRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const tag = `{{${name}}}`;
    const newText = editBody.substring(0, start) + tag + editBody.substring(ta.selectionEnd);
    handleBodyChange(newText);
    setTimeout(() => {
      ta.focus();
      const pos = start + tag.length;
      ta.setSelectionRange(pos, pos);
    }, 0);
  }

  const vars = placeholders || COMMON_PLACEHOLDERS;
  const minH = compact ? "min-h-[120px]" : "min-h-[200px]";

  return (
    <div className="space-y-2">
      {/* Subject */}
      <Input
        value={subject}
        onChange={(e) => onSubjectChange(e.target.value)}
        placeholder="Subject..."
        className="h-7 text-xs"
        data-testid="input-email-subject"
      />

      {/* Toolbar */}
      <div className="flex items-center gap-1 flex-wrap">
        <div className="flex items-center gap-0.5 bg-white/[0.03] border border-white/[0.06] rounded-md p-0.5">
          <ToolBtn icon={<Bold className="w-3 h-3" />} title="Bold" onClick={() => insertAtCursor("**", "**")} />
          <ToolBtn icon={<Italic className="w-3 h-3" />} title="Italic" onClick={() => insertAtCursor("_", "_")} />
          <ToolBtn icon={<Link2 className="w-3 h-3" />} title="Link" onClick={() => insertAtCursor("[", "](https://)")} />
          <ToolBtn icon={<List className="w-3 h-3" />} title="Bullet" onClick={() => insertAtCursor("\n- ", "")} />
        </div>
        <div className="h-4 w-px bg-white/[0.06] mx-1" />

        {/* Placeholder chips */}
        <div className="flex items-center gap-1 flex-wrap">
          {vars.slice(0, compact ? 4 : 8).map(v => (
            <button
              key={v}
              onClick={() => insertPlaceholder(v)}
              className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-colors"
              title={`Insert {{${v}}}`}
            >
              {v}
            </button>
          ))}
          {vars.length > (compact ? 4 : 8) && (
            <span className="text-[9px] text-muted-foreground">+{vars.length - (compact ? 4 : 8)} more</span>
          )}
        </div>

        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => { setPreviewMode(!previewMode); setShowSource(false); }}
            className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded transition-colors ${previewMode ? "bg-blue-500/15 text-blue-400" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Eye className="w-3 h-3" />
            Preview
          </button>
          <button
            onClick={() => { setShowSource(!showSource); setPreviewMode(false); }}
            className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded transition-colors ${showSource ? "bg-amber-500/15 text-amber-400" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Code className="w-3 h-3" />
            HTML
          </button>
        </div>
      </div>

      {/* Editor area */}
      {previewMode ? (
        <div className="border border-white/[0.06] rounded-lg p-3 bg-white text-black text-xs max-h-[300px] overflow-y-auto">
          <div dangerouslySetInnerHTML={{ __html: markupToHtml(editBody).replace(/\{\{(\w+)\}\}/g, '<span style="background:#dbeafe;color:#2563eb;padding:1px 4px;border-radius:3px;font-size:11px">$1</span>') }} />
        </div>
      ) : showSource ? (
        <textarea
          value={markupToHtml(editBody)}
          readOnly
          className={`w-full ${minH} p-2 bg-[#13151d] text-[10px] font-mono text-amber-300/70 border border-white/[0.06] rounded-lg resize-y`}
        />
      ) : (
        <textarea
          ref={textRef}
          value={editBody}
          onChange={(e) => handleBodyChange(e.target.value)}
          placeholder="Type your email body here...&#10;&#10;Use **bold**, _italic_, [link text](url)&#10;Use - for bullet lists&#10;Click placeholder buttons above to insert variables"
          className={`w-full ${minH} p-3 text-xs bg-background/50 border border-white/[0.08] rounded-lg resize-y focus:ring-1 focus:ring-primary/30 focus:border-primary/40 leading-relaxed`}
          data-testid="input-email-body"
        />
      )}

      <p className="text-[9px] text-muted-foreground/60">
        **bold** &middot; _italic_ &middot; [text](url) &middot; {"{{variable}}"} &middot; - bullet list
      </p>
    </div>
  );
}

function ToolBtn({ icon, title, onClick }: { icon: React.ReactNode; title: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors"
    >
      {icon}
    </button>
  );
}
