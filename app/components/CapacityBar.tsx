interface CapacityBarProps {
  usedMinutes: number;
  maxMinutes: number;
}

export default function CapacityBar({ usedMinutes, maxMinutes }: CapacityBarProps) {
  const percentage = maxMinutes > 0 ? Math.min((usedMinutes / maxMinutes) * 100, 100) : 0;
  const isOverCapacity = usedMinutes > maxMinutes;

  return (
    <div style={{ marginBottom: "1.5rem" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          marginBottom: "0.5rem",
          fontSize: "0.85rem",
          opacity: 0.7,
        }}
      >
        <span style={{ flex: 1 }}>Focus Capacity</span>
        <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
          {usedMinutes} / {maxMinutes} min
        </span>
      </div>
      <div
        style={{
          width: "100%",
          height: "6px",
          backgroundColor: "var(--panel-2)",
          borderRadius: "8px",
          overflow: "hidden",
          border: "1px solid var(--border)",
        }}
      >
        <div
          style={{
            width: `${percentage}%`,
            height: "100%",
            backgroundColor: isOverCapacity ? "var(--danger)" : "var(--accent-2)",
            transition: "width 0.3s ease",
          }}
        />
      </div>
      {isOverCapacity && (
        <div
          style={{
            marginTop: "0.5rem",
            fontSize: "0.85rem",
            color: "var(--danger)",
          }}
        >
          ⚠️ Over capacity - consider moving tasks to Next
        </div>
      )}
    </div>
  );
}
