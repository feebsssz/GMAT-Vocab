import { useState, useEffect, useCallback, useRef } from "react";

// ── DECK CONFIG ────────────────────────────────────────────────────────────────
const DECKS = [
  { id: "vocab",    name: "Vocab",    emoji: "📖", color: "#4f46e5", file: "/vocab_data.json" },
  { id: "cr_logic", name: "CR Logic", emoji: "🧠", color: "#0891b2", file: "/cr_logic_data.json" },
  // Uncomment when you've added content from your books:
  // { id: "quant",   name: "Quant",   emoji: "🔢", color: "#0ea5e9", file: "/quant_data.json" },
  // { id: "grammar", name: "Grammar", emoji: "✍️", color: "#7c3aed", file: "/grammar_data.json" },
];

// ── COLORS ─────────────────────────────────────────────────────────────────────
const C = {
  bg:     "#f1f5f9",
  surface: "#ffffff",
  border:  "#e2e8f0",
  accent:  "#4f46e5",
  know:    "#22c55e",
  study:   "#f97316",
  text:    "#0f172a",
  muted:   "#64748b",
  faint:   "#cbd5e1",
  font:    "-apple-system, 'Segoe UI', system-ui, sans-serif",
};

// ── SUPABASE ───────────────────────────────────────────────────────────────────
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const HAS_SUPABASE = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

const sbH = {
  "Content-Type": "application/json",
  "apikey": SUPABASE_ANON_KEY,
  "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
};

async function sbFetchProgress(userCode) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/vocab_progress?user_code=eq.${encodeURIComponent(userCode)}&select=deck,word,status,level,misses`,
    { headers: sbH }
  );
  if (!res.ok) throw new Error();
  return res.json();
}

async function sbUpsert(userCode, deck, word, status, level, misses) {
  await fetch(`${SUPABASE_URL}/rest/v1/vocab_progress`, {
    method: "POST",
    headers: { ...sbH, "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ user_code: userCode, deck, word, status, level, misses, updated_at: new Date().toISOString() }),
  });
}

async function sbFetchDaily(userCode) {
  const from = new Date(); from.setDate(from.getDate() - 7);
  const fromStr = from.toLocaleDateString("sv-SE");
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/vocab_daily?user_code=eq.${encodeURIComponent(userCode)}&date=gte.${fromStr}`,
    { headers: sbH }
  );
  if (!res.ok) throw new Error();
  return res.json();
}

async function sbUpsertDaily(userCode, date, reviews, newWords) {
  await fetch(`${SUPABASE_URL}/rest/v1/vocab_daily`, {
    method: "POST",
    headers: { ...sbH, "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ user_code: userCode, date, reviews, new_words: newWords }),
  });
}

// ── HELPERS ────────────────────────────────────────────────────────────────────
function todayStr() { return new Date().toLocaleDateString("sv-SE"); }

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildQueue(words, progress, filter, deckId) {
  const pool = words.filter(w => {
    const s = progress[`${deckId}:${w.word}`]?.status || "unseen";
    if (filter === "unseen") return s === "unseen";
    if (filter === "know")   return s === "know";
    if (filter === "study")  return s === "dont_know";
    return true;
  });
  const weighted = [];
  pool.forEach(w => {
    const level = progress[`${deckId}:${w.word}`]?.level ?? 0;
    const weight = Math.max(1, 5 - level);
    for (let i = 0; i < weight; i++) weighted.push(w.word);
  });
  return shuffle(weighted);
}

function loadLocalProgress() {
  try { return JSON.parse(localStorage.getItem("gmat_progress_v2") || "{}"); } catch { return {}; }
}
function saveLocalProgress(p) { localStorage.setItem("gmat_progress_v2", JSON.stringify(p)); }

function loadLocalDaily() {
  try { return JSON.parse(localStorage.getItem("gmat_daily_log") || "{}"); } catch { return {}; }
}
function saveLocalDaily(d) { localStorage.setItem("gmat_daily_log", JSON.stringify(d)); }

function generateCode() {
  const adj = ["swift","bright","calm","bold","keen","sharp","clear","fresh","fast","smart"];
  const noun = ["panda","tiger","hawk","river","stone","cloud","spark","ridge","grove","peak"];
  const n = Math.floor(Math.random() * 90) + 10;
  return `${adj[Math.floor(Math.random()*adj.length)]}-${noun[Math.floor(Math.random()*noun.length)]}-${n}`;
}

// ── MAIN COMPONENT ─────────────────────────────────────────────────────────────
export default function GmatVocab() {
  const [deckData,    setDeckData]    = useState({});
  const [activeDeck,  setActiveDeck]  = useState("vocab");
  const [progress,    setProgress]    = useState(loadLocalProgress);
  const [dailyLog,    setDailyLog]    = useState(loadLocalDaily);
  const [dailyStats,  setDailyStats]  = useState({ reviews: 0, newWords: 0 });
  const [streak,      setStreak]      = useState(() => parseInt(localStorage.getItem("gmat_streak") || "0"));
  const [userCode,    setUserCode]    = useState(() => localStorage.getItem("gmat_user_code") || "");

  const [view,        setView]        = useState("study");   // study | words | stats
  const [filter,      setFilter]      = useState("all");     // all | unseen | study | know
  const [mode,        setMode]        = useState("flip");    // flip | mc
  const [showZh,      setShowZh]      = useState(() => localStorage.getItem("gmat_show_zh") === "true");

  const [queue,       setQueue]       = useState([]);
  const [queueIdx,    setQueueIdx]    = useState(0);
  const [isFlipped,   setIsFlipped]   = useState(false);
  const [mcOptions,   setMcOptions]   = useState(null);
  const [mcSelected,  setMcSelected]  = useState(null);
  const [undoStack,   setUndoStack]   = useState(null);
  const [toast,       setToast]       = useState(null);

  const [search,        setSearch]        = useState("");
  const [listFilter,    setListFilter]    = useState("all");
  const [expandedWords, setExpandedWords] = useState(new Set());

  const [setupOpen,    setSetupOpen]    = useState(!localStorage.getItem("gmat_user_code"));
  const [codeInput,    setCodeInput]    = useState(() => generateCode());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [syncing,      setSyncing]      = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState(null);

  const touchStartX   = useRef(null);
  const isTouchDevice = useRef(false);
  const isFlippedRef  = useRef(false);
  useEffect(() => { isFlippedRef.current = isFlipped; }, [isFlipped]);

  // Load all deck JSON files
  useEffect(() => {
    DECKS.forEach(deck => {
      fetch(deck.file)
        .then(r => r.json())
        .then(data => setDeckData(prev => ({ ...prev, [deck.id]: data })))
        .catch(() => {});
    });
  }, []);

  // Restore today's stats from local log
  useEffect(() => {
    const today = todayStr();
    const d = loadLocalDaily()[today];
    if (d) setDailyStats({ reviews: d.reviews || 0, newWords: d.newWords || 0 });
    // Fix stale streak
    const lastStudy = localStorage.getItem("gmat_last_study");
    if (lastStudy && lastStudy < new Date(Date.now() - 86400000).toLocaleDateString("sv-SE")) {
      setStreak(0); localStorage.setItem("gmat_streak", "0");
    }
  }, []);

  // Sync from Supabase when user code is set
  const syncFromCloud = useCallback(async (code) => {
    if (!HAS_SUPABASE || !code) return;
    setLoading(true);
    try {
      const rows = await sbFetchProgress(code);
      const prog = { ...loadLocalProgress() };
      rows.forEach(r => { prog[`${r.deck}:${r.word}`] = { status: r.status, level: r.level, misses: r.misses || 0 }; });
      setProgress(prog); saveLocalProgress(prog);

      const dailyRows = await sbFetchDaily(code);
      const log = { ...loadLocalDaily() };
      dailyRows.forEach(r => { log[r.date] = { reviews: r.reviews, newWords: r.new_words }; });
      setDailyLog(log); saveLocalDaily(log);
      const today = todayStr();
      if (log[today]) setDailyStats({ reviews: log[today].reviews || 0, newWords: log[today].newWords || 0 });
      setError(null);
    } catch {
      setError("Couldn't sync with cloud. Using local progress.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (userCode) syncFromCloud(userCode); }, [userCode, syncFromCloud]);

  // Rebuild queue on deck/filter/progress change
  const currentDeckWords = deckData[activeDeck] || [];
  useEffect(() => {
    if (!currentDeckWords.length) return;
    setQueue(buildQueue(currentDeckWords, progress, filter, activeDeck));
    setQueueIdx(0); setIsFlipped(false); setMcOptions(null); setMcSelected(null);
  }, [currentDeckWords.length, filter, activeDeck]); // intentionally not progress — only rebuild on deck/filter switch

  function saveUserCode(code) {
    const clean = code.trim().toLowerCase().replace(/\s+/g, "-") || generateCode();
    localStorage.setItem("gmat_user_code", clean);
    setUserCode(clean); setSetupOpen(false);
  }

  const currentWordName = queue.length > 0 ? queue[queueIdx % queue.length] : null;
  const currentWord     = currentWordName ? currentDeckWords.find(w => w.word === currentWordName) : null;
  const currentKey      = currentWordName ? `${activeDeck}:${currentWordName}` : null;
  const currentProg     = currentKey ? (progress[currentKey] || { status: "unseen", level: 0, misses: 0 }) : null;
  const activeDeckCfg   = DECKS.find(d => d.id === activeDeck);

  const knownCount  = (deckId) => currentDeckWords.length && Object.entries(progress).filter(([k, v]) => k.startsWith(deckId + ":") && v.status === "know").length;
  const studyCount  = (deckId) => Object.entries(progress).filter(([k, v]) => k.startsWith(deckId + ":") && v.status === "dont_know").length;
  const unseenCount = (deckId, total) => total - Object.entries(progress).filter(([k]) => k.startsWith(deckId + ":")).length;

  function generateMcOptions(word) {
    const correct = word.definition;
    const others  = shuffle(currentDeckWords.filter(w => w.word !== word.word)).slice(0, 3).map(w => w.definition);
    return shuffle([{ def: correct, isCorrect: true }, ...others.map(def => ({ def, isCorrect: false }))]);
  }

  // Show MC options when card changes in MC mode
  useEffect(() => {
    if (mode === "mc" && currentWord) {
      setMcOptions(generateMcOptions(currentWord));
      setMcSelected(null);
    }
  }, [currentWord?.word, mode]);

  async function handleAnswer(know) {
    if (!currentWord || !userCode) return;
    const word    = currentWord.word;
    const key     = `${activeDeck}:${word}`;
    const prev    = progress[key] || { status: "unseen", level: 0, misses: 0 };
    const wasNew  = prev.status === "unseen";
    const newLevel  = know ? Math.min(4, (prev.level || 0) + 1) : 0;
    const newStatus = know ? "know" : "dont_know";
    const newMisses = know ? (prev.misses || 0) : (prev.misses || 0) + 1;

    setUndoStack({ key, prevProg: prev, prevDaily: dailyStats, prevStreak: streak });

    const newProg = { ...progress, [key]: { status: newStatus, level: newLevel, misses: newMisses } };
    setProgress(newProg); saveLocalProgress(newProg);

    const today       = todayStr();
    const newReviews  = dailyStats.reviews + 1;
    const newNewWords = dailyStats.newWords + (wasNew && know ? 1 : 0);
    setDailyStats({ reviews: newReviews, newWords: newNewWords });
    const newLog = { ...dailyLog, [today]: { reviews: newReviews, newWords: newNewWords } };
    setDailyLog(newLog); saveLocalDaily(newLog);

    const lastStudy = localStorage.getItem("gmat_last_study");
    if (lastStudy !== today) {
      const yest = new Date(); yest.setDate(yest.getDate() - 1);
      const newStreak = lastStudy === yest.toLocaleDateString("sv-SE") ? streak + 1 : 1;
      setStreak(newStreak);
      localStorage.setItem("gmat_streak", String(newStreak));
      localStorage.setItem("gmat_last_study", today);
    }

    setToast(know ? "know" : "study");
    setTimeout(() => setToast(null), 1200);
    setIsFlipped(false); setMcOptions(null); setMcSelected(null);
    setQueueIdx(i => i + 1);

    if (HAS_SUPABASE && userCode) {
      setSyncing(true);
      try { await Promise.all([sbUpsert(userCode, activeDeck, word, newStatus, newLevel, newMisses), sbUpsertDaily(userCode, today, newReviews, newNewWords)]); }
      catch { /* local already saved */ } finally { setSyncing(false); }
    }
  }

  async function handleUndo() {
    if (!undoStack) return;
    const { key, prevProg, prevDaily, prevStreak } = undoStack;
    const newProg = { ...progress, [key]: prevProg };
    setProgress(newProg); saveLocalProgress(newProg);
    setDailyStats(prevDaily); setStreak(prevStreak); setUndoStack(null);
    setIsFlipped(false); setMcOptions(null); setMcSelected(null);
    setQueueIdx(i => Math.max(0, i - 1));
    if (HAS_SUPABASE && userCode) {
      const [did, ...wParts] = key.split(":"); const word = wParts.join(":");
      try { await Promise.all([sbUpsert(userCode, did, word, prevProg.status, prevProg.level, prevProg.misses || 0), sbUpsertDaily(userCode, todayStr(), prevDaily.reviews, prevDaily.newWords)]); }
      catch { /* silent */ }
    }
  }

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e) {
      if (settingsOpen || setupOpen || view !== "study") return;
      if (mode === "flip") {
        if (e.key === " " || e.key === "Enter") { e.preventDefault(); setIsFlipped(f => !f); }
        else if ((e.key === "ArrowRight" || e.key === "k") && isFlippedRef.current) handleAnswer(true);
        else if ((e.key === "ArrowLeft"  || e.key === "j") && isFlippedRef.current) handleAnswer(false);
      }
      if (e.key === "u") handleUndo();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, mode, settingsOpen, setupOpen, currentWord, undoStack, streak, dailyStats, userCode, activeDeck, progress]);

  // Touch/swipe on card
  function onTouchStart(e) { isTouchDevice.current = true; touchStartX.current = e.touches[0].clientX; }
  function onTouchEnd(e) {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) < 40) { setIsFlipped(f => !f); return; }
    if (!isFlippedRef.current || mode === "mc") return;
    if (dx > 40) handleAnswer(true); else if (dx < -40) handleAnswer(false);
  }

  // Filter counts for pills
  const filterCounts = {
    all:    currentDeckWords.length,
    unseen: currentDeckWords.filter(w => !progress[`${activeDeck}:${w.word}`] || progress[`${activeDeck}:${w.word}`].status === "unseen").length,
    know:   currentDeckWords.filter(w => progress[`${activeDeck}:${w.word}`]?.status === "know").length,
    study:  currentDeckWords.filter(w => progress[`${activeDeck}:${w.word}`]?.status === "dont_know").length,
  };

  // Error log: most-missed cards in current deck
  const errorWords = currentDeckWords
    .map(w => ({ w, p: progress[`${activeDeck}:${w.word}`] }))
    .filter(({ p }) => p?.status === "dont_know")
    .sort((a, b) => (b.p?.misses || 0) - (a.p?.misses || 0))
    .slice(0, 15);

  // List view filtered words
  const filteredList = currentDeckWords.filter(w => {
    if (search && !w.word.toLowerCase().includes(search.toLowerCase())) return false;
    const s = progress[`${activeDeck}:${w.word}`]?.status || "unseen";
    if (listFilter === "know")   return s === "know";
    if (listFilter === "study")  return s === "dont_know";
    if (listFilter === "unseen") return s === "unseen";
    return true;
  });

  // Last 7 days for stats chart
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    const s = d.toLocaleDateString("sv-SE");
    return { label: d.toLocaleDateString("en", { weekday: "narrow" }), count: dailyLog[s]?.reviews || 0 };
  });

  // ── SETUP SCREEN ──────────────────────────────────────────────────────────────
  if (!userCode || setupOpen) {
    return (
      <div style={{
        minHeight: "100vh", background: C.bg,
        fontFamily: C.font, color: C.text,
        maxWidth: 430, margin: "0 auto",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        padding: "40px 24px",
      }}>
        <div style={{ fontSize: 52, marginBottom: 16 }}>📚</div>
        <div style={{ fontSize: 26, fontWeight: "700", marginBottom: 8 }}>GMAT Study</div>
        <div style={{ fontSize: 14, color: C.muted, marginBottom: 40, textAlign: "center", lineHeight: 1.6 }}>
          Your sync code lets you continue on any device. We generated one for you — keep it or change it.
        </div>
        <div style={{ width: "100%" }}>
          <label style={{ fontSize: 13, color: C.muted, display: "block", marginBottom: 8, fontWeight: "600" }}>Your code</label>
          <input
            type="text" value={codeInput}
            onChange={e => setCodeInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && saveUserCode(codeInput)}
            autoFocus
            style={{
              width: "100%", padding: "14px 16px", borderRadius: 12,
              border: `2px solid ${C.border}`, fontSize: 16, outline: "none",
              boxSizing: "border-box", fontFamily: "inherit", marginBottom: 12,
              background: C.surface,
            }}
          />
          <button onClick={() => saveUserCode(codeInput)} style={{
            width: "100%", padding: "15px", background: C.accent, border: "none",
            borderRadius: 12, fontSize: 15, fontWeight: "700", color: "white",
            cursor: "pointer", fontFamily: "inherit",
          }}>
            Start Studying →
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        background: C.bg, fontFamily: C.font, color: C.text, gap: 14,
      }}>
        <div style={{ fontSize: 44 }}>📚</div>
        <div style={{ fontSize: 15, color: C.muted }}>Loading…</div>
      </div>
    );
  }

  // ── MAIN APP ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: C.font, color: C.text, maxWidth: 430, margin: "0 auto", position: "relative" }}>

      {/* ── Header ── */}
      <div style={{ padding: "22px 20px 0", borderBottom: `1px solid ${C.border}`, background: C.surface }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: "700", letterSpacing: "-0.5px" }}>GMAT Study 📚</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2, display: "flex", gap: 6, alignItems: "center" }}>
              {filterCounts.know} / {currentDeckWords.length} known · {activeDeckCfg?.name}
              {syncing && <span style={{ color: "#22c55e", fontSize: 11 }}>● syncing</span>}
            </div>
          </div>
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <TabBtn active={view === "study"}   onClick={() => setView("study")}>Study</TabBtn>
            <TabBtn active={view === "words"}   onClick={() => setView("words")}>Words</TabBtn>
            <TabBtn active={view === "stats"}   onClick={() => setView("stats")}>Stats</TabBtn>
            <button onClick={() => setSettingsOpen(true)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 17, padding: "4px 6px", color: C.faint }}>⚙</button>
          </div>
        </div>

        {/* Deck selector */}
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 12 }}>
          {DECKS.map(deck => {
            const total = (deckData[deck.id] || []).length;
            const known = total ? Object.entries(progress).filter(([k, v]) => k.startsWith(deck.id + ":") && v.status === "know").length : 0;
            const active = activeDeck === deck.id;
            return (
              <button key={deck.id} onClick={() => { setActiveDeck(deck.id); setFilter("all"); }} style={{
                padding: "6px 14px", borderRadius: 8, border: `2px solid ${active ? deck.color : C.border}`,
                background: active ? deck.color + "14" : C.surface, cursor: "pointer",
                fontFamily: "inherit", whiteSpace: "nowrap", flexShrink: 0,
                display: "flex", alignItems: "center", gap: 6,
              }}>
                <span style={{ fontSize: 14 }}>{deck.emoji}</span>
                <span style={{ fontSize: 13, fontWeight: "600", color: active ? deck.color : C.muted }}>{deck.name}</span>
                {total > 0 && <span style={{ fontSize: 11, color: C.faint }}>{known}/{total}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <div style={{ margin: "10px 16px 0", padding: "9px 14px", background: "#fff7ed", borderRadius: 10, fontSize: 13, color: "#c2410c" }}>
          ⚠️ {error}
        </div>
      )}

      {/* ── STUDY VIEW ── */}
      {view === "study" && (
        <div style={{ padding: "16px 16px 100px" }}>

          {/* Stats row */}
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <Stat label="Today"   value={dailyStats.reviews} color="#818cf8" />
            <Stat label="Learned" value={dailyStats.newWords} color={C.know} />
            <Stat label="Streak"  value={`${streak}d`}       color={C.study} />
            <Stat label="Queue"   value={queue.length}        color={C.faint} />
          </div>

          {/* Filter pills + mode toggle */}
          <div style={{ display: "flex", gap: 6, marginBottom: 14, alignItems: "center" }}>
            <div style={{ display: "flex", gap: 6, overflowX: "auto", flex: 1, paddingBottom: 2 }}>
              {[
                { key: "all",    label: "All" },
                { key: "unseen", label: "Unseen", color: "#818cf8" },
                { key: "study",  label: "Review",  color: C.study },
                { key: "know",   label: "Known",   color: C.know },
              ].map(({ key, label, color = C.accent }) => (
                <button key={key} onClick={() => setFilter(key)} style={{
                  padding: "5px 12px", borderRadius: 8,
                  border: `2px solid ${filter === key ? color : C.border}`,
                  background: filter === key ? color + "14" : C.surface,
                  color: filter === key ? color : C.muted,
                  fontSize: 12, fontWeight: "600", cursor: "pointer",
                  fontFamily: "inherit", whiteSpace: "nowrap", flexShrink: 0,
                }}>
                  {label} <span style={{ opacity: 0.55 }}>({filterCounts[key]})</span>
                </button>
              ))}
            </div>
            <button onClick={() => setMode(m => m === "flip" ? "mc" : "flip")} style={{
              padding: "5px 12px", borderRadius: 8, flexShrink: 0,
              border: `2px solid ${mode === "mc" ? C.accent : C.border}`,
              background: mode === "mc" ? C.accent + "14" : C.surface,
              color: mode === "mc" ? C.accent : C.muted,
              fontSize: 12, fontWeight: "600", cursor: "pointer", fontFamily: "inherit",
            }}>
              {mode === "flip" ? "Flip" : "Quiz"}
            </button>
          </div>

          {/* Card */}
          {currentWord ? (
            <>
              <div
                onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}
                onClick={() => { if (mode === "flip" && !isTouchDevice.current) setIsFlipped(f => !f); }}
                style={{
                  background: C.surface, borderRadius: 16,
                  minHeight: 260, padding: "32px 24px",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 4px 16px rgba(0,0,0,0.05)",
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  cursor: mode === "flip" ? "pointer" : "default",
                  userSelect: "none", position: "relative", marginBottom: 12,
                }}
              >
                {/* Level dots */}
                <div style={{ position: "absolute", top: 14, right: 16, display: "flex", gap: 4 }}>
                  {[0,1,2,3,4].map(i => (
                    <div key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: i < (currentProg?.level || 0) ? C.know : C.border }} />
                  ))}
                </div>
                {/* Counter */}
                <div style={{ position: "absolute", top: 14, left: 16, fontSize: 11, color: C.faint, fontVariantNumeric: "tabular-nums" }}>
                  {(queueIdx % Math.max(queue.length,1)) + 1} / {queue.length}
                </div>

                {/* Flip mode: front */}
                {mode === "flip" && !isFlipped && (
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 34, fontWeight: "700", letterSpacing: "-0.5px", marginBottom: 10, lineHeight: 1.2 }}>
                      {currentWord.word}
                    </div>
                    {currentWord.pos && (
                      <div style={{ display: "inline-block", background: "#eef2ff", color: "#6366f1", fontSize: 12, padding: "3px 10px", borderRadius: 6, fontWeight: "600" }}>
                        {currentWord.pos}
                      </div>
                    )}
                    <div style={{ fontSize: 12, color: C.faint, marginTop: 24 }}>tap to reveal</div>
                  </div>
                )}

                {/* Flip mode: back */}
                {mode === "flip" && isFlipped && (
                  <div style={{ textAlign: "center", width: "100%" }}>
                    <div style={{ fontSize: 20, fontWeight: "700", marginBottom: 4, color: C.text }}>{currentWord.word}</div>
                    {currentWord.pos && <div style={{ fontSize: 11, color: C.muted, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 14 }}>{currentWord.pos}</div>}
                    <div style={{ fontSize: 14, lineHeight: 1.7, color: "#334155", textAlign: "left", whiteSpace: "pre-line" }}>
                      {currentWord.definition}
                    </div>
                    {showZh && currentWord.definition_zh && (
                      <div style={{ fontSize: 13, lineHeight: 1.6, color: "#92400e", marginTop: 12, padding: "10px 14px", background: "#fffbeb", borderRadius: 8, textAlign: "left" }}>
                        {currentWord.definition_zh}
                      </div>
                    )}
                    {currentWord.all_definitions?.length > 1 && (
                      <div style={{ marginTop: 12, borderTop: `1px solid ${C.border}`, paddingTop: 10, textAlign: "left" }}>
                        {currentWord.all_definitions.slice(1).map((d, i) => (
                          <div key={i} style={{ fontSize: 12, color: C.muted, lineHeight: 1.5, marginBottom: 4 }}>
                            <em>{d.pos}</em> — {d.def}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* MC mode: always show word, options below card */}
                {mode === "mc" && (
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 34, fontWeight: "700", letterSpacing: "-0.5px", marginBottom: 10, lineHeight: 1.2 }}>
                      {currentWord.word}
                    </div>
                    {currentWord.pos && (
                      <div style={{ display: "inline-block", background: "#eef2ff", color: "#6366f1", fontSize: 12, padding: "3px 10px", borderRadius: 6, fontWeight: "600" }}>
                        {currentWord.pos}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* MC options */}
              {mode === "mc" && mcOptions && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                  {mcOptions.map((opt, i) => {
                    const selected = mcSelected === i;
                    const revealed = mcSelected !== null;
                    const bg = revealed
                      ? opt.isCorrect ? "#f0fdf4" : (selected ? "#fff1f2" : C.surface)
                      : C.surface;
                    const border = revealed
                      ? opt.isCorrect ? C.know : (selected ? "#fca5a5" : C.border)
                      : C.border;
                    return (
                      <button key={i} disabled={revealed} onClick={() => {
                        if (revealed) return;
                        setMcSelected(i);
                        setTimeout(() => handleAnswer(opt.isCorrect), 1200);
                      }} style={{
                        background: bg, border: `2px solid ${border}`,
                        borderRadius: 10, padding: "12px 14px",
                        textAlign: "left", cursor: revealed ? "default" : "pointer",
                        fontFamily: "inherit", fontSize: 13, lineHeight: 1.5, color: C.text,
                        whiteSpace: "pre-line",
                      }}>
                        <span style={{ fontSize: 11, fontWeight: "700", color: C.muted, marginRight: 8 }}>
                          {["A","B","C","D"][i]}
                        </span>
                        {opt.def.split("\n")[0]}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Flip mode action buttons */}
              {mode === "flip" && (
                isFlipped ? (
                  <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                    {[
                      { know: false, label: "✗  Don't Know", border: C.study },
                      { know: true,  label: "✓  Know It",    border: C.know },
                    ].map(({ know, label, border }) => (
                      <button key={label} onClick={() => handleAnswer(know)} style={{
                        flex: 1, padding: "14px 10px", background: C.surface,
                        border: `2px solid ${border}`, borderRadius: 12,
                        fontSize: 14, fontWeight: "600", cursor: "pointer",
                        color: C.text, fontFamily: "inherit",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                      }}
                        onMouseDown={e => e.currentTarget.style.transform = "scale(0.97)"}
                        onMouseUp={e => e.currentTarget.style.transform = ""}
                        onTouchStart={e => e.currentTarget.style.transform = "scale(0.97)"}
                        onTouchEnd={e => e.currentTarget.style.transform = ""}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div style={{ marginBottom: 10 }}>
                    <button onClick={() => setIsFlipped(true)} style={{
                      width: "100%", padding: "14px", background: activeDeckCfg?.color || C.accent,
                      border: "none", borderRadius: 12, fontSize: 14, fontWeight: "700",
                      color: "white", cursor: "pointer", fontFamily: "inherit",
                    }}>
                      Show Definition
                    </button>
                  </div>
                )
              )}

              {/* Undo */}
              <div style={{ display: "flex", justifyContent: "center", marginTop: 4 }}>
                <button onClick={handleUndo} disabled={!undoStack} style={{
                  background: "none", border: `1px solid ${C.border}`, borderRadius: 8,
                  padding: "5px 16px", fontSize: 12,
                  color: undoStack ? C.muted : C.faint,
                  cursor: undoStack ? "pointer" : "default", fontFamily: "inherit", fontWeight: "600",
                }}>
                  ↩ Undo
                </button>
              </div>
            </>
          ) : (
            <div style={{ textAlign: "center", padding: "60px 20px", color: C.faint, fontSize: 14 }}>
              No cards in this filter. 🎉
            </div>
          )}

          {/* Error log banner */}
          {errorWords.length > 0 && filter !== "study" && (
            <div style={{ marginTop: 20, background: "#fff7ed", border: `1px solid #fed7aa`, borderRadius: 12, padding: "12px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: "700", color: "#c2410c" }}>⚠️ {errorWords.length} cards to review</div>
                  <div style={{ fontSize: 12, color: "#9a3412", marginTop: 2 }}>
                    Most missed: {errorWords.slice(0, 3).map(e => e.w.word).join(", ")}
                  </div>
                </div>
                <button onClick={() => setFilter("study")} style={{
                  background: C.study, border: "none", borderRadius: 8, padding: "6px 12px",
                  fontSize: 12, fontWeight: "700", color: "white", cursor: "pointer", fontFamily: "inherit",
                }}>
                  Review
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── WORDS VIEW ── */}
      {view === "words" && (
        <div style={{ padding: "16px 16px 80px" }}>
          <div style={{ position: "relative", marginBottom: 10 }}>
            <span style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", color: C.faint, fontSize: 15, pointerEvents: "none" }}>🔍</span>
            <input
              type="text" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)}
              style={{
                width: "100%", padding: "11px 14px 11px 40px", borderRadius: 10,
                border: `2px solid ${C.border}`, fontSize: 14, outline: "none",
                boxSizing: "border-box", fontFamily: "inherit", background: C.surface,
              }}
            />
          </div>

          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            {[{ key: "all", label: "All" }, { key: "unseen", label: "Unseen" }, { key: "study", label: "Review", color: C.study }, { key: "know", label: "Known", color: C.know }].map(({ key, label, color = C.accent }) => (
              <button key={key} onClick={() => setListFilter(key)} style={{
                padding: "4px 11px", borderRadius: 8,
                border: `2px solid ${listFilter === key ? color : C.border}`,
                background: listFilter === key ? color + "14" : C.surface,
                color: listFilter === key ? color : C.muted,
                fontSize: 12, fontWeight: "600", cursor: "pointer", fontFamily: "inherit",
              }}>
                {label}
              </button>
            ))}
            <span style={{ marginLeft: "auto", fontSize: 12, color: C.faint, alignSelf: "center" }}>{filteredList.length} words</span>
          </div>

          {filteredList.map(word => {
            const p = progress[`${activeDeck}:${word.word}`] || { status: "unseen", level: 0 };
            const statusColor = p.status === "know" ? C.know : p.status === "dont_know" ? C.study : C.faint;
            const isExp = expandedWords.has(word.word);
            return (
              <div key={word.word} style={{ background: C.surface, borderRadius: 10, marginBottom: 6, border: `1px solid ${C.border}`, overflow: "hidden" }}>
                <div
                  onClick={() => setExpandedWords(prev => { const n = new Set(prev); n.has(word.word) ? n.delete(word.word) : n.add(word.word); return n; })}
                  style={{ display: "flex", alignItems: "center", padding: "11px 14px", cursor: "pointer", gap: 10, borderBottom: isExp ? `1px solid ${C.border}` : "none" }}
                >
                  <div style={{ width: 9, height: 9, borderRadius: "50%", background: statusColor, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: 14, fontWeight: "600" }}>{word.word}</span>
                    {word.pos && <span style={{ fontSize: 11, color: C.muted, marginLeft: 6, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.3 }}>{word.pos}</span>}
                  </div>
                  <div style={{ display: "flex", gap: 3 }}>
                    {[0,1,2,3,4].map(i => <div key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: i < p.level ? C.know : C.border }} />)}
                  </div>
                  <span style={{ color: C.faint, fontSize: 12 }}>{isExp ? "▾" : "▸"}</span>
                </div>
                {isExp && (
                  <div style={{ padding: "10px 14px 12px 33px" }}>
                    <div style={{ fontSize: 13, lineHeight: 1.7, color: "#334155", whiteSpace: "pre-line" }}>{word.definition}</div>
                    {showZh && word.definition_zh && (
                      <div style={{ fontSize: 12, color: "#92400e", marginTop: 8, lineHeight: 1.5 }}>{word.definition_zh}</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── STATS VIEW ── */}
      {view === "stats" && (
        <div style={{ padding: "16px 16px 80px" }}>

          {/* Today summary */}
          <div style={{ background: C.surface, borderRadius: 14, padding: "16px", marginBottom: 12, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 11, fontWeight: "700", color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Today</div>
            <div style={{ display: "flex", gap: 10 }}>
              <Stat label="Reviewed" value={dailyStats.reviews} color="#818cf8" />
              <Stat label="Learned"  value={dailyStats.newWords} color={C.know} />
              <Stat label="Streak"   value={`${streak} days`}   color={C.study} />
            </div>
          </div>

          {/* 7-day activity */}
          <div style={{ background: C.surface, borderRadius: 14, padding: "16px", marginBottom: 12, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 11, fontWeight: "700", color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 14 }}>7-Day Activity</div>
            <ActivityChart data={last7} color={C.accent} />
          </div>

          {/* Per-deck progress */}
          <div style={{ background: C.surface, borderRadius: 14, padding: "16px", marginBottom: 12, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 11, fontWeight: "700", color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 14 }}>Decks</div>
            {DECKS.map(deck => {
              const words = deckData[deck.id] || [];
              const total = words.length;
              if (!total) return null;
              const known  = Object.entries(progress).filter(([k, v]) => k.startsWith(deck.id + ":") && v.status === "know").length;
              const studying = Object.entries(progress).filter(([k, v]) => k.startsWith(deck.id + ":") && v.status === "dont_know").length;
              const pct = Math.round((known / total) * 100);
              return (
                <div key={deck.id} style={{ marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <div style={{ fontSize: 14, fontWeight: "600" }}>{deck.emoji} {deck.name}</div>
                    <div style={{ fontSize: 12, color: C.muted }}>{known} / {total} known · {pct}%</div>
                  </div>
                  <div style={{ height: 8, borderRadius: 4, background: C.border, overflow: "hidden" }}>
                    <div style={{ height: "100%", background: deck.color, width: `${pct}%`, borderRadius: 4, transition: "width 0.5s ease" }} />
                  </div>
                  <div style={{ display: "flex", gap: 12, marginTop: 6, fontSize: 11, color: C.muted }}>
                    <span style={{ color: C.know }}>● {known} known</span>
                    <span style={{ color: C.study }}>● {studying} reviewing</span>
                    <span style={{ color: C.faint }}>● {total - known - studying} unseen</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Error log */}
          {errorWords.length > 0 && (
            <div style={{ background: C.surface, borderRadius: 14, padding: "16px", border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 11, fontWeight: "700", color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Error Log · {activeDeckCfg?.name}</div>
              {errorWords.map(({ w, p }) => (
                <div key={w.word} style={{ display: "flex", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: 13, fontWeight: "600" }}>{w.word}</span>
                    {w.pos && <span style={{ fontSize: 11, color: C.muted, marginLeft: 6 }}>{w.pos}</span>}
                  </div>
                  <div style={{ fontSize: 12, color: C.study, fontWeight: "700" }}>{p?.misses || 0}× missed</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── SETTINGS MODAL ── */}
      {settingsOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 100 }} onClick={() => setSettingsOpen(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: C.surface, borderRadius: "20px 20px 0 0", padding: "24px 20px 44px", width: "100%", maxWidth: 430, boxShadow: "0 -4px 24px rgba(0,0,0,0.08)" }}>
            <div style={{ fontSize: 17, fontWeight: "700", marginBottom: 22, textAlign: "center" }}>Settings</div>

            <div style={{ marginBottom: 18 }}>
              <label style={{ fontSize: 12, color: C.muted, display: "block", marginBottom: 6, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 }}>Sync code</label>
              <div style={{ fontSize: 14, background: C.bg, borderRadius: 8, padding: "10px 14px", color: C.text, fontFamily: "monospace" }}>{userCode}</div>
              <div style={{ fontSize: 12, color: C.faint, marginTop: 4 }}>Enter this code on other devices to sync.</div>
            </div>

            <div style={{ marginBottom: 18 }}>
              <button onClick={() => { const n = !showZh; setShowZh(n); localStorage.setItem("gmat_show_zh", String(n)); }} style={{
                width: "100%", padding: "13px", background: showZh ? "#f0fdf4" : C.bg,
                border: `2px solid ${showZh ? C.know : C.border}`, borderRadius: 10,
                fontSize: 14, fontWeight: "600", color: showZh ? "#166534" : C.muted,
                cursor: "pointer", fontFamily: "inherit",
              }}>
                {showZh ? "✓ Chinese definitions on" : "Show Chinese definitions"}
              </button>
            </div>

            <button onClick={() => {
              if (!confirm("Reset all progress? This cannot be undone.")) return;
              setProgress({}); saveLocalProgress({});
              setDailyStats({ reviews: 0, newWords: 0 });
              setDailyLog({}); saveLocalDaily({});
              setStreak(0); localStorage.removeItem("gmat_streak"); localStorage.removeItem("gmat_last_study");
              setSettingsOpen(false);
            }} style={{
              width: "100%", padding: "13px", background: "#fff1f2",
              border: "2px solid #fca5a5", borderRadius: 10,
              fontSize: 14, fontWeight: "600", color: "#dc2626", cursor: "pointer", fontFamily: "inherit",
            }}>
              Reset All Progress
            </button>
          </div>
        </div>
      )}

      {/* ── TOAST ── */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)",
          background: C.text, color: "white", padding: "10px 22px", borderRadius: 50,
          fontSize: 13, fontWeight: "700", boxShadow: "0 4px 14px rgba(0,0,0,0.18)",
          zIndex: 200, whiteSpace: "nowrap",
        }}>
          {toast === "know" ? "✓ Know It" : "✗ Keep Studying"}
        </div>
      )}
    </div>
  );
}

// ── SUB-COMPONENTS ──────────────────────────────────────────────────────────────
function TabBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      background: active ? C.accent : "transparent",
      color: active ? "white" : C.muted,
      border: "none", borderRadius: 8, padding: "5px 11px",
      fontSize: 12, fontWeight: "700", cursor: "pointer", fontFamily: "inherit",
    }}>
      {children}
    </button>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={{ background: color + "18", borderRadius: 8, padding: "7px 12px", minWidth: 56 }}>
      <div style={{ fontSize: 10, color: C.muted, marginBottom: 2, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.3 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: "700", color: C.text }}>{value}</div>
    </div>
  );
}

function ActivityChart({ data, color }) {
  const max = Math.max(...data.map(d => d.count), 1);
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "flex-end", height: 64 }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
          <div style={{
            width: "100%", borderRadius: 4,
            background: d.count > 0 ? color : "#e2e8f0",
            height: `${Math.max(4, (d.count / max) * 48)}px`,
          }} />
          <div style={{ fontSize: 10, color: C.muted, fontWeight: "600" }}>{d.label}</div>
        </div>
      ))}
    </div>
  );
}
