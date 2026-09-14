/**
 * Keep settings.work.projects (used by the existing AI routes for project
 * matching) in step with the registry's followed projects. Names only; the
 * registry is the source of truth for everything else.
 */

import { getStoredSettings, saveSettings, getDefaultWorkSettingsV2 } from "./settings";
import { getFollowedProjects } from "./registry";
import type { ProjectMeta } from "@/src/types";
import { seedContactsFromRegistry } from "./contacts";

export function syncRegistryToSettings(): number {
  if (typeof window === "undefined") return 0;
  const stored = getStoredSettings();
  const settings = stored ?? { version: 2 as const, work: getDefaultWorkSettingsV2() };
  const existing: ProjectMeta[] = settings.work.projects ?? [];
  const byName = new Map(existing.map((p) => [p.name.toLowerCase(), p]));
  let added = 0;
  for (const p of getFollowedProjects()) {
    const key = p.name.toLowerCase();
    const aliasNote = p.aliases.filter((a) => a.toLowerCase() !== key).join(", ");
    const meta = byName.get(key);
    if (meta) {
      if (aliasNote && !(meta.notes ?? "").includes(aliasNote)) {
        meta.notes = [meta.notes, `Aliases: ${aliasNote}`].filter(Boolean).join(" ");
      }
      continue;
    }
    existing.push({
      id: crypto.randomUUID(),
      name: p.name,
      llmr_due: null,
      ifr_due: null,
      ifc_due: null,
      notes: aliasNote ? `Aliases: ${aliasNote}` : "",
      updated_at: new Date().toISOString(),
    });
    added++;
  }
  settings.work.projects = existing;
  saveSettings(settings);
  try {
    seedContactsFromRegistry();
  } catch (e) {
    console.warn("Contact seeding skipped:", e);
  }
  return added;
}
