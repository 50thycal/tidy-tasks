"use client";

import { useState } from "react";
import type { ProjectMeta } from "@/src/types";

interface ProjectsTableProps {
  value: ProjectMeta[];
  onChange: (projects: ProjectMeta[]) => void;
}

export default function ProjectsTable({ value, onChange }: ProjectsTableProps) {
  const [editingId, setEditingId] = useState<string | null>(null);

  const handleAdd = () => {
    const newProject: ProjectMeta = {
      id: crypto.randomUUID(),
      name: "",
      llmr_due: null,
      ifr_due: null,
      ifc_due: null,
      notes: "",
      updated_at: new Date().toISOString(),
    };
    onChange([...value, newProject]);
    setEditingId(newProject.id);
  };

  const handleRemove = (id: string) => {
    onChange(value.filter(p => p.id !== id));
  };

  const handleUpdate = (id: string, field: keyof ProjectMeta, newValue: any) => {
    onChange(
      value.map(p =>
        p.id === id
          ? {
              ...p,
              [field]: newValue,
              updated_at: new Date().toISOString(),
            }
          : p
      )
    );
  };

  const handleBlur = (id: string, field: 'name') => {
    const project = value.find(p => p.id === id);
    if (field === 'name' && project && !project.name.trim()) {
      // Remove project if name is empty on blur
      handleRemove(id);
    }
    setEditingId(null);
  };

  return (
    <div>
      <div
        style={{
          marginBottom: "1rem",
          display: "grid",
          gridTemplateColumns: "2fr 1fr 1fr 1fr 2fr auto",
          gap: "0.5rem",
          fontSize: "0.85rem",
          fontWeight: "600",
          color: "var(--muted)",
          paddingBottom: "0.5rem",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div>Project Name</div>
        <div>LLMR Due</div>
        <div>IFR Due</div>
        <div>IFC Due</div>
        <div>Notes</div>
        <div></div>
      </div>

      {value.length === 0 ? (
        <div
          style={{
            padding: "2rem",
            textAlign: "center",
            color: "var(--muted)",
            fontSize: "0.9rem",
            backgroundColor: "var(--panel-2)",
            borderRadius: "4px",
            marginBottom: "1rem",
          }}
        >
          No projects yet. Add one to get started.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1rem" }}>
          {value.map((project) => (
            <div
              key={project.id}
              style={{
                display: "grid",
                gridTemplateColumns: "2fr 1fr 1fr 1fr 2fr auto",
                gap: "0.5rem",
                alignItems: "center",
                padding: "0.75rem",
                backgroundColor: "var(--panel-2)",
                borderRadius: "4px",
                border: "1px solid var(--border)",
              }}
            >
              <input
                type="text"
                value={project.name}
                onChange={(e) => handleUpdate(project.id, "name", e.target.value)}
                onFocus={() => setEditingId(project.id)}
                onBlur={() => handleBlur(project.id, "name")}
                placeholder="Project name (required)"
                className="input"
                style={{
                  padding: "0.5rem",
                  fontSize: "0.9rem",
                  backgroundColor: editingId === project.id ? "var(--panel)" : "var(--panel-2)",
                }}
                required
              />

              <input
                type="date"
                value={project.llmr_due || ""}
                onChange={(e) => handleUpdate(project.id, "llmr_due", e.target.value || null)}
                className="input"
                style={{ padding: "0.5rem", fontSize: "0.85rem" }}
              />

              <input
                type="date"
                value={project.ifr_due || ""}
                onChange={(e) => handleUpdate(project.id, "ifr_due", e.target.value || null)}
                className="input"
                style={{ padding: "0.5rem", fontSize: "0.85rem" }}
              />

              <input
                type="date"
                value={project.ifc_due || ""}
                onChange={(e) => handleUpdate(project.id, "ifc_due", e.target.value || null)}
                className="input"
                style={{ padding: "0.5rem", fontSize: "0.85rem" }}
              />

              <input
                type="text"
                value={project.notes || ""}
                onChange={(e) => handleUpdate(project.id, "notes", e.target.value)}
                placeholder="Notes (optional)"
                className="input"
                style={{ padding: "0.5rem", fontSize: "0.9rem" }}
              />

              <button
                onClick={() => handleRemove(project.id)}
                style={{
                  padding: "0.5rem 0.75rem",
                  backgroundColor: "transparent",
                  color: "var(--danger)",
                  border: "1px solid var(--danger)",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontSize: "0.85rem",
                }}
                title="Remove project"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={handleAdd}
        className="btn btn-muted"
        style={{
          padding: "0.75rem 1.5rem",
        }}
      >
        + Add Project
      </button>
    </div>
  );
}
