"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { Bot, Download, Loader2, MessageCircle, Minus, Send, X, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { apiFetch, API_BASE_URL } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

type ChatRole = "user" | "assistant";

interface ChatResponse {
  success: boolean;
  intent: string;
  message: string;
  data: Record<string, unknown>[];
  summary?: Record<string, unknown> | null;
  pdf_available: boolean;
  report_id?: string | null;
  context?: Record<string, unknown>;
}

interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  response?: ChatResponse;
  error?: boolean;
}

const INTENT_LABELS: Record<string, string> = {
  patient_search: "Patient Search",
  patient_history: "Patient History",
  patient_medicines: "Patient Medicines",
  patient_visits: "Patient Visits",
  patient_footfall: "Patient Footfall",
  medicine_stock: "Medicine Stock",
  medicine_low_stock: "Low Stock",
  medicine_out_of_stock: "Out Of Stock",
  bed_availability: "Bed Availability",
  phc_bed_status: "PHC Bed Status",
  doctor_attendance: "Doctor Attendance",
  doctor_absence: "Doctor Absence",
  doctor_specific_attendance: "Doctor Attendance",
  live_database_query: "Live Database Query",
  unsupported: "Unsupported",
};

const COLUMNS: Record<string, string[]> = {
  patient_search: ["patient_code", "name", "age", "gender", "status"],
  patient_visits: ["patient_code", "status", "hospital_id", "admitted_at", "discharged_at"],
  patient_footfall: ["phc_name", "district", "date_from", "date_to", "patient_footfall"],
  patient_medicines: ["medicine", "quantity", "change_type", "timestamp"],
  medicine_stock: ["name", "quantity", "unit", "min_threshold", "status"],
  medicine_low_stock: ["name", "quantity", "unit", "min_threshold", "status"],
  medicine_out_of_stock: ["name", "quantity", "unit", "min_threshold", "status"],
  bed_availability: ["name", "total_beds", "occupied_beds", "available_beds", "occupancy_percentage"],
  phc_bed_status: ["name", "district", "total_beds", "occupied_beds", "available_beds"],
  doctor_attendance: ["date", "doctor_name", "specialization", "status", "timestamp"],
  doctor_absence: ["date", "doctor_name", "specialization", "status"],
  doctor_specific_attendance: ["date", "doctor_name", "specialization", "status", "timestamp"],
};

const CHATBOT_ALLOWED_ROLES = new Set([
  "DISTRICT_ADMIN",
  "NATION_ADMIN",
  "RECEPTIONIST",
  "DOCTOR",
  "MEDICAL_OFFICER",
  "DEVELOPER",
]);

function formatLabel(key: string) {
  return key.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(2);
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  }
  return String(value);
}

function rowsFor(response: ChatResponse) {
  if (response.intent === "patient_history") {
    return response.data.map((row) => {
      const patient = row.patient as Record<string, unknown> | undefined;
      return {
        patient_code: patient?.patient_code,
        name: patient?.name,
        status: patient?.status,
        history_events: Array.isArray(row.history) ? row.history.length : 0,
      };
    });
  }
  return response.data;
}

function ResultTable({ response }: { response: ChatResponse }) {
  const rows = rowsFor(response);
  if (!rows.length) return null;
  const columns = COLUMNS[response.intent] || Object.keys(rows[0]).slice(0, 5);

  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-border bg-background">
      <div className="max-h-48 overflow-auto">
        <table className="w-full min-w-[420px] text-left text-xs">
          <thead className="sticky top-0 bg-muted text-muted-foreground">
            <tr>
              {columns.map((column) => (
                <th key={column} className="px-3 py-2 font-semibold">{formatLabel(column)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 8).map((row, rowIndex) => (
              <tr key={rowIndex} className="border-t border-border">
                {columns.map((column) => (
                  <td key={column} className="px-3 py-2 align-top text-foreground">
                    {formatValue((row as Record<string, unknown>)[column])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Summary({ response }: { response: ChatResponse }) {
  if (!response.summary) return null;
  const entries = Object.entries(response.summary).slice(0, 6);
  if (!entries.length) return null;
  return (
    <div className="mt-3 grid grid-cols-2 gap-2">
      {entries.map(([key, value]) => (
        <div key={key} className="rounded-lg border border-border bg-muted/30 px-3 py-2">
          <div className="text-[10px] font-semibold uppercase text-muted-foreground">{formatLabel(key)}</div>
          <div className="mt-0.5 truncate text-sm font-semibold text-foreground">{formatValue(value)}</div>
        </div>
      ))}
    </div>
  );
}

export function FloatingChatbot() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [context, setContext] = useState<Record<string, unknown>>({});
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Ask about patients, medicine stock, bed availability, or doctor attendance.",
    },
  ]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, loading, open, minimized]);

  const canSend = useMemo(() => input.trim().length > 0 && !loading, [input, loading]);

  const sendMessage = async () => {
    const message = input.trim();
    if (!message || loading) return;
    setInput("");
    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", content: message };
    setMessages((current) => [...current, userMessage]);
    setLoading(true);

    try {
      const url = `${API_BASE_URL}/api/v1/chat/`;
      const res = await apiFetch(url, {
        method: "POST",
        body: JSON.stringify({ message, context, scope_all: user?.role === "DISTRICT_ADMIN" }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) {
        throw new Error(data?.detail || "Chat request failed");
      }
      const response = data as ChatResponse;
      if (response.context) {
        setContext((current) => ({ ...current, ...response.context }));
      }
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: response.message,
          response,
          error: !response.success,
        },
      ]);
    } catch (error: unknown) {
      const messageText = error instanceof Error ? error.message : "Network error. Please check the backend connection.";
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: messageText,
          error: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const downloadPdf = async (reportId: string) => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/v1/chat/reports/${encodeURIComponent(reportId)}/download`);
      if (!res.ok) throw new Error("PDF download failed");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "Aarogya_AI_Healthcare_Report.pdf";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      setMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), role: "assistant", content: "Unable to download the PDF report.", error: true },
      ]);
    }
  };

  if (!user || !CHATBOT_ALLOWED_ROLES.has(user.role)) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[60] md:bottom-6 md:right-6">
      {!open && (
        <Button
          size="icon-lg"
          onClick={() => {
            setOpen(true);
            setMinimized(false);
          }}
          className="h-14 w-14 rounded-full shadow-xl ring-4 ring-primary/10 cursor-pointer hover:scale-105 transition-transform"
          title="Open Aarogya AI"
        >
          <MessageCircle className="h-6 w-6" />
        </Button>
      )}

      {open && (
        <section
          className={cn(
            "flex w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl ring-1 ring-foreground/10 sm:w-[420px]",
            minimized ? "h-16" : "h-[min(680px,calc(100vh-2rem))]"
          )}
          aria-label="Aarogya AI healthcare chatbot"
        >
          <div className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-primary px-4 text-primary-foreground">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-foreground/15">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <div className="text-sm font-semibold">Aarogya AI</div>
                <div className="text-xs text-primary-foreground/75">Healthcare operations assistant</div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground"
                onClick={() => setMinimized((value) => !value)}
                title={minimized ? "Expand chat" : "Minimize chat"}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground"
                onClick={() => setOpen(false)}
                title="Close chat"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {!minimized && (
            <>
              <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto bg-background/60 p-4">
                {messages.map((message) => (
                  <div key={message.id} className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}>
                    <div
                      className={cn(
                        "max-w-[88%] rounded-xl px-3 py-2 text-sm shadow-sm",
                        message.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "border border-border bg-card text-foreground",
                        message.error && "border-destructive/30 bg-destructive/5 text-destructive"
                      )}
                    >
                      {message.response && (
                        <div className="mb-2 flex items-center gap-2">
                          <Badge variant={message.response.success ? "secondary" : "destructive"}>
                            {INTENT_LABELS[message.response.intent] || formatLabel(message.response.intent)}
                          </Badge>
                          {!message.response.success && <AlertCircle className="h-4 w-4" />}
                        </div>
                      )}
                      <p className="leading-relaxed whitespace-pre-wrap">{message.content}</p>
                      {message.response && (
                        <>
                          <Summary response={message.response} />
                          <ResultTable response={message.response} />
                          {message.response.pdf_available && message.response.report_id && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="mt-3 gap-2"
                              onClick={() => downloadPdf(message.response!.report_id!)}
                            >
                              <Download className="h-3.5 w-3.5" />
                              Download PDF
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex justify-start">
                    <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm text-muted-foreground shadow-sm">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Checking records...
                    </div>
                  </div>
                )}
              </div>

              <div className="shrink-0 border-t border-border bg-card p-3">
                <form
                  className="flex gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    sendMessage();
                  }}
                >
                  <Input
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    placeholder="Ask about ABHA ID, stock, beds, or attendance..."
                    className="h-10"
                  />
                  <Button type="submit" size="icon-lg" disabled={!canSend} title="Send message" className="cursor-pointer">
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </form>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
