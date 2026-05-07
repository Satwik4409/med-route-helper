import { priorityLabel, priorityScore, type Appointment } from "@/data/mockData";

interface AppointmentCardProps {
  appt: Appointment;
  onStart: (id: string) => void;
  onView: (id: string) => void;
}

function urgencyBadge(u: Appointment["urgency"]) {
  if (u === "STAT") return "bg-danger text-danger-foreground";
  if (u === "Urgent") return "bg-warning text-warning-foreground";
  return "bg-muted text-muted-foreground";
}

function priorityBadge(p: "HIGH" | "MEDIUM" | "LOW") {
  if (p === "HIGH") return "bg-danger text-danger-foreground";
  if (p === "MEDIUM") return "bg-warning text-warning-foreground";
  return "bg-success text-success-foreground";
}

function statusBadge(s: Appointment["status"]) {
  switch (s) {
    case "NOT STARTED":
      return "bg-muted text-muted-foreground";
    case "PROCESSING":
      return "bg-brand text-brand-foreground";
    case "ESCALATED":
      return "bg-danger text-danger-foreground";
    case "CLEARED":
      return "bg-success text-success-foreground";
  }
}

export function AppointmentCard({ appt, onStart, onView }: AppointmentCardProps) {
  const score = priorityScore(appt);
  const pLabel = priorityLabel(score);
  const completed = appt.stages.filter((s) => s.status === "COMPLETE").length;
  const total = appt.stages.length;
  const pct = (completed / total) * 100;

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-mono font-semibold text-foreground">
              {appt.id}
            </span>
            <Badge className={urgencyBadge(appt.urgency)}>{appt.urgency.toUpperCase()}</Badge>
            <Badge className={priorityBadge(pLabel)}>{pLabel}</Badge>
            <Badge className={statusBadge(appt.status)}>{appt.status}</Badge>
          </div>
          <h3 className="mt-2 text-lg font-semibold text-foreground">{appt.patientName}</h3>
          <p className="text-sm text-muted-foreground">
            {appt.specialty} · Denial Risk: {Math.round(appt.denialRisk * 100)}% · Score:{" "}
            {score.toFixed(2)}
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <button
            disabled={appt.status !== "NOT STARTED"}
            onClick={() => onStart(appt.id)}
            className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {appt.status === "NOT STARTED" ? "Start Processing" : "Started"}
          </button>
          <button
            onClick={() => onView(appt.id)}
            className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
          >
            View Pipeline
          </button>
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-1 flex justify-between text-xs text-muted-foreground">
          <span>Pipeline Progress</span>
          <span>
            {completed} / {total} stages
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-brand transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function Badge({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${className}`}
    >
      {children}
    </span>
  );
}
