import { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { io } from "socket.io-client";

// ─── GROQ CONFIG ─────────────────────────────────────────────────────────────
// API routed through Vite proxy (/api/groq → https://api.groq.com) to avoid CORS
const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY || "";
const GROQ_URL = "/api/groq/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";

// ─── QUESTIONS + CORRECT ANSWERS ─────────────────────────────────────────────
// ⚠️  Q3 and Q4 answers are PLACEHOLDERS — replace with actual answers!
const QUESTIONS = [
  {
    q: "What did you say to me during the Hindi Olympiad? 🤫",
    hint: "Something you admitted about yourself...",
    answer: "a girl not shy as much you are",
  },
  {
    q: "Have you ever slapped me (in any way, ever)? 👀",
    hint: "Yes or no...",
    answer: "yes",
  },
  {
    q: "Who was sitting next to you in the Matrix exam — a girl or a boy?",
    hint: "Girl or boy?",
    answer: "girl",
  },
  {
    q: "Was I sitting in front of you or behind you in the Matrix exam?",
    hint: "Front or behind?",
    answer: "behind",
  },
  {
    q: "What was your center for the Matrix exam? 📍",
    hint: "Your exam center location...",
    answer: "narnaud",
  },
  {
    q: "What is your first goal in life? 🎯",
    hint: "Your biggest dream...",
    answer: "nda",
  },
];

// ─── GROQ SEMANTIC VALIDATOR ─────────────────────────────────────────────────
function fallbackMatch(userAnswer, correctAnswer) {
  const u = userAnswer.trim().toLowerCase();
  const c = correctAnswer.toLowerCase();
  if (u === c || u.includes(c) || c.includes(u)) return true;
  // Keyword overlap: if >50% of correct answer words are in user answer
  const cWords = c.split(/\s+/).filter((w) => w.length > 2);
  if (cWords.length === 0) return false;
  const matches = cWords.filter((w) => u.includes(w));
  return matches.length / cWords.length >= 0.5;
}

function normalizeWords(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function editDistance(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
}

function fuzzyWordMatch(target, words) {
  return words.some((w) => {
    if (w === target) return true;
    const maxDist = target.length >= 6 ? 2 : 1;
    return editDistance(w, target) <= maxDist;
  });
}

function firstQuestionFlexibleMatch(userAnswer, correctAnswer) {
  const userWords = normalizeWords(userAnswer);
  const correctWords = normalizeWords(correctAnswer).filter((w) => w.length > 2);
  if (userWords.length === 0 || correctWords.length === 0) return false;

  const requiredAnchors = ["girl", "shy"];
  const hasAnchors = requiredAnchors.every((w) => fuzzyWordMatch(w, userWords));
  if (!hasAnchors) return false;

  const hitCount = correctWords.filter((w) => fuzzyWordMatch(w, userWords)).length;
  const requiredHits = Math.max(3, Math.ceil(correctWords.length * 0.55));
  return hitCount >= requiredHits;
}

async function validateAnswer(question, correctAnswer, userAnswer, questionIndex = -1) {
  if (questionIndex === 0 && firstQuestionFlexibleMatch(userAnswer, correctAnswer)) return true;
  // Quick local check first
  if (fallbackMatch(userAnswer, correctAnswer)) return true;
  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          {
            role: "system",
            content:
              'You are a strict but fair answer validator. ' +
              'Check if the user\'s answer matches the intended answer in meaning. ' +
              'Be lenient with typos, abbreviations, case, and minor rephrasing. ' +
              'For yes/no questions, accept "yeah", "yep", "nah", "nope" etc. ' +
              'Reply ONLY with the single word "yes" or "no". Nothing else.',
          },
          {
            role: "user",
            content:
              `Question: "${question}"\n` +
              `Intended answer: "${correctAnswer}"\n` +
              `User answered: "${userAnswer}"\n\n` +
              `Does the user's answer match the intended answer in meaning? Reply only "yes" or "no".`,
          },
        ],
        max_tokens: 3,
        temperature: 0,
      }),
    });
    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content?.trim().toLowerCase() ?? "";
    return reply.startsWith("yes");
  } catch {
    // API unreachable — rely on fallback
    return fallbackMatch(userAnswer, correctAnswer);
  }
}

// ─── BACKGROUND ───────────────────────────────────────────────────────────────
function Background() {
  return (
    <div className="fixed inset-0 overflow-hidden" style={{ zIndex: 0 }}>
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(155deg, #060d2e 0%, #0a0a28 55%, #06091f 100%)" }} />
      <motion.div
        style={{
          position: "absolute", borderRadius: "50%",
          width: "55vw", height: "55vw", top: "-18vw", left: "-12vw",
          background: "radial-gradient(circle, rgba(109,40,217,0.20) 0%, transparent 68%)",
          filter: "blur(48px)",
        }}
        animate={{ scale: [1, 1.12, 1], opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        style={{
          position: "absolute", borderRadius: "50%",
          width: "50vw", height: "50vw", bottom: "-16vw", right: "-12vw",
          background: "radial-gradient(circle, rgba(59,130,246,0.16) 0%, transparent 68%)",
          filter: "blur(48px)",
        }}
        animate={{ scale: [1, 1.14, 1], opacity: [0.6, 0.95, 0.6] }}
        transition={{ duration: 13, repeat: Infinity, ease: "easeInOut", delay: 3 }}
      />
    </div>
  );
}

// ─── PARTICLES ────────────────────────────────────────────────────────────────
function Particles() {
  const dots = useMemo(() =>
    Array.from({ length: 20 }, (_, i) => ({
      id: i,
      x: Math.random() * 100, y: Math.random() * 100,
      size: 1.5 + Math.random() * 2.5,
      dur: 9 + Math.random() * 10, delay: Math.random() * 8,
      op: 0.12 + Math.random() * 0.35,
      rise: 25 + Math.random() * 45,
      color: i % 3 === 0 ? "rgba(167,139,250,0.8)" : i % 3 === 1 ? "rgba(96,165,250,0.7)" : "rgba(255,255,255,0.35)",
    })), []
  );
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 1 }}>
      {dots.map((d) => (
        <motion.div
          key={d.id} className="absolute rounded-full"
          style={{ left: `${d.x}%`, top: `${d.y}%`, width: d.size, height: d.size, background: d.color, boxShadow: `0 0 ${d.size * 3}px ${d.color}`, willChange: "transform, opacity" }}
          animate={{ y: [-d.rise, 0], opacity: [0, d.op, d.op, 0] }}
          transition={{ duration: d.dur, delay: d.delay, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

// ─── GLASS CARD ───────────────────────────────────────────────────────────────
function GlassCard({ children, className = "", glow = "rgba(109,40,217,0.22)" }) {
  return (
    <div className={`rounded-3xl ${className}`} style={{
      background: "rgba(8, 12, 38, 0.65)",
      backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
      border: "1px solid rgba(139,92,246,0.22)",
      boxShadow: `0 8px 48px ${glow}, 0 2px 16px rgba(0,0,0,0.55)`,
    }}>
      {children}
    </div>
  );
}

// ─── TYPING HOOK ──────────────────────────────────────────────────────────────
function useTyping(text, speed = 58, startDelay = 700) {
  const [out, setOut] = useState("");
  useEffect(() => {
    setOut("");
    const t = setTimeout(() => {
      let i = 0;
      const iv = setInterval(() => { setOut(text.slice(0, ++i)); if (i >= text.length) clearInterval(iv); }, speed);
      return () => clearInterval(iv);
    }, startDelay);
    return () => clearTimeout(t);
  }, [text, speed, startDelay]);
  return out;
}

// ─── PROGRESS BAR ─────────────────────────────────────────────────────────────
function ProgressBar({ current, total }) {
  return (
    <div className="w-full mb-6">
      <div className="flex justify-between items-center mb-2">
        <span style={{ color: "rgba(196,181,253,0.7)", fontSize: "0.72rem", letterSpacing: "0.15em", textTransform: "uppercase" }}>
          Question
        </span>
        <span style={{ color: "rgba(196,181,253,0.9)", fontSize: "0.75rem", fontWeight: 600 }}>
          {current + 1} <span style={{ color: "rgba(148,163,184,0.5)" }}>/ {total}</span>
        </span>
      </div>
      <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: "rgba(139,92,246,0.15)" }}>
        <motion.div
          className="h-full rounded-full"
          style={{ background: "linear-gradient(90deg, #7c3aed, #60a5fa)" }}
          animate={{ width: `${((current + 1) / total) * 100}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </div>
      {/* Step dots */}
      <div className="flex justify-between mt-2">
        {Array.from({ length: total }).map((_, i) => (
          <motion.div
            key={i}
            className="rounded-full"
            style={{
              width: 7, height: 7,
              background: i <= current ? "rgba(139,92,246,0.9)" : "rgba(139,92,246,0.2)",
              boxShadow: i === current ? "0 0 8px rgba(139,92,246,0.8)" : "none",
            }}
            animate={{ scale: i === current ? [1, 1.3, 1] : 1 }}
            transition={{ duration: 1.5, repeat: i === current ? Infinity : 0 }}
          />
        ))}
      </div>
    </div>
  );
}

// ─── QUIZ SCREEN ──────────────────────────────────────────────────────────────
function QuizScreen({ onUnlock }) {
  const [step, setStep] = useState(0);
  const [val, setVal] = useState("");
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);
  const [loading, setLoading] = useState(false);
  const [correct, setCorrect] = useState(false); // brief success flash
  const inputRef = useRef(null);
  const total = QUESTIONS.length;

  const current = QUESTIONS[step];

  useEffect(() => {
    setVal(""); setError("");
    setTimeout(() => inputRef.current?.focus(), 300);
  }, [step]);

  const submit = async (e) => {
    e.preventDefault();
    if (!val.trim() || loading) return;

    setLoading(true);
    setError("");

    const ok = await validateAnswer(current.q, current.answer, val.trim(), step);
    setLoading(false);

    if (ok) {
      setCorrect(true);
      setTimeout(() => {
        setCorrect(false);
        if (step + 1 >= total) {
          onUnlock();
        } else {
          setStep((s) => s + 1);
        }
      }, 700);
    } else {
      setError("That doesn't seem right, try again 💭");
      setShake(true);
      setVal("");
      setTimeout(() => setShake(false), 520);
    }
  };

  return (
    <motion.div
      key="quiz"
      className="fixed inset-0 flex items-center justify-center px-5 py-8"
      style={{ zIndex: 10 }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.04 }}
      transition={{ duration: 0.65 }}
    >
      <div className="w-full max-w-sm">
        {/* Header */}
        <motion.div
          className="text-center mb-6"
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <motion.div
            className="text-4xl mb-2"
            animate={{ y: [0, -7, 0] }}
            transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
          >
            🌸
          </motion.div>
          <p style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: "clamp(0.85rem, 3vw, 1rem)",
            background: "linear-gradient(135deg, #ddd6fe, #a5b4fc)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
          }}>
            Prove you're Ankita
          </p>
        </motion.div>

        {/* Card */}
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 40, scale: 0.97 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -40, scale: 0.97 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          >
            <motion.div
              animate={shake ? { x: [-12, 12, -9, 9, -5, 5, 0] } : {}}
              transition={{ duration: 0.48 }}
            >
              <GlassCard
                className="p-7"
                glow={error ? "rgba(239,68,68,0.2)" : correct ? "rgba(52,211,153,0.28)" : "rgba(109,40,217,0.22)"}
              >
                <ProgressBar current={step} total={total} />

                {/* Question */}
                <motion.p
                  className="text-center mb-6 leading-relaxed"
                  style={{
                    fontFamily: "'Playfair Display', serif",
                    fontSize: "clamp(0.9rem, 3.5vw, 1.05rem)",
                    color: "rgba(226,232,240,0.92)",
                    minHeight: "3.5rem",
                  }}
                >
                  {current.q}
                </motion.p>

                {/* Hint */}
                <p className="text-center text-xs mb-5" style={{ color: "rgba(148,163,184,0.5)", letterSpacing: "0.04em" }}>
                  {current.hint}
                </p>

                <form onSubmit={submit} className="flex flex-col gap-3">
                  <input
                    ref={inputRef}
                    type="text"
                    value={val}
                    onChange={(e) => setVal(e.target.value)}
                    placeholder="Your answer…"
                    disabled={loading || correct}
                    className="w-full px-4 py-3.5 rounded-2xl text-white placeholder-slate-500 outline-none"
                    style={{
                      background: "rgba(5, 8, 28, 0.75)",
                      border: error
                        ? "1.5px solid rgba(239,68,68,0.65)"
                        : correct
                          ? "1.5px solid rgba(52,211,153,0.65)"
                          : "1.5px solid rgba(139,92,246,0.35)",
                      boxShadow: error
                        ? "0 0 18px rgba(239,68,68,0.15)"
                        : correct
                          ? "0 0 18px rgba(52,211,153,0.2)"
                          : "none",
                      fontSize: "0.92rem",
                      fontFamily: "'Inter', sans-serif",
                      letterSpacing: "0.04em",
                      transition: "border 0.2s, box-shadow 0.2s",
                      opacity: loading ? 0.6 : 1,
                    }}
                    onFocus={(e) => {
                      if (!error && !correct) {
                        e.target.style.border = "1.5px solid rgba(167,139,250,0.75)";
                        e.target.style.boxShadow = "0 0 24px rgba(139,92,246,0.22)";
                      }
                    }}
                    onBlur={(e) => {
                      if (!error && !correct) {
                        e.target.style.border = "1.5px solid rgba(139,92,246,0.35)";
                        e.target.style.boxShadow = "none";
                      }
                    }}
                  />

                  <motion.button
                    type="submit"
                    disabled={loading || correct || !val.trim()}
                    className="relative w-full py-3.5 rounded-2xl font-semibold text-white overflow-hidden"
                    style={{
                      background: correct
                        ? "linear-gradient(135deg, #059669, #10b981)"
                        : "linear-gradient(135deg, #7c3aed, #4f46e5)",
                      boxShadow: correct
                        ? "0 0 28px rgba(52,211,153,0.38)"
                        : "0 0 28px rgba(124,58,237,0.35)",
                      fontFamily: "'Inter', sans-serif",
                      letterSpacing: "0.08em", fontSize: "0.88rem",
                      opacity: (!val.trim() && !loading && !correct) ? 0.6 : 1,
                      transition: "background 0.3s, box-shadow 0.3s, opacity 0.2s",
                    }}
                    whileHover={!loading && !correct && val.trim() ? { scale: 1.025, boxShadow: "0 0 44px rgba(124,58,237,0.55)" } : {}}
                    whileTap={!loading && !correct ? { scale: 0.96 } : {}}
                  >
                    {/* Pulse ring */}
                    {!loading && !correct && (
                      <motion.span
                        className="absolute inset-0 rounded-2xl"
                        style={{ border: "1.5px solid rgba(196,181,253,0.35)" }}
                        animate={{ scale: [1, 1.07], opacity: [0.6, 0] }}
                        transition={{ duration: 1.8, repeat: Infinity }}
                      />
                    )}
                    <span className="relative z-10 flex items-center justify-center gap-2">
                      {loading ? (
                        <>
                          <motion.span
                            animate={{ rotate: 360 }}
                            transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                            style={{ display: "inline-block", width: 14, height: 14, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "white", borderRadius: "50%" }}
                          />
                          Checking…
                        </>
                      ) : correct ? (
                        <>✓ Correct!</>
                      ) : step === total - 1 ? (
                        "Unlock 🌸"
                      ) : (
                        "Next →"
                      )}
                    </span>
                  </motion.button>
                </form>

                {/* Error */}
                <AnimatePresence>
                  {error && (
                    <motion.p
                      className="text-center mt-3 text-xs font-medium"
                      style={{ color: "rgba(252,165,165,0.85)" }}
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                    >
                      {error}
                    </motion.p>
                  )}
                </AnimatePresence>
              </GlassCard>
            </motion.div>
          </motion.div>
        </AnimatePresence>

        {/* Back hint */}
        {step > 0 && (
          <motion.button
            onClick={() => { setStep((s) => s - 1); setError(""); }}
            className="w-full mt-3 text-center text-xs py-2"
            style={{ color: "rgba(148,163,184,0.4)", letterSpacing: "0.06em" }}
            whileHover={{ color: "rgba(196,181,253,0.7)" }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
          >
            ← go back
          </motion.button>
        )}
      </div>
    </motion.div>
  );
}

// ─── MAIN CONTENT ─────────────────────────────────────────────────────────────
function MainContent() {
  // Restore decision from localStorage so reload skips to the right screen
  const [showFinal, setShowFinal] = useState(() => {
    const saved = localStorage.getItem("sorry_decision");
    return saved || false;
  });

  const handleDecide = (val) => {
    if (val) localStorage.setItem("sorry_decision", val);
    setShowFinal(val);
  };

  const subtitle = useTyping("A quiet note — just for you.", 60, 900);

  const lines = [
    { text: "I'm sorry if I ever hurt you.", icon: "🌸" },
    { text: "I never wanted to.", icon: "💫" },
    { text: "I respect you deeply.", icon: "✨" },
    { text: "No expectations — only respect.", icon: "💜" },
    { text: "All the best for your boards.", icon: "⭐" },
  ];

  const fadeUp = {
    hidden: { opacity: 0, y: 22 },
    show: (d = 0) => ({ opacity: 1, y: 0, transition: { delay: d, duration: 0.65, ease: "easeOut" } }),
  };

  return (
    <motion.div
      key="main"
      className="relative min-h-screen flex flex-col items-center py-16 px-5"
      style={{ zIndex: 10 }}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.75, ease: "easeOut" }}
    >
      <div className="w-full max-w-lg mx-auto flex flex-col gap-9">

        {/* Intro */}
        <div className="text-center pt-2">
          <motion.div
            custom={0.15} variants={fadeUp} initial="hidden" animate="show"
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-5"
            style={{
              background: "rgba(139,92,246,0.13)", border: "1px solid rgba(139,92,246,0.28)",
              color: "rgba(196,181,253,0.8)", fontSize: "0.65rem", letterSpacing: "0.2em", textTransform: "uppercase",
            }}
          >
            <motion.span animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 2.5, repeat: Infinity }}>✦</motion.span>
            A PRIVATE MESSAGE
            <motion.span animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 2.5, repeat: Infinity, delay: 1.25 }}>✦</motion.span>
          </motion.div>

          <motion.h1
            custom={0.3} variants={fadeUp} initial="hidden" animate="show"
            className="font-bold mb-3"
            style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: "clamp(2.6rem, 8vw, 4rem)",
              background: "linear-gradient(135deg, #ede9fe 0%, #c4b5fd 45%, #93c5fd 100%)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
              lineHeight: 1.15, filter: "drop-shadow(0 0 24px rgba(139,92,246,0.4))",
            }}
          >
            Hey Ankita
          </motion.h1>

          <motion.p
            custom={0.45} variants={fadeUp} initial="hidden" animate="show"
            className="min-h-[1.75rem]"
            style={{
              color: "rgba(148,163,184,0.78)", fontFamily: "'Inter', sans-serif",
              fontWeight: 300, fontSize: "clamp(0.9rem, 2.5vw, 1.05rem)", letterSpacing: "0.04em",
            }}
          >
            {subtitle}
            <motion.span animate={{ opacity: [1, 0] }} transition={{ duration: 0.7, repeat: Infinity }} style={{ color: "#818cf8", marginLeft: 1 }}>|</motion.span>
          </motion.p>

          <motion.div
            className="mx-auto mt-5 h-px rounded-full"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 100, opacity: 1 }}
            transition={{ delay: 1.1, duration: 0.7 }}
            style={{ background: "linear-gradient(90deg, transparent, #7c3aed 40%, #60a5fa 60%, transparent)" }}
          />
        </div>

        {/* Message Card */}
        <motion.div initial={{ opacity: 0, y: 36 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.0, duration: 0.8, ease: "easeOut" }}>
          <GlassCard className="p-7 md:p-9">
            <div className="flex items-center gap-2 mb-7">
              <div className="h-px flex-1 rounded-full" style={{ background: "linear-gradient(90deg, transparent, rgba(139,92,246,0.4))" }} />
              <motion.span animate={{ rotate: 360 }} transition={{ duration: 9, repeat: Infinity, ease: "linear" }} style={{ fontSize: "0.8rem", color: "#a78bfa", filter: "drop-shadow(0 0 5px rgba(167,139,250,0.7))" }}>✦</motion.span>
              <div className="h-px flex-1 rounded-full" style={{ background: "linear-gradient(90deg, rgba(139,92,246,0.4), transparent)" }} />
            </div>

            <div className="space-y-5">
              {lines.map(({ text, icon }, i) => (
                <motion.div
                  key={i} className="flex items-start gap-3"
                  initial={{ opacity: 0, x: -18 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 1.35 + i * 0.22, duration: 0.55, ease: "easeOut" }}
                >
                  <motion.span
                    className="flex-shrink-0 text-base mt-0.5"
                    animate={{ y: [0, -4, 0] }}
                    transition={{ duration: 3, delay: i * 0.5, repeat: Infinity, ease: "easeInOut" }}
                    style={{ filter: "drop-shadow(0 0 4px rgba(167,139,250,0.6))" }}
                  >{icon}</motion.span>
                  <p style={{
                    color: i === 4 ? "rgba(196,181,253,0.95)" : "rgba(226,232,240,0.86)",
                    fontFamily: "'Playfair Display', serif",
                    fontSize: "clamp(0.95rem, 2.4vw, 1.08rem)",
                    fontStyle: i < 4 ? "italic" : "normal",
                    fontWeight: i === 4 ? 600 : 400, lineHeight: 1.75,
                  }}>{text}</p>
                </motion.div>
              ))}
            </div>

            <div className="flex items-center gap-2 mt-7">
              <div className="h-px flex-1 rounded-full" style={{ background: "linear-gradient(90deg, transparent, rgba(96,165,250,0.35))" }} />
              <motion.span animate={{ rotate: -360 }} transition={{ duration: 11, repeat: Infinity, ease: "linear" }} style={{ fontSize: "0.8rem", color: "#60a5fa", filter: "drop-shadow(0 0 5px rgba(96,165,250,0.7))" }}>✧</motion.span>
              <div className="h-px flex-1 rounded-full" style={{ background: "linear-gradient(90deg, rgba(96,165,250,0.35), transparent)" }} />
            </div>
          </GlassCard>
        </motion.div>

        {/* ── DECISION SECTION ── */}
        <motion.div
          className="w-full pb-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2.7, duration: 0.7 }}
        >
          <AnimatePresence mode="wait">
            {!showFinal ? (
              <DecisionButtons key="decision" onDecide={handleDecide} />
            ) : showFinal === "pardon" ? (
              <PardonScreen key="pardon" />
            ) : (
              <RefuseScreen key="refuse" onPardon={() => handleDecide("pardon")} />
            )}
          </AnimatePresence>
        </motion.div>

        <motion.p className="text-center text-xs pb-8" style={{ color: "rgba(100,116,139,0.4)", letterSpacing: "0.12em" }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 3.4 }}>
          — with sincerity and respect
        </motion.p>
      </div>
    </motion.div>
  );
}

// ─── DECISION BUTTONS ─────────────────────────────────────────────────────────
function DecisionButtons({ onDecide }) {
  return (
    <motion.div
      className="flex flex-col items-center gap-4"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.92 }}
      transition={{ duration: 0.5 }}
    >
      <p style={{
        fontFamily: "'Playfair Display', serif",
        fontSize: "clamp(0.85rem, 2.5vw, 1rem)",
        color: "rgba(196,181,253,0.7)",
        fontStyle: "italic",
        textAlign: "center",
        marginBottom: "0.25rem",
      }}>
        Do you pardon me? 🥺
      </p>

      <div className="flex gap-4 flex-wrap justify-center">
        {/* YES — Pardon */}
        <motion.button
          onClick={() => onDecide("pardon")}
          className="relative px-8 py-3.5 rounded-full font-semibold text-white overflow-hidden"
          style={{
            background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
            border: "1px solid rgba(196,181,253,0.35)",
            boxShadow: "0 0 28px rgba(124,58,237,0.35)",
            fontFamily: "'Inter', sans-serif",
            letterSpacing: "0.07em", fontSize: "0.9rem",
          }}
          whileHover={{ scale: 1.06, boxShadow: "0 0 50px rgba(124,58,237,0.6)" }}
          whileTap={{ scale: 0.95 }}
        >
          <motion.span
            className="absolute inset-0 rounded-full"
            style={{ border: "1.5px solid rgba(196,181,253,0.4)" }}
            animate={{ scale: [1, 1.1], opacity: [0.7, 0] }}
            transition={{ duration: 1.8, repeat: Infinity }}
          />
          <span className="relative z-10">Yes, I pardon you 🥺</span>
        </motion.button>

        {/* NO — Dodge button */}
        <DodgeButton onRefuse={() => onDecide("refuse")} />
      </div>
    </motion.div>
  );
}

// ─── DODGE BUTTON (funny No) ──────────────────────────────────────────────────
function DodgeButton({ onRefuse }) {
  const [dodges, setDodges] = useState(0);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const maxDodges = 3;

  const handleHover = () => {
    if (dodges >= maxDodges) return;
    const dx = (Math.random() - 0.5) * 160;
    const dy = (Math.random() - 0.5) * 80;
    setPos({ x: dx, y: dy });
    setDodges((d) => d + 1);
  };

  const label =
    dodges === 0 ? "Not yet 😤" :
      dodges === 1 ? "Hey wait— 😅" :
        dodges === 2 ? "Okay stop— 😭" :
          "Fine! Click me 😤";

  return (
    <motion.button
      onClick={onRefuse}
      onHoverStart={handleHover}
      animate={{ x: pos.x, y: pos.y }}
      transition={{ type: "spring", stiffness: 300, damping: 18 }}
      className="relative px-8 py-3.5 rounded-full font-semibold"
      style={{
        background: "rgba(15, 20, 50, 0.6)",
        border: "1px solid rgba(139,92,246,0.22)",
        color: "rgba(196,181,253,0.65)",
        fontFamily: "'Inter', sans-serif",
        letterSpacing: "0.07em", fontSize: "0.9rem",
        boxShadow: "0 0 16px rgba(0,0,0,0.3)",
      }}
      whileTap={{ scale: 0.95 }}
    >
      {label}
    </motion.button>
  );
}

// ─── PARDON SCREEN 🎉 ─────────────────────────────────────────────────────────
// ⚠️  Replace this URL with your actual link when ready!
function PookieChatModal({ open, onClose }) {
  const [name, setName] = useState(() => localStorage.getItem("pookie_name") || "");
  const [draftName, setDraftName] = useState(() => localStorage.getItem("pookie_name") || "");
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [connected, setConnected] = useState(false);
  const [connectError, setConnectError] = useState("");
  const [onlineCount, setOnlineCount] = useState(0);
  const [typingUsers, setTypingUsers] = useState([]);
  const [lastOnlineMap, setLastOnlineMap] = useState({});
  const [seenState, setSeenState] = useState(null);
  const [mySocketId, setMySocketId] = useState("");
  const socketRef = useRef(null);
  const listRef = useRef(null);
  const typingTimerRef = useRef(null);

  useEffect(() => {
    if (!open) return;

    const socketUrl = import.meta.env.VITE_SOCKET_URL
      || (import.meta.env.DEV ? "http://localhost:3000" : window.location.origin);

    const socket = io(socketUrl, {
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      setConnectError("");
      setMySocketId(socket.id || "");
      const saved = (localStorage.getItem("pookie_name") || "").trim().slice(0, 24);
      if (saved) socket.emit("chat register", { name: saved });
    });
    socket.on("disconnect", () => {
      setConnected(false);
      setMySocketId("");
    });
    socket.on("connect_error", () => {
      setConnected(false);
      setConnectError("Chat server not reachable");
    });
    socket.on("chat message", (msg) => {
      setMessages((prev) => [...prev, msg]);
    });
    socket.on("chat history", (history) => {
      setMessages(history);
    });
    socket.on("presence:update", (payload) => {
      setOnlineCount(Number(payload?.onlineCount) || 0);
    });
    socket.on("presence:typing", (payload) => {
      const users = Array.isArray(payload?.users) ? payload.users : [];
      setTypingUsers(users);
    });
    socket.on("presence:last_online", (payload) => {
      setLastOnlineMap(payload || {});
    });
    socket.on("chat seen", (payload) => {
      setSeenState({
        name: String(payload?.name || ""),
        at: Number(payload?.at) || Date.now(),
        viewerSocketId: String(payload?.viewerSocketId || ""),
      });
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
      setConnectError("");
      setTypingUsers([]);
      setMySocketId("");
    };
  }, [open]);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (!open || !name || !socketRef.current) return;
    socketRef.current.emit("chat seen", { name, at: Date.now() });
  }, [open, name, messages.length]);

  useEffect(() => {
    if (!connected || !socketRef.current) return;
    const activeName = (name || draftName).trim().slice(0, 24);
    if (!activeName) return;
    socketRef.current.emit("chat register", { name: activeName });
  }, [connected, name, draftName]);

  useEffect(() => {
    return () => {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    };
  }, []);

  const applyName = () => {
    const clean = draftName.trim().slice(0, 24);
    if (!clean) return;
    setName(clean);
    localStorage.setItem("pookie_name", clean);
    socketRef.current?.emit("chat register", { name: clean });
  };

  const send = () => {
    const clean = text.trim();
    const activeName = (name || draftName).trim().slice(0, 24);
    if (!clean || !activeName || !socketRef.current) return;
    if (activeName !== name) {
      setName(activeName);
      localStorage.setItem("pookie_name", activeName);
      socketRef.current.emit("chat register", { name: activeName });
    }
    socketRef.current.emit("chat message", {
      name: activeName,
      text: clean.slice(0, 350),
      at: Date.now(),
    });
    socketRef.current.emit("chat typing", { name: activeName, typing: false });
    setText("");
  };

  const onType = (value) => {
    setText(value);
    const activeName = (name || draftName).trim().slice(0, 24);
    if (!activeName || !socketRef.current) return;
    socketRef.current.emit("chat register", { name: activeName });
    socketRef.current.emit("chat typing", { name: activeName, typing: value.trim().length > 0 });
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      socketRef.current?.emit("chat typing", { name: activeName, typing: false });
    }, 1000);
  };

  const myLastMessageAt = [...messages].reverse().find((m) => m.senderSocketId === mySocketId)?.at ?? 0;
  const seenMine = Boolean(
    seenState &&
    seenState.viewerSocketId &&
    seenState.viewerSocketId !== mySocketId &&
    myLastMessageAt &&
    seenState.at >= myLastMessageAt
  );
  const typingText = typingUsers
    .filter((u) => String(u?.socketId || "") !== mySocketId)
    .map((u) => String(u?.name || "Someone"))
    .slice(0, 2)
    .join(", ");
  const latestOther = Object.entries(lastOnlineMap)
    .sort((a, b) => (Number(b[1]) || 0) - (Number(a[1]) || 0))[0];

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 flex items-center justify-center p-4"
        style={{ zIndex: 60, background: "rgba(2, 6, 23, 0.62)", backdropFilter: "blur(6px)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="w-full max-w-2xl rounded-3xl overflow-hidden"
          style={{
            background: "linear-gradient(165deg, rgba(8,12,38,0.95) 0%, rgba(14,20,52,0.92) 100%)",
            border: "1px solid rgba(139,92,246,0.28)",
            boxShadow: "0 16px 65px rgba(15, 23, 42, 0.85), 0 0 40px rgba(124,58,237,0.28)",
          }}
          initial={{ y: 26, scale: 0.95, opacity: 0 }}
          animate={{ y: 0, scale: 1, opacity: 1 }}
          exit={{ y: 18, scale: 0.97, opacity: 0 }}
          transition={{ duration: 0.24 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="px-5 py-4 flex items-center justify-between"
            style={{ borderBottom: "1px solid rgba(139,92,246,0.22)" }}
          >
            <div>
              <p style={{ color: "rgba(226,232,240,0.95)", fontWeight: 700, letterSpacing: "0.04em" }}>
                Pookie Chat
              </p>
              <p style={{ color: connected ? "rgba(134,239,172,0.9)" : "rgba(251,191,36,0.9)", fontSize: "0.8rem" }}>
                {connected ? "Live and connected" : "Connecting..."}
              </p>
              <p style={{ color: "rgba(148,163,184,0.86)", fontSize: "0.76rem" }}>
                {onlineCount} online
              </p>
              {!connected && connectError && (
                <p style={{ color: "rgba(251,113,133,0.9)", fontSize: "0.76rem" }}>
                  {connectError}
                </p>
              )}
              {latestOther && (
                <p style={{ color: "rgba(148,163,184,0.72)", fontSize: "0.74rem" }}>
                  Last online: {latestOther[0]} at {new Date(Number(latestOther[1])).toLocaleTimeString()}
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg"
              style={{
                background: "rgba(30,41,59,0.5)",
                border: "1px solid rgba(148,163,184,0.25)",
                color: "rgba(226,232,240,0.9)",
              }}
            >
              Close
            </button>
          </div>

          <div className="px-5 pt-4 pb-3 flex flex-wrap gap-2 items-center">
            <input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              placeholder="Pick your pookie name..."
              className="flex-1 min-w-[180px] px-3 py-2 rounded-xl outline-none"
              style={{
                background: "rgba(15,23,42,0.55)",
                border: "1px solid rgba(139,92,246,0.24)",
                color: "rgba(226,232,240,0.95)",
              }}
            />
            <button
              onClick={applyName}
              className="px-4 py-2 rounded-xl"
              style={{
                background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
                border: "1px solid rgba(196,181,253,0.35)",
                color: "white",
                fontWeight: 600,
              }}
            >
              Save Name
            </button>
          </div>

          <div
            ref={listRef}
            className="mx-5 mb-4 rounded-2xl p-3 overflow-y-auto"
            style={{
              height: "38vh",
              maxHeight: 380,
              background: "rgba(2, 6, 23, 0.38)",
              border: "1px solid rgba(139,92,246,0.16)",
            }}
          >
            {messages.length === 0 ? (
              <p style={{ color: "rgba(148,163,184,0.78)", fontStyle: "italic", fontSize: "0.92rem" }}>
                No messages yet. Say hi, pookie.
              </p>
            ) : (
              messages.map((m, idx) => {
                const mine = name && m.name === name;
                return (
                  <div
                    key={`${m.at || 0}-${idx}`}
                    className="mb-2 max-w-[84%] px-3 py-2 rounded-2xl"
                    style={{
                      marginLeft: mine ? "auto" : 0,
                      background: mine
                        ? "linear-gradient(135deg, rgba(124,58,237,0.9), rgba(79,70,229,0.9))"
                        : "rgba(30, 41, 59, 0.68)",
                      border: mine
                        ? "1px solid rgba(196,181,253,0.4)"
                        : "1px solid rgba(148,163,184,0.22)",
                      color: "rgba(241,245,249,0.95)",
                    }}
                  >
                    <p style={{ fontSize: "0.74rem", opacity: 0.85, marginBottom: 2 }}>
                      {m.name || "anon"}
                    </p>
                    <p style={{ fontSize: "0.93rem", lineHeight: 1.45 }}>{m.text}</p>
                  </div>
                );
              })
            )}
            {!!typingText && (
              <p style={{ color: "rgba(196,181,253,0.9)", fontSize: "0.78rem", marginTop: 2 }}>
                {typingText} typing...
              </p>
            )}
            {seenMine && (
              <p style={{ color: "rgba(134,239,172,0.9)", fontSize: "0.74rem", textAlign: "right", marginTop: 6 }}>
                Seen
              </p>
            )}
          </div>

          <div className="px-5 pb-5 flex gap-2">
            <input
              value={text}
              onChange={(e) => onType(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") send();
              }}
              placeholder={name ? "Type your message..." : "Save your name first..."}
              className="flex-1 px-4 py-2.5 rounded-xl outline-none"
              style={{
                background: "rgba(15,23,42,0.55)",
                border: "1px solid rgba(139,92,246,0.24)",
                color: "rgba(226,232,240,0.95)",
              }}
            />
            <button
              onClick={send}
              className="px-5 py-2.5 rounded-xl"
              style={{
                background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
                border: "1px solid rgba(196,181,253,0.35)",
                color: "white",
                fontWeight: 600,
              }}
            >
              Send
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function PardonScreen() {
  const celebEmojis = ["🎉", "🌸", "✨", "💫", "🥳", "💜", "⭐", "🎊"];
  const [chatOpen, setChatOpen] = useState(false);

  return (
    <motion.div
      className="w-full flex flex-col items-center gap-5"
      initial={{ opacity: 0, scale: 0.85, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Burst emojis */}
      <div className="relative h-16 w-full pointer-events-none overflow-hidden">
        {celebEmojis.map((e, i) => (
          <motion.span
            key={i}
            className="absolute text-2xl"
            style={{ left: `${8 + i * 11}%`, top: "50%" }}
            initial={{ y: 0, opacity: 0, scale: 0 }}
            animate={{
              y: [-10, -65 - Math.random() * 35, -20],
              opacity: [0, 1, 0],
              scale: [0, 1.3, 0.8],
            }}
            transition={{ duration: 1.4, delay: i * 0.09, ease: "easeOut" }}
          >
            {e}
          </motion.span>
        ))}
      </div>

      <GlassCard className="p-8 text-center w-full" glow="rgba(139,92,246,0.38)">
        {/* Bouncing hearts */}
        <div className="flex justify-center gap-2 mb-5">
          {["💜", "🌸", "💜"].map((e, i) => (
            <motion.span
              key={i} className="text-3xl"
              animate={{ y: [0, -12, 0] }}
              transition={{ duration: 1.2, delay: i * 0.18, repeat: Infinity, ease: "easeInOut" }}
              style={{ filter: "drop-shadow(0 0 10px rgba(167,139,250,0.7))" }}
            >{e}</motion.span>
          ))}
        </div>

        <motion.p
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
          style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: "clamp(1.1rem, 3.5vw, 1.3rem)", fontWeight: 600,
            background: "linear-gradient(135deg, #ede9fe, #c4b5fd, #93c5fd)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
            lineHeight: 1.5, marginBottom: "0.75rem",
          }}
        >
          This truly means everything. 🥺
        </motion.p>

        <motion.p
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.55 }}
          style={{
            fontFamily: "'Playfair Display', serif", fontStyle: "italic",
            fontSize: "clamp(0.88rem, 2.4vw, 1rem)",
            color: "rgba(226,232,240,0.72)", lineHeight: 1.65,
            marginBottom: "1.75rem",
          }}
        >
          Thank you for being kind enough to pardon me.<br />
          You're genuinely a good person, Ankita. 🌸
        </motion.p>

        {/* Reach Out Button */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.85 }}>
          <motion.button
            type="button"
            onClick={() => setChatOpen(true)}
            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full font-semibold text-white relative overflow-hidden"
            style={{
              background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
              border: "1px solid rgba(196,181,253,0.35)",
              boxShadow: "0 0 32px rgba(124,58,237,0.45)",
              fontFamily: "'Inter', sans-serif",
              letterSpacing: "0.07em", fontSize: "0.9rem",
              textDecoration: "none",
            }}
            whileHover={{ scale: 1.06, boxShadow: "0 0 55px rgba(124,58,237,0.65)" }}
            whileTap={{ scale: 0.96 }}
          >
            <motion.span
              className="absolute inset-0 rounded-full"
              style={{ border: "1.5px solid rgba(196,181,253,0.4)" }}
              animate={{ scale: [1, 1.1], opacity: [0.7, 0] }}
              transition={{ duration: 1.8, repeat: Infinity }}
            />
            <span className="relative z-10">Reach out to me 💌</span>
          </motion.button>
        </motion.div>
      </GlassCard>
      <PookieChatModal open={chatOpen} onClose={() => setChatOpen(false)} />
    </motion.div>
  );
}

// ─── REFUSE SCREEN (funny → warm) ────────────────────────────────────────────
function RefuseScreen({ onPardon }) {
  // Restore refuse step from localStorage
  const [step, setStep] = useState(() => {
    const saved = parseInt(localStorage.getItem("sorry_refuse_step") || "0", 10);
    return isNaN(saved) ? 0 : Math.min(saved, 2); // cap at final step
  });

  const handleStep = (n) => {
    localStorage.setItem("sorry_refuse_step", n);
    setStep(n);
  };

  const stages = [
    {
      emoji: "😭",
      line: "Okay... that's fair 😔",
      sub: "I get it. I truly do.",
      btn: "But wait—",
      next: 1,
    },
    {
      emoji: "🥺",
      line: "Are you sureeee sure? 👉👈",
      sub: "Like... absolutely positively sure sure?",
      btn: "Yes, I'm sure 😤",
      next: 2,
      alt: "Okay fine 🥺",
    },
    {
      emoji: "😮‍💨",
      line: "Okay okay, I accept. 💜",
      sub: "No matter what — you always matter more than anything. Take care of yourself, Ankita. 🌸",
      btn: null,
    },
  ];

  const s = stages[step];

  return (
    <motion.div
      className="w-full"
      initial={{ opacity: 0, scale: 0.88, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 28 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -28 }}
          transition={{ duration: 0.32 }}
        >
          <GlassCard
            className="p-8 text-center"
            glow={step === 2 ? "rgba(109,40,217,0.28)" : "rgba(239,68,68,0.10)"}
          >
            <motion.div
              className="text-4xl mb-4"
              animate={step === 1
                ? { rotate: [0, -12, 12, -8, 8, 0] }
                : { y: [0, -6, 0] }}
              transition={{ duration: 1.4, repeat: Infinity, repeatDelay: 1.5 }}
            >
              {s.emoji}
            </motion.div>

            <p style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: "clamp(1rem, 3.5vw, 1.2rem)", fontWeight: 600,
              color: step === 2 ? "rgba(196,181,253,0.95)" : "rgba(226,232,240,0.9)",
              marginBottom: "0.6rem", lineHeight: 1.4,
            }}>
              {s.line}
            </p>

            <p style={{
              fontFamily: "'Playfair Display', serif", fontStyle: "italic",
              fontSize: "clamp(0.85rem, 2.3vw, 0.98rem)",
              color: "rgba(148,163,184,0.7)", lineHeight: 1.65,
              marginBottom: s.btn ? "1.5rem" : 0,
            }}>
              {s.sub}
            </p>

            {s.btn && (
              <motion.div
                className="flex flex-wrap gap-3 justify-center"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }}
              >
                {/* Refuse further */}
                <motion.button
                  onClick={() => handleStep(s.next)}
                  className="px-7 py-3 rounded-full font-semibold"
                  style={{
                    background: "rgba(15, 20, 50, 0.7)",
                    border: "1px solid rgba(139,92,246,0.28)",
                    color: "rgba(196,181,253,0.75)",
                    fontFamily: "'Inter', sans-serif",
                    fontSize: "0.88rem", letterSpacing: "0.06em",
                  }}
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                >
                  {s.btn}
                </motion.button>

                {/* Change mind → pardon */}
                {s.alt && (
                  <motion.button
                    onClick={onPardon}
                    className="relative px-7 py-3 rounded-full font-semibold text-white overflow-hidden"
                    style={{
                      background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
                      border: "1px solid rgba(196,181,253,0.3)",
                      boxShadow: "0 0 22px rgba(124,58,237,0.35)",
                      fontFamily: "'Inter', sans-serif",
                      fontSize: "0.88rem", letterSpacing: "0.06em",
                    }}
                    whileHover={{ scale: 1.05, boxShadow: "0 0 40px rgba(124,58,237,0.55)" }}
                    whileTap={{ scale: 0.96 }}
                  >
                    <motion.span
                      className="absolute inset-0 rounded-full"
                      style={{ border: "1.5px solid rgba(196,181,253,0.35)" }}
                      animate={{ scale: [1, 1.1], opacity: [0.6, 0] }}
                      transition={{ duration: 1.8, repeat: Infinity }}
                    />
                    <span className="relative z-10">{s.alt}</span>
                  </motion.button>
                )}
              </motion.div>
            )}

            {step === 2 && (
              <motion.p
                className="mt-5 text-xs"
                style={{ color: "rgba(100,116,139,0.5)", letterSpacing: "0.06em" }}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.65 }}
              >
                Your happiness always comes first. 💜
              </motion.p>
            )}
          </GlassCard>
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────
export default function App() {
  // Skip the quiz entirely if already unlocked before
  const [unlocked, setUnlocked] = useState(() => {
    return localStorage.getItem("sorry_unlocked") === "true";
  });

  const handleUnlock = () => {
    localStorage.setItem("sorry_unlocked", "true");
    setUnlocked(true);
  };

  return (
    <div className="relative min-h-screen">
      <Background />
      <Particles />
      <AnimatePresence mode="wait">
        {!unlocked
          ? <QuizScreen key="quiz" onUnlock={handleUnlock} />
          : <MainContent key="main" />
        }
      </AnimatePresence>
    </div>
  );
}
