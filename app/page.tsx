"use client";

import { useState } from "react";
import Link from "next/link";
import { submitQuick } from "@/src/lib/submitQuick";
import { saveInboxItem, type InboxItem } from "@/src/lib/clientStore";
import { getWorkSettings } from "@/src/lib/settings";
import { inc } from "@/src/db/metrics";

export default function Home() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const settings = getWorkSettings();

  const handleSubmit = async (useAI: boolean) => {
    if (!input.trim()) return;

    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    const result = await submitQuick(input, {
      useAI,
      timezone: settings.timezone,
      onSuccess: async (taskResult) => {
        // Create inbox item
        const newItem: InboxItem = {
          id: crypto.randomUUID(),
          created_at: new Date().toISOString(),
          request: {
            raw_text: input,
            timezone: settings.timezone,
            today: new Date().toISOString().split("T")[0],
          },
          result: taskResult,
          status: "inbox",
        };

        saveInboxItem(newItem);
        await inc('tasksCreated');

        // Clear input and show success
        setInput("");
        setSuccessMessage("✓ Added to Inbox");
        setTimeout(() => setSuccessMessage(null), 3000);
      },
      onError: (err) => {
        setError(err.message);
      },
    });

    setLoading(false);
  };

  return (
    <main style={{ padding: '2rem', minHeight: '100vh', maxWidth: '800px', margin: '0 auto' }}>
      <h1 style={{ marginBottom: '1rem' }}>Tidy</h1>
      <p style={{ color: 'var(--muted)', marginBottom: '2rem' }}>
        Lightweight AI-assisted task tracking app
      </p>

      {/* Quick Add Card */}
      <div
        style={{
          backgroundColor: 'var(--panel)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '1.5rem',
          marginBottom: '2rem',
        }}
      >
        <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Quick Add</h2>

        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(false);
            }
          }}
          placeholder="Type a task... (Enter to add, Shift+Enter for new line)"
          disabled={loading}
          style={{
            width: '100%',
            minHeight: '80px',
            padding: '0.75rem',
            backgroundColor: 'var(--panel-2)',
            color: 'var(--text)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            fontSize: '1rem',
            fontFamily: 'inherit',
            resize: 'vertical',
            marginBottom: '1rem',
          }}
        />

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            onClick={() => handleSubmit(false)}
            disabled={loading || !input.trim()}
            className="btn btn-primary"
            style={{
              padding: '0.75rem 1.5rem',
              cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
              opacity: loading || !input.trim() ? 0.6 : 1,
            }}
          >
            {loading ? 'Adding...' : 'Add'}
          </button>

          <button
            onClick={() => handleSubmit(true)}
            disabled={loading || !input.trim()}
            className="btn btn-muted"
            style={{
              padding: '0.75rem 1.5rem',
              cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
              opacity: loading || !input.trim() ? 0.6 : 1,
            }}
          >
            Clean with AI
          </button>

          {successMessage && (
            <span style={{ color: 'var(--accent)', fontSize: '0.9rem' }}>
              {successMessage}{' '}
              <Link href="/inbox" style={{ textDecoration: 'underline' }}>
                Go to Inbox
              </Link>
            </span>
          )}
        </div>

        {error && (
          <div
            style={{
              marginTop: '1rem',
              padding: '0.75rem',
              backgroundColor: 'color-mix(in srgb, var(--danger) 15%, transparent)',
              color: 'var(--danger)',
              borderRadius: '4px',
              fontSize: '0.9rem',
            }}
          >
            {error}
          </div>
        )}
      </div>

      {/* Navigation links */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <Link href="/inbox" className="btn btn-muted" style={{ textAlign: 'center', padding: '1rem', display: 'block' }}>
          View Inbox
        </Link>
        <Link href="/focus" className="btn btn-muted" style={{ textAlign: 'center', padding: '1rem', display: 'block' }}>
          View Focus Queue
        </Link>
      </div>
    </main>
  );
}
