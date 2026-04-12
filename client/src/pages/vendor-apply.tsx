import { useState, useEffect } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, Loader2, Upload } from "lucide-react";
import {
  SearchableMultiSelect,
  SERVICE_TYPE_OPTIONS,
  SPECIALIZATION_OPTIONS,
  CAT_TOOL_OPTIONS,
  LANGUAGE_OPTIONS,
  CERTIFICATION_OPTIONS,
} from "@/components/SearchableMultiSelect";

const STORAGE_KEY = "elturco_vendor_application_draft";

const STEPS = [
  "Personal Info",
  "Languages",
  "Services",
  "Specializations",
  "Software & Tools",
  "Experience",
  "Rates & Review",
];

interface LanguagePair {
  source: string;
  target: string;
  proficiency: string;
}

interface SoftwareEntry {
  name: string;
  proficiency: string;
}

interface FormData {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  timezone: string;
  website: string;
  linkedin: string;
  nativeLanguage: string;
  languagePairs: LanguagePair[];
  serviceTypes: string[];
  specializations: string[];
  software: SoftwareEntry[];
  experienceYears: number | "";
  education: string;
  certifications: string[];
  cvFileUrl: string;
  ratePerWord: string;
  ratePerHour: string;
  minimumFee: string;
  currency: string;
}

const defaultForm: FormData = {
  fullName: "",
  email: "",
  phone: "",
  location: "",
  timezone: "",
  website: "",
  linkedin: "",
  nativeLanguage: "",
  languagePairs: [],
  serviceTypes: [],
  specializations: [],
  software: [],
  experienceYears: "",
  education: "",
  certifications: [],
  cvFileUrl: "",
  ratePerWord: "",
  ratePerHour: "",
  minimumFee: "",
  currency: "EUR",
};

export default function VendorApplyPage() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormData>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? { ...defaultForm, ...JSON.parse(saved) } : defaultForm;
    } catch {
      return defaultForm;
    }
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  // Auto-save to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(form));
  }, [form]);

  const update = (field: keyof FormData, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const addLanguagePair = () => {
    update("languagePairs", [
      ...form.languagePairs,
      { source: "", target: "", proficiency: "Professional" },
    ]);
  };

  const removeLanguagePair = (idx: number) => {
    update(
      "languagePairs",
      form.languagePairs.filter((_, i) => i !== idx)
    );
  };

  const updateLanguagePair = (idx: number, field: string, value: string) => {
    const updated = [...form.languagePairs];
    (updated[idx] as any)[field] = value;
    update("languagePairs", updated);
  };

  const addSoftware = (name: string) => {
    if (!form.software.find((s) => s.name === name)) {
      update("software", [...form.software, { name, proficiency: "Intermediate" }]);
    }
  };

  const removeSoftware = (name: string) => {
    update(
      "software",
      form.software.filter((s) => s.name !== name)
    );
  };

  const updateSoftwareProficiency = (name: string, proficiency: string) => {
    update(
      "software",
      form.software.map((s) => (s.name === name ? { ...s, proficiency } : s))
    );
  };

  const validateStep = (): string | null => {
    switch (step) {
      case 0:
        if (!form.fullName.trim()) return "Full name is required";
        if (!form.email.trim() || !form.email.includes("@"))
          return "Valid email is required";
        return null;
      case 1:
        if (!form.nativeLanguage) return "Native language is required";
        if (form.languagePairs.length === 0)
          return "At least one language pair is required";
        for (const lp of form.languagePairs) {
          if (!lp.source || !lp.target) return "All language pairs must be complete";
        }
        return null;
      case 2:
        if (form.serviceTypes.length === 0)
          return "Select at least one service type";
        return null;
      default:
        return null;
    }
  };

  const nextStep = () => {
    const err = validateStep();
    if (err) {
      setError(err);
      return;
    }
    setError("");
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const prevStep = () => {
    setError("");
    setStep((s) => Math.max(s - 1, 0));
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/vendors/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          experienceYears: form.experienceYears || undefined,
          ratePerWord: form.ratePerWord || undefined,
          ratePerHour: form.ratePerHour || undefined,
          minimumFee: form.minimumFee || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to submit application");
      }
      setSubmitted(true);
      localStorage.removeItem(STORAGE_KEY);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-[#0d1117] flex items-center justify-center p-4">
        <div className="max-w-md text-center">
          <CheckCircle2 className="w-16 h-16 text-emerald-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-2">
            Application Submitted!
          </h1>
          <p className="text-white/50">
            Thank you for applying to El Turco Translation Services. We will
            review your application and get back to you shortly.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d1117] py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white mb-1">
            Vendor Application
          </h1>
          <p className="text-white/40 text-sm">
            El Turco Translation Services
          </p>
        </div>

        {/* Progress bar */}
        <div className="flex items-center gap-1 mb-8">
          {STEPS.map((s, i) => (
            <div key={s} className="flex-1">
              <div
                className={`h-1.5 rounded-full transition-colors ${
                  i <= step ? "bg-blue-500" : "bg-white/[0.06]"
                }`}
              />
              <p
                className={`text-[10px] mt-1 truncate ${
                  i === step ? "text-blue-400" : "text-white/20"
                }`}
              >
                {s}
              </p>
            </div>
          ))}
        </div>

        {/* Form */}
        <div className="bg-[#161b22] border border-white/[0.06] rounded-xl p-6">
          {/* Step 0: Personal Info */}
          {step === 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-white mb-4">
                Personal Information
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-white/40 mb-1">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    value={form.fullName}
                    onChange={(e) => update("fullName", e.target.value)}
                    className="w-full px-3 py-2 rounded-md bg-white/[0.04] border border-white/10 text-sm text-white placeholder-white/20 outline-none focus:border-blue-500/50"
                    placeholder="John Smith"
                  />
                </div>
                <div>
                  <label className="block text-xs text-white/40 mb-1">
                    Email *
                  </label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => update("email", e.target.value)}
                    className="w-full px-3 py-2 rounded-md bg-white/[0.04] border border-white/10 text-sm text-white placeholder-white/20 outline-none focus:border-blue-500/50"
                    placeholder="john@example.com"
                  />
                </div>
                <div>
                  <label className="block text-xs text-white/40 mb-1">
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => update("phone", e.target.value)}
                    className="w-full px-3 py-2 rounded-md bg-white/[0.04] border border-white/10 text-sm text-white placeholder-white/20 outline-none focus:border-blue-500/50"
                    placeholder="+90 555 123 4567"
                  />
                </div>
                <div>
                  <label className="block text-xs text-white/40 mb-1">
                    Location
                  </label>
                  <input
                    type="text"
                    value={form.location}
                    onChange={(e) => update("location", e.target.value)}
                    className="w-full px-3 py-2 rounded-md bg-white/[0.04] border border-white/10 text-sm text-white placeholder-white/20 outline-none focus:border-blue-500/50"
                    placeholder="Istanbul, Turkey"
                  />
                </div>
                <div>
                  <label className="block text-xs text-white/40 mb-1">
                    Timezone
                  </label>
                  <input
                    type="text"
                    value={form.timezone}
                    onChange={(e) => update("timezone", e.target.value)}
                    className="w-full px-3 py-2 rounded-md bg-white/[0.04] border border-white/10 text-sm text-white placeholder-white/20 outline-none focus:border-blue-500/50"
                    placeholder="UTC+3"
                  />
                </div>
                <div>
                  <label className="block text-xs text-white/40 mb-1">
                    Website
                  </label>
                  <input
                    type="url"
                    value={form.website}
                    onChange={(e) => update("website", e.target.value)}
                    className="w-full px-3 py-2 rounded-md bg-white/[0.04] border border-white/10 text-sm text-white placeholder-white/20 outline-none focus:border-blue-500/50"
                    placeholder="https://..."
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs text-white/40 mb-1">
                    LinkedIn
                  </label>
                  <input
                    type="url"
                    value={form.linkedin}
                    onChange={(e) => update("linkedin", e.target.value)}
                    className="w-full px-3 py-2 rounded-md bg-white/[0.04] border border-white/10 text-sm text-white placeholder-white/20 outline-none focus:border-blue-500/50"
                    placeholder="https://linkedin.com/in/..."
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 1: Languages */}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-white mb-4">
                Languages
              </h2>
              <div>
                <label className="block text-xs text-white/40 mb-1">
                  Native Language *
                </label>
                <select
                  value={form.nativeLanguage}
                  onChange={(e) => update("nativeLanguage", e.target.value)}
                  className="w-full px-3 py-2 rounded-md bg-white/[0.04] border border-white/10 text-sm text-white outline-none focus:border-blue-500/50"
                >
                  <option value="">Select...</option>
                  {LANGUAGE_OPTIONS.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs text-white/40">
                    Language Pairs *
                  </label>
                  <button
                    type="button"
                    onClick={addLanguagePair}
                    className="text-xs text-blue-400 hover:text-blue-300"
                  >
                    + Add pair
                  </button>
                </div>
                {form.languagePairs.length === 0 && (
                  <p className="text-xs text-white/20 text-center py-4">
                    Add at least one language pair
                  </p>
                )}
                {form.languagePairs.map((lp, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 mb-2"
                  >
                    <select
                      value={lp.source}
                      onChange={(e) =>
                        updateLanguagePair(i, "source", e.target.value)
                      }
                      className="flex-1 px-2 py-1.5 rounded-md bg-white/[0.04] border border-white/10 text-xs text-white outline-none"
                    >
                      <option value="">Source</option>
                      {LANGUAGE_OPTIONS.map((l) => (
                        <option key={l.value} value={l.value}>
                          {l.label}
                        </option>
                      ))}
                    </select>
                    <span className="text-white/20 text-xs">→</span>
                    <select
                      value={lp.target}
                      onChange={(e) =>
                        updateLanguagePair(i, "target", e.target.value)
                      }
                      className="flex-1 px-2 py-1.5 rounded-md bg-white/[0.04] border border-white/10 text-xs text-white outline-none"
                    >
                      <option value="">Target</option>
                      {LANGUAGE_OPTIONS.map((l) => (
                        <option key={l.value} value={l.value}>
                          {l.label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={lp.proficiency}
                      onChange={(e) =>
                        updateLanguagePair(i, "proficiency", e.target.value)
                      }
                      className="w-28 px-2 py-1.5 rounded-md bg-white/[0.04] border border-white/10 text-xs text-white outline-none"
                    >
                      <option value="Native">Native</option>
                      <option value="Professional">Professional</option>
                      <option value="Advanced">Advanced</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => removeLanguagePair(i)}
                      className="text-red-400 hover:text-red-300 text-xs"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Services */}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-white mb-4">
                Services
              </h2>
              <p className="text-xs text-white/40 mb-3">
                Select all service types you offer *
              </p>
              <div className="grid grid-cols-2 gap-2">
                {SERVICE_TYPE_OPTIONS.map((svc) => (
                  <label
                    key={svc.value}
                    className={`flex items-center gap-2 px-3 py-2 rounded-md border cursor-pointer transition-colors ${
                      form.serviceTypes.includes(svc.value)
                        ? "border-blue-500/50 bg-blue-500/10 text-blue-300"
                        : "border-white/10 bg-white/[0.02] text-white/60 hover:border-white/20"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={form.serviceTypes.includes(svc.value)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          update("serviceTypes", [
                            ...form.serviceTypes,
                            svc.value,
                          ]);
                        } else {
                          update(
                            "serviceTypes",
                            form.serviceTypes.filter(
                              (s) => s !== svc.value
                            )
                          );
                        }
                      }}
                      className="sr-only"
                    />
                    <span className="text-xs">{svc.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Specializations */}
          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-white mb-4">
                Specializations
              </h2>
              <p className="text-xs text-white/40 mb-2">
                Select your areas of expertise
              </p>
              <SearchableMultiSelect
                options={SPECIALIZATION_OPTIONS}
                selected={form.specializations}
                onChange={(v) => update("specializations", v)}
                placeholder="Search specializations..."
              />
            </div>
          )}

          {/* Step 4: Software & Tools */}
          {step === 4 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-white mb-4">
                Software & Tools
              </h2>
              <SearchableMultiSelect
                options={CAT_TOOL_OPTIONS}
                selected={form.software.map((s) => s.name)}
                onChange={(selected) => {
                  // Add new ones, remove deselected
                  const newSoftware = selected.map(
                    (name) =>
                      form.software.find((s) => s.name === name) || {
                        name,
                        proficiency: "Intermediate",
                      }
                  );
                  update("software", newSoftware);
                }}
                placeholder="Search CAT tools..."
              />
              {form.software.length > 0 && (
                <div className="space-y-2 mt-3">
                  <p className="text-xs text-white/40">
                    Set proficiency level:
                  </p>
                  {form.software.map((sw) => (
                    <div
                      key={sw.name}
                      className="flex items-center gap-3 px-3 py-2 rounded-md bg-white/[0.02] border border-white/[0.06]"
                    >
                      <span className="text-xs text-white/70 flex-1">
                        {sw.name}
                      </span>
                      <select
                        value={sw.proficiency}
                        onChange={(e) =>
                          updateSoftwareProficiency(sw.name, e.target.value)
                        }
                        className="px-2 py-1 rounded bg-white/[0.04] border border-white/10 text-xs text-white outline-none"
                      >
                        <option value="Beginner">Beginner</option>
                        <option value="Intermediate">Intermediate</option>
                        <option value="Advanced">Advanced</option>
                        <option value="Expert">Expert</option>
                      </select>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 5: Experience */}
          {step === 5 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-white mb-4">
                Experience & Education
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-white/40 mb-1">
                    Years of Experience
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={form.experienceYears}
                    onChange={(e) =>
                      update(
                        "experienceYears",
                        e.target.value ? parseInt(e.target.value) : ""
                      )
                    }
                    className="w-full px-3 py-2 rounded-md bg-white/[0.04] border border-white/10 text-sm text-white outline-none focus:border-blue-500/50"
                  />
                </div>
                <div>
                  <label className="block text-xs text-white/40 mb-1">
                    Education Level
                  </label>
                  <select
                    value={form.education}
                    onChange={(e) => update("education", e.target.value)}
                    className="w-full px-3 py-2 rounded-md bg-white/[0.04] border border-white/10 text-sm text-white outline-none focus:border-blue-500/50"
                  >
                    <option value="">Select...</option>
                    <option value="High School">High School</option>
                    <option value="Bachelor's">Bachelor's Degree</option>
                    <option value="Master's">Master's Degree</option>
                    <option value="PhD">PhD</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-white/40 mb-1">
                  Certifications
                </label>
                <SearchableMultiSelect
                  options={CERTIFICATION_OPTIONS}
                  selected={form.certifications}
                  onChange={(v) => update("certifications", v)}
                  placeholder="Search certifications..."
                />
              </div>
              <div>
                <label className="block text-xs text-white/40 mb-1">
                  CV Upload
                </label>
                <p className="text-[10px] text-white/20 mb-2">
                  Upload your CV (PDF/DOCX, max 10MB)
                </p>
                <label className="flex items-center gap-2 px-4 py-3 rounded-md border border-dashed border-white/10 bg-white/[0.02] cursor-pointer hover:border-white/20 transition-colors">
                  <Upload className="w-4 h-4 text-white/30" />
                  <span className="text-xs text-white/40">
                    {form.cvFileUrl
                      ? "CV uploaded"
                      : "Click to upload CV"}
                  </span>
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx"
                    className="sr-only"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = () => {
                        update("cvFileUrl", reader.result as string);
                      };
                      reader.readAsDataURL(file);
                    }}
                  />
                </label>
              </div>
            </div>
          )}

          {/* Step 6: Rates & Review */}
          {step === 6 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-white mb-4">
                Rates & Review
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-white/40 mb-1">
                    Rate per Word
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    value={form.ratePerWord}
                    onChange={(e) => update("ratePerWord", e.target.value)}
                    className="w-full px-3 py-2 rounded-md bg-white/[0.04] border border-white/10 text-sm text-white outline-none focus:border-blue-500/50"
                    placeholder="0.08"
                  />
                </div>
                <div>
                  <label className="block text-xs text-white/40 mb-1">
                    Rate per Hour
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.ratePerHour}
                    onChange={(e) => update("ratePerHour", e.target.value)}
                    className="w-full px-3 py-2 rounded-md bg-white/[0.04] border border-white/10 text-sm text-white outline-none focus:border-blue-500/50"
                    placeholder="30.00"
                  />
                </div>
                <div>
                  <label className="block text-xs text-white/40 mb-1">
                    Minimum Fee
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.minimumFee}
                    onChange={(e) => update("minimumFee", e.target.value)}
                    className="w-full px-3 py-2 rounded-md bg-white/[0.04] border border-white/10 text-sm text-white outline-none focus:border-blue-500/50"
                    placeholder="25.00"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-white/40 mb-1">
                  Currency
                </label>
                <select
                  value={form.currency}
                  onChange={(e) => update("currency", e.target.value)}
                  className="w-full px-3 py-2 rounded-md bg-white/[0.04] border border-white/10 text-sm text-white outline-none focus:border-blue-500/50"
                >
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                  <option value="GBP">GBP</option>
                  <option value="TRY">TRY</option>
                </select>
              </div>

              {/* Review summary */}
              <div className="mt-6 pt-4 border-t border-white/[0.06]">
                <h3 className="text-sm font-medium text-white mb-3">
                  Application Summary
                </h3>
                <div className="space-y-2 text-xs">
                  <p className="text-white/60">
                    <span className="text-white/30">Name:</span> {form.fullName}
                  </p>
                  <p className="text-white/60">
                    <span className="text-white/30">Email:</span> {form.email}
                  </p>
                  <p className="text-white/60">
                    <span className="text-white/30">Languages:</span>{" "}
                    {form.languagePairs
                      .map((lp) => `${lp.source}→${lp.target}`)
                      .join(", ") || "None"}
                  </p>
                  <p className="text-white/60">
                    <span className="text-white/30">Services:</span>{" "}
                    {form.serviceTypes.join(", ") || "None"}
                  </p>
                  <p className="text-white/60">
                    <span className="text-white/30">Specializations:</span>{" "}
                    {form.specializations.join(", ") || "None"}
                  </p>
                  <p className="text-white/60">
                    <span className="text-white/30">Tools:</span>{" "}
                    {form.software.map((s) => s.name).join(", ") || "None"}
                  </p>
                  <p className="text-white/60">
                    <span className="text-white/30">Experience:</span>{" "}
                    {form.experienceYears || "Not specified"} years
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="mt-4 px-3 py-2 rounded-md bg-red-500/10 border border-red-500/20 text-xs text-red-400">
              {error}
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-white/[0.06]">
            <button
              type="button"
              onClick={prevStep}
              disabled={step === 0}
              className="flex items-center gap-1 px-4 py-2 rounded-md text-xs text-white/40 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Back
            </button>

            {step < STEPS.length - 1 ? (
              <button
                type="button"
                onClick={nextStep}
                className="flex items-center gap-1 px-4 py-2 rounded-md bg-blue-500 text-white text-xs font-medium hover:bg-blue-600 transition-colors"
              >
                Next <ChevronRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="flex items-center gap-2 px-6 py-2 rounded-md bg-emerald-500 text-white text-xs font-medium hover:bg-emerald-600 disabled:opacity-50 transition-colors"
              >
                {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Submit Application
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
