import type { Appointment, LogEntry, Stage } from "@/data/mockData";

const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

// ---------------------------------------------------------------------------
// Type mapping: backend (snake_case) ↔ frontend (camelCase)
// ---------------------------------------------------------------------------

// Backend status uses underscores; frontend uses a space in "NOT STARTED"
function toFrontendStatus(s: string): Appointment["status"] {
  if (s === "NOT_STARTED") return "NOT STARTED";
  return s as Appointment["status"];
}

function toBackendStatus(s: Appointment["status"]): string {
  if (s === "NOT STARTED") return "NOT_STARTED";
  return s;
}

function toFrontendStage(s: Record<string, unknown>): Stage {
  return {
    id:         s.id as string,
    name:       s.name as string,
    parallel:   s.parallel as boolean,
    status:     s.status as Stage["status"],
    durationMs: s.duration_ms != null ? (s.duration_ms as number) : undefined,
    reason:     s.escalation_reason != null ? (s.escalation_reason as string) : undefined,
  };
}

function toBackendStage(s: Stage): Record<string, unknown> {
  return {
    id:               s.id,
    name:             s.name,
    parallel:         s.parallel,
    status:           s.status,
    duration_ms:      s.durationMs ?? null,
    escalation_reason: s.reason ?? null,
  };
}

// Backend agent_log stores LogEntry objects (or plain strings from old data).
function toFrontendLog(entries: unknown[]): LogEntry[] {
  return entries.map((e) => {
    if (typeof e === "string") {
      return { time: "", text: e, kind: "info" as const };
    }
    return e as LogEntry;
  });
}

function toFrontendAppointment(row: Record<string, unknown>): Appointment {
  const stages = (row.stages as Record<string, unknown>[]).map(toFrontendStage);
  const escalatedStage = stages.find((s) => s.status === "ESCALATE");

  return {
    id:           row.id as string,
    patientName:  row.patient_name as string,
    specialty:    row.specialty as string,
    urgency:      row.urgency as Appointment["urgency"],
    denialRisk:   row.denial_risk as number,
    ageInQueue:   row.age_in_queue as number,
    status:       toFrontendStatus(row.status as string),
    stages,
    log:          toFrontendLog((row.agent_log as unknown[]) ?? []),
    escalatedStageName: escalatedStage?.name,
    escalationReason:   escalatedStage?.reason,
  };
}

// ---------------------------------------------------------------------------
// Sync a local Appointment snapshot to the backend (fire-and-forget)
// ---------------------------------------------------------------------------

export function syncAppointment(appt: Appointment): void {
  fetch(`${BASE}/appointments/${appt.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      status:    toBackendStatus(appt.status),
      stages:    appt.stages.map(toBackendStage),
      agent_log: appt.log,
    }),
  }).then((r) => {
    if (!r.ok) console.warn(`[sync] PATCH ${appt.id} failed: HTTP ${r.status}`);
  }).catch((err) => {
    console.warn(`[sync] PATCH ${appt.id} unreachable:`, err);
  });
}

// ---------------------------------------------------------------------------
// API surface
// ---------------------------------------------------------------------------

export const api = {
  getAppointments: async (filters: Record<string, string> = {}): Promise<Appointment[]> => {
    const params = new URLSearchParams(
      Object.fromEntries(Object.entries(filters).filter(([, v]) => v && v !== "All")),
    );
    const r = await fetch(`${BASE}/appointments?${params}`);
    if (!r.ok) throw new Error(`GET /appointments failed: HTTP ${r.status}`);
    const rows: Record<string, unknown>[] = await r.json();
    return rows.map(toFrontendAppointment);
  },

  getExceptions: async (): Promise<Appointment[]> => {
    const r = await fetch(`${BASE}/exceptions`);
    if (!r.ok) throw new Error(`GET /exceptions failed: HTTP ${r.status}`);
    const rows: Record<string, unknown>[] = await r.json();
    return rows.map(toFrontendAppointment);
  },

  resolveAppointment: async (id: string, notes: string): Promise<Appointment> => {
    const r = await fetch(`${BASE}/appointments/${id}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes, resolved_by: "Concierge Staff" }),
    });
    if (!r.ok) throw new Error(`POST /resolve failed: HTTP ${r.status}`);
    return toFrontendAppointment(await r.json());
  },

  getStats: async () => {
    const r = await fetch(`${BASE}/stats`);
    if (!r.ok) throw new Error(`GET /stats failed: HTTP ${r.status}`);
    return r.json();
  },

  resetAll: async () => {
    const r = await fetch(`${BASE}/appointments/reset-all`, { method: "POST" });
    if (!r.ok) throw new Error(`POST /reset-all failed: HTTP ${r.status}`);
    return r.json();
  },
};
