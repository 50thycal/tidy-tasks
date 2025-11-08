'use client';

import Link from 'next/link';
import { useEffect } from 'react';

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mb-12">
      <h2 className="text-2xl font-semibold mb-3">{title}</h2>
      <div className="leading-relaxed text-[15px] opacity-90">{children}</div>
    </section>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="px-2 py-0.5 rounded border border-white/20 bg-white/5 text-sm">{children}</kbd>;
}

export default function AboutPage() {
  useEffect(() => { window.scrollTo({ top: 0 }); }, []);
  return (
    <main className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-4xl font-bold mb-4">About Tidy</h1>
      <p className="opacity-90 mb-8">
        Tidy is a lightweight, privacy-minded task tracker with AI assists. You capture messy tasks, Tidy cleans and
        normalizes them, then helps you prioritize into a focused daily plan.
      </p>

      <nav className="mb-10">
        <h3 className="text-lg font-semibold mb-2">On this page</h3>
        <ol className="list-decimal list-inside space-y-1 opacity-90">
          <li><a href="#quickstart" className="underline">Quick Start</a></li>
          <li><a href="#core-pages" className="underline">Core Pages</a></li>
          <li><a href="#work-context" className="underline">Work Context & Dates</a></li>
          <li><a href="#privacy" className="underline">Privacy & Data</a></li>
          <li><a href="#backups" className="underline">Backups, Import/Export</a></li>
          <li><a href="#troubleshooting" className="underline">Troubleshooting</a></li>
        </ol>
      </nav>

      <Section id="quickstart" title="Quick Start (3 minutes)">
        <ol className="list-decimal list-inside space-y-4">
          <li>
            <strong>Capture</strong> — Go to <Link href="/inbox" className="underline">Inbox</Link> or <Link href="/capture" className="underline">Capture</Link>.
            Paste a messy task (or multiple lines on Capture). Click <em>Clean with AI</em> (or <em>Clean All with AI</em>).
          </li>
          <li>
            <strong>Review</strong> — Check the cleaned task: title, effort (5/15/30/60/120), energy (low/med/high), tags, due date.
            If needed, edit inline on the card (title, project, tags, due/scheduled, importance).
          </li>
          <li>
            <strong>Prioritize</strong> — Move items to <em>Active</em>, then open <Link href="/focus" className="underline">Focus</Link> and click
            <em> Recalculate</em> to build your Focus Queue (Now / Next / Later / Backlog).
          </li>
        </ol>
        <p className="mt-4 opacity-80">
          Tip: press <Kbd>Cmd</Kbd>/<Kbd>Ctrl</Kbd> + <Kbd>Enter</Kbd> to submit the Inbox form quickly.
        </p>
      </Section>

      <Section id="core-pages" title="Core Pages">
        <ul className="list-disc list-inside space-y-3">
          <li>
            <strong>Inbox</strong> — One-off capture and clean. Good for single tasks. Supports options for timezone and
            redaction (emails/phones).
          </li>
          <li>
            <strong>Capture</strong> — Batch input (one task per line). AI cleans each, shows a review list, and lets you
            add all successes to Inbox or Active at once.
          </li>
          <li>
            <strong>Focus</strong> — Prioritizes Active tasks into <em>Now / Next / Later / Backlog</em> with a score (0–100),
            considering importance, urgency (due dates), and effort against your focus capacity.
          </li>
          <li>
            <strong>Review</strong> — Weekly Review & Reflection: overdue, due this week, stale active, and recent done.
            Also includes a weekly AI summary generator.
          </li>
          <li>
            <strong>Settings</strong> — Work hours/timezone, end-of-week anchor, rollover rules, optional project context,
            daily digest time, and data backup/restore.
          </li>
        </ul>
      </Section>

      <Section id="work-context" title="Work Context & Dates">
        <p className="mb-3">
          Tidy interprets vague phrases like "end of day" and "end of week" using your settings:
        </p>
        <ul className="list-disc list-inside space-y-2">
          <li><strong>Timezone</strong> controls all parsing and display.</li>
          <li><strong>Work days</strong> determine valid scheduling days.</li>
          <li><strong>End of day</strong> sets the default time when a date is missing a time.</li>
          <li><strong>EOW anchor</strong> + <strong>rollover rule</strong> decide what "end of week" means if you are past EOD.</li>
        </ul>
        <p className="mt-3 opacity-80">
          Example: If it's Friday 6:10 PM and your EOD is 5:00 PM with rollover = "next workweek," then "by end of week"
          resolves to next Friday at 5:00 PM.
        </p>
      </Section>

      <Section id="privacy" title="Privacy & Data">
        <ul className="list-disc list-inside space-y-2">
          <li>
            <strong>No-train header</strong> is sent on AI calls to opt out of training. Redaction can mask emails/phones automatically.
          </li>
          <li>
            <strong>Local-first</strong>: tasks are stored in your browser via localStorage. Clearing site data removes them unless you exported a backup.
          </li>
          <li>
            <strong>Offline</strong>: with PWA enabled, the UI works offline; AI endpoints require connectivity.
          </li>
        </ul>
        <p className="mt-3 opacity-80">
          All task data stays in your browser. No analytics, no tracking, no third-party services beyond OpenAI API calls.
        </p>
      </Section>

      <Section id="backups" title="Backups, Import/Export">
        <p className="mb-2">
          Go to <Link href="/settings" className="underline">Settings</Link> → "Data Backup &amp; Restore" to export JSON/CSV or import a previous backup.
        </p>
        <ul className="list-disc list-inside space-y-2">
          <li><strong>Export JSON</strong> for full fidelity (includes subtasks, tags, dates).</li>
          <li><strong>Export CSV</strong> to analyze in spreadsheets.</li>
          <li><strong>Import</strong> supports merge/replace options.</li>
        </ul>
      </Section>

      <Section id="troubleshooting" title="Troubleshooting">
        <ul className="list-disc list-inside space-y-3">
          <li>
            <strong>"AI response does not match schema"</strong> — Try again; or simplify the text (remove long notes), then edit details inline.
          </li>
          <li>
            <strong>Validation for dates/subtasks</strong> — Due dates must be ISO datetime; subtasks are strings. The app coerces common cases, but you can edit inline if needed.
          </li>
          <li>
            <strong>Notifications denied</strong> — You'll see in-app digests. To enable push on mobile, install as a PWA and allow notifications in system settings.
          </li>
          <li>
            <strong>Quota errors</strong> — Check your OpenAI billing/quota. The app surfaces 429/insufficient_quota messages from the API.
          </li>
        </ul>
        <p className="mt-4">
          Need more help? Open an issue on GitHub: <a className="underline" href="https://github.com/50thycal/tidy-tasks">50thycal/tidy-tasks</a>.
        </p>
      </Section>
    </main>
  );
}
