"use client";

interface FocusControlsProps {
  capacity: number;
  setCapacity: (n: number) => void;
  capacityPlus2h: boolean;
  setCapacityPlus2h: (b: boolean) => void;
  dirty: boolean;
  calculating: boolean;
  onCalculate: () => void;
}

const PRESET_MINUTES = [15, 30, 60, 120];

export default function FocusControls({
  capacity,
  setCapacity,
  capacityPlus2h,
  setCapacityPlus2h,
  dirty,
  calculating,
  onCalculate,
}: FocusControlsProps) {
  const effectiveMinutes = capacityPlus2h ? 240 : capacity;

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCapacity(Number(e.target.value));
  };

  const handlePresetClick = (minutes: number) => {
    if (minutes === 240) {
      setCapacityPlus2h(true);
    } else {
      setCapacityPlus2h(false);
      setCapacity(minutes);
    }
  };

  const handleToggle2hPlus = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCapacityPlus2h(e.target.checked);
  };

  return (
    <div
      style={{
        backgroundColor: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: "8px",
        padding: "1.5rem",
        marginBottom: "2rem",
      }}
    >
      {/* Capacity label */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1rem",
        }}
      >
        <div>
          <label
            htmlFor="capacity-slider"
            style={{
              display: "block",
              fontWeight: "500",
              color: "var(--text)",
              marginBottom: "0.25rem",
            }}
          >
            Focus capacity: {capacityPlus2h ? "2h+" : `${capacity} min`}
          </label>
          {capacityPlus2h && (
            <div style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
              (240 minutes)
            </div>
          )}
        </div>

        {/* Calculate button */}
        <button
          onClick={onCalculate}
          disabled={calculating}
          className="btn btn-primary"
          style={{
            padding: "0.5rem 1.5rem",
            cursor: calculating ? "not-allowed" : "pointer",
            opacity: calculating ? 0.6 : 1,
          }}
        >
          {calculating ? "Calculating..." : "Calculate"}
        </button>
      </div>

      {/* Dirty indicator */}
      {dirty && !calculating && (
        <div
          style={{
            fontSize: "0.85rem",
            color: "var(--warning, #f59e0b)",
            marginBottom: "1rem",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <span style={{ fontSize: "1rem" }}>⚠️</span>
          Changes pending — click Calculate to update
        </div>
      )}

      {/* 2h+ toggle */}
      <div style={{ marginBottom: "1rem" }}>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            cursor: "pointer",
            fontSize: "0.9rem",
          }}
        >
          <input
            type="checkbox"
            checked={capacityPlus2h}
            onChange={handleToggle2hPlus}
            style={{ cursor: "pointer" }}
          />
          2h+ (240 minutes)
        </label>
      </div>

      {/* Slider */}
      {!capacityPlus2h && (
        <div style={{ marginBottom: "1rem" }}>
          <input
            id="capacity-slider"
            type="range"
            min={5}
            max={120}
            step={5}
            value={capacity}
            onChange={handleSliderChange}
            style={{
              width: "100%",
              accentColor: "var(--accent)",
            }}
          />
        </div>
      )}

      {/* Preset chips */}
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          flexWrap: "wrap",
        }}
      >
        {PRESET_MINUTES.map((minutes) => (
          <button
            key={minutes}
            onClick={() => handlePresetClick(minutes)}
            style={{
              padding: "0.25rem 0.75rem",
              fontSize: "0.85rem",
              borderRadius: "4px",
              border: "1px solid var(--border)",
              backgroundColor:
                (capacityPlus2h && minutes === 240) || (!capacityPlus2h && capacity === minutes)
                  ? "var(--accent)"
                  : "var(--panel-2)",
              color:
                (capacityPlus2h && minutes === 240) || (!capacityPlus2h && capacity === minutes)
                  ? "white"
                  : "var(--text)",
              cursor: "pointer",
            }}
          >
            {minutes} min
          </button>
        ))}
        <button
          onClick={() => handlePresetClick(240)}
          style={{
            padding: "0.25rem 0.75rem",
            fontSize: "0.85rem",
            borderRadius: "4px",
            border: "1px solid var(--border)",
            backgroundColor: capacityPlus2h ? "var(--accent)" : "var(--panel-2)",
            color: capacityPlus2h ? "white" : "var(--text)",
            cursor: "pointer",
          }}
        >
          2h+
        </button>
      </div>
    </div>
  );
}
