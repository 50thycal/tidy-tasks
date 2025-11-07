import { useState } from "react";

interface ActionBarProps {
  itemId: string;
  currentStatus: "inbox" | "active" | "done" | "snoozed";
  onMarkDone: (id: string) => void;
  onMoveToActive: (id: string) => void;
  onMoveToInbox: (id: string) => void;
  onSnooze: (id: string, days: number) => void;
  onUnsnooze: (id: string) => void;
}

export default function ActionBar({
  itemId,
  currentStatus,
  onMarkDone,
  onMoveToActive,
  onMoveToInbox,
  onSnooze,
  onUnsnooze,
}: ActionBarProps) {
  const [showSnoozeOptions, setShowSnoozeOptions] = useState(false);

  const handleSnooze = (days: number) => {
    onSnooze(itemId, days);
    setShowSnoozeOptions(false);
  };

  return (
    <div
      style={{
        display: "flex",
        gap: "0.5rem",
        flexWrap: "wrap",
        alignItems: "center",
      }}
    >
      {/* Mark Done */}
      {currentStatus !== "done" && (
        <button
          onClick={() => onMarkDone(itemId)}
          style={{
            padding: "0.375rem 0.75rem",
            backgroundColor: "var(--accent-2)",
            color: "white",
            border: "none",
            borderRadius: "4px",
            fontSize: "0.85rem",
            cursor: "pointer",
          }}
          title="Mark as done (d)"
        >
          ✓ Done
        </button>
      )}

      {/* Move to Active */}
      {currentStatus !== "active" && currentStatus !== "done" && (
        <button
          onClick={() => onMoveToActive(itemId)}
          style={{
            padding: "0.375rem 0.75rem",
            backgroundColor: "var(--accent)",
            color: "white",
            border: "none",
            borderRadius: "4px",
            fontSize: "0.85rem",
            cursor: "pointer",
          }}
          title="Move to Active (a)"
        >
          → Active
        </button>
      )}

      {/* Move to Inbox */}
      {currentStatus !== "inbox" && currentStatus !== "done" && (
        <button
          onClick={() => onMoveToInbox(itemId)}
          style={{
            padding: "0.375rem 0.75rem",
            backgroundColor: "var(--muted)",
            color: "white",
            border: "none",
            borderRadius: "4px",
            fontSize: "0.85rem",
            cursor: "pointer",
          }}
          title="Move to Inbox (i)"
        >
          ← Inbox
        </button>
      )}

      {/* Snooze */}
      {currentStatus !== "snoozed" && currentStatus !== "done" && (
        <div style={{ position: "relative" }}>
          <button
            onClick={() => setShowSnoozeOptions(!showSnoozeOptions)}
            style={{
              padding: "0.375rem 0.75rem",
              backgroundColor: "var(--panel-2)",
              color: "var(--text)",
              border: "1px solid var(--border)",
              borderRadius: "4px",
              fontSize: "0.85rem",
              cursor: "pointer",
            }}
          >
            ⏰ Snooze
          </button>

          {showSnoozeOptions && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                marginTop: "0.25rem",
                backgroundColor: "var(--panel)",
                border: "1px solid var(--border)",
                borderRadius: "4px",
                boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                zIndex: 10,
                display: "flex",
                flexDirection: "column",
                gap: "0.25rem",
                padding: "0.5rem",
              }}
            >
              <button
                onClick={() => handleSnooze(1)}
                style={{
                  padding: "0.375rem 0.75rem",
                  backgroundColor: "var(--panel-2)",
                  color: "var(--text)",
                  border: "none",
                  borderRadius: "4px",
                  fontSize: "0.85rem",
                  cursor: "pointer",
                  textAlign: "left",
                  whiteSpace: "nowrap",
                }}
                title="Snooze for 1 day (1)"
              >
                +1 day
              </button>
              <button
                onClick={() => handleSnooze(3)}
                style={{
                  padding: "0.375rem 0.75rem",
                  backgroundColor: "var(--panel-2)",
                  color: "var(--text)",
                  border: "none",
                  borderRadius: "4px",
                  fontSize: "0.85rem",
                  cursor: "pointer",
                  textAlign: "left",
                  whiteSpace: "nowrap",
                }}
                title="Snooze for 3 days (3)"
              >
                +3 days
              </button>
              <button
                onClick={() => handleSnooze(7)}
                style={{
                  padding: "0.375rem 0.75rem",
                  backgroundColor: "var(--panel-2)",
                  color: "var(--text)",
                  border: "none",
                  borderRadius: "4px",
                  fontSize: "0.85rem",
                  cursor: "pointer",
                  textAlign: "left",
                  whiteSpace: "nowrap",
                }}
                title="Snooze for 7 days (7)"
              >
                +7 days
              </button>
            </div>
          )}
        </div>
      )}

      {/* Unsnooze */}
      {currentStatus === "snoozed" && (
        <button
          onClick={() => onUnsnooze(itemId)}
          style={{
            padding: "0.375rem 0.75rem",
            backgroundColor: "var(--warn)",
            color: "white",
            border: "none",
            borderRadius: "4px",
            fontSize: "0.85rem",
            cursor: "pointer",
          }}
        >
          ⏰ Unsnooze
        </button>
      )}
    </div>
  );
}
