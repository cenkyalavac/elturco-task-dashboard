import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  ThumbsUp, ThumbsDown, SkipForward, MapPin, Mail, Phone,
  Globe, Briefcase, GraduationCap, FileText, Download,
  ChevronLeft, ChevronRight, Sparkles, Loader2, X,
} from "lucide-react";

interface Application {
  id: number;
  fullName: string;
  email: string;
  phone?: string;
  location?: string;
  timezone?: string;
  website?: string;
  linkedin?: string;
  nativeLanguage?: string;
  languagePairs?: any[];
  serviceTypes?: string[];
  specializations?: string[];
  software?: any[];
  experienceYears?: number;
  education?: string;
  certifications?: string[];
  cvFileUrl?: string;
  ratePerWord?: string;
  ratePerHour?: string;
  minimumFee?: string;
  currency?: string;
  status: string;
  notes?: string;
  submittedAt?: string;
}

interface AISummary {
  profileScore: number;
  strengths: string[];
  weaknesses: string[];
  recommendation: string;
  summary: string;
}

export default function VMReviewApplicationsPage() {
  const { toast } = useToast();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [notes, setNotes] = useState("");
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [slideDirection, setSlideDirection] = useState<"left" | "right" | null>(null);
  const [showAISummary, setShowAISummary] = useState(false);

  const { data, isLoading } = useQuery<{ applications: Application[]; total: number }>({
    queryKey: ["/api/vm/pending-applications"],
  });

  const applications = data?.applications || [];
  const total = data?.total || 0;
  const current = applications[currentIndex];

  // AI Summary
  const aiSummaryMutation = useMutation({
    mutationFn: async (appId: number) => {
      const res = await apiRequest("POST", `/api/vm/applications/${appId}/ai-summary`);
      return res.json() as Promise<AISummary>;
    },
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ id, action, notes }: { id: number; action: string; notes?: string }) => {
      const res = await apiRequest("PATCH", `/api/vm/applications/${id}/review`, { action, notes });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.action === "approve") {
        toast({ title: "Application Approved", description: `Vendor created and moved to CV Review` });
      } else if (data.action === "reject") {
        toast({ title: "Application Rejected", variant: "destructive" });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/vm/pending-applications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vm/dashboard"] });
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const handleAction = useCallback((action: "approve" | "reject" | "skip") => {
    if (!current || isTransitioning) return;

    setSlideDirection(action === "approve" ? "right" : "left");
    setIsTransitioning(true);

    setTimeout(() => {
      if (action !== "skip") {
        reviewMutation.mutate({ id: current.id, action, notes: notes || undefined });
      }
      setNotes("");
      setShowAISummary(false);
      setSlideDirection(null);
      setIsTransitioning(false);

      if (action === "skip") {
        setCurrentIndex(prev => Math.min(prev + 1, applications.length - 1));
      }
    }, 300);
  }, [current, isTransitioning, notes, applications.length, reviewMutation]);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      if (e.key === "q" || e.key === "Q") handleAction("reject");
      if (e.key === "e" || e.key === "E") handleAction("approve");
      if (e.key === "w" || e.key === "W") handleAction("skip");
    }
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [handleAction]);

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-[500px] rounded-xl" />
      </div>
    );
  }

  if (applications.length === 0) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-white mb-4">Review Applications</h1>
        <Card className="bg-[#151922] border-white/[0.06]">
          <CardContent className="p-12 text-center">
            <ThumbsUp className="w-12 h-12 text-emerald-400/40 mx-auto mb-3" />
            <p className="text-white/60 text-lg">All caught up!</p>
            <p className="text-white/30 text-sm mt-1">No pending applications to review</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Review Applications</h1>
          <p className="text-sm text-white/40 mt-1">
            Application {currentIndex + 1} of {total}
            <span className="ml-3 text-[10px] text-white/20">Shortcuts: Q=Reject E=Approve W=Skip</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
            disabled={currentIndex === 0}
            className="border-white/10"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-xs text-white/40 min-w-[3rem] text-center">{currentIndex + 1}/{applications.length}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentIndex(prev => Math.min(applications.length - 1, prev + 1))}
            disabled={currentIndex >= applications.length - 1}
            className="border-white/10"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-500 transition-all duration-300"
          style={{ width: `${((currentIndex + 1) / total) * 100}%` }}
        />
      </div>

      {current && (
        <div
          className={`transition-all duration-300 ${
            slideDirection === "left" ? "translate-x-[-100%] opacity-0" :
            slideDirection === "right" ? "translate-x-[100%] opacity-0" : ""
          }`}
        >
          <Card className="bg-[#151922] border-white/[0.06]">
            <CardContent className="p-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left: Personal Info */}
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-full bg-blue-500/20 flex items-center justify-center text-2xl font-bold text-blue-400">
                      {current.fullName?.charAt(0) || "?"}
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-white">{current.fullName}</h2>
                      <p className="text-xs text-white/40">{current.nativeLanguage && `Native: ${current.nativeLanguage}`}</p>
                    </div>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-white/60">
                      <Mail className="w-3.5 h-3.5" />
                      <a href={`mailto:${current.email}`} className="hover:text-blue-400">{current.email}</a>
                    </div>
                    {current.phone && (
                      <div className="flex items-center gap-2 text-white/60">
                        <Phone className="w-3.5 h-3.5" />
                        <span>{current.phone}</span>
                      </div>
                    )}
                    {current.location && (
                      <div className="flex items-center gap-2 text-white/60">
                        <MapPin className="w-3.5 h-3.5" />
                        <span>{current.location}</span>
                      </div>
                    )}
                    {current.website && (
                      <div className="flex items-center gap-2 text-white/60">
                        <Globe className="w-3.5 h-3.5" />
                        <a href={current.website} target="_blank" rel="noreferrer" className="hover:text-blue-400 truncate">{current.website}</a>
                      </div>
                    )}
                  </div>

                  {current.submittedAt && (
                    <p className="text-[10px] text-white/20">Submitted: {new Date(current.submittedAt).toLocaleDateString()}</p>
                  )}
                </div>

                {/* Center: Languages, Services, Skills */}
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-medium text-white/40 mb-2">Language Pairs</p>
                    <div className="flex flex-wrap gap-1.5">
                      {(current.languagePairs || []).length === 0 ? (
                        <span className="text-xs text-white/20">No pairs specified</span>
                      ) : (
                        (current.languagePairs || []).map((lp: any, i: number) => (
                          <Badge key={i} variant="secondary" className="bg-blue-500/10 text-blue-400 text-[11px]">
                            {lp.source || lp.sourceLanguage} → {lp.target || lp.targetLanguage}
                          </Badge>
                        ))
                      )}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-medium text-white/40 mb-2">Service Types</p>
                    <div className="flex flex-wrap gap-1.5">
                      {(current.serviceTypes || []).length === 0 ? (
                        <span className="text-xs text-white/20">None</span>
                      ) : (
                        (current.serviceTypes || []).map((s, i) => (
                          <Badge key={i} variant="outline" className="text-[11px] border-white/10">{s}</Badge>
                        ))
                      )}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-medium text-white/40 mb-2">Specializations</p>
                    <div className="flex flex-wrap gap-1.5">
                      {(current.specializations || []).length === 0 ? (
                        <span className="text-xs text-white/20">None</span>
                      ) : (
                        (current.specializations || []).map((s, i) => (
                          <Badge key={i} variant="outline" className="text-[11px] border-white/10">{s}</Badge>
                        ))
                      )}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-medium text-white/40 mb-2">CAT Tools</p>
                    <div className="flex flex-wrap gap-1.5">
                      {(current.software || []).length === 0 ? (
                        <span className="text-xs text-white/20">None</span>
                      ) : (
                        (current.software || []).map((s: any, i: number) => (
                          <Badge key={i} variant="outline" className="text-[11px] border-white/10">
                            {typeof s === "string" ? s : s.name || ""}
                          </Badge>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Experience, Rates, CV */}
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg bg-white/[0.03] p-3">
                      <p className="text-[10px] text-white/30">Experience</p>
                      <p className="text-sm font-medium text-white">{current.experienceYears ? `${current.experienceYears} yrs` : "N/A"}</p>
                    </div>
                    <div className="rounded-lg bg-white/[0.03] p-3">
                      <p className="text-[10px] text-white/30">Rate/Word</p>
                      <p className="text-sm font-medium text-white">
                        {current.ratePerWord ? `${current.currency || "EUR"} ${current.ratePerWord}` : "N/A"}
                      </p>
                    </div>
                    <div className="rounded-lg bg-white/[0.03] p-3">
                      <p className="text-[10px] text-white/30">Rate/Hour</p>
                      <p className="text-sm font-medium text-white">
                        {current.ratePerHour ? `${current.currency || "EUR"} ${current.ratePerHour}` : "N/A"}
                      </p>
                    </div>
                    <div className="rounded-lg bg-white/[0.03] p-3">
                      <p className="text-[10px] text-white/30">Min Fee</p>
                      <p className="text-sm font-medium text-white">
                        {current.minimumFee ? `${current.currency || "EUR"} ${current.minimumFee}` : "N/A"}
                      </p>
                    </div>
                  </div>

                  {current.education && (
                    <div>
                      <p className="text-xs font-medium text-white/40 mb-1 flex items-center gap-1">
                        <GraduationCap className="w-3.5 h-3.5" /> Education
                      </p>
                      <p className="text-xs text-white/60">{current.education}</p>
                    </div>
                  )}

                  {(current.certifications || []).length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-white/40 mb-1">Certifications</p>
                      <div className="flex flex-wrap gap-1">
                        {current.certifications!.map((c, i) => (
                          <Badge key={i} variant="secondary" className="bg-emerald-500/10 text-emerald-400 text-[10px]">{c}</Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {current.cvFileUrl && (
                    <a
                      href={current.cvFileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 text-xs text-blue-400 hover:text-blue-300"
                    >
                      <Download className="w-3.5 h-3.5" /> Download CV
                    </a>
                  )}
                </div>
              </div>

              {/* AI Summary Panel */}
              <div className="mt-4 pt-4 border-t border-white/[0.06]">
                <button
                  onClick={() => {
                    setShowAISummary(!showAISummary);
                    if (!showAISummary && !aiSummaryMutation.data) {
                      aiSummaryMutation.mutate(current.id);
                    }
                  }}
                  className="flex items-center gap-2 text-xs text-purple-400 hover:text-purple-300 transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {showAISummary ? "Hide AI Summary" : "AI Summary"}
                </button>

                {showAISummary && (
                  <div className="mt-3 rounded-lg bg-purple-500/5 border border-purple-500/10 p-4">
                    {aiSummaryMutation.isPending ? (
                      <div className="flex items-center gap-2 text-sm text-purple-400">
                        <Loader2 className="w-4 h-4 animate-spin" /> Analyzing application...
                      </div>
                    ) : aiSummaryMutation.error ? (
                      <p className="text-sm text-red-400">
                        {aiSummaryMutation.error instanceof Error && aiSummaryMutation.error.message.includes("503")
                          ? "AI service not configured (OPENAI_API_KEY not set)"
                          : "Failed to generate AI summary"}
                      </p>
                    ) : aiSummaryMutation.data ? (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-white/40">Profile Score</span>
                          <div className="flex items-center gap-2">
                            <div className="w-24 h-2 bg-white/10 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  aiSummaryMutation.data.profileScore >= 70 ? "bg-emerald-500" :
                                  aiSummaryMutation.data.profileScore >= 40 ? "bg-yellow-500" : "bg-red-500"
                                }`}
                                style={{ width: `${aiSummaryMutation.data.profileScore}%` }}
                              />
                            </div>
                            <span className="text-sm font-bold text-white">{aiSummaryMutation.data.profileScore}/100</span>
                          </div>
                        </div>
                        <p className="text-xs text-white/60">{aiSummaryMutation.data.summary}</p>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <p className="text-[10px] text-emerald-400 font-medium mb-1">Strengths</p>
                            {aiSummaryMutation.data.strengths.map((s: string, i: number) => (
                              <p key={i} className="text-[11px] text-white/50">+ {s}</p>
                            ))}
                          </div>
                          <div>
                            <p className="text-[10px] text-red-400 font-medium mb-1">Weaknesses</p>
                            {aiSummaryMutation.data.weaknesses.map((w: string, i: number) => (
                              <p key={i} className="text-[11px] text-white/50">- {w}</p>
                            ))}
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${
                            aiSummaryMutation.data.recommendation === "approve" ? "border-emerald-500/30 text-emerald-400" :
                            aiSummaryMutation.data.recommendation === "reject" ? "border-red-500/30 text-red-400" :
                            "border-yellow-500/30 text-yellow-400"
                          }`}
                        >
                          AI Recommendation: {aiSummaryMutation.data.recommendation}
                        </Badge>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>

              {/* Notes */}
              <div className="mt-4">
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add notes (optional)..."
                  className="bg-white/[0.03] border-white/[0.08] text-white text-sm h-16 resize-none"
                />
              </div>

              {/* Action buttons */}
              <div className="mt-4 flex items-center gap-3">
                <Button
                  onClick={() => handleAction("reject")}
                  disabled={reviewMutation.isPending || isTransitioning}
                  className="flex-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20"
                  variant="outline"
                  size="lg"
                >
                  <ThumbsDown className="w-4 h-4 mr-2" />
                  Reject (Q)
                </Button>
                <Button
                  onClick={() => handleAction("skip")}
                  disabled={reviewMutation.isPending || isTransitioning}
                  className="flex-1"
                  variant="outline"
                  size="lg"
                >
                  <SkipForward className="w-4 h-4 mr-2" />
                  Skip (W)
                </Button>
                <Button
                  onClick={() => handleAction("approve")}
                  disabled={reviewMutation.isPending || isTransitioning}
                  className="flex-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20"
                  variant="outline"
                  size="lg"
                >
                  <ThumbsUp className="w-4 h-4 mr-2" />
                  Approve (E)
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
