interface CapacityBarProps {
  usedMinutes: number;
  maxMinutes: number;
}

export default function CapacityBar({ usedMinutes, maxMinutes }: CapacityBarProps) {
  const percentage = Math.min((usedMinutes / maxMinutes) * 100, 100);
  const isOverCapacity = usedMinutes > maxMinutes;

  return (
    <div style={{ marginBottom: "1.5rem" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: "0.5rem",
          fontSize: "0.9rem",
          color: "#666",
        }}
      >
        <span>Focus Capacity</span>
        <span>
          {usedMinutes} / {maxMinutes} min ({Math.round(percentage)}%)
        </span>
      </div>
      <div
        style={{
          width: "100%",
          height: "8px",
          backgroundColor: "#e0e0e0",
          borderRadius: "4px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${percentage}%`,
            height: "100%",
            backgroundColor: isOverCapacity ? "#f44336" : "#4caf50",
            transition: "width 0.3s ease",
          }}
        />
      </div>
      {isOverCapacity && (
        <div
          style={{
            marginTop: "0.25rem",
            fontSize: "0.85rem",
            color: "#f44336",
          }}
        >
          ⚠️ Over capacity - consider moving tasks to Next
        </div>
      )}
    </div>
  );
}
