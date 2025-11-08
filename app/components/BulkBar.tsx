'use client';

import { useState } from 'react';

type BulkBarProps = {
  count: number;
  onDone: () => void;
  onMove: (bucket: 'now' | 'next' | 'later' | 'backlog') => void;
  onDue: (preset: 'today' | 'tomorrow' | 'nextFriday' | 'clear') => void;
  onCancel: () => void;
};

export default function BulkBar({ count, onDone, onMove, onDue, onCancel }: BulkBarProps) {
  const [showMoveMenu, setShowMoveMenu] = useState(false);
  const [showDueMenu, setShowDueMenu] = useState(false);

  if (count === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        backgroundColor: 'var(--panel)',
        borderTop: '1px solid var(--border)',
        padding: '0.75rem 1rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        flexWrap: 'wrap',
        backdropFilter: 'blur(10px)',
      }}
    >
      <span style={{ fontWeight: 500, fontSize: '0.9rem' }}>
        {count} selected
      </span>

      <button
        onClick={onDone}
        className="btn btn-primary"
        style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
      >
        Mark Done
      </button>

      <div style={{ position: 'relative' }}>
        <button
          onClick={() => {
            setShowMoveMenu(!showMoveMenu);
            setShowDueMenu(false);
          }}
          className="btn btn-muted"
          style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
        >
          Move to...
        </button>
        {showMoveMenu && (
          <div
            style={{
              position: 'absolute',
              bottom: '100%',
              left: 0,
              marginBottom: '0.5rem',
              backgroundColor: 'var(--panel-2)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              overflow: 'hidden',
              minWidth: '150px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            }}
          >
            {(['now', 'next', 'later', 'backlog'] as const).map((bucket) => (
              <button
                key={bucket}
                onClick={() => {
                  onMove(bucket);
                  setShowMoveMenu(false);
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '0.75rem 1rem',
                  backgroundColor: 'transparent',
                  color: 'var(--text)',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--accent-2)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                {bucket.charAt(0).toUpperCase() + bucket.slice(1)}
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={{ position: 'relative' }}>
        <button
          onClick={() => {
            setShowDueMenu(!showDueMenu);
            setShowMoveMenu(false);
          }}
          className="btn btn-muted"
          style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
        >
          Set Due...
        </button>
        {showDueMenu && (
          <div
            style={{
              position: 'absolute',
              bottom: '100%',
              left: 0,
              marginBottom: '0.5rem',
              backgroundColor: 'var(--panel-2)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              overflow: 'hidden',
              minWidth: '150px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            }}
          >
            {[
              { preset: 'today' as const, label: 'Today' },
              { preset: 'tomorrow' as const, label: 'Tomorrow' },
              { preset: 'nextFriday' as const, label: 'Next Friday' },
              { preset: 'clear' as const, label: 'Clear' },
            ].map(({ preset, label }) => (
              <button
                key={preset}
                onClick={() => {
                  onDue(preset);
                  setShowDueMenu(false);
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '0.75rem 1rem',
                  backgroundColor: 'transparent',
                  color: 'var(--text)',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--accent-2)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        onClick={onCancel}
        className="btn btn-muted"
        style={{ padding: '0.5rem 1rem', fontSize: '0.9rem', marginLeft: 'auto' }}
      >
        Cancel
      </button>
    </div>
  );
}
