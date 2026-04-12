import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus,
  List,
  LayoutGrid,
  Search,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Users,
  Trash2,
  Filter,
  ChevronDown,
  ChevronUp,
  X,
} from "lucide-react";

// ── Constants ──

const LANGUAGES = ["EN", "TR", "DE", "FR", "ES", "IT", "PT", "NL", "PL", "RU", "ZH", "JA", "KO", "AR", "SV", "DA", "FI", "NO", "CS", "HU", "RO", "BG", "HR", "SK", "SL", "EL", "UK", "TH", "VI", "ID", "MS", "HI", "BN", "HE", "FA"];

const COUNTRIES = ["Turkey", "United Kingdom", "United States", "Germany", "France", "Spain", "Italy", "Netherlands", "Poland", "Portugal", "Brazil", "Russia", "China", "Japan", "South Korea", "India", "Canada", "Australia", "Sweden", "Norway", "Denmark", "Finland", "Austria", "Switzerland", "Belgium", "Ireland", "Czech Republic", "Hungary", "Romania", "Bulgaria", "Greece", "Ukraine", "Egypt", "UAE", "Saudi Arabia", "Argentina", "Mexico", "Colombia", "Chile"];

const SERVICE_TYPES = [
  "Translation", "Interpretation", "Proofreading", "Localization",
  "Transcription", "Subtitling", "MTPE", "Review", "LQA",
  "Transcreation", "Editing", "DTP", "Copywriting", "TEP",
];

const SPECIALIZATIONS = [
  "Medical", "Legal", "Technical", "Marketing", "IT/Software",
  "Financial", "Gaming", "E-commerce", "Literary", "Automotive",
  "Life Sciences", "Manufacturing",
];

const CAT_TOOLS = [
  "Trados", "memoQ", "Phrase/Memsource", "Smartcat", "MateCAT",
  "Wordfast", "OmegaT", "XTM", "Across",
];

const RATE_TYPES = ["per_word", "per_hour", "per_page"];
const CURRENCIES = ["EUR", "USD", "GBP", "TRY"];
const PAYMENT_METHODS = ["Bank Transfer", "PayPal", "Payoneer", "Wise", "Smartcat"];
const RESOURCE_TYPES = ["Freelancer", "In-house", "Agency"];
const GENDERS = ["Male", "Female", "Other"];

// ── Types ──

interface Vendor {
  id: number;
  fullName: string;
  email: string;
  email2?: string | null;
  phone?: string | null;
  status: string;
  language?: string | null;
  nativeLanguage?: string | null;
  serviceTypes?: string[] | null;
  translationSpecializations?: string[] | null;
  qualityScore?: number | null;
  resourceCode?: string | null;
  accounts?: string[] | null;
  tags?: string[] | null;
  followUpDate?: string | null;
  tested?: boolean | null;
  certified?: boolean | null;
  ndaSigned?: boolean | null;
  availability?: string | null;
  languagePairs?: LanguagePair[] | null;
}

interface LanguagePair {
  id?: number;
  sourceLanguage: string;
  targetLanguage: string;
  isPrimary: boolean;
}

interface VendorsResponse {
  data: Vendor[];
  total: number;
  page: number;
  limit: number;
}

interface PipelineItem {
  status: string;
  count: number;
}

interface UserItem {
  id: number;
  name: string;
  email: string;
}

interface RateRow {
  sourceLanguage: string;
  targetLanguage: string;
  serviceType: string;
  rateType: string;
  rateValue: string;
  currency: string;
}

interface CatDiscounts {
  repetitions: string;
  match100: string;
  match9599: string;
  match8594: string;
  match7584: string;
  match5074: string;
  noMatch: string;
  machineTranslated: string;
}

interface AddressData {
  address1: string;
  address2: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}

interface PaymentInfoData {
  primaryPaymentMethod: string;
  bankName: string;
  accountHolderName: string;
  iban: string;
  swiftCode: string;
  paypalId: string;
  wiseEmail: string;
}

interface TaxInfoData {
  vatNumber: string;
  taxId: string;
}

interface VendorFormData {
  fullName: string;
  email: string;
  email2: string;
  phone: string;
  phone2: string;
  phone3: string;
  address: AddressData;
  location: string;
  website: string;
  skype: string;
  gender: string;
  companyName: string;
  resourceType: string;
  nativeLanguage: string;
  languagePairs: LanguagePair[];
  serviceTypes: string[];
  translationSpecializations: string[];
  software: string[];
  experienceYears: string;
  education: string;
  certifications: string;
  rates: RateRow[];
  catDiscounts: CatDiscounts;
  currency: string;
  minimumFee: string;
  minimumProjectFee: string;
  paymentInfo: PaymentInfoData;
  taxInfo: TaxInfoData;
  status: string;
  assignedTo: string;
  followUpDate: string;
  followUpNote: string;
  tags: string;
  accounts: string;
  notes: string;
  specialInstructions: string;
  ndaSigned: boolean;
  tested: boolean;
  certified: boolean;
  canDoLqa: boolean;
  cvFileUrl: string;
  ndaFileUrl: string;
  portfolioFileUrl: string;
}

interface FilterState {
  sourceLanguage: string;
  targetLanguage: string;
  serviceType: string;
  specialization: string;
  account: string;
  qualityScoreMin: string;
  qualityScoreMax: string;
  tagsFilter: string;
  tested: boolean;
  certified: boolean;
  ndaSigned: boolean;
}

type ViewMode = "list" | "pipeline";

// ── Status definitions ──

const VENDOR_STATUSES = [
  "New Application",
  "Form Sent",
  "Price Negotiation",
  "Test Sent",
  "Approved",
  "Inactive",
  "Rejected",
  "Red Flag",
] as const;

const STATUS_COLORS: Record<string, string> = {
  "New Application": "bg-blue-500/15 text-blue-400 border-blue-500/25",
  "Form Sent": "bg-cyan-500/15 text-cyan-400 border-cyan-500/25",
  "Price Negotiation": "bg-amber-500/15 text-amber-400 border-amber-500/25",
  "Test Sent": "bg-purple-500/15 text-purple-400 border-purple-500/25",
  Approved: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
  Inactive: "bg-zinc-500/15 text-zinc-400 border-zinc-500/25",
  Rejected: "bg-red-500/15 text-red-400 border-red-500/25",
  "Red Flag": "bg-rose-600/15 text-rose-400 border-rose-600/25",
};

const STATUS_HEADER_COLORS: Record<string, string> = {
  "New Application": "border-blue-500/40 bg-blue-500/5",
  "Form Sent": "border-cyan-500/40 bg-cyan-500/5",
  "Price Negotiation": "border-amber-500/40 bg-amber-500/5",
  "Test Sent": "border-purple-500/40 bg-purple-500/5",
  Approved: "border-emerald-500/40 bg-emerald-500/5",
  Inactive: "border-zinc-500/40 bg-zinc-500/5",
  Rejected: "border-red-500/40 bg-red-500/5",
  "Red Flag": "border-rose-600/40 bg-rose-600/5",
};

const LIMIT = 20;

// ── Helper: initial form data ──

function createInitialFormData(): VendorFormData {
  return {
    fullName: "",
    email: "",
    email2: "",
    phone: "",
    phone2: "",
    phone3: "",
    address: { address1: "", address2: "", city: "", state: "", zip: "", country: "" },
    location: "",
    website: "",
    skype: "",
    gender: "",
    companyName: "",
    resourceType: "",
    nativeLanguage: "",
    languagePairs: [{ sourceLanguage: "", targetLanguage: "", isPrimary: true }],
    serviceTypes: [],
    translationSpecializations: [],
    software: [],
    experienceYears: "",
    education: "",
    certifications: "",
    rates: [],
    catDiscounts: {
      repetitions: "", match100: "", match9599: "", match8594: "",
      match7584: "", match5074: "", noMatch: "", machineTranslated: "",
    },
    currency: "",
    minimumFee: "",
    minimumProjectFee: "",
    paymentInfo: {
      primaryPaymentMethod: "", bankName: "", accountHolderName: "",
      iban: "", swiftCode: "", paypalId: "", wiseEmail: "",
    },
    taxInfo: { vatNumber: "", taxId: "" },
    status: "New Application",
    assignedTo: "",
    followUpDate: "",
    followUpNote: "",
    tags: "",
    accounts: "",
    notes: "",
    specialInstructions: "",
    ndaSigned: false,
    tested: false,
    certified: false,
    canDoLqa: false,
    cvFileUrl: "",
    ndaFileUrl: "",
    portfolioFileUrl: "",
  };
}

function createInitialFilters(): FilterState {
  return {
    sourceLanguage: "",
    targetLanguage: "",
    serviceType: "",
    specialization: "",
    account: "",
    qualityScoreMin: "",
    qualityScoreMax: "",
    tagsFilter: "",
    tested: false,
    certified: false,
    ndaSigned: false,
  };
}

// ── Status Badge ──

function StatusBadge({ status }: { status: string }) {
  const colorClass = STATUS_COLORS[status] ?? "bg-zinc-500/15 text-zinc-400 border-zinc-500/25";
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${colorClass}`}
    >
      {status}
    </span>
  );
}

// ── Multi-checkbox helper ──

function MultiCheckboxGrid({
  options,
  selected,
  onChange,
  columns = 3,
}: {
  options: string[];
  selected: string[];
  onChange: (val: string[]) => void;
  columns?: number;
}) {
  const toggle = (item: string) => {
    if (selected.includes(item)) {
      onChange(selected.filter((s) => s !== item));
    } else {
      onChange([...selected, item]);
    }
  };

  return (
    <div className={`grid grid-cols-2 md:grid-cols-${columns} gap-2`}>
      {options.map((opt) => (
        <div key={opt} className="flex items-center gap-2">
          <Checkbox
            id={`cb-${opt}`}
            checked={selected.includes(opt)}
            onCheckedChange={() => toggle(opt)}
          />
          <Label htmlFor={`cb-${opt}`} className="text-xs cursor-pointer">
            {opt}
          </Label>
        </div>
      ))}
    </div>
  );
}

// ── Add Vendor Dialog (Multi-Tab) ──

function AddVendorDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState<VendorFormData>(createInitialFormData);
  const [activeTab, setActiveTab] = useState("personal");
  const [error, setError] = useState<string | null>(null);

  const { data: usersData } = useQuery<UserItem[]>({
    queryKey: ["/api/users"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/users");
      return res.json();
    },
    enabled: open,
  });

  const createMutation = useMutation({
    mutationFn: async (data: VendorFormData) => {
      const payload = buildPayload(data);
      const res = await apiRequest("POST", "/api/vendors", payload);
      const vendor = await res.json();
      // Post language pairs
      const validPairs = data.languagePairs.filter(
        (lp) => lp.sourceLanguage && lp.targetLanguage
      );
      for (const pair of validPairs) {
        await apiRequest("POST", `/api/vendors/${vendor.id}/language-pairs`, {
          sourceLanguage: pair.sourceLanguage,
          targetLanguage: pair.targetLanguage,
          isPrimary: pair.isPrimary,
        });
      }
      return vendor;
    },
    onSuccess: () => {
      setOpen(false);
      setFormData(createInitialFormData());
      setActiveTab("personal");
      setError(null);
      onCreated();
    },
    onError: (err: Error) => {
      setError(err.message || "Failed to create vendor.");
    },
  });

  function buildPayload(data: VendorFormData) {
    const payload: Record<string, unknown> = {
      fullName: data.fullName.trim(),
      email: data.email.trim(),
      status: data.status,
    };

    if (data.email2.trim()) payload.email2 = data.email2.trim();
    if (data.phone.trim()) payload.phone = data.phone.trim();
    if (data.phone2.trim()) payload.phone2 = data.phone2.trim();
    if (data.phone3.trim()) payload.phone3 = data.phone3.trim();

    const addr = data.address;
    if (addr.address1 || addr.city || addr.country) {
      payload.address = {
        address1: addr.address1, address2: addr.address2,
        city: addr.city, state: addr.state, zip: addr.zip, country: addr.country,
      };
    }

    if (data.location.trim()) payload.location = data.location.trim();
    if (data.website.trim()) payload.website = data.website.trim();
    if (data.skype.trim()) payload.skype = data.skype.trim();
    if (data.gender) payload.gender = data.gender;
    if (data.companyName.trim()) payload.companyName = data.companyName.trim();
    if (data.resourceType) payload.resourceType = data.resourceType;
    if (data.nativeLanguage) payload.nativeLanguage = data.nativeLanguage;
    if (data.serviceTypes.length > 0) payload.serviceTypes = data.serviceTypes;
    if (data.translationSpecializations.length > 0) payload.translationSpecializations = data.translationSpecializations;
    if (data.software.length > 0) payload.software = data.software;
    if (data.experienceYears) payload.experienceYears = Number(data.experienceYears);
    if (data.education.trim()) payload.education = data.education.trim();
    if (data.certifications.trim()) {
      payload.certifications = data.certifications.split(",").map((c) => c.trim()).filter(Boolean);
    }

    const validRates = data.rates.filter((r) => r.rateValue && r.serviceType);
    if (validRates.length > 0) {
      payload.rates = validRates.map((r) => ({
        sourceLanguage: r.sourceLanguage,
        targetLanguage: r.targetLanguage,
        serviceType: r.serviceType,
        rateType: r.rateType,
        rateValue: Number(r.rateValue),
        currency: r.currency,
      }));
    }

    const cd = data.catDiscounts;
    if (cd.repetitions || cd.match100 || cd.noMatch) {
      payload.catDiscounts = {
        repetitions: cd.repetitions ? Number(cd.repetitions) : undefined,
        match100: cd.match100 ? Number(cd.match100) : undefined,
        match9599: cd.match9599 ? Number(cd.match9599) : undefined,
        match8594: cd.match8594 ? Number(cd.match8594) : undefined,
        match7584: cd.match7584 ? Number(cd.match7584) : undefined,
        match5074: cd.match5074 ? Number(cd.match5074) : undefined,
        noMatch: cd.noMatch ? Number(cd.noMatch) : undefined,
        machineTranslated: cd.machineTranslated ? Number(cd.machineTranslated) : undefined,
      };
    }

    if (data.currency) payload.currency = data.currency;
    if (data.minimumFee) payload.minimumFee = Number(data.minimumFee);
    if (data.minimumProjectFee) payload.minimumProjectFee = Number(data.minimumProjectFee);

    const pi = data.paymentInfo;
    if (pi.primaryPaymentMethod || pi.iban || pi.paypalId) {
      payload.paymentInfo = {
        primaryPaymentMethod: pi.primaryPaymentMethod,
        bankName: pi.bankName, accountHolderName: pi.accountHolderName,
        iban: pi.iban, swiftCode: pi.swiftCode,
        paypalId: pi.paypalId, wiseEmail: pi.wiseEmail,
      };
    }

    const ti = data.taxInfo;
    if (ti.vatNumber || ti.taxId) {
      payload.taxInfo = { vatNumber: ti.vatNumber, taxId: ti.taxId };
    }

    if (data.assignedTo) payload.assignedTo = Number(data.assignedTo);
    if (data.followUpDate) payload.followUpDate = data.followUpDate;
    if (data.followUpNote.trim()) payload.followUpNote = data.followUpNote.trim();
    if (data.tags.trim()) {
      payload.tags = data.tags.split(",").map((t) => t.trim()).filter(Boolean);
    }
    if (data.accounts.trim()) {
      payload.accounts = data.accounts.split(",").map((a) => a.trim()).filter(Boolean);
    }
    if (data.notes.trim()) payload.notes = data.notes.trim();
    if (data.specialInstructions.trim()) payload.specialInstructions = data.specialInstructions.trim();
    if (data.ndaSigned) payload.ndaSigned = true;
    if (data.tested) payload.tested = true;
    if (data.certified) payload.certified = true;
    if (data.canDoLqa) payload.canDoLqa = true;
    if (data.cvFileUrl.trim()) payload.cvFileUrl = data.cvFileUrl.trim();
    if (data.ndaFileUrl.trim()) payload.ndaFileUrl = data.ndaFileUrl.trim();
    if (data.portfolioFileUrl.trim()) payload.portfolioFileUrl = data.portfolioFileUrl.trim();

    return payload;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!formData.fullName.trim()) {
      setError("Full name is required.");
      setActiveTab("personal");
      return;
    }
    if (!formData.email.trim()) {
      setError("Email is required.");
      setActiveTab("personal");
      return;
    }
    createMutation.mutate(formData);
  }

  function updateField<K extends keyof VendorFormData>(key: K, value: VendorFormData[K]) {
    setFormData((prev) => ({ ...prev, [key]: value }));
  }

  function updateAddress<K extends keyof AddressData>(key: K, value: string) {
    setFormData((prev) => ({
      ...prev,
      address: { ...prev.address, [key]: value },
    }));
  }

  function updatePaymentInfo<K extends keyof PaymentInfoData>(key: K, value: string) {
    setFormData((prev) => ({
      ...prev,
      paymentInfo: { ...prev.paymentInfo, [key]: value },
    }));
  }

  function updateTaxInfo<K extends keyof TaxInfoData>(key: K, value: string) {
    setFormData((prev) => ({
      ...prev,
      taxInfo: { ...prev.taxInfo, [key]: value },
    }));
  }

  function updateCatDiscount<K extends keyof CatDiscounts>(key: K, value: string) {
    setFormData((prev) => ({
      ...prev,
      catDiscounts: { ...prev.catDiscounts, [key]: value },
    }));
  }

  function addLanguagePair() {
    setFormData((prev) => ({
      ...prev,
      languagePairs: [...prev.languagePairs, { sourceLanguage: "", targetLanguage: "", isPrimary: false }],
    }));
  }

  function removeLanguagePair(index: number) {
    setFormData((prev) => ({
      ...prev,
      languagePairs: prev.languagePairs.filter((_, i) => i !== index),
    }));
  }

  function updateLanguagePair(index: number, field: keyof LanguagePair, value: string | boolean) {
    setFormData((prev) => {
      const pairs = [...prev.languagePairs];
      pairs[index] = { ...pairs[index], [field]: value };
      return { ...prev, languagePairs: pairs };
    });
  }

  function addRateRow() {
    setFormData((prev) => ({
      ...prev,
      rates: [...prev.rates, {
        sourceLanguage: "", targetLanguage: "", serviceType: "",
        rateType: "per_word", rateValue: "", currency: "EUR",
      }],
    }));
  }

  function removeRateRow(index: number) {
    setFormData((prev) => ({
      ...prev,
      rates: prev.rates.filter((_, i) => i !== index),
    }));
  }

  function updateRateRow(index: number, field: keyof RateRow, value: string) {
    setFormData((prev) => {
      const rates = [...prev.rates];
      rates[index] = { ...rates[index], [field]: value };
      return { ...prev, rates };
    });
  }

  function handleOpenChange(isOpen: boolean) {
    setOpen(isOpen);
    if (!isOpen) {
      setFormData(createInitialFormData());
      setActiveTab("personal");
      setError(null);
    }
  }

  const users = usersData ?? [];
  const isPending = createMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Plus className="w-4 h-4" />
          Add Vendor
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Vendor</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full grid grid-cols-5">
              <TabsTrigger value="personal" className="text-xs">Personal Info</TabsTrigger>
              <TabsTrigger value="languages" className="text-xs">Languages & Skills</TabsTrigger>
              <TabsTrigger value="rates" className="text-xs">Rates & Payment</TabsTrigger>
              <TabsTrigger value="status" className="text-xs">Status & Notes</TabsTrigger>
              <TabsTrigger value="documents" className="text-xs">Documents</TabsTrigger>
            </TabsList>

            {/* ── Tab 1: Personal Info ── */}
            <TabsContent value="personal" className="space-y-4 mt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Full Name *</Label>
                  <Input
                    placeholder="Jane Doe"
                    value={formData.fullName}
                    onChange={(e) => updateField("fullName", e.target.value)}
                    disabled={isPending}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Email *</Label>
                  <Input
                    type="email"
                    placeholder="jane@example.com"
                    value={formData.email}
                    onChange={(e) => updateField("email", e.target.value)}
                    disabled={isPending}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Email 2</Label>
                  <Input
                    type="email"
                    placeholder="Secondary email"
                    value={formData.email2}
                    onChange={(e) => updateField("email2", e.target.value)}
                    disabled={isPending}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Phone</Label>
                  <Input
                    placeholder="+1 234 567 8900"
                    value={formData.phone}
                    onChange={(e) => updateField("phone", e.target.value)}
                    disabled={isPending}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Phone 2</Label>
                  <Input
                    placeholder="Secondary phone"
                    value={formData.phone2}
                    onChange={(e) => updateField("phone2", e.target.value)}
                    disabled={isPending}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Phone 3</Label>
                  <Input
                    placeholder="Additional phone"
                    value={formData.phone3}
                    onChange={(e) => updateField("phone3", e.target.value)}
                    disabled={isPending}
                  />
                </div>
              </div>

              <div className="border-t border-white/[0.06] pt-4">
                <h4 className="text-sm font-medium text-muted-foreground mb-3">Address</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Address Line 1</Label>
                    <Input
                      placeholder="Street address"
                      value={formData.address.address1}
                      onChange={(e) => updateAddress("address1", e.target.value)}
                      disabled={isPending}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Address Line 2</Label>
                    <Input
                      placeholder="Apt, suite, etc."
                      value={formData.address.address2}
                      onChange={(e) => updateAddress("address2", e.target.value)}
                      disabled={isPending}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">City</Label>
                    <Input
                      placeholder="City"
                      value={formData.address.city}
                      onChange={(e) => updateAddress("city", e.target.value)}
                      disabled={isPending}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">State / Province</Label>
                    <Input
                      placeholder="State"
                      value={formData.address.state}
                      onChange={(e) => updateAddress("state", e.target.value)}
                      disabled={isPending}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">ZIP / Postal Code</Label>
                    <Input
                      placeholder="12345"
                      value={formData.address.zip}
                      onChange={(e) => updateAddress("zip", e.target.value)}
                      disabled={isPending}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Country</Label>
                    <Select
                      value={formData.address.country}
                      onValueChange={(val) => updateAddress("country", val)}
                      disabled={isPending}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select country" />
                      </SelectTrigger>
                      <SelectContent>
                        {COUNTRIES.map((c) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="border-t border-white/[0.06] pt-4">
                <h4 className="text-sm font-medium text-muted-foreground mb-3">Additional Info</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Location</Label>
                    <Input
                      placeholder="e.g. Istanbul, Turkey"
                      value={formData.location}
                      onChange={(e) => updateField("location", e.target.value)}
                      disabled={isPending}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Website</Label>
                    <Input
                      placeholder="https://example.com"
                      value={formData.website}
                      onChange={(e) => updateField("website", e.target.value)}
                      disabled={isPending}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Skype</Label>
                    <Input
                      placeholder="Skype ID"
                      value={formData.skype}
                      onChange={(e) => updateField("skype", e.target.value)}
                      disabled={isPending}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Gender</Label>
                    <Select
                      value={formData.gender}
                      onValueChange={(val) => updateField("gender", val)}
                      disabled={isPending}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select gender" />
                      </SelectTrigger>
                      <SelectContent>
                        {GENDERS.map((g) => (
                          <SelectItem key={g} value={g}>{g}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Company Name</Label>
                    <Input
                      placeholder="Company name"
                      value={formData.companyName}
                      onChange={(e) => updateField("companyName", e.target.value)}
                      disabled={isPending}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Resource Type</Label>
                    <Select
                      value={formData.resourceType}
                      onValueChange={(val) => updateField("resourceType", val)}
                      disabled={isPending}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {RESOURCE_TYPES.map((rt) => (
                          <SelectItem key={rt} value={rt}>{rt}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* ── Tab 2: Languages & Skills ── */}
            <TabsContent value="languages" className="space-y-4 mt-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Native Language</Label>
                <Select
                  value={formData.nativeLanguage}
                  onValueChange={(val) => updateField("nativeLanguage", val)}
                  disabled={isPending}
                >
                  <SelectTrigger className="w-full max-w-xs">
                    <SelectValue placeholder="Select native language" />
                  </SelectTrigger>
                  <SelectContent>
                    {LANGUAGES.map((lang) => (
                      <SelectItem key={lang} value={lang}>{lang}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="border-t border-white/[0.06] pt-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-medium text-muted-foreground">Language Pairs</h4>
                  <Button type="button" variant="outline" size="sm" onClick={addLanguagePair} disabled={isPending}>
                    <Plus className="w-3.5 h-3.5 mr-1" /> Add Pair
                  </Button>
                </div>
                <div className="rounded-lg border border-white/[0.06] overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-white/[0.06] hover:bg-transparent">
                        <TableHead className="text-xs">Source Language</TableHead>
                        <TableHead className="text-xs">Target Language</TableHead>
                        <TableHead className="text-xs w-20">Primary</TableHead>
                        <TableHead className="text-xs w-16"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {formData.languagePairs.map((pair, idx) => (
                        <TableRow key={idx} className="border-white/[0.06]">
                          <TableCell>
                            <Select
                              value={pair.sourceLanguage}
                              onValueChange={(val) => updateLanguagePair(idx, "sourceLanguage", val)}
                              disabled={isPending}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Source" />
                              </SelectTrigger>
                              <SelectContent>
                                {LANGUAGES.map((lang) => (
                                  <SelectItem key={lang} value={lang}>{lang}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Select
                              value={pair.targetLanguage}
                              onValueChange={(val) => updateLanguagePair(idx, "targetLanguage", val)}
                              disabled={isPending}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Target" />
                              </SelectTrigger>
                              <SelectContent>
                                {LANGUAGES.map((lang) => (
                                  <SelectItem key={lang} value={lang}>{lang}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Checkbox
                              checked={pair.isPrimary}
                              onCheckedChange={(val) => updateLanguagePair(idx, "isPrimary", !!val)}
                              disabled={isPending}
                            />
                          </TableCell>
                          <TableCell>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400"
                              onClick={() => removeLanguagePair(idx)}
                              disabled={isPending || formData.languagePairs.length <= 1}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div className="border-t border-white/[0.06] pt-4">
                <h4 className="text-sm font-medium text-muted-foreground mb-3">Service Types</h4>
                <MultiCheckboxGrid
                  options={SERVICE_TYPES}
                  selected={formData.serviceTypes}
                  onChange={(val) => updateField("serviceTypes", val)}
                  columns={4}
                />
              </div>

              <div className="border-t border-white/[0.06] pt-4">
                <h4 className="text-sm font-medium text-muted-foreground mb-3">Specializations</h4>
                <MultiCheckboxGrid
                  options={SPECIALIZATIONS}
                  selected={formData.translationSpecializations}
                  onChange={(val) => updateField("translationSpecializations", val)}
                  columns={4}
                />
              </div>

              <div className="border-t border-white/[0.06] pt-4">
                <h4 className="text-sm font-medium text-muted-foreground mb-3">CAT Tools</h4>
                <MultiCheckboxGrid
                  options={CAT_TOOLS}
                  selected={formData.software}
                  onChange={(val) => updateField("software", val)}
                  columns={3}
                />
              </div>

              <div className="border-t border-white/[0.06] pt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Experience (Years)</Label>
                    <Input
                      type="number"
                      min="0"
                      placeholder="0"
                      value={formData.experienceYears}
                      onChange={(e) => updateField("experienceYears", e.target.value)}
                      disabled={isPending}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Certifications (comma-separated)</Label>
                    <Input
                      placeholder="ATA, DipTrans, etc."
                      value={formData.certifications}
                      onChange={(e) => updateField("certifications", e.target.value)}
                      disabled={isPending}
                    />
                  </div>
                  <div className="space-y-1.5 md:col-span-2">
                    <Label className="text-xs">Education</Label>
                    <Textarea
                      placeholder="Education background..."
                      value={formData.education}
                      onChange={(e) => updateField("education", e.target.value)}
                      disabled={isPending}
                      className="min-h-[60px]"
                    />
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* ── Tab 3: Rates & Payment ── */}
            <TabsContent value="rates" className="space-y-4 mt-4">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-medium text-muted-foreground">Rates</h4>
                  <Button type="button" variant="outline" size="sm" onClick={addRateRow} disabled={isPending}>
                    <Plus className="w-3.5 h-3.5 mr-1" /> Add Rate
                  </Button>
                </div>
                {formData.rates.length > 0 && (
                  <div className="rounded-lg border border-white/[0.06] overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-white/[0.06] hover:bg-transparent">
                          <TableHead className="text-xs">Source</TableHead>
                          <TableHead className="text-xs">Target</TableHead>
                          <TableHead className="text-xs">Service</TableHead>
                          <TableHead className="text-xs">Type</TableHead>
                          <TableHead className="text-xs">Rate</TableHead>
                          <TableHead className="text-xs">Currency</TableHead>
                          <TableHead className="text-xs w-12"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {formData.rates.map((rate, idx) => (
                          <TableRow key={idx} className="border-white/[0.06]">
                            <TableCell>
                              <Select value={rate.sourceLanguage} onValueChange={(val) => updateRateRow(idx, "sourceLanguage", val)} disabled={isPending}>
                                <SelectTrigger className="h-8 text-xs w-20">
                                  <SelectValue placeholder="Src" />
                                </SelectTrigger>
                                <SelectContent>
                                  {LANGUAGES.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <Select value={rate.targetLanguage} onValueChange={(val) => updateRateRow(idx, "targetLanguage", val)} disabled={isPending}>
                                <SelectTrigger className="h-8 text-xs w-20">
                                  <SelectValue placeholder="Tgt" />
                                </SelectTrigger>
                                <SelectContent>
                                  {LANGUAGES.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <Select value={rate.serviceType} onValueChange={(val) => updateRateRow(idx, "serviceType", val)} disabled={isPending}>
                                <SelectTrigger className="h-8 text-xs w-28">
                                  <SelectValue placeholder="Service" />
                                </SelectTrigger>
                                <SelectContent>
                                  {SERVICE_TYPES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <Select value={rate.rateType} onValueChange={(val) => updateRateRow(idx, "rateType", val)} disabled={isPending}>
                                <SelectTrigger className="h-8 text-xs w-24">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {RATE_TYPES.map((rt) => <SelectItem key={rt} value={rt}>{rt}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                step="0.001"
                                min="0"
                                className="h-8 text-xs w-20"
                                placeholder="0.00"
                                value={rate.rateValue}
                                onChange={(e) => updateRateRow(idx, "rateValue", e.target.value)}
                                disabled={isPending}
                              />
                            </TableCell>
                            <TableCell>
                              <Select value={rate.currency} onValueChange={(val) => updateRateRow(idx, "currency", val)} disabled={isPending}>
                                <SelectTrigger className="h-8 text-xs w-20">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400" onClick={() => removeRateRow(idx)} disabled={isPending}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
                {formData.rates.length === 0 && (
                  <p className="text-xs text-muted-foreground py-3">No rates added yet. Click "Add Rate" to begin.</p>
                )}
              </div>

              <div className="border-t border-white/[0.06] pt-4">
                <h4 className="text-sm font-medium text-muted-foreground mb-3">CAT Discount Grid (%)</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Repetitions %</Label>
                    <Input type="number" min="0" max="100" placeholder="0" value={formData.catDiscounts.repetitions} onChange={(e) => updateCatDiscount("repetitions", e.target.value)} disabled={isPending} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">100% Match %</Label>
                    <Input type="number" min="0" max="100" placeholder="0" value={formData.catDiscounts.match100} onChange={(e) => updateCatDiscount("match100", e.target.value)} disabled={isPending} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">95-99% %</Label>
                    <Input type="number" min="0" max="100" placeholder="0" value={formData.catDiscounts.match9599} onChange={(e) => updateCatDiscount("match9599", e.target.value)} disabled={isPending} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">85-94% %</Label>
                    <Input type="number" min="0" max="100" placeholder="0" value={formData.catDiscounts.match8594} onChange={(e) => updateCatDiscount("match8594", e.target.value)} disabled={isPending} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">75-84% %</Label>
                    <Input type="number" min="0" max="100" placeholder="0" value={formData.catDiscounts.match7584} onChange={(e) => updateCatDiscount("match7584", e.target.value)} disabled={isPending} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">50-74% %</Label>
                    <Input type="number" min="0" max="100" placeholder="0" value={formData.catDiscounts.match5074} onChange={(e) => updateCatDiscount("match5074", e.target.value)} disabled={isPending} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">No Match %</Label>
                    <Input type="number" min="0" max="100" placeholder="0" value={formData.catDiscounts.noMatch} onChange={(e) => updateCatDiscount("noMatch", e.target.value)} disabled={isPending} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">MT %</Label>
                    <Input type="number" min="0" max="100" placeholder="0" value={formData.catDiscounts.machineTranslated} onChange={(e) => updateCatDiscount("machineTranslated", e.target.value)} disabled={isPending} />
                  </div>
                </div>
              </div>

              <div className="border-t border-white/[0.06] pt-4">
                <h4 className="text-sm font-medium text-muted-foreground mb-3">Fee Preferences</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Currency Preference</Label>
                    <Select value={formData.currency} onValueChange={(val) => updateField("currency", val)} disabled={isPending}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select currency" />
                      </SelectTrigger>
                      <SelectContent>
                        {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Minimum Fee</Label>
                    <Input type="number" step="0.01" min="0" placeholder="0.00" value={formData.minimumFee} onChange={(e) => updateField("minimumFee", e.target.value)} disabled={isPending} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Minimum Project Fee</Label>
                    <Input type="number" step="0.01" min="0" placeholder="0.00" value={formData.minimumProjectFee} onChange={(e) => updateField("minimumProjectFee", e.target.value)} disabled={isPending} />
                  </div>
                </div>
              </div>

              <div className="border-t border-white/[0.06] pt-4">
                <h4 className="text-sm font-medium text-muted-foreground mb-3">Payment Details</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Payment Method</Label>
                    <Select value={formData.paymentInfo.primaryPaymentMethod} onValueChange={(val) => updatePaymentInfo("primaryPaymentMethod", val)} disabled={isPending}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select method" />
                      </SelectTrigger>
                      <SelectContent>
                        {PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Bank Name</Label>
                    <Input placeholder="Bank name" value={formData.paymentInfo.bankName} onChange={(e) => updatePaymentInfo("bankName", e.target.value)} disabled={isPending} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Account Holder Name</Label>
                    <Input placeholder="Account holder" value={formData.paymentInfo.accountHolderName} onChange={(e) => updatePaymentInfo("accountHolderName", e.target.value)} disabled={isPending} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">IBAN</Label>
                    <Input placeholder="IBAN" value={formData.paymentInfo.iban} onChange={(e) => updatePaymentInfo("iban", e.target.value)} disabled={isPending} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">SWIFT/BIC</Label>
                    <Input placeholder="SWIFT code" value={formData.paymentInfo.swiftCode} onChange={(e) => updatePaymentInfo("swiftCode", e.target.value)} disabled={isPending} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">PayPal ID</Label>
                    <Input placeholder="PayPal email or ID" value={formData.paymentInfo.paypalId} onChange={(e) => updatePaymentInfo("paypalId", e.target.value)} disabled={isPending} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Wise Email</Label>
                    <Input placeholder="Wise email" value={formData.paymentInfo.wiseEmail} onChange={(e) => updatePaymentInfo("wiseEmail", e.target.value)} disabled={isPending} />
                  </div>
                </div>
              </div>

              <div className="border-t border-white/[0.06] pt-4">
                <h4 className="text-sm font-medium text-muted-foreground mb-3">Tax Information</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">VAT Number</Label>
                    <Input placeholder="VAT number" value={formData.taxInfo.vatNumber} onChange={(e) => updateTaxInfo("vatNumber", e.target.value)} disabled={isPending} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Tax ID</Label>
                    <Input placeholder="Tax ID" value={formData.taxInfo.taxId} onChange={(e) => updateTaxInfo("taxId", e.target.value)} disabled={isPending} />
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* ── Tab 4: Status & Notes ── */}
            <TabsContent value="status" className="space-y-4 mt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Status</Label>
                  <Select value={formData.status} onValueChange={(val) => updateField("status", val)} disabled={isPending}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      {VENDOR_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Assigned To</Label>
                  <Select value={formData.assignedTo} onValueChange={(val) => updateField("assignedTo", val)} disabled={isPending}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select user" />
                    </SelectTrigger>
                    <SelectContent>
                      {users.map((u) => (
                        <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Follow-up Date</Label>
                  <Input
                    type="date"
                    value={formData.followUpDate}
                    onChange={(e) => updateField("followUpDate", e.target.value)}
                    disabled={isPending}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Follow-up Note</Label>
                  <Input
                    placeholder="Follow-up reminder..."
                    value={formData.followUpNote}
                    onChange={(e) => updateField("followUpNote", e.target.value)}
                    disabled={isPending}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Tags (comma-separated)</Label>
                  <Input
                    placeholder="urgent, priority, etc."
                    value={formData.tags}
                    onChange={(e) => updateField("tags", e.target.value)}
                    disabled={isPending}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Accounts (comma-separated)</Label>
                  <Input
                    placeholder="Account1, Account2"
                    value={formData.accounts}
                    onChange={(e) => updateField("accounts", e.target.value)}
                    disabled={isPending}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Notes</Label>
                <Textarea
                  placeholder="General notes about the vendor..."
                  value={formData.notes}
                  onChange={(e) => updateField("notes", e.target.value)}
                  disabled={isPending}
                  className="min-h-[80px]"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Special Instructions</Label>
                <Textarea
                  placeholder="Special instructions for this vendor..."
                  value={formData.specialInstructions}
                  onChange={(e) => updateField("specialInstructions", e.target.value)}
                  disabled={isPending}
                  className="min-h-[80px]"
                />
              </div>
            </TabsContent>

            {/* ── Tab 5: Documents ── */}
            <TabsContent value="documents" className="space-y-4 mt-4">
              <h4 className="text-sm font-medium text-muted-foreground mb-1">Verification Flags</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="nda-signed"
                    checked={formData.ndaSigned}
                    onCheckedChange={(val) => updateField("ndaSigned", !!val)}
                    disabled={isPending}
                  />
                  <Label htmlFor="nda-signed" className="text-xs cursor-pointer">NDA Signed</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="tested"
                    checked={formData.tested}
                    onCheckedChange={(val) => updateField("tested", !!val)}
                    disabled={isPending}
                  />
                  <Label htmlFor="tested" className="text-xs cursor-pointer">Tested</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="certified"
                    checked={formData.certified}
                    onCheckedChange={(val) => updateField("certified", !!val)}
                    disabled={isPending}
                  />
                  <Label htmlFor="certified" className="text-xs cursor-pointer">Certified</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="can-do-lqa"
                    checked={formData.canDoLqa}
                    onCheckedChange={(val) => updateField("canDoLqa", !!val)}
                    disabled={isPending}
                  />
                  <Label htmlFor="can-do-lqa" className="text-xs cursor-pointer">Can Do LQA</Label>
                </div>
              </div>

              <div className="border-t border-white/[0.06] pt-4">
                <h4 className="text-sm font-medium text-muted-foreground mb-3">Document URLs</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">CV URL</Label>
                    <Input
                      placeholder="https://..."
                      value={formData.cvFileUrl}
                      onChange={(e) => updateField("cvFileUrl", e.target.value)}
                      disabled={isPending}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">NDA URL</Label>
                    <Input
                      placeholder="https://..."
                      value={formData.ndaFileUrl}
                      onChange={(e) => updateField("ndaFileUrl", e.target.value)}
                      disabled={isPending}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Portfolio URL</Label>
                    <Input
                      placeholder="https://..."
                      value={formData.portfolioFileUrl}
                      onChange={(e) => updateField("portfolioFileUrl", e.target.value)}
                      disabled={isPending}
                    />
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>

          {error && (
            <p className="text-sm text-red-400" data-testid="add-vendor-error">
              {error}
            </p>
          )}

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isPending}
              data-testid="add-vendor-submit"
            >
              {isPending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Vendor"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Advanced Filter Panel ──

function AdvancedFilterPanel({
  filters,
  onFiltersChange,
  onClear,
}: {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  onClear: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const hasActiveFilters = filters.sourceLanguage || filters.targetLanguage ||
    filters.serviceType || filters.specialization || filters.account ||
    filters.qualityScoreMin || filters.qualityScoreMax || filters.tagsFilter ||
    filters.tested || filters.certified || filters.ndaSigned;

  function updateFilter<K extends keyof FilterState>(key: K, value: FilterState[K]) {
    onFiltersChange({ ...filters, [key]: value });
  }

  return (
    <div className="rounded-lg border border-white/[0.06] bg-card">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5" />
          <span className="font-medium">Advanced Filters</span>
          {hasActiveFilters && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Active</Badge>
          )}
        </div>
        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-white/[0.06]">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 pt-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Source Language</Label>
              <Select value={filters.sourceLanguage} onValueChange={(val) => updateFilter("sourceLanguage", val)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any</SelectItem>
                  {LANGUAGES.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Target Language</Label>
              <Select value={filters.targetLanguage} onValueChange={(val) => updateFilter("targetLanguage", val)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any</SelectItem>
                  {LANGUAGES.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Service Type</Label>
              <Select value={filters.serviceType} onValueChange={(val) => updateFilter("serviceType", val)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any</SelectItem>
                  {SERVICE_TYPES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Specialization</Label>
              <Select value={filters.specialization} onValueChange={(val) => updateFilter("specialization", val)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any</SelectItem>
                  {SPECIALIZATIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Account</Label>
              <Input
                className="h-8 text-xs"
                placeholder="Account name"
                value={filters.account}
                onChange={(e) => updateFilter("account", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Quality Score Min</Label>
              <Input
                type="number"
                min="0"
                max="5"
                step="0.1"
                className="h-8 text-xs"
                placeholder="0.0"
                value={filters.qualityScoreMin}
                onChange={(e) => updateFilter("qualityScoreMin", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Quality Score Max</Label>
              <Input
                type="number"
                min="0"
                max="5"
                step="0.1"
                className="h-8 text-xs"
                placeholder="5.0"
                value={filters.qualityScoreMax}
                onChange={(e) => updateFilter("qualityScoreMax", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Tags</Label>
              <Input
                className="h-8 text-xs"
                placeholder="Tag name"
                value={filters.tagsFilter}
                onChange={(e) => updateFilter("tagsFilter", e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center gap-6 pt-1">
            <div className="flex items-center gap-2">
              <Checkbox
                id="filter-tested"
                checked={filters.tested}
                onCheckedChange={(val) => updateFilter("tested", !!val)}
              />
              <Label htmlFor="filter-tested" className="text-xs cursor-pointer">Tested</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="filter-certified"
                checked={filters.certified}
                onCheckedChange={(val) => updateFilter("certified", !!val)}
              />
              <Label htmlFor="filter-certified" className="text-xs cursor-pointer">Certified</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="filter-nda"
                checked={filters.ndaSigned}
                onCheckedChange={(val) => updateFilter("ndaSigned", !!val)}
              />
              <Label htmlFor="filter-nda" className="text-xs cursor-pointer">NDA Signed</Label>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-auto text-xs text-muted-foreground hover:text-foreground"
              onClick={onClear}
            >
              <X className="w-3.5 h-3.5 mr-1" />
              Clear Filters
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Bulk Actions Bar ──

function BulkActionsBar({
  selectedCount,
  onChangeStatus,
  onDelete,
}: {
  selectedCount: number;
  onChangeStatus: (status: string) => void;
  onDelete: () => void;
}) {
  if (selectedCount === 0) return null;

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg border border-blue-500/25 bg-blue-500/5">
      <span className="text-xs font-medium text-blue-400">
        {selectedCount} vendor{selectedCount !== 1 ? "s" : ""} selected
      </span>
      <div className="flex items-center gap-2 ml-auto">
        <Select onValueChange={onChangeStatus}>
          <SelectTrigger className="h-7 w-[160px] text-xs">
            <SelectValue placeholder="Change Status" />
          </SelectTrigger>
          <SelectContent>
            {VENDOR_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          className="h-7 text-xs"
          onClick={onDelete}
        >
          <Trash2 className="w-3.5 h-3.5 mr-1" />
          Delete
        </Button>
      </div>
    </div>
  );
}

// ── Enhanced List View ──

function ListView({
  vendors,
  isLoading,
  total,
  page,
  limit,
  onPageChange,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
}: {
  vendors: Vendor[];
  isLoading: boolean;
  total: number;
  page: number;
  limit: number;
  onPageChange: (page: number) => void;
  selectedIds: Set<number>;
  onToggleSelect: (id: number) => void;
  onToggleSelectAll: () => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const allSelected = vendors.length > 0 && vendors.every((v) => selectedIds.has(v.id));

  function formatLanguagePairs(vendor: Vendor): string {
    if (vendor.languagePairs && vendor.languagePairs.length > 0) {
      return vendor.languagePairs
        .slice(0, 3)
        .map((lp) => `${lp.sourceLanguage}>${lp.targetLanguage}`)
        .join(", ") + (vendor.languagePairs.length > 3 ? ` +${vendor.languagePairs.length - 3}` : "");
    }
    return vendor.language ?? "—";
  }

  function formatServiceTypes(vendor: Vendor): string {
    if (vendor.serviceTypes && vendor.serviceTypes.length > 0) {
      return vendor.serviceTypes.slice(0, 2).join(", ") +
        (vendor.serviceTypes.length > 2 ? ` +${vendor.serviceTypes.length - 2}` : "");
    }
    return "—";
  }

  function formatAccounts(vendor: Vendor): string {
    if (vendor.accounts && vendor.accounts.length > 0) {
      return vendor.accounts.slice(0, 2).join(", ") +
        (vendor.accounts.length > 2 ? ` +${vendor.accounts.length - 2}` : "");
    }
    return "—";
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-white/[0.06] overflow-hidden bg-card">
        <Table>
          <TableHeader>
            <TableRow className="border-white/[0.06] hover:bg-transparent">
              <TableHead className="w-10">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={onToggleSelectAll}
                />
              </TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground">Resource Code</TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground">Name</TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground">Email</TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground">Status</TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground">Languages</TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground">Service Types</TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground">Quality Score</TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground">Accounts</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i} className="border-white/[0.06]">
                  {Array.from({ length: 9 }).map((__, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full rounded" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : vendors.length === 0 ? (
              <TableRow className="border-white/[0.06]">
                <TableCell colSpan={9} className="text-center text-muted-foreground py-12 text-sm">
                  No vendors found.
                </TableCell>
              </TableRow>
            ) : (
              vendors.map((vendor) => (
                <TableRow
                  key={vendor.id}
                  className={`border-white/[0.06] hover:bg-white/[0.02] transition-colors ${
                    selectedIds.has(vendor.id) ? "bg-blue-500/5" : ""
                  }`}
                  data-testid={`vendor-row-${vendor.id}`}
                >
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.has(vendor.id)}
                      onCheckedChange={() => onToggleSelect(vendor.id)}
                    />
                  </TableCell>
                  <TableCell className="text-sm font-mono text-muted-foreground">
                    {vendor.resourceCode ?? "—"}
                  </TableCell>
                  <TableCell className="font-medium text-sm">
                    <Link
                      href={`/vendors/${vendor.id}`}
                      className="text-foreground hover:text-blue-400 transition-colors underline-offset-4 hover:underline"
                    >
                      {vendor.fullName}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {vendor.email}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={vendor.status} />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[140px] truncate">
                    {formatLanguagePairs(vendor)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[120px] truncate">
                    {formatServiceTypes(vendor)}
                  </TableCell>
                  <TableCell className="text-sm">
                    {vendor.qualityScore !== null && vendor.qualityScore !== undefined ? (
                      <span
                        className={
                          vendor.qualityScore >= 4.5
                            ? "text-emerald-400 font-medium"
                            : vendor.qualityScore >= 3.5
                            ? "text-blue-400 font-medium"
                            : "text-amber-400 font-medium"
                        }
                      >
                        {vendor.qualityScore.toFixed(1)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[120px] truncate">
                    {formatAccounts(vendor)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm text-muted-foreground px-1">
        <span>
          {isLoading ? (
            <Skeleton className="h-4 w-28 rounded inline-block" />
          ) : (
            <>
              Showing {total === 0 ? 0 : (page - 1) * limit + 1}–
              {Math.min(page * limit, total)} of {total}
            </>
          )}
        </span>
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1 || isLoading}
            aria-label="Previous page"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </Button>
          <span className="px-2 text-xs">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages || isLoading}
            aria-label="Next page"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Enhanced Pipeline View ──

function PipelineView({
  pipeline,
  isPipelineLoading,
}: {
  pipeline: PipelineItem[];
  isPipelineLoading: boolean;
}) {
  const countMap: Record<string, number> = {};
  for (const item of pipeline) {
    countMap[item.status] = item.count;
  }

  if (isPipelineLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4" data-testid="pipeline-loading">
        {VENDOR_STATUSES.map((s) => (
          <Skeleton key={s} className="h-28 rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div
      className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4"
      data-testid="pipeline-view"
    >
      {VENDOR_STATUSES.map((status) => {
        const count = countMap[status] ?? 0;
        const headerClass =
          STATUS_HEADER_COLORS[status] ?? "border-zinc-500/40 bg-zinc-500/5";
        return (
          <Card
            key={status}
            className="bg-card border border-white/[0.06] overflow-hidden"
            data-testid={`pipeline-column-${status}`}
          >
            <CardHeader
              className={`py-3 px-4 border-b ${headerClass}`}
            >
              <CardTitle className="text-xs font-semibold text-foreground flex items-center justify-between gap-2">
                <span className="truncate">{status}</span>
                <span className="shrink-0 inline-flex items-center justify-center rounded-full bg-white/[0.08] text-foreground text-xs font-bold w-6 h-6">
                  {count}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              {count === 0 ? (
                <p className="text-[11px] text-muted-foreground text-center py-4">No vendors</p>
              ) : (
                <div className="flex flex-col gap-2">
                  <PipelineVendorList status={status} count={count} />
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function PipelineVendorList({ status, count }: { status: string; count: number }) {
  const { data, isLoading } = useQuery<VendorsResponse>({
    queryKey: ["/api/vendors", { status, page: 1, limit: 5 }],
    queryFn: async () => {
      const params = new URLSearchParams({
        status,
        page: "1",
        limit: "5",
      });
      const res = await apiRequest("GET", `/api/vendors?${params.toString()}`);
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <>
        {Array.from({ length: Math.min(count, 3) }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded" />
        ))}
      </>
    );
  }

  const vendors = data?.data ?? [];

  return (
    <>
      {vendors.map((vendor) => (
        <Link
          key={vendor.id}
          href={`/vendors/${vendor.id}`}
          className="block rounded-md px-2.5 py-2 text-xs bg-white/[0.03] border border-white/[0.05] hover:bg-white/[0.07] hover:border-white/[0.10] transition-colors"
          data-testid={`pipeline-vendor-${vendor.id}`}
        >
          <div className="font-medium text-foreground truncate">{vendor.fullName}</div>
          <div className="text-[10px] text-muted-foreground truncate mt-0.5">{vendor.email}</div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {vendor.languagePairs && vendor.languagePairs.length > 0 ? (
              vendor.languagePairs.slice(0, 2).map((lp: LanguagePair, i: number) => (
                <span key={i} className="text-[10px] text-muted-foreground bg-white/[0.05] px-1.5 py-0.5 rounded font-mono">
                  {lp.sourceLanguage}→{lp.targetLanguage}
                </span>
              ))
            ) : vendor.nativeLanguage ? (
              <span className="text-[10px] text-muted-foreground bg-white/[0.05] px-1.5 py-0.5 rounded">
                {vendor.nativeLanguage}
              </span>
            ) : null}
            {(vendor as any).combinedQualityScore != null && (
              <span className={`text-[10px] font-medium ${
                Number((vendor as any).combinedQualityScore) >= 90 ? "text-emerald-400" :
                Number((vendor as any).combinedQualityScore) >= 75 ? "text-blue-400" : "text-amber-400"
              }`}>
                QS: {Number((vendor as any).combinedQualityScore).toFixed(1)}
              </span>
            )}
            {vendor.qualityScore !== null && vendor.qualityScore !== undefined && !(vendor as any).combinedQualityScore && (
              <span className={`text-[10px] font-medium ${
                vendor.qualityScore >= 4.5 ? "text-emerald-400" :
                vendor.qualityScore >= 3.5 ? "text-blue-400" : "text-amber-400"
              }`}>
                {vendor.qualityScore.toFixed(1)}
              </span>
            )}
          </div>
        </Link>
      ))}
      {count > 5 && (
        <p className="text-[10px] text-muted-foreground text-center pt-1">
          +{count - 5} more
        </p>
      )}
    </>
  );
}

// ── Main Page ──

export default function VendorsPage() {
  const qc = useQueryClient();
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [filters, setFilters] = useState<FilterState>(createInitialFilters);

  // Debounce search
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const debounceRef = useState<ReturnType<typeof setTimeout> | null>(null);

  function handleSearchChange(val: string) {
    setSearch(val);
    if (debounceRef[0]) clearTimeout(debounceRef[0]);
    debounceRef[1](
      setTimeout(() => {
        setDebouncedSearch(val);
        setPage(1);
      }, 300),
    );
  }

  function handleStatusFilterChange(val: string) {
    setStatusFilter(val);
    setPage(1);
  }

  function handleFiltersChange(newFilters: FilterState) {
    setFilters(newFilters);
    setPage(1);
  }

  function handleClearFilters() {
    setFilters(createInitialFilters());
    setPage(1);
  }

  // Build query params
  const listParams = new URLSearchParams();
  if (debouncedSearch) listParams.set("search", debouncedSearch);
  if (statusFilter && statusFilter !== "all") listParams.set("status", statusFilter);
  if (filters.sourceLanguage && filters.sourceLanguage !== "any") listParams.set("sourceLanguage", filters.sourceLanguage);
  if (filters.targetLanguage && filters.targetLanguage !== "any") listParams.set("targetLanguage", filters.targetLanguage);
  if (filters.serviceType && filters.serviceType !== "any") listParams.set("serviceType", filters.serviceType);
  if (filters.specialization && filters.specialization !== "any") listParams.set("specialization", filters.specialization);
  if (filters.account) listParams.set("account", filters.account);
  if (filters.qualityScoreMin) listParams.set("qualityScoreMin", filters.qualityScoreMin);
  if (filters.qualityScoreMax) listParams.set("qualityScoreMax", filters.qualityScoreMax);
  if (filters.tagsFilter) listParams.set("tags", filters.tagsFilter);
  if (filters.tested) listParams.set("tested", "true");
  if (filters.certified) listParams.set("certified", "true");
  if (filters.ndaSigned) listParams.set("ndaSigned", "true");
  listParams.set("page", String(page));
  listParams.set("limit", String(LIMIT));

  const listQueryKey = ["/api/vendors", listParams.toString()];

  const { data: vendorsData, isLoading: isVendorsLoading } = useQuery<VendorsResponse>({
    queryKey: listQueryKey,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/vendors?${listParams.toString()}`);
      return res.json();
    },
  });

  // Pipeline data
  const { data: pipelineData, isLoading: isPipelineLoading } = useQuery<PipelineItem[]>({
    queryKey: ["/api/vendors/pipeline"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/vendors/pipeline");
      return res.json();
    },
    enabled: viewMode === "pipeline",
  });

  // Bulk status change mutation
  const bulkStatusMutation = useMutation({
    mutationFn: async ({ ids, status }: { ids: number[]; status: string }) => {
      await Promise.all(
        ids.map((id) => apiRequest("PATCH", `/api/vendors/${id}`, { status }))
      );
    },
    onSuccess: () => {
      setSelectedIds(new Set());
      invalidateVendors();
    },
  });

  // Bulk delete mutation
  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      await Promise.all(
        ids.map((id) => apiRequest("DELETE", `/api/vendors/${id}`))
      );
    },
    onSuccess: () => {
      setSelectedIds(new Set());
      invalidateVendors();
    },
  });

  function invalidateVendors() {
    qc.invalidateQueries({ queryKey: ["/api/vendors"] });
  }

  const vendors = vendorsData?.data ?? [];
  const total = vendorsData?.total ?? 0;

  function handleToggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function handleToggleSelectAll() {
    if (vendors.every((v) => selectedIds.has(v.id))) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(vendors.map((v) => v.id)));
    }
  }

  function handleBulkChangeStatus(status: string) {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    bulkStatusMutation.mutate({ ids, status });
  }

  function handleBulkDelete() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!window.confirm(`Delete ${ids.length} vendor${ids.length !== 1 ? "s" : ""}? This cannot be undone.`)) return;
    bulkDeleteMutation.mutate(ids);
  }

  return (
    <div className="h-full overflow-auto" data-testid="vendors-page">
      <div className="max-w-[1400px] mx-auto p-6 space-y-5">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-muted-foreground" />
            <h1 className="text-lg font-semibold text-foreground">Vendors</h1>
            {!isVendorsLoading && (
              <Badge variant="secondary" className="ml-1 text-xs">
                {total}
              </Badge>
            )}
          </div>
          <AddVendorDialog onCreated={invalidateVendors} />
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search vendors..."
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-8 h-8 text-sm"
              data-testid="vendor-search"
            />
          </div>

          {/* Status filter */}
          <Select value={statusFilter} onValueChange={handleStatusFilterChange}>
            <SelectTrigger className="h-8 w-[180px] text-sm" data-testid="vendor-status-filter">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {VENDOR_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* View toggle */}
          <div className="flex items-center rounded-md border border-white/[0.08] bg-white/[0.03] p-0.5 gap-0.5 ml-auto">
            <button
              onClick={() => setViewMode("list")}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                viewMode === "list"
                  ? "bg-white/[0.10] text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/[0.05]"
              }`}
              data-testid="view-toggle-list"
              aria-label="List view"
            >
              <List className="w-3.5 h-3.5" />
              List
            </button>
            <button
              onClick={() => setViewMode("pipeline")}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                viewMode === "pipeline"
                  ? "bg-white/[0.10] text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/[0.05]"
              }`}
              data-testid="view-toggle-pipeline"
              aria-label="Pipeline view"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              Pipeline
            </button>
          </div>
        </div>

        {/* Advanced Filters */}
        <AdvancedFilterPanel
          filters={filters}
          onFiltersChange={handleFiltersChange}
          onClear={handleClearFilters}
        />

        {/* Bulk Actions */}
        <BulkActionsBar
          selectedCount={selectedIds.size}
          onChangeStatus={handleBulkChangeStatus}
          onDelete={handleBulkDelete}
        />

        {/* Content */}
        {viewMode === "list" ? (
          <ListView
            vendors={vendors}
            isLoading={isVendorsLoading}
            total={total}
            page={page}
            limit={LIMIT}
            onPageChange={setPage}
            selectedIds={selectedIds}
            onToggleSelect={handleToggleSelect}
            onToggleSelectAll={handleToggleSelectAll}
          />
        ) : (
          <PipelineView
            pipeline={pipelineData ?? []}
            isPipelineLoading={isPipelineLoading}
          />
        )}
      </div>
    </div>
  );
}
