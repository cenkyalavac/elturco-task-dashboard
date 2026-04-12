import { useState, useEffect, useRef } from "react";
import { useRoute } from "wouter";
import { CheckCircle2, XCircle, Clock, Loader2, AlertTriangle } from "lucide-react";

type Question = {
  id: number;
  questionText: string;
  questionType: string;
  options: { label: string; value: string }[];
  points: number;
  orderIndex: number;
};

type QuizData = {
  quiz: { title: string; description?: string; timeLimit?: number; category?: string };
  questions: Question[];
  assignmentId: number;
  completed?: boolean;
  score?: number;
  maxScore?: number;
  passed?: boolean;
};

type Result = {
  score: number;
  maxScore: number;
  percentage: number;
  passed: boolean;
  passingScore?: number;
};

export default function QuizTakePage() {
  const [, params] = useRoute("/quiz/:token");
  const token = params?.token || "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [quizData, setQuizData] = useState<QuizData | null>(null);
  const [answers, setAnswers] = useState<Record<number, string[]>>({});
  const [currentQ, setCurrentQ] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load quiz
  useEffect(() => {
    if (!token) return;
    fetch(`/api/quiz/${token}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Failed to load quiz");
        if (data.completed) {
          setResult({ score: data.score, maxScore: data.maxScore, percentage: Math.round((data.score / data.maxScore) * 100), passed: data.passed });
        } else {
          setQuizData(data);
          if (data.quiz?.timeLimit) {
            setTimeLeft(data.quiz.timeLimit * 60);
          }
        }
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, [token]);

  // Timer
  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0 || result) return;
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(timerRef.current!);
          handleSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [timeLeft !== null && !result]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  const selectAnswer = (questionId: number, value: string) => {
    setAnswers((prev) => {
      const current = prev[questionId] || [];
      // For true_false and single-answer, replace
      const question = quizData?.questions.find(q => q.id === questionId);
      if (question?.questionType === "true_false") {
        return { ...prev, [questionId]: [value] };
      }
      // Toggle for multiple choice
      if (current.includes(value)) {
        return { ...prev, [questionId]: current.filter((v) => v !== value) };
      }
      return { ...prev, [questionId]: [value] };
    });
  };

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const formattedAnswers = (quizData?.questions || []).map((q) => ({
        questionId: q.id,
        selectedAnswers: answers[q.id] || [],
      }));
      const res = await fetch(`/api/quiz/${token}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: formattedAnswers }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to submit");
      setResult(data);
      if (timerRef.current) clearInterval(timerRef.current);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0d1117] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#0d1117] flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto mb-3" />
          <h1 className="text-lg font-semibold text-white mb-2">Unable to Load Quiz</h1>
          <p className="text-sm text-white/40">{error}</p>
        </div>
      </div>
    );
  }

  if (result) {
    return (
      <div className="min-h-screen bg-[#0d1117] flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          {result.passed ? (
            <CheckCircle2 className="w-16 h-16 text-emerald-400 mx-auto mb-4" />
          ) : (
            <XCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
          )}
          <h1 className="text-2xl font-bold text-white mb-2">
            {result.passed ? "Congratulations!" : "Quiz Completed"}
          </h1>
          <div className="text-4xl font-bold mb-2">
            <span className={result.passed ? "text-emerald-400" : "text-red-400"}>
              {result.percentage}%
            </span>
          </div>
          <p className="text-white/40 text-sm mb-4">
            Score: {result.score}/{result.maxScore}
            {result.passingScore && ` (Pass: ${result.passingScore}%)`}
          </p>
          <p className="text-white/30 text-xs">
            {result.passed
              ? "You have passed the quiz. Our team will review your results."
              : "Unfortunately, you did not reach the passing score. Our team will be in touch."}
          </p>
        </div>
      </div>
    );
  }

  if (!quizData) return null;

  const questions = quizData.questions;
  const currentQuestion = questions[currentQ];
  const answeredCount = Object.keys(answers).filter(k => (answers[+k] || []).length > 0).length;

  return (
    <div className="min-h-screen bg-[#0d1117] py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-white">{quizData.quiz.title}</h1>
            {quizData.quiz.description && (
              <p className="text-xs text-white/40 mt-1">{quizData.quiz.description}</p>
            )}
          </div>
          {timeLeft !== null && (
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${
              timeLeft < 60 ? "bg-red-500/10 text-red-400" : "bg-white/[0.04] text-white/60"
            }`}>
              <Clock className="w-4 h-4" />
              <span className="text-sm font-mono font-medium">{formatTime(timeLeft)}</span>
            </div>
          )}
        </div>

        {/* Progress */}
        <div className="flex items-center gap-1 mb-6">
          {questions.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full cursor-pointer transition-colors ${
                i === currentQ ? "bg-blue-500" : answers[questions[i].id]?.length ? "bg-emerald-500/50" : "bg-white/[0.06]"
              }`}
              onClick={() => setCurrentQ(i)}
            />
          ))}
        </div>

        {/* Question */}
        {currentQuestion && (
          <div className="bg-[#161b22] border border-white/[0.06] rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs text-white/30">Question {currentQ + 1} of {questions.length}</span>
              <span className="text-xs text-white/30">{currentQuestion.points} point{currentQuestion.points !== 1 ? "s" : ""}</span>
            </div>

            <h2 className="text-base text-white font-medium mb-6">{currentQuestion.questionText}</h2>

            <div className="space-y-2">
              {(currentQuestion.options || []).map((opt) => {
                const selected = (answers[currentQuestion.id] || []).includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    onClick={() => selectAnswer(currentQuestion.id, opt.value)}
                    className={`w-full text-left px-4 py-3 rounded-lg border transition-all ${
                      selected
                        ? "border-blue-500/50 bg-blue-500/10 text-white"
                        : "border-white/[0.06] bg-white/[0.02] text-white/60 hover:border-white/10 hover:text-white/80"
                    }`}
                  >
                    <span className="text-sm">{opt.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between mt-6 pt-4 border-t border-white/[0.06]">
              <button
                onClick={() => setCurrentQ(Math.max(0, currentQ - 1))}
                disabled={currentQ === 0}
                className="px-4 py-2 rounded-md text-xs text-white/40 hover:text-white disabled:opacity-30"
              >
                Previous
              </button>

              <span className="text-xs text-white/20">{answeredCount}/{questions.length} answered</span>

              {currentQ < questions.length - 1 ? (
                <button
                  onClick={() => setCurrentQ(currentQ + 1)}
                  className="px-4 py-2 rounded-md bg-blue-500 text-white text-xs font-medium hover:bg-blue-600"
                >
                  Next
                </button>
              ) : (
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="flex items-center gap-2 px-6 py-2 rounded-md bg-emerald-500 text-white text-xs font-medium hover:bg-emerald-600 disabled:opacity-50"
                >
                  {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Submit Quiz
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
