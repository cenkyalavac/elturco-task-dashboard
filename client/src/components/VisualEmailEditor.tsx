import { useState, useRef, useEffect, useCallback } from "react";
import DOMPurify from "dompurify";
import { Input } from "@/components/ui/input";
import { Bold, Italic, Link2, List, Eye, Code, Type } from "lucide-react";

interface VisualEmailEditorProps {
  subject: string;
  body: string;
  onSubjectChange: (v: string) => void;
  onBodyChange: (v: string) => void;
  placeholders?: string[];
  compact?: boolean;
}

const COMMON_PLACEHOLDERS = [
  "freelancerName", "account", "projectId", "projectTitle",
  "deadline", "total", "wwc", "role", "source", "sheet",
  "hoNote", "revType",
];

export default function VisualEmailEditor({
  subject, body, onSubjectChange, onBodyChange, placeholders, compact,
}: VisualEmailEditorProps) {
  const [mode, setMode] = useState<"visual" | "preview" | "html">("visual");
  const editorRef = useRef<HTMLDivElement>(null);
  const [htmlSource, setHtmlSource] = useState(body);
  const vars = placeholders || COMMON_PLACEHOLDERS;
  const minH = compact ? "min-h-[120px]" : "min-h-[200px]";

  // Sync from parent when body changes externally (initial load)
  const initialized = useRef(false);
  useEffect(() => {
    if (!initialized.current) {
      setHtmlSource(body);
      initialized.current = true;
    }
  }, [body]);

  // When switching to visual mode, load HTML into contentEditable
  useEffect(() => {
    if (mode === "visual" && editorRef.current) {
      // Only set innerHTML if it's different (avoid cursor reset)
      if (editorRef.current.innerHTML !== htmlSource) {
        editorRef.current.innerHTML = htmlSource;
      }
    }
  }, [mode]);

  // Capture changes from contentEditable
  const handleEditorInput = useCallback(() => {
    if (editorRef.current) {
      const newHtml = editorRef.current.innerHTML;
      setHtmlSource(newHtml);
      onBodyChange(newHtml);
    }
  }, [onBodyChange]);

  // Capture changes from HTML source textarea
  const handleSourceChange = useCallback((newHtml: string) => {
    setHtmlSource(newHtml);
    onBodyChange(newHtml);
  }, [onBodyChange]);

  // execCommand helpers for toolbar
  function execFmt(command: string, value?: string) {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    handleEditorInput();
  }

  function insertHtml(html: string) {
    editorRef.current?.focus();
    document.execCommand("insertHTML", false, html);
    handleEditorInput();
  }

  function insertPlaceholder(name: string) {
    if (mode === "visual") {
      insertHtml(`<span style="background:#dbeafe;color:#2563eb;padding:1px 4px;border-radius:3px;font-family:monospace;font-size:12px" contenteditable="false">\{\{${name}\}\}</span>&nbsp;`);
    } else if (mode === "html") {
      // Insert at cursor position in textarea — we'll just append
      const tag = `{{${name}}}`;
      handleSourceChange(htmlSource + tag);
    }
  }

  function handleAddLink() {
    const url = prompt("URL:");
    if (!url) return;
    const selection = window.getSelection();
    const text = selection?.toString() || "link";
    if (mode === "visual") {
      insertHtml(`<a href="${url}" style="color:#3b82f6">${text}</a>`);
    }
  }

  // Highlight placeholders in preview
  function highlightVars(html: string): string {
    return html.replace(
      /\{\{(\w+)\}\}/g,
      '<span style="background:#dbeafe;color:#2563eb;padding:1px 4px;border-radius:3px;font-size:11px">$1</span>'
    );
  }

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
        {mode === "visual" && (
          <div className="flex items-center gap-0.5 bg-white/[0.03] border border-white/[0.06] rounded-md p-0.5">
            <ToolBtn icon={<Bold className="w-3 h-3" />} title="Bold" onClick={() => execFmt("bold")} />
            <ToolBtn icon={<Italic className="w-3 h-3" />} title="Italic" onClick={() => execFmt("italic")} />
            <ToolBtn icon={<Link2 className="w-3 h-3" />} title="Add Link" onClick={handleAddLink} />
            <ToolBtn icon={<List className="w-3 h-3" />} title="Bullet List" onClick={() => execFmt("insertUnorderedList")} />
          </div>
        )}
        {mode === "visual" && <div className="h-4 w-px bg-white/[0.06] mx-1" />}

        {/* Placeholder chips */}
        <div className="flex items-center gap-1 flex-wrap">
          {vars.slice(0, compact ? 5 : 10).map(v => (
            <button
              key={v}
              onClick={() => insertPlaceholder(v)}
              className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-colors"
              title={`Insert {{${v}}}`}
            >
              {v}
            </button>
          ))}
          {vars.length > (compact ? 5 : 10) && (
            <span className="text-[9px] text-muted-foreground">+{vars.length - (compact ? 5 : 10)}</span>
          )}
        </div>

        {/* Mode switcher */}
        <div className="ml-auto flex items-center gap-0.5 bg-white/[0.03] border border-white/[0.06] rounded-md p-0.5">
          <ModeBtn label="Edit" icon={<Type className="w-3 h-3" />} active={mode === "visual"} onClick={() => setMode("visual")} />
          <ModeBtn label="Preview" icon={<Eye className="w-3 h-3" />} active={mode === "preview"} onClick={() => setMode("preview")} />
          <ModeBtn label="HTML" icon={<Code className="w-3 h-3" />} active={mode === "html"} onClick={() => setMode("html")} />
        </div>
      </div>

      {/* Editor area */}
      {mode === "visual" ? (
        <div
          ref={editorRef}
          contentEditable
          onInput={handleEditorInput}
          onBlur={handleEditorInput}
          className={`${minH} p-3 text-xs bg-white dark:bg-[#1a1d27] text-black dark:text-white/90 border border-white/[0.08] rounded-lg overflow-y-auto focus:ring-1 focus:ring-primary/30 focus:border-primary/40 leading-relaxed outline-none [&_table]:w-full [&_table]:border-collapse [&_td]:p-2 [&_td]:text-xs [&_a]:text-blue-500 [&_a]:underline [&_strong]:font-bold`}
          data-testid="input-email-body"
          suppressContentEditableWarning
        />
      ) : mode === "preview" ? (
        <div className={`${minH} p-3 bg-white rounded-lg border border-white/[0.08] text-black text-xs overflow-y-auto`}>
          <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(highlightVars(htmlSource)) }} />
        </div>
      ) : (
        <textarea
          value={htmlSource}
          onChange={(e) => handleSourceChange(e.target.value)}
          className={`w-full ${minH} p-2 bg-[#13151d] text-[10px] font-mono text-emerald-300/80 border border-white/[0.06] rounded-lg resize-y leading-relaxed`}
          data-testid="input-email-html"
        />
      )}
    </div>
  );
}

function ToolBtn({ icon, title, onClick }: { icon: React.ReactNode; title: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors"
    >
      {icon}
    </button>
  );
}

function ModeBtn({ label, icon, active, onClick }: { label: string; icon: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded transition-colors ${
        active ? "bg-white/[0.10] text-foreground" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
