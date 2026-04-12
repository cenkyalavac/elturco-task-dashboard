import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Trash2, Edit2, Users, Eye, ChevronDown, ChevronRight,
  GripVertical, CheckCircle2, XCircle, Clock, Send,
} from "lucide-react";

type Quiz = {
  id: number;
  title: string;
  description?: string;
  category?: string;
  timeLimit?: number;
  passingScore?: number;
  isActive: boolean;
  questionCount: number;
  assignmentCount: number;
  createdAt: string;
};

type Question = {
  id: number;
  quizId: number;
  questionText: string;
  questionType: string;
  options: { label: string; value: string }[];
  correctAnswers: string[];
  points: number;
  orderIndex: number;
};

export default function QuizzesPage() {
  const { toast } = useToast();
  const [selectedQuiz, setSelectedQuiz] = useState<number | null>(null);
  const [showCreateQuiz, setShowCreateQuiz] = useState(false);
  const [showCreateQuestion, setShowCreateQuestion] = useState(false);
  const [editingQuiz, setEditingQuiz] = useState<Quiz | null>(null);
  const [assignVendorIds, setAssignVendorIds] = useState("");
  const [showAssignModal, setShowAssignModal] = useState(false);

  // Form states
  const [quizForm, setQuizForm] = useState({ title: "", description: "", category: "", timeLimit: "", passingScore: "70" });
  const [questionForm, setQuestionForm] = useState({
    questionText: "", questionType: "multiple_choice",
    options: [{ label: "", value: "a" }, { label: "", value: "b" }, { label: "", value: "c" }, { label: "", value: "d" }],
    correctAnswers: [] as string[], points: "1",
  });

  // Fetch quizzes
  const { data: quizzes = [] } = useQuery<Quiz[]>({
    queryKey: ["/api/quizzes"],
    queryFn: async () => { const r = await apiRequest("GET", "/api/quizzes"); return r.json(); },
  });

  // Fetch selected quiz details
  const { data: quizDetail } = useQuery({
    queryKey: ["/api/quizzes", selectedQuiz],
    queryFn: async () => { const r = await apiRequest("GET", `/api/quizzes/${selectedQuiz}`); return r.json(); },
    enabled: !!selectedQuiz,
  });

  // Mutations
  const createQuiz = useMutation({
    mutationFn: async (data: any) => { const r = await apiRequest("POST", "/api/quizzes", data); return r.json(); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quizzes"] });
      setShowCreateQuiz(false);
      setQuizForm({ title: "", description: "", category: "", timeLimit: "", passingScore: "70" });
      toast({ title: "Quiz created" });
    },
  });

  const updateQuiz = useMutation({
    mutationFn: async ({ id, ...data }: any) => { const r = await apiRequest("PATCH", `/api/quizzes/${id}`, data); return r.json(); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quizzes"] });
      setEditingQuiz(null);
      toast({ title: "Quiz updated" });
    },
  });

  const deleteQuiz = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/quizzes/${id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quizzes"] });
      if (selectedQuiz) setSelectedQuiz(null);
      toast({ title: "Quiz deleted" });
    },
  });

  const createQuestion = useMutation({
    mutationFn: async (data: any) => { const r = await apiRequest("POST", `/api/quizzes/${selectedQuiz}/questions`, data); return r.json(); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quizzes", selectedQuiz] });
      setShowCreateQuestion(false);
      setQuestionForm({ questionText: "", questionType: "multiple_choice", options: [{ label: "", value: "a" }, { label: "", value: "b" }, { label: "", value: "c" }, { label: "", value: "d" }], correctAnswers: [], points: "1" });
      toast({ title: "Question added" });
    },
  });

  const deleteQuestion = useMutation({
    mutationFn: async (questionId: number) => { await apiRequest("DELETE", `/api/quizzes/${selectedQuiz}/questions/${questionId}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quizzes", selectedQuiz] });
      toast({ title: "Question deleted" });
    },
  });

  const assignQuiz = useMutation({
    mutationFn: async (data: { vendorIds: number[] }) => {
      const r = await apiRequest("POST", `/api/quizzes/${selectedQuiz}/assign`, data);
      return r.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/quizzes", selectedQuiz] });
      setShowAssignModal(false);
      setAssignVendorIds("");
      toast({ title: `Quiz assigned to ${data.count} vendor(s)` });
    },
  });

  const handleCreateQuiz = () => {
    createQuiz.mutate({
      title: quizForm.title,
      description: quizForm.description || undefined,
      category: quizForm.category || undefined,
      timeLimit: quizForm.timeLimit ? parseInt(quizForm.timeLimit) : undefined,
      passingScore: parseInt(quizForm.passingScore) || 70,
    });
  };

  const handleCreateQuestion = () => {
    const filteredOptions = questionForm.options.filter(o => o.label.trim());
    createQuestion.mutate({
      questionText: questionForm.questionText,
      questionType: questionForm.questionType,
      options: filteredOptions,
      correctAnswers: questionForm.correctAnswers,
      points: parseInt(questionForm.points) || 1,
    });
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Quiz Management</h1>
          <p className="text-xs text-white/40 mt-0.5">Create and manage vendor assessment quizzes</p>
        </div>
        <button
          onClick={() => setShowCreateQuiz(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-500 text-white text-xs font-medium hover:bg-blue-600 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Create Quiz
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quiz list */}
        <div className="lg:col-span-1 space-y-2">
          {quizzes.length === 0 ? (
            <div className="text-center py-12 text-white/20 text-sm">No quizzes yet</div>
          ) : (
            quizzes.map((quiz) => (
              <div
                key={quiz.id}
                onClick={() => setSelectedQuiz(quiz.id)}
                className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                  selectedQuiz === quiz.id
                    ? "border-blue-500/50 bg-blue-500/10"
                    : "border-white/[0.06] bg-[#161b22] hover:border-white/10"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium text-white truncate">{quiz.title}</h3>
                    {quiz.category && <span className="text-[10px] text-blue-400">{quiz.category}</span>}
                  </div>
                  <div className={`w-2 h-2 rounded-full mt-1 ${quiz.isActive ? "bg-emerald-400" : "bg-white/20"}`} />
                </div>
                <div className="flex items-center gap-3 mt-2 text-[10px] text-white/30">
                  <span>{quiz.questionCount} questions</span>
                  <span>{quiz.assignmentCount} assigned</span>
                  {quiz.timeLimit && <span><Clock className="w-3 h-3 inline" /> {quiz.timeLimit}m</span>}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Quiz detail */}
        <div className="lg:col-span-2">
          {selectedQuiz && quizDetail ? (
            <div className="bg-[#161b22] border border-white/[0.06] rounded-xl p-5">
              {/* Quiz header */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-white">{quizDetail.title}</h2>
                  {quizDetail.description && <p className="text-xs text-white/40 mt-1">{quizDetail.description}</p>}
                  <div className="flex items-center gap-3 mt-2 text-xs text-white/30">
                    {quizDetail.category && <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400">{quizDetail.category}</span>}
                    {quizDetail.timeLimit && <span>Time: {quizDetail.timeLimit}m</span>}
                    <span>Pass: {quizDetail.passingScore}%</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowAssignModal(true)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-emerald-500/10 text-emerald-400 text-xs hover:bg-emerald-500/20"
                  >
                    <Send className="w-3 h-3" /> Assign
                  </button>
                  <button
                    onClick={() => deleteQuiz.mutate(selectedQuiz)}
                    className="p-1.5 rounded-md text-red-400 hover:bg-red-500/10"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Questions */}
              <div className="border-t border-white/[0.06] pt-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-white">Questions ({quizDetail.questions?.length || 0})</h3>
                  <button
                    onClick={() => setShowCreateQuestion(true)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-blue-500/10 text-blue-400 text-xs hover:bg-blue-500/20"
                  >
                    <Plus className="w-3 h-3" /> Add Question
                  </button>
                </div>

                {(quizDetail.questions || []).map((q: Question, i: number) => (
                  <div key={q.id} className="mb-3 p-3 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="text-xs text-white/70">
                          <span className="text-white/30 mr-2">Q{i + 1}.</span>
                          {q.questionText}
                        </p>
                        <div className="mt-2 space-y-1">
                          {(q.options || []).map((opt: any) => (
                            <div key={opt.value} className={`flex items-center gap-2 text-[11px] px-2 py-1 rounded ${
                              q.correctAnswers?.includes(opt.value) ? "bg-emerald-500/10 text-emerald-400" : "text-white/40"
                            }`}>
                              {q.correctAnswers?.includes(opt.value) ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3 opacity-30" />}
                              {opt.label}
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-3">
                        <span className="text-[10px] text-white/20">{q.points}pt</span>
                        <button onClick={() => deleteQuestion.mutate(q.id)} className="text-red-400/50 hover:text-red-400"><Trash2 className="w-3 h-3" /></button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Assignments */}
              {quizDetail.assignments && quizDetail.assignments.length > 0 && (
                <div className="border-t border-white/[0.06] pt-4 mt-4">
                  <h3 className="text-sm font-medium text-white mb-3">Assignments ({quizDetail.assignments.length})</h3>
                  <div className="space-y-1">
                    {quizDetail.assignments.map((a: any) => (
                      <div key={a.id} className="flex items-center justify-between px-3 py-2 rounded-md bg-white/[0.02] text-xs">
                        <span className="text-white/60">Vendor #{a.vendorId}</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] ${
                          a.status === "completed" ? "bg-emerald-500/10 text-emerald-400" :
                          a.status === "expired" ? "bg-red-500/10 text-red-400" :
                          a.status === "in_progress" ? "bg-amber-500/10 text-amber-400" :
                          "bg-blue-500/10 text-blue-400"
                        }`}>{a.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-20 text-white/20 text-sm">
              Select a quiz to view details
            </div>
          )}
        </div>
      </div>

      {/* Create Quiz Modal */}
      {showCreateQuiz && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-[#1a1d27] border border-white/[0.08] rounded-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold text-white mb-4">Create Quiz</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-white/40 mb-1">Title *</label>
                <input value={quizForm.title} onChange={e => setQuizForm(f => ({ ...f, title: e.target.value }))} className="w-full px-3 py-2 rounded-md bg-white/[0.04] border border-white/10 text-sm text-white outline-none" placeholder="Quiz title" />
              </div>
              <div>
                <label className="block text-xs text-white/40 mb-1">Description</label>
                <textarea value={quizForm.description} onChange={e => setQuizForm(f => ({ ...f, description: e.target.value }))} className="w-full px-3 py-2 rounded-md bg-white/[0.04] border border-white/10 text-sm text-white outline-none" rows={3} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-white/40 mb-1">Category</label>
                  <input value={quizForm.category} onChange={e => setQuizForm(f => ({ ...f, category: e.target.value }))} className="w-full px-3 py-2 rounded-md bg-white/[0.04] border border-white/10 text-sm text-white outline-none" placeholder="e.g. Translation" />
                </div>
                <div>
                  <label className="block text-xs text-white/40 mb-1">Time Limit (min)</label>
                  <input type="number" value={quizForm.timeLimit} onChange={e => setQuizForm(f => ({ ...f, timeLimit: e.target.value }))} className="w-full px-3 py-2 rounded-md bg-white/[0.04] border border-white/10 text-sm text-white outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-white/40 mb-1">Passing Score (%)</label>
                <input type="number" value={quizForm.passingScore} onChange={e => setQuizForm(f => ({ ...f, passingScore: e.target.value }))} className="w-full px-3 py-2 rounded-md bg-white/[0.04] border border-white/10 text-sm text-white outline-none" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowCreateQuiz(false)} className="px-4 py-2 rounded-md text-xs text-white/40 hover:text-white">Cancel</button>
              <button onClick={handleCreateQuiz} disabled={!quizForm.title} className="px-4 py-2 rounded-md bg-blue-500 text-white text-xs font-medium hover:bg-blue-600 disabled:opacity-50">Create</button>
            </div>
          </div>
        </div>
      )}

      {/* Create Question Modal */}
      {showCreateQuestion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-[#1a1d27] border border-white/[0.08] rounded-xl p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-white mb-4">Add Question</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-white/40 mb-1">Question Text *</label>
                <textarea value={questionForm.questionText} onChange={e => setQuestionForm(f => ({ ...f, questionText: e.target.value }))} className="w-full px-3 py-2 rounded-md bg-white/[0.04] border border-white/10 text-sm text-white outline-none" rows={3} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-white/40 mb-1">Type</label>
                  <select value={questionForm.questionType} onChange={e => {
                    const type = e.target.value;
                    setQuestionForm(f => ({
                      ...f,
                      questionType: type,
                      options: type === "true_false"
                        ? [{ label: "True", value: "true" }, { label: "False", value: "false" }]
                        : [{ label: "", value: "a" }, { label: "", value: "b" }, { label: "", value: "c" }, { label: "", value: "d" }],
                      correctAnswers: [],
                    }));
                  }} className="w-full px-3 py-2 rounded-md bg-white/[0.04] border border-white/10 text-sm text-white outline-none">
                    <option value="multiple_choice">Multiple Choice</option>
                    <option value="true_false">True/False</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-white/40 mb-1">Points</label>
                  <input type="number" min="1" value={questionForm.points} onChange={e => setQuestionForm(f => ({ ...f, points: e.target.value }))} className="w-full px-3 py-2 rounded-md bg-white/[0.04] border border-white/10 text-sm text-white outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-white/40 mb-2">Options (click to mark correct)</label>
                {questionForm.options.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2 mb-2">
                    <button
                      type="button"
                      onClick={() => {
                        const ca = questionForm.correctAnswers.includes(opt.value)
                          ? questionForm.correctAnswers.filter(a => a !== opt.value)
                          : [...questionForm.correctAnswers, opt.value];
                        setQuestionForm(f => ({ ...f, correctAnswers: ca }));
                      }}
                      className={`w-6 h-6 rounded flex items-center justify-center shrink-0 ${
                        questionForm.correctAnswers.includes(opt.value) ? "bg-emerald-500 text-white" : "bg-white/[0.06] text-white/30"
                      }`}
                    >
                      {questionForm.correctAnswers.includes(opt.value) ? "✓" : String.fromCharCode(65 + i)}
                    </button>
                    {questionForm.questionType === "multiple_choice" ? (
                      <input
                        value={opt.label}
                        onChange={e => {
                          const opts = [...questionForm.options];
                          opts[i] = { ...opts[i], label: e.target.value };
                          setQuestionForm(f => ({ ...f, options: opts }));
                        }}
                        className="flex-1 px-3 py-1.5 rounded-md bg-white/[0.04] border border-white/10 text-xs text-white outline-none"
                        placeholder={`Option ${String.fromCharCode(65 + i)}`}
                      />
                    ) : (
                      <span className="text-xs text-white/60">{opt.label}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowCreateQuestion(false)} className="px-4 py-2 rounded-md text-xs text-white/40 hover:text-white">Cancel</button>
              <button onClick={handleCreateQuestion} disabled={!questionForm.questionText || questionForm.correctAnswers.length === 0} className="px-4 py-2 rounded-md bg-blue-500 text-white text-xs font-medium hover:bg-blue-600 disabled:opacity-50">Add Question</button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Quiz Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-[#1a1d27] border border-white/[0.08] rounded-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold text-white mb-4">Assign Quiz to Vendors</h2>
            <div>
              <label className="block text-xs text-white/40 mb-1">Vendor IDs (comma-separated)</label>
              <input
                value={assignVendorIds}
                onChange={e => setAssignVendorIds(e.target.value)}
                className="w-full px-3 py-2 rounded-md bg-white/[0.04] border border-white/10 text-sm text-white outline-none"
                placeholder="1, 2, 3"
              />
              <p className="text-[10px] text-white/20 mt-1">Enter the vendor ID numbers separated by commas</p>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowAssignModal(false)} className="px-4 py-2 rounded-md text-xs text-white/40 hover:text-white">Cancel</button>
              <button
                onClick={() => {
                  const ids = assignVendorIds.split(",").map(s => parseInt(s.trim())).filter(n => !isNaN(n));
                  if (ids.length > 0) assignQuiz.mutate({ vendorIds: ids });
                }}
                disabled={!assignVendorIds.trim()}
                className="px-4 py-2 rounded-md bg-emerald-500 text-white text-xs font-medium hover:bg-emerald-600 disabled:opacity-50"
              >
                Assign
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
