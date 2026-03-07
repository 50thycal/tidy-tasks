"use client";

import { useState, useEffect } from "react";
import EmailDropZone from "@/app/components/EmailDropZone";
import EmailActionItems, { type EmailResult } from "@/app/components/EmailActionItems";
import { bulkAddInboxItems, type InboxItem } from "@/src/lib/clientStore";
import { getWorkSettings, getWorkSettingsV2 } from "@/src/lib/settings";
import type { EmailActionItem, CleanTaskRequest, CleanTaskResponse } from "@/src/types";

export default function EmailPage() {
  const [mounted, setMounted] = useState(false);
  const [results, setResults] = useState<EmailResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const handleEmailsParsed = async (
    emails: Array<{ fileName: string; text: string }>
  ) => {
    setIsProcessing(true);

    const settings = getWorkSettings();
    const settingsV2 = getWorkSettingsV2();
    const today = new Date().toISOString().split("T")[0];

    // Create processing entries
    const newResults: EmailResult[] = emails.map((email, idx) => ({
      id: `email-${Date.now()}-${idx}`,
      fileName: email.fileName,
      status: "processing" as const,
    }));

    setResults((prev) => [...newResults, ...prev]);

    // Process each email
    for (let i = 0; i < emails.length; i++) {
      const email = emails[i];
      const resultId = newResults[i].id;

      try {
        const response = await fetch("/api/ai/parse_email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email_text: email.text,
            today,
            timezone: settings.timezone,
            settings: settingsV2,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(
            errorData.error || `HTTP ${response.status}`
          );
        }

        const data = await response.json();

        setResults((prev) =>
          prev.map((r) =>
            r.id === resultId
              ? { ...r, status: "success" as const, data }
              : r
          )
        );
      } catch (err) {
        console.error(`Failed to process ${email.fileName}:`, err);
        setResults((prev) =>
          prev.map((r) =>
            r.id === resultId
              ? {
                  ...r,
                  status: "failed" as const,
                  error:
                    err instanceof Error
                      ? err.message
                      : "Unknown error",
                }
              : r
          )
        );
      }
    }

    setIsProcessing(false);
  };

  const handleAddToInbox = (
    items: Array<{
      actionItem: EmailActionItem;
      emailMeta: {
        sender: string;
        subject: string;
        email_date: string | null;
      };
    }>,
    destination: "active" | "follow-up"
  ) => {
    const today = new Date().toISOString().split("T")[0];
    const settings = getWorkSettings();

    const newItems: InboxItem[] = items.map(({ actionItem, emailMeta }) => {
      const request: CleanTaskRequest = {
        raw_text: `[Email] ${actionItem.title} (from ${emailMeta.sender})`,
        today,
        timezone: settings.timezone,
      };

      const result: CleanTaskResponse = {
        title: actionItem.title,
        due_at: actionItem.owner === "theirs" ? actionItem.follow_up_by : actionItem.due_at,
        effort_min: actionItem.effort_min,
        energy: actionItem.energy,
        tags: [
          ...actionItem.tags,
          "email",
          ...(actionItem.owner === "theirs" ? ["waiting"] : []),
        ],
        project: actionItem.project,
        subtasks: [],
        importance: actionItem.importance,
        notes_append: [
          actionItem.notes,
          `Contact: ${actionItem.contact}`,
          `Email: "${emailMeta.subject}" from ${emailMeta.sender}`,
        ]
          .filter(Boolean)
          .join("\n"),
      };

      return {
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        status: destination,
        request,
        result,
        email_context: {
          sender: emailMeta.sender,
          subject: emailMeta.subject,
          email_date: emailMeta.email_date,
          contact: actionItem.contact,
          follow_up_by: actionItem.follow_up_by,
        },
      };
    });

    try {
      bulkAddInboxItems(newItems);

      // Remove the processed email results that are now empty
      setResults((prev) => {
        // We keep results but they'll show as having no items
        // since we don't track individual item removal
        return prev;
      });

      setToast(
        `Added ${newItems.length} ${newItems.length === 1 ? "task" : "tasks"} to ${
          destination === "follow-up" ? "Follow-up" : "Active"
        }`
      );
    } catch (error) {
      setToast("Error adding tasks. Please try again.");
      console.error("Error adding tasks:", error);
    }
  };

  const handleDismiss = (resultId: string) => {
    setResults((prev) => prev.filter((r) => r.id !== resultId));
  };

  if (!mounted) {
    return (
      <div style={{ padding: "2rem" }}>
        <div className="container">
          <h1>Email Drop</h1>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  const successCount = results.filter((r) => r.status === "success").length;

  return (
    <div style={{ padding: "2rem" }}>
      <div className="container">
        <h1 style={{ marginBottom: "0.5rem" }}>Email Drop</h1>
        <p className="text-muted" style={{ marginBottom: "2rem" }}>
          Drop emails to extract action items and follow-up reminders
        </p>

        <EmailDropZone
          onEmailsParsed={handleEmailsParsed}
          isProcessing={isProcessing}
        />

        <EmailActionItems
          results={results}
          onAddToInbox={handleAddToInbox}
          onDismiss={handleDismiss}
        />

        {/* Quick navigation */}
        {successCount > 0 && !isProcessing && (
          <div
            className="card"
            style={{
              marginTop: "2rem",
              padding: "1.5rem",
              textAlign: "center",
            }}
          >
            <div
              style={{
                marginBottom: "1rem",
                color: "var(--accent-2)",
                fontWeight: "500",
              }}
            >
              Ready to continue?
            </div>
            <div
              style={{
                display: "flex",
                gap: "1rem",
                justifyContent: "center",
                flexWrap: "wrap",
              }}
            >
              <a href="/inbox" className="btn btn-muted">
                Go to Inbox
              </a>
              <a href="/focus" className="btn btn-primary">
                Go to Focus Queue
              </a>
            </div>
          </div>
        )}

        {/* Toast */}
        {toast && (
          <div
            style={{
              position: "fixed",
              bottom: "2rem",
              right: "2rem",
              padding: "1rem 1.5rem",
              backgroundColor: "var(--panel)",
              color: "var(--text)",
              borderRadius: "0.75rem",
              border: "1px solid var(--border)",
              boxShadow: "0 4px 8px rgba(0,0,0,0.3)",
              zIndex: 1000,
            }}
          >
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}
