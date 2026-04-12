import { useState, useRef, useEffect } from "react";
import { X, ChevronDown, Search } from "lucide-react";

interface Option {
  value: string;
  label: string;
  group?: string;
}

interface SearchableMultiSelectProps {
  options: Option[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  maxHeight?: number;
  disabled?: boolean;
  className?: string;
}

export function SearchableMultiSelect({
  options,
  selected,
  onChange,
  placeholder = "Select...",
  maxHeight = 240,
  disabled = false,
  className = "",
}: SearchableMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const filtered = options.filter(
    (o) =>
      o.label.toLowerCase().includes(search.toLowerCase()) &&
      !selected.includes(o.value)
  );

  const selectedLabels = selected.map(
    (v) => options.find((o) => o.value === v)?.label || v
  );

  const toggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  const remove = (value: string) => {
    onChange(selected.filter((v) => v !== value));
  };

  return (
    <div ref={ref} className={`relative ${className}`}>
      <div
        className={`flex flex-wrap gap-1 min-h-[36px] items-center px-2 py-1 rounded-md border border-white/10 bg-white/[0.04] cursor-pointer ${
          disabled ? "opacity-50 pointer-events-none" : "hover:border-white/20"
        }`}
        onClick={() => {
          if (!disabled) {
            setOpen(!open);
            setTimeout(() => inputRef.current?.focus(), 50);
          }
        }}
      >
        {selected.length === 0 && (
          <span className="text-white/30 text-xs px-1">{placeholder}</span>
        )}
        {selectedLabels.map((label, i) => (
          <span
            key={selected[i]}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 text-[11px] font-medium"
          >
            {label}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                remove(selected[i]);
              }}
              className="hover:text-white"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <ChevronDown className="w-3.5 h-3.5 text-white/30 ml-auto shrink-0" />
      </div>

      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-[#1a1d27] border border-white/[0.08] rounded-lg shadow-xl shadow-black/40 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.06]">
            <Search className="w-3.5 h-3.5 text-white/30" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="flex-1 bg-transparent text-xs text-white/80 placeholder-white/20 outline-none"
            />
            {selected.length > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-[10px] text-red-400 hover:text-red-300"
              >
                Clear all
              </button>
            )}
          </div>
          <div
            className="overflow-y-auto"
            style={{ maxHeight }}
          >
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-white/20">
                No options found
              </div>
            ) : (
              filtered.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    toggle(option.value);
                    setSearch("");
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs text-white/70 hover:bg-white/[0.06] hover:text-white transition-colors"
                >
                  {option.label}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Pre-built option lists for the application
export const SERVICE_TYPE_OPTIONS: Option[] = [
  "Translation", "Interpreting", "Editing", "Proofreading", "DTP",
  "Subtitling", "Transcription", "Voiceover", "Copywriting", "Localization",
].map((s) => ({ value: s, label: s }));

export const SPECIALIZATION_OPTIONS: Option[] = [
  "Legal", "Medical", "Technical", "Marketing", "Financial", "Gaming",
  "Automotive", "IT/Software", "E-commerce", "Tourism", "Education",
  "Pharmaceutical", "Engineering", "Environmental", "Energy", "Fashion",
  "Food & Beverage", "Government", "Human Resources", "Insurance",
  "Manufacturing", "Media", "Military", "Mining", "Real Estate",
  "Retail", "Science", "Sports", "Telecommunications", "Transportation",
  "Advertising", "Architecture", "Art", "Aviation", "Banking",
  "Cosmetics", "Crypto/Blockchain",
].sort().map((s) => ({ value: s, label: s }));

export const CAT_TOOL_OPTIONS: Option[] = [
  "SDL Trados Studio", "memoQ", "Memsource (Phrase)", "Smartcat", "Wordfast",
  "OmegaT", "Across", "Déjà Vu", "CafeTran Espresso", "MateCat",
  "Smartling", "Crowdin", "Transifex", "Lokalise", "POEditor",
  "XTM Cloud", "Wordbee", "GlobalLink", "Passolo", "Alchemy Catalyst",
].sort().map((s) => ({ value: s, label: s }));

export const LANGUAGE_OPTIONS: Option[] = [
  { value: "EN", label: "English" }, { value: "TR", label: "Turkish" },
  { value: "DE", label: "German" }, { value: "FR", label: "French" },
  { value: "ES", label: "Spanish" }, { value: "IT", label: "Italian" },
  { value: "PT", label: "Portuguese" }, { value: "RU", label: "Russian" },
  { value: "AR", label: "Arabic" }, { value: "ZH", label: "Chinese" },
  { value: "JA", label: "Japanese" }, { value: "KO", label: "Korean" },
  { value: "NL", label: "Dutch" }, { value: "PL", label: "Polish" },
  { value: "SV", label: "Swedish" }, { value: "DA", label: "Danish" },
  { value: "NO", label: "Norwegian" }, { value: "FI", label: "Finnish" },
  { value: "EL", label: "Greek" }, { value: "CS", label: "Czech" },
  { value: "HU", label: "Hungarian" }, { value: "RO", label: "Romanian" },
  { value: "BG", label: "Bulgarian" }, { value: "HR", label: "Croatian" },
  { value: "SK", label: "Slovak" }, { value: "SL", label: "Slovenian" },
  { value: "UK", label: "Ukrainian" }, { value: "HE", label: "Hebrew" },
  { value: "TH", label: "Thai" }, { value: "VI", label: "Vietnamese" },
  { value: "ID", label: "Indonesian" }, { value: "MS", label: "Malay" },
  { value: "HI", label: "Hindi" }, { value: "BN", label: "Bengali" },
  { value: "FA", label: "Persian" }, { value: "SR", label: "Serbian" },
  { value: "LT", label: "Lithuanian" }, { value: "LV", label: "Latvian" },
  { value: "ET", label: "Estonian" }, { value: "KA", label: "Georgian" },
].sort((a, b) => a.label.localeCompare(b.label));

export const CERTIFICATION_OPTIONS: Option[] = [
  "DipTrans", "ATA Certified", "NAATI", "IoL", "CIOL",
  "CMI", "AIIC", "CertTrans", "sworn translator", "Other",
].map((s) => ({ value: s, label: s }));

export const VENDOR_STAGES: string[] = [
  "New Application", "CV Review", "Quiz Pending", "Quiz Passed",
  "Test Task", "Interview", "NDA Pending", "Active", "Inactive", "Blacklisted",
];
