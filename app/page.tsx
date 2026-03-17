"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function JoinPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    setLoading(true);
    setError("");

    try {
      // Check if player with same name already exists (rejoin support)
      const { data: existing } = await supabase
        .from("players")
        .select("id, name, score")
        .ilike("name", trimmed)
        .single();

      let playerId: string;

      if (existing) {
        playerId = existing.id;
      } else {
        const { data: newPlayer, error: insertErr } = await supabase
          .from("players")
          .insert({ name: trimmed, score: 0 })
          .select("id")
          .single();

        if (insertErr || !newPlayer) {
          setError("Failed to join the game. Please try again.");
          setLoading(false);
          return;
        }
        playerId = newPlayer.id;
      }

      // Persist player id in session storage
      sessionStorage.setItem("playerId", playerId);
      sessionStorage.setItem("playerName", trimmed);

      router.push("/player");
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div
      className="page-container"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100dvh",
        padding: "24px",
      }}
    >
      {/* Background blobs */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          overflow: "hidden",
          pointerEvents: "none",
          zIndex: 0,
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "-20%",
            left: "50%",
            transform: "translateX(-50%)",
            width: "800px",
            height: "600px",
            background:
              "radial-gradient(ellipse, rgba(139,92,246,0.18) 0%, transparent 70%)",
            borderRadius: "50%",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "-10%",
            right: "-10%",
            width: "500px",
            height: "500px",
            background:
              "radial-gradient(ellipse, rgba(236,72,153,0.12) 0%, transparent 70%)",
            borderRadius: "50%",
          }}
        />
      </div>

      <div
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          maxWidth: "440px",
        }}
        className="animate-fade-in-up"
      >
        {/* Logo / Header */}
        <div style={{ textAlign: "center", marginBottom: "40px" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "72px",
              height: "72px",
              borderRadius: "20px",
              marginBottom: "20px",
              background: "linear-gradient(135deg, #7c3aed, #ec4899)",
              fontSize: "36px",
              boxShadow: "0 8px 32px rgba(139,92,246,0.4)",
            }}
          >
            🎭
          </div>
          <h1
            style={{
              fontSize: "32px",
              fontWeight: 900,
              lineHeight: 1.1,
              marginBottom: "10px",
            }}
          >
            <span className="gradient-text">Two Truths</span>
            <br />
            <span
              style={{
                color: "var(--text-secondary)",
                fontWeight: 700,
                fontSize: "22px",
              }}
            >
              and a Lie
            </span>
          </h1>
          <p
            style={{
              color: "var(--text-secondary)",
              fontSize: "15px",
              marginTop: "8px",
            }}
          >
            The party game for hybrid teams ✨
          </p>
        </div>

        {/* Join Card */}
        <div className="card" style={{ padding: "32px" }}>
          <h2
            style={{
              fontSize: "20px",
              fontWeight: 700,
              marginBottom: "6px",
              color: "var(--text-primary)",
            }}
          >
            Join the Game
          </h2>
          <p
            style={{
              color: "var(--text-secondary)",
              fontSize: "14px",
              marginBottom: "28px",
            }}
          >
            Enter your name to get started. No sign-up required.
          </p>

          <form
            onSubmit={handleJoin}
            style={{ display: "flex", flexDirection: "column", gap: "16px" }}
          >
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "var(--text-secondary)",
                  marginBottom: "8px",
                }}
              >
                Your Name
              </label>
              <input
                className="input"
                type="text"
                placeholder="e.g. Alex, Jamie..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={40}
                autoFocus
                autoComplete="off"
              />
            </div>

            {error && (
              <div
                style={{
                  background: "rgba(239,68,68,0.1)",
                  border: "1px solid rgba(239,68,68,0.3)",
                  borderRadius: "10px",
                  padding: "12px 14px",
                  color: "#f87171",
                  fontSize: "14px",
                }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary btn-lg"
              disabled={!name.trim() || loading}
              style={{ width: "100%", marginTop: "4px" }}
            >
              {loading ? (
                <>
                  <div className="spinner" />
                  Joining...
                </>
              ) : (
                <>🎮 Join Game</>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
