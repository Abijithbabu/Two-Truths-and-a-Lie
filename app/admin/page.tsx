"use client";

import { useState, useEffect, useRef, startTransition } from "react";
import { supabase } from "@/lib/supabase";
import type { Player, Question, GameState, Vote } from "@/lib/types";
import { playTick } from "@/lib/audio";

// ---------- Leaderboard ----------
function Leaderboard({ players }: { players: Player[] }) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  const medals = ["🥇", "🥈", "🥉"];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      {sorted.map((p, i) => (
        <div key={p.id} className="lb-row">
          <span
            style={{ fontSize: "18px", width: "28px", textAlign: "center" }}
          >
            {medals[i] ?? `#${i + 1}`}
          </span>
          <span style={{ flex: 1, fontWeight: 500 }}>{p.name}</span>
          <span className="score-pill">{p.score} pts</span>
        </div>
      ))}
    </div>
  );
}

// ---------- Countdown ----------
function Countdown({ seconds, total }: { seconds: number; total: number }) {
  const radius = 22;
  const circ = 2 * Math.PI * radius;
  const dash = circ * (seconds / total);
  const color =
    seconds <= 5 ? "#ef4444" : seconds <= 10 ? "#f59e0b" : "#8b5cf6";
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "4px",
      }}
    >
      <svg width="64" height="64" viewBox="0 0 64 64">
        <circle
          cx="32"
          cy="32"
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="4"
        />
        <circle
          cx="32"
          cy="32"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          transform="rotate(-90 32 32)"
          style={{ transition: "stroke-dasharray 1s linear, stroke 0.3s" }}
        />
        <text
          x="32"
          y="37"
          textAnchor="middle"
          fill={color}
          fontSize="16"
          fontWeight="700"
          fontFamily="Inter,sans-serif"
        >
          {seconds}
        </text>
      </svg>
    </div>
  );
}

// ---------- Main ----------
export default function AdminPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [questions, setQuestions] = useState<
    (Question & { players?: { name: string } })[]
  >([]);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    msg: string;
    type: "success" | "error";
  } | null>(null);

  // Countdown
  const [countdown, setCountdown] = useState(120);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const COUNTDOWN_TOTAL = 120;

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // ---------- Initial fetch ----------
  useEffect(() => {
    const fetchAll = async () => {
      const [gsRes, plRes, qsRes] = await Promise.all([
        supabase.from("game_state").select("*").eq("id", 1).single(),
        supabase
          .from("players")
          .select("*")
          .order("joined_at", { ascending: true }),
        supabase
          .from("questions")
          .select("*, players(name)")
          .order("created_at", { ascending: true }),
      ]);
      const gs = gsRes.data as GameState | null;
      const pl = plRes.data;
      const qs = qsRes.data;
      if (gs) setGameState(gs);
      if (pl) setPlayers(pl as Player[]);
      if (qs) setQuestions(qs as (Question & { players?: { name: string } })[]);

      if (gs?.current_question_id) {
        const { data: q } = await supabase
          .from("questions")
          .select("*, players(name)")
          .eq("id", gs.current_question_id)
          .single();
        if (q) setCurrentQuestion(q as Question);
        const { data: v } = await supabase
          .from("votes")
          .select("*")
          .eq("question_id", gs.current_question_id);
        if (v) setVotes(v as Vote[]);
      }
    };
    fetchAll();
  }, []);

  // ---------- Realtime ----------
  useEffect(() => {
    const gsSub = supabase
      .channel("game_state_admin")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "game_state",
          filter: "id=eq.1",
        },
        async (payload) => {
          const gs = payload.new as GameState;
          setGameState(gs);
          if (gs.current_question_id) {
            const { data: q } = await supabase
              .from("questions")
              .select("*, players(name)")
              .eq("id", gs.current_question_id)
              .single();
            if (q) setCurrentQuestion(q as Question);
          }
        },
      )
      .subscribe();

    const playersSub = supabase
      .channel("players_admin")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "players" },
        async () => {
          const { data } = await supabase
            .from("players")
            .select("*")
            .order("joined_at", { ascending: true });
          if (data) setPlayers(data as Player[]);
        },
      )
      .subscribe();

    const questionsSub = supabase
      .channel("questions_admin")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "questions" },
        async () => {
          const { data } = await supabase
            .from("questions")
            .select("*, players(name)")
            .order("created_at", { ascending: true });
          if (data)
            setQuestions(data as (Question & { players?: { name: string } })[]);
        },
      )
      .subscribe();

    const votesSub = supabase
      .channel("votes_admin")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "votes" },
        async () => {
          if (!gameState?.current_question_id) return;
          const { data } = await supabase
            .from("votes")
            .select("*")
            .eq("question_id", gameState.current_question_id);
          if (data) setVotes(data as Vote[]);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(gsSub);
      supabase.removeChannel(playersSub);
      supabase.removeChannel(questionsSub);
      supabase.removeChannel(votesSub);
    };
  }, [gameState?.current_question_id]);

  // ---------- Countdown timer logic ----------
  useEffect(() => {
    if (gameState?.status === "voting") {
      startTransition(() => setCountdown(COUNTDOWN_TOTAL));
      countdownRef.current = setInterval(() => {
        setCountdown((prev) =>
          prev <= 1 ? (clearInterval(countdownRef.current!), 0) : prev - 1,
        );
      }, 1000);
    } else {
      if (countdownRef.current) clearInterval(countdownRef.current);
    }
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [gameState?.status, currentQuestion]);

  useEffect(() => {
    if (
      gameState?.status === "voting" &&
      countdown > 0 &&
      countdown < COUNTDOWN_TOTAL
    ) {
      playTick();
    }
  }, [countdown, gameState?.status]);

  // ---------- Helpers ----------
  const withLoading = async (key: string, fn: () => Promise<void>) => {
    setActionLoading(key);
    try {
      await fn();
    } finally {
      setActionLoading(null);
    }
  };

  const updateGameState = async (update: Partial<GameState>) => {
    const { error } = await supabase
      .from("game_state")
      .update(update)
      .eq("id", 1);
    if (error) showToast("Action failed: " + error.message, "error");
  };

  // ---------- Actions ----------
  const startRound = async (question: Question) => {
    await withLoading(`start-${question.id}`, async () => {
      await supabase
        .from("questions")
        .update({ status: "pending" })
        .eq("status", "active");
      await supabase
        .from("questions")
        .update({ status: "active" })
        .eq("id", question.id);
      await updateGameState({
        current_question_id: question.id,
        status: "waiting",
      });
      setCurrentQuestion(question);
      setVotes([]);
      showToast('Round loaded! Now click "Start Voting" when ready.');
    });
  };

  const startVoting = async () => {
    await withLoading("start-voting", async () => {
      await updateGameState({ status: "voting" });
      showToast("Voting started! 🗳️");
    });
  };

  const endVoting = async () => {
    await withLoading("end-voting", async () => {
      await updateGameState({ status: "waiting" });
      showToast("Voting ended.");
    });
  };

  const revealAnswer = async () => {
    if (!currentQuestion) return;
    await withLoading("reveal", async () => {
      await updateGameState({ status: "revealed" });

      // --- Score calculation ---
      const qid = currentQuestion.id;

      // We need the shuffle map to know which display index = lie
      // Re-derive same seed as player page
      const seed = qid.charCodeAt(0) + qid.charCodeAt(1);
      const arr = [0, 1, 2];
      let s = seed;
      for (let i = arr.length - 1; i > 0; i--) {
        s = (s * 1664525 + 1013904223) >>> 0;
        const j = s % (i + 1);
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      const shuffleMap = arr;
      const lieDisplayIndex = shuffleMap.findIndex(
        (origIdx) => origIdx === currentQuestion.lie_index,
      );

      const { data: allVotes } = await supabase
        .from("votes")
        .select("*")
        .eq("question_id", qid);
      const totalVotes = allVotes?.length ?? 0;
      const correctVoters = (allVotes ?? []).filter(
        (v: Vote) => v.selected_index === lieDisplayIndex,
      );

      if (totalVotes > 0 && correctVoters.length === 0) {
        // Nobody guessed correctly → question creator gets +20
        const { data: creator } = await supabase
          .from("players")
          .select("score")
          .eq("id", currentQuestion.player_id)
          .single();
        if (creator) {
          await supabase
            .from("players")
            .update({ score: creator.score + 20 })
            .eq("id", currentQuestion.player_id);
        }
      } else {
        // Each correct voter gets +10
        for (const v of correctVoters) {
          const { data: voter } = await supabase
            .from("players")
            .select("score")
            .eq("id", v.player_id)
            .single();
          if (voter) {
            await supabase
              .from("players")
              .update({ score: voter.score + 10 })
              .eq("id", v.player_id);
          }
        }
      }

      await supabase
        .from("questions")
        .update({ status: "completed" })
        .eq("id", qid);
      showToast("Answer revealed & scores updated! 🎉");
    });
  };

  const deleteQuestion = async (id: string) => {
    await withLoading(`delete-${id}`, async () => {
      await supabase.from("votes").delete().eq("question_id", id);
      const { error } = await supabase.from("questions").delete().eq("id", id);
      if (error) showToast("Delete failed.", "error");
      else showToast("Question deleted.");
    });
  };

  const resetGame = async () => {
    if (!confirm("Reset all scores and clear all questions & votes?")) return;
    await withLoading("reset", async () => {
      await supabase
        .from("votes")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");
      await supabase
        .from("questions")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");
      await supabase
        .from("players")
        .update({ score: 0 })
        .neq("id", "00000000-0000-0000-0000-000000000000");
      await updateGameState({ current_question_id: null, status: "waiting" });
      setCurrentQuestion(null);
      setVotes([]);
      showToast("Game reset!");
    });
  };

  // ------- Build shuffleMap for display --------
  const getShuffleMap = (q: Question): number[] => {
    const seed = q.id.charCodeAt(0) + q.id.charCodeAt(1);
    const arr = [0, 1, 2];
    let s = seed;
    for (let i = arr.length - 1; i > 0; i--) {
      s = (s * 1664525 + 1013904223) >>> 0;
      const j = s % (i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  const pendingQuestions = questions.filter((q) => q.status === "pending");
  const completedQuestions = questions.filter((q) => q.status === "completed");

  const sortedPlayers = [...players].sort((a, b) => b.score - a.score);

  return (
    <div className="page-container" style={{ padding: "0 0 60px" }}>
      {/* Toast */}
      {toast && (
        <div
          style={{
            position: "fixed",
            top: "20px",
            right: "20px",
            zIndex: 9999,
            background:
              toast.type === "success"
                ? "rgba(16,185,129,0.15)"
                : "rgba(239,68,68,0.15)",
            border: `1px solid ${toast.type === "success" ? "rgba(16,185,129,0.4)" : "rgba(239,68,68,0.4)"}`,
            color: toast.type === "success" ? "#34d399" : "#f87171",
            padding: "12px 20px",
            borderRadius: "12px",
            fontWeight: 600,
            fontSize: "14px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
            animation: "fadeInUp 0.3s ease",
          }}
        >
          {toast.type === "success" ? "✅" : "❌"} {toast.msg}
        </div>
      )}

      {/* Header */}
      <header
        style={{
          background: "rgba(13,15,26,0.9)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid var(--border)",
          padding: "14px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "sticky",
          top: 0,
          zIndex: 50,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "22px" }}>🎭</span>
          <div>
            <span
              style={{ fontWeight: 800, fontSize: "15px" }}
              className="gradient-text"
            >
              Admin Dashboard
            </span>
            <div
              style={{
                fontSize: "11px",
                color: "var(--text-muted)",
                marginTop: "1px",
              }}
            >
              Two Truths &amp; a Lie
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {gameState && (
            <span
              className={`badge ${gameState.status === "voting" ? "badge-green" : gameState.status === "revealed" ? "badge-yellow" : "badge-purple"}`}
            >
              {gameState.status === "voting"
                ? "🗳️ VOTING"
                : gameState.status === "revealed"
                  ? "🎉 REVEALED"
                  : "⏳ WAITING"}
            </span>
          )}
          <button
            className="btn btn-ghost btn-sm"
            onClick={resetGame}
            disabled={actionLoading === "reset"}
          >
            🔄 Reset Game
          </button>
        </div>
      </header>

      <div
        style={{ maxWidth: "1100px", margin: "0 auto", padding: "28px 20px" }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 320px",
            gap: "24px",
            alignItems: "start",
          }}
        >
          {/* LEFT COLUMN */}
          <div
            style={{ display: "flex", flexDirection: "column", gap: "24px" }}
          >
            {/* Active Round Controls */}
            {currentQuestion && (
              <div
                className={
                  gameState?.status === "voting" ? "card-glow" : "card"
                }
                style={{ animation: "fadeInUp 0.4s ease" }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "16px",
                  }}
                >
                  <div className="section-header" style={{ marginBottom: 0 }}>
                    🎯 Active Round
                  </div>
                  {gameState?.status === "voting" && (
                    <Countdown seconds={countdown} total={COUNTDOWN_TOTAL} />
                  )}
                </div>

                <div style={{ marginBottom: "16px" }}>
                  <div
                    style={{
                      color: "var(--text-secondary)",
                      fontSize: "13px",
                      marginBottom: "8px",
                    }}
                  >
                    Submitted by{" "}
                    <strong style={{ color: "var(--text-primary)" }}>
                      {(
                        currentQuestion as Question & {
                          players?: { name: string };
                        }
                      )?.players?.name ?? "?"}
                    </strong>
                  </div>
                  {(() => {
                    const sm = getShuffleMap(currentQuestion);
                    const stmts = [
                      currentQuestion.statement_1,
                      currentQuestion.statement_2,
                      currentQuestion.statement_3,
                    ];
                    return (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "8px",
                        }}
                      >
                        {sm.map((origIdx, displayIdx) => {
                          const isLie = origIdx === currentQuestion.lie_index;
                          const voteCount = votes.filter(
                            (v) => v.selected_index === displayIdx,
                          ).length;
                          return (
                            <div
                              key={displayIdx}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "12px",
                                padding: "10px 14px",
                                borderRadius: "10px",
                                background: isLie
                                  ? "rgba(239,68,68,0.08)"
                                  : "rgba(255,255,255,0.03)",
                                border: `1px solid ${isLie ? "rgba(239,68,68,0.25)" : "var(--border)"}`,
                                fontSize: "14px",
                              }}
                            >
                              <span
                                style={{
                                  color: isLie
                                    ? "#f87171"
                                    : "var(--text-muted)",
                                  fontSize: "18px",
                                }}
                              >
                                {isLie ? "🚫" : "✅"}
                              </span>
                              <span style={{ flex: 1 }}>{stmts[origIdx]}</span>
                              {isLie && (
                                <span
                                  className="badge badge-red"
                                  style={{ fontSize: "10px" }}
                                >
                                  LIE
                                </span>
                              )}
                              {gameState?.status !== "waiting" && (
                                <span
                                  style={{
                                    color: "var(--text-muted)",
                                    fontSize: "12px",
                                    minWidth: "48px",
                                    textAlign: "right",
                                  }}
                                >
                                  {voteCount} vote{voteCount !== 1 ? "s" : ""}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>

                {/* Live vote count */}
                {gameState?.status === "voting" && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "10px 14px",
                      borderRadius: "10px",
                      background: "rgba(139,92,246,0.08)",
                      border: "1px solid rgba(139,92,246,0.2)",
                      marginBottom: "16px",
                      fontSize: "14px",
                      color: "#a78bfa",
                    }}
                  >
                    <span>🗳️ Live votes received:</span>
                    <strong style={{ fontSize: "18px" }}>{votes.length}</strong>
                    <span style={{ color: "var(--text-muted)" }}>
                      / {players.length}
                    </span>
                  </div>
                )}

                {/* Controls */}
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  {gameState?.status === "waiting" && (
                    <button
                      className="btn btn-success"
                      onClick={startVoting}
                      disabled={actionLoading === "start-voting"}
                    >
                      {actionLoading === "start-voting" ? (
                        <>
                          <div className="spinner" />
                          Starting...
                        </>
                      ) : (
                        "▶️ Start Voting"
                      )}
                    </button>
                  )}
                  {gameState?.status === "voting" && (
                    <button
                      className="btn btn-warning"
                      onClick={endVoting}
                      disabled={actionLoading === "end-voting"}
                    >
                      {actionLoading === "end-voting" ? (
                        <>
                          <div className="spinner" />
                          Ending...
                        </>
                      ) : (
                        "⏹️ End Voting"
                      )}
                    </button>
                  )}
                  {(gameState?.status === "voting" ||
                    gameState?.status === "waiting") && (
                    <button
                      className="btn btn-primary"
                      onClick={revealAnswer}
                      disabled={!!actionLoading}
                    >
                      {actionLoading === "reveal" ? (
                        <>
                          <div className="spinner" />
                          Revealing...
                        </>
                      ) : (
                        "🎉 Reveal Answer"
                      )}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Pending Questions */}
            <div className="card">
              <div className="section-header">
                📋 Submitted Questions ({pendingQuestions.length})
              </div>

              {pendingQuestions.length === 0 ? (
                <div
                  style={{
                    textAlign: "center",
                    padding: "32px",
                    color: "var(--text-muted)",
                  }}
                >
                  <div style={{ fontSize: "40px", marginBottom: "12px" }}>
                    📭
                  </div>
                  <p>Waiting for participants to submit questions...</p>
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "16px",
                  }}
                >
                  {pendingQuestions.map((q) => (
                    <div
                      key={q.id}
                      style={{
                        background: "rgba(255,255,255,0.02)",
                        border: "1px solid var(--border)",
                        borderRadius: "12px",
                        padding: "16px",
                        transition: "border-color 0.2s",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          marginBottom: "12px",
                          flexWrap: "wrap",
                          gap: "8px",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                          }}
                        >
                          <span style={{ fontSize: "16px" }}>👤</span>
                          <span style={{ fontWeight: 600, fontSize: "15px" }}>
                            {q.players?.name ?? "Unknown"}
                          </span>
                        </div>
                        <div style={{ display: "flex", gap: "8px" }}>
                          <button
                            className="btn btn-success btn-sm"
                            onClick={() => startRound(q)}
                            disabled={!!actionLoading}
                          >
                            {actionLoading === `start-${q.id}` ? (
                              <>
                                <div className="spinner" />
                                Loading...
                              </>
                            ) : (
                              "🎯 Start Round"
                            )}
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => deleteQuestion(q.id)}
                            disabled={!!actionLoading}
                          >
                            {actionLoading === `delete-${q.id}` ? (
                              <div className="spinner" />
                            ) : (
                              "🗑️"
                            )}
                          </button>
                        </div>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "6px",
                        }}
                      >
                        {[q.statement_1, q.statement_2, q.statement_3].map(
                          (stmt, i) => (
                            <div
                              key={i}
                              style={{
                                display: "flex",
                                alignItems: "flex-start",
                                gap: "8px",
                                padding: "8px 10px",
                                borderRadius: "8px",
                                background:
                                  i === q.lie_index
                                    ? "rgba(239,68,68,0.08)"
                                    : "rgba(255,255,255,0.02)",
                                border: `1px solid ${i === q.lie_index ? "rgba(239,68,68,0.2)" : "transparent"}`,
                              }}
                            >
                              <span
                                style={{
                                  color:
                                    i === q.lie_index
                                      ? "#f87171"
                                      : "var(--text-muted)",
                                  fontSize: "14px",
                                  marginTop: "1px",
                                  flexShrink: 0,
                                }}
                              >
                                {i === q.lie_index ? "🚫" : "✅"}
                              </span>
                              <span
                                style={{
                                  fontSize: "14px",
                                  flex: 1,
                                  color: "var(--text-primary)",
                                }}
                              >
                                {stmt}
                              </span>
                              {i === q.lie_index && (
                                <span
                                  className="badge badge-red"
                                  style={{ fontSize: "10px", flexShrink: 0 }}
                                >
                                  LIE
                                </span>
                              )}
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Completed */}
            {completedQuestions.length > 0 && (
              <div className="card">
                <div className="section-header">
                  ✅ Completed Rounds ({completedQuestions.length})
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                  }}
                >
                  {completedQuestions.map((q) => (
                    <div
                      key={q.id}
                      style={{
                        padding: "10px 14px",
                        borderRadius: "10px",
                        background: "rgba(16,185,129,0.05)",
                        border: "1px solid rgba(16,185,129,0.15)",
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        fontSize: "14px",
                      }}
                    >
                      <span>✅</span>
                      <span style={{ color: "var(--text-secondary)" }}>
                        {q.players?.name}
                      </span>
                      <span
                        style={{
                          flex: 1,
                          color: "var(--text-muted)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {q.statement_1}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* RIGHT COLUMN */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "24px",
              position: "sticky",
              top: "80px",
            }}
          >
            {/* Players */}
            <div className="card">
              <div className="section-header">
                👥 Players ({players.length})
              </div>
              {players.length === 0 ? (
                <p
                  style={{
                    color: "var(--text-muted)",
                    fontSize: "14px",
                    textAlign: "center",
                    padding: "20px",
                  }}
                >
                  No players yet — share the URL!
                </p>
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                  }}
                >
                  {sortedPlayers.map((p) => (
                    <div key={p.id} className="lb-row">
                      <div
                        style={{
                          width: "32px",
                          height: "32px",
                          borderRadius: "10px",
                          flexShrink: 0,
                          background:
                            "linear-gradient(135deg, rgba(139,92,246,0.4), rgba(236,72,153,0.3))",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "14px",
                          fontWeight: 700,
                          color: "#c4b5fd",
                        }}
                      >
                        {p.name[0].toUpperCase()}
                      </div>
                      <span style={{ flex: 1, fontSize: "14px" }}>
                        {p.name}
                      </span>
                      <span className="score-pill">{p.score}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Leaderboard */}
            <div className="card">
              <div className="section-header">🏆 Leaderboard</div>
              {players.length === 0 ? (
                <p
                  style={{
                    color: "var(--text-muted)",
                    fontSize: "14px",
                    textAlign: "center",
                    padding: "20px",
                  }}
                >
                  No scores yet
                </p>
              ) : (
                <Leaderboard players={players} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
