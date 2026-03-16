'use client';

import { useState, useEffect, useRef, startTransition } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import type { Player, Question, GameState, Vote } from '@/lib/types';

// ---------- Confetti helper ----------
async function fireConfetti() {
  try {
    const confetti = (await import('canvas-confetti')).default;
    confetti({ particleCount: 120, spread: 80, origin: { y: 0.55 }, colors: ['#8b5cf6', '#ec4899', '#06b6d4', '#10b981', '#f59e0b'] });
  } catch { /* silent */ }
}



// ---------- Countdown ----------
function Countdown({ seconds, total }: { seconds: number; total: number }) {
  const radius = 22;
  const circ = 2 * Math.PI * radius;
  const dash = circ * (seconds / total);
  const color = seconds <= 5 ? '#ef4444' : seconds <= 10 ? '#f59e0b' : '#8b5cf6';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
      <svg width="64" height="64" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
        <circle
          cx="32" cy="32" r={radius}
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          transform="rotate(-90 32 32)"
          style={{ transition: 'stroke-dasharray 1s linear, stroke 0.3s' }}
        />
        <text x="32" y="37" textAnchor="middle" fill={color} fontSize="16" fontWeight="700" fontFamily="Inter,sans-serif">
          {seconds}
        </text>
      </svg>
    </div>
  );
}

// ---------- Leaderboard ----------
function Leaderboard({ players, currentPlayerId }: { players: Player[]; currentPlayerId: string }) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  const medals = ['🥇', '🥈', '🥉'];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {sorted.map((p, i) => (
        <div
          key={p.id}
          className={`lb-row ${p.id === currentPlayerId ? 'highlight' : ''}`}
          style={{ animationDelay: `${i * 0.05}s` }}
        >
          <span style={{ fontSize: '20px', width: '28px', textAlign: 'center' }}>
            {medals[i] ?? `#${i + 1}`}
          </span>
          <span style={{ flex: 1, fontWeight: p.id === currentPlayerId ? 700 : 500 }}>
            {p.name} {p.id === currentPlayerId ? <span style={{ color: 'var(--accent-purple)', fontSize: '12px' }}>(you)</span> : ''}
          </span>
          <span className="score-pill">{p.score} pts</span>
        </div>
      ))}
    </div>
  );
}

// ---------- Main Component ----------
export default function PlayerPage() {
  const router = useRouter();
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [playerName, setPlayerName] = useState('');
  const [players, setPlayers] = useState<Player[]>([]);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [shuffleMap, setShuffleMap] = useState<number[]>([0, 1, 2]);
  const [myVote, setMyVote] = useState<Vote | null>(null);
  const [voteLoading, setVoteLoading] = useState(false);
  // Submit question form
  const [s1, setS1] = useState('');
  const [s2, setS2] = useState('');
  const [s3, setS3] = useState('');
  const [lieIdx, setLieIdx] = useState<number>(0);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitDone, setSubmitDone] = useState(false);
  const [submitError, setSubmitError] = useState('');
  // Voting
  const [selectedVote, setSelectedVote] = useState<number | null>(null);
  const [voteError, setVoteError] = useState('');
  // Countdown
  const [countdown, setCountdown] = useState(20);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const COUNTDOWN_TOTAL = 20;
  // Results votes
  const [allVotes, setAllVotes] = useState<Vote[]>([]);
  const confettiFiredRef = useRef(false);

  // ---------- Bootstrap ----------
  useEffect(() => {
    const id = sessionStorage.getItem('playerId');
    const nm = sessionStorage.getItem('playerName');
    if (!id || !nm) { router.replace('/'); return; }
    startTransition(() => {
      setPlayerId(id);
      setPlayerName(nm);
    });
  }, [router]);

  // ---------- Initial fetch ----------
  useEffect(() => {
    if (!playerId) return;

    const fetchAll = async () => {
      const [{ data: gs }, { data: pl }] = await Promise.all([
        supabase.from('game_state').select('*').eq('id', 1).single(),
        supabase.from('players').select('*').order('score', { ascending: false }),
      ]);
      if (gs) setGameState(gs as GameState);
      if (pl) setPlayers(pl as Player[]);

      if (gs?.current_question_id) {
        const { data: q } = await supabase
          .from('questions')
          .select('*, players(name)')
          .eq('id', gs.current_question_id)
          .single();
        if (q) setCurrentQuestion(q as Question);
      }
    };
    fetchAll();
  }, [playerId]);

  // ---------- Sync shuffle map when active question changes ----------
  useEffect(() => {
    if (currentQuestion && gameState?.status === 'voting') {
      // Use deterministic shuffle based on question id to keep all players in sync
      const seed = currentQuestion.id.charCodeAt(0) + currentQuestion.id.charCodeAt(1);
      const arr = [0, 1, 2];
      // Simple seeded Fisher-Yates
      let s = seed;
      for (let i = arr.length - 1; i > 0; i--) {
        s = (s * 1664525 + 1013904223) >>> 0;
        const j = s % (i + 1);
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      startTransition(() => {
        setShuffleMap(arr);
        setSelectedVote(null);
        setVoteError('');
      });
    }
  }, [currentQuestion, gameState?.status]);

  // ---------- Fetch my vote for current question ----------
  useEffect(() => {
    if (!playerId || !currentQuestion) {
      startTransition(() => setMyVote(null));
      return;
    }
    supabase
      .from('votes')
      .select('*')
      .eq('player_id', playerId)
      .eq('question_id', currentQuestion.id)
      .single()
      .then(({ data }) => {
        if (data) { setMyVote(data as Vote); setSelectedVote(data.selected_index); }
        else { setMyVote(null); }
      });
  }, [playerId, currentQuestion]);

  // ---------- Fetch all votes when revealed ----------
  useEffect(() => {
    if (gameState?.status === 'revealed' && currentQuestion) {
      supabase
        .from('votes')
        .select('*')
        .eq('question_id', currentQuestion.id)
        .then(({ data }) => { if (data) setAllVotes(data as Vote[]); });

      if (!confettiFiredRef.current) {
        confettiFiredRef.current = true;
        fireConfetti();
      }
    } else {
      confettiFiredRef.current = false;
    }
  }, [gameState?.status, currentQuestion]);

  // ---------- Countdown timer ----------
  useEffect(() => {
    if (gameState?.status === 'voting') {
      startTransition(() => setCountdown(COUNTDOWN_TOTAL));
      countdownRef.current = setInterval(() => {
        setCountdown(prev => (prev <= 1 ? (clearInterval(countdownRef.current!), 0) : prev - 1));
      }, 1000);
    } else {
      if (countdownRef.current) clearInterval(countdownRef.current);
    }
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, [gameState?.status, currentQuestion]);

  // ---------- Realtime subscriptions ----------
  useEffect(() => {
    if (!playerId) return;

    const gsSub = supabase
      .channel('game_state_player')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_state', filter: 'id=eq.1' }, async (payload) => {
        const gs = payload.new as GameState;
        setGameState(gs);

        if (gs.current_question_id) {
          const { data: q } = await supabase
            .from('questions')
            .select('*, players(name)')
            .eq('id', gs.current_question_id)
            .single();
          if (q) setCurrentQuestion(q as Question);
        }
      })
      .subscribe();

    const playersSub = supabase
      .channel('players_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, async () => {
        const { data } = await supabase.from('players').select('*').order('score', { ascending: false });
        if (data) setPlayers(data as Player[]);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(gsSub);
      supabase.removeChannel(playersSub);
    };
  }, [playerId]);

  // ---------- Submit question ----------
  const handleSubmitQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerId || !s1.trim() || !s2.trim() || !s3.trim()) return;
    setSubmitLoading(true);
    setSubmitError('');

    const { error } = await supabase.from('questions').insert({
      player_id: playerId,
      statement_1: s1.trim(),
      statement_2: s2.trim(),
      statement_3: s3.trim(),
      lie_index: lieIdx,
      status: 'pending',
    });

    setSubmitLoading(false);
    if (error) { setSubmitError('Failed to submit. Please try again.'); }
    else { setSubmitDone(true); }
  };

  // ---------- Submit vote ----------
  const handleVote = async () => {
    if (selectedVote === null || !playerId || !currentQuestion) return;
    if (myVote) return; // already voted
    setVoteLoading(true);
    setVoteError('');

    const { error } = await supabase.from('votes').insert({
      player_id: playerId,
      question_id: currentQuestion.id,
      selected_index: selectedVote,
    });

    setVoteLoading(false);
    if (error) {
      if (error.code === '23505') setVoteError('You already voted!');
      else setVoteError('Failed to submit vote. Try again.');
    } else {
      const { data } = await supabase
        .from('votes')
        .select('*')
        .eq('player_id', playerId)
        .eq('question_id', currentQuestion.id)
        .single();
      if (data) setMyVote(data as Vote);
    }
  };

  // ---------- Statements helpers ----------
  const statements = currentQuestion
    ? [currentQuestion.statement_1, currentQuestion.statement_2, currentQuestion.statement_3]
    : [];

  const shuffledStatements = shuffleMap.map(origIdx => statements[origIdx]);

  // In shuffled display: which display index is the lie?
  const lieDisplayIndex = shuffleMap.findIndex(origIdx => origIdx === currentQuestion?.lie_index);

  // Was my vote correct?
  const iVotedCorrectly = myVote !== null && myVote.selected_index === lieDisplayIndex;

  // ---------- Render helpers ----------
  const renderWaiting = () => (
    <div style={{ textAlign: 'center', padding: '48px 24px' }}>
      <div style={{ fontSize: '64px', marginBottom: '16px' }}>⏳</div>
      <h2 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '8px' }}>Waiting for the host...</h2>
      <p style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>
        The admin will start the next round soon. Make sure you&apos;ve submitted your question!
      </p>
      <div style={{ marginTop: '32px', display: 'flex', justifyContent: 'center', gap: '6px' }}>
        {[0,1,2].map(i => (
          <div key={i} style={{
            width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-purple)',
            animation: `pulse-glow 1.2s ${i * 0.2}s infinite`
          }} />
        ))}
      </div>
    </div>
  );

  const renderVoting = () => (
    <div className="animate-fade-in-up">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div className="badge badge-purple" style={{ marginBottom: '8px' }}>🗳️ VOTING OPEN</div>
          <h2 style={{ fontSize: '20px', fontWeight: 700 }}>
            Which is the LIE?
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>
            Submitted by <strong style={{ color: 'var(--text-primary)' }}>{(currentQuestion as Question & { players?: { name: string } })?.players?.name ?? 'Someone'}</strong>
          </p>
        </div>
        <Countdown seconds={countdown} total={COUNTDOWN_TOTAL} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
        {shuffledStatements.map((stmt, displayIdx) => (
          <button
            key={displayIdx}
            className={`vote-option ${selectedVote === displayIdx ? 'selected' : ''}`}
            onClick={() => !myVote && setSelectedVote(displayIdx)}
            disabled={!!myVote || countdown === 0}
          >
            <span style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: '28px', height: '28px', borderRadius: '8px', flexShrink: 0,
              background: selectedVote === displayIdx ? 'rgba(139,92,246,0.3)' : 'rgba(255,255,255,0.06)',
              fontWeight: 700, fontSize: '13px', color: selectedVote === displayIdx ? '#c4b5fd' : 'var(--text-muted)'
            }}>
              {displayIdx + 1}
            </span>
            <span style={{ flex: 1, lineHeight: 1.4 }}>{stmt}</span>
          </button>
        ))}
      </div>

      {voteError && (
        <div style={{ color: '#f87171', fontSize: '14px', marginBottom: '12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '8px', padding: '10px 14px' }}>
          {voteError}
        </div>
      )}

      {!myVote ? (
        <button
          className="btn btn-primary"
          style={{ width: '100%' }}
          disabled={selectedVote === null || voteLoading || countdown === 0}
          onClick={handleVote}
        >
          {voteLoading ? <><div className="spinner" />Submitting...</> : '✅ Submit Vote'}
        </button>
      ) : (
        <div style={{
          background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)',
          borderRadius: '12px', padding: '14px 18px', textAlign: 'center',
          color: '#34d399', fontWeight: 600, fontSize: '15px'
        }}>
          ✓ Vote submitted! Waiting for results...
        </div>
      )}
    </div>
  );

  const renderRevealed = () => {
    const correctVoters = allVotes.filter(v => v.selected_index === lieDisplayIndex).map(v => v.player_id);
    const myPlayer = players.find(p => p.id === playerId);

    return (
      <div className="animate-bounce-in">
        <div className="badge badge-yellow" style={{ marginBottom: '16px' }}>🎉 RESULTS</div>
        <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '20px' }}>The Lie Was...</h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
          {shuffledStatements.map((stmt, displayIdx) => {
            const isLie = displayIdx === lieDisplayIndex;
            const iVoted = myVote?.selected_index === displayIdx;
            return (
              <div
                key={displayIdx}
                className={`vote-option ${isLie ? 'correct' : 'wrong'}`}
                style={{ cursor: 'default' }}
              >
                <span style={{ fontSize: '20px' }}>{isLie ? '🚫' : '✅'}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ lineHeight: 1.4 }}>{stmt}</div>
                  <div style={{ fontSize: '12px', marginTop: '4px', color: isLie ? '#34d399' : 'var(--text-muted)' }}>
                    {isLie ? '← This is the LIE' : 'Truth'}
                    {iVoted && <span style={{ marginLeft: '8px' }}>← your vote</span>}
                  </div>
                </div>
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                  {allVotes.filter(v => v.selected_index === displayIdx).length} vote(s)
                </span>
              </div>
            );
          })}
        </div>

        {/* Personal result */}
        <div style={{
          padding: '16px 20px', borderRadius: '14px', marginBottom: '20px', textAlign: 'center',
          background: iVotedCorrectly
            ? 'rgba(16,185,129,0.12)' : myVote === null
            ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)',
          border: `1px solid ${iVotedCorrectly ? 'rgba(16,185,129,0.35)' : myVote === null ? 'rgba(245,158,11,0.35)' : 'rgba(239,68,68,0.3)'}`,
        }}>
          {iVotedCorrectly ? (
            <>
              <div style={{ fontSize: '28px', marginBottom: '6px' }}>🎯</div>
              <div style={{ fontWeight: 700, fontSize: '17px', color: '#34d399' }}>Correct! +10 points</div>
            </>
          ) : myVote === null ? (
            <>
              <div style={{ fontSize: '28px', marginBottom: '6px' }}>⏭️</div>
              <div style={{ fontWeight: 700, fontSize: '17px', color: '#fbbf24' }}>You didn&apos;t vote this round</div>
            </>
          ) : (
            <>
              <div style={{ fontSize: '28px', marginBottom: '6px' }}>😅</div>
              <div style={{ fontWeight: 700, fontSize: '17px', color: '#f87171' }}>Wrong guess — 0 points</div>
            </>
          )}
        </div>

        {correctVoters.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <div className="section-header">🎯 Who guessed right</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {correctVoters.map(pid => {
                const p = players.find(pl => pl.id === pid);
                return p ? (
                  <span key={pid} className={`badge ${pid === playerId ? 'badge-purple' : 'badge-green'}`}>
                    {p.name}{pid === playerId ? ' (you)' : ''}
                  </span>
                ) : null;
              })}
            </div>
          </div>
        )}

        {myPlayer && (
          <div style={{ textAlign: 'center', marginTop: '8px' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Your total score: </span>
            <span className="score-pill" style={{ fontSize: '16px' }}>{myPlayer.score} pts</span>
          </div>
        )}
      </div>
    );
  };

  if (!playerId) return null;

  const currentPlayer = players.find(p => p.id === playerId);

  return (
    <div className="page-container" style={{ padding: '0 0 40px' }}>
      {/* Header */}
      <header style={{
        background: 'rgba(13,15,26,0.8)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border)', padding: '14px 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 50
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '22px' }}>🎭</span>
          <span style={{ fontWeight: 800, fontSize: '16px' }} className="gradient-text">Two Truths &amp; a Lie</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>👤 {playerName}</span>
          {currentPlayer && <span className="score-pill">⭐ {currentPlayer.score}</span>}
        </div>
      </header>

      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '28px 20px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

        {/* Game Area */}
        <div className={gameState?.status === 'voting' ? 'card-glow' : 'card'}>
          {!gameState || gameState.status === 'waiting' ? renderWaiting() : null}
          {gameState?.status === 'voting' ? renderVoting() : null}
          {gameState?.status === 'revealed' ? renderRevealed() : null}
        </div>

        {/* Submit Question */}
        {(gameState?.status === 'waiting' || !gameState) && (
          <div className="card animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
            <div className="section-header">📝 Your Question</div>

            {submitDone ? (
              <div style={{
                textAlign: 'center', padding: '28px',
                background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: '12px'
              }}>
                <div style={{ fontSize: '40px', marginBottom: '10px' }}>✅</div>
                <div style={{ fontWeight: 700, fontSize: '17px', color: '#34d399', marginBottom: '6px' }}>Question Submitted!</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>The host will select it for an upcoming round.</div>
              </div>
            ) : (
              <form onSubmit={handleSubmitQuestion} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                  Write two truths and one lie about yourself. Mark which one is the lie.
                </p>

                {[
                  { label: 'Statement 1', val: s1, set: setS1 },
                  { label: 'Statement 2', val: s2, set: setS2 },
                  { label: 'Statement 3', val: s3, set: setS3 },
                ].map(({ label, val, set }, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        {label}
                      </label>
                      <input
                        className="input"
                        type="text"
                        placeholder={`Enter ${label.toLowerCase()}...`}
                        value={val}
                        onChange={e => set(e.target.value)}
                        maxLength={200}
                      />
                    </div>
                    <div style={{ paddingTop: '28px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <input
                        type="radio"
                        id={`lie-${idx}`}
                        name="lieOption"
                        checked={lieIdx === idx}
                        onChange={() => setLieIdx(idx)}
                        style={{ accentColor: 'var(--accent-red)', width: '16px', height: '16px', cursor: 'pointer' }}
                      />
                      <label htmlFor={`lie-${idx}`} style={{ fontSize: '12px', color: 'var(--accent-red)', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        = LIE
                      </label>
                    </div>
                  </div>
                ))}

                {submitError && (
                  <div style={{ color: '#f87171', fontSize: '13px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '8px', padding: '10px 14px' }}>
                    {submitError}
                  </div>
                )}

                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={!s1.trim() || !s2.trim() || !s3.trim() || submitLoading}
                  style={{ alignSelf: 'flex-end' }}
                >
                  {submitLoading ? <><div className="spinner" />Submitting...</> : '📤 Submit Question'}
                </button>
              </form>
            )}
          </div>
        )}

        {/* Leaderboard */}
        <div className="card animate-fade-in-up" style={{ animationDelay: '0.15s' }}>
          <div className="section-header">🏆 Leaderboard</div>
          {players.length === 0
            ? <p style={{ color: 'var(--text-muted)', fontSize: '14px', textAlign: 'center', padding: '20px' }}>No players yet...</p>
            : <Leaderboard players={players} currentPlayerId={playerId} />
          }
        </div>
      </div>
    </div>
  );
}
