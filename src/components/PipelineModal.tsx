import { useEffect, useRef } from "react";
import type { Appointment, Stage } from "@/data/mockData";

interface PipelineModalProps {
  appt: Appointment;
  onClose: () => void;
  onResolve: (id: string) => void;
}

export function PipelineModal({ appt, onClose, onResolve }: PipelineModalProps) {
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [appt.log.length]);

  // group stages: parallel pairs together
  const groups: Array<{ parallel: boolean; stages: Stage[]; idxs: number[] }> = [];
  appt.stages.forEach((s, idx) => {
    const last = groups[groups.length - 1];
    if (s.parallel && last && last.parallel) {
      last.stages.push(s);
      last.idxs.push(idx);
    } else {
      groups.push({ parallel: s.parallel, stages: [s], idxs: [idx] });
    }
  });

  const statusColor = (s: Appointment["status"]) =>
    s === "PROCESSING"
      ? "text-brand"
      : s === "ESCALATED"
        ? "text-danger"
        : s === "CLEARED"
          ? "text-success"
          : "text-muted-foreground";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl bg-background shadow-2xl">
        <div className="flex items-start justify-between border-b border-border p-6">
          <div>
            <h2 className="text-xl font-bold text-foreground">{appt.patientName}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {appt.specialty} · {appt.urgency} ·{" "}
              <span className={`font-semibold ${statusColor(appt.status)}`}>{appt.status}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6 space-y-3">
          {groups.map((g, gi) => (
            <div key={gi}>
              {g.parallel && (
                <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Parallel Execution
                </div>
              )}
              <div className={g.parallel ? "grid grid-cols-2 gap-3" : ""}>
                {g.stages.map((s, i) => (
                  <StageCard key={g.idxs[i]} stage={s} />
                ))}
              </div>
            </div>
          ))}

          <div>
            <h3 className="mt-6 mb-2 text-sm font-semibold text-foreground">Agent Log</h3>
            <div
              ref={logRef}
              className="h-48 overflow-auto rounded-lg bg-log-bg p-4 font-mono text-xs"
              style={{ color: "var(--log-fg)" }}
            >
              {appt.log.length === 0 ? (
                <div className="text-muted-foreground">No activity yet.</div>
              ) : (
                appt.log.map((entry, i) => (
                  <div
                    key={i}
                    className={
                      entry.kind === "success"
                        ? "text-success"
                        : entry.kind === "error"
                          ? "text-danger"
                          : ""
                    }
                  >
                    {entry.time} — {entry.text}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-border p-4">
          {appt.status === "ESCALATED" && (
            <button
              onClick={() => onResolve(appt.id)}
              className="rounded-md bg-danger px-4 py-2 text-sm font-medium text-danger-foreground hover:bg-danger/90"
            >
              Resolve Exception
            </button>
          )}
          <button
            onClick={onClose}
            className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function StageCard({ stage }: { stage: Stage }) {
  const base = "rounded-lg border p-3 flex items-start justify-between gap-2";
  if (stage.status === "COMPLETE") {
    return (
      <div className={`${base} border-success/30 bg-success-soft`}>
        <div>
          <div className="text-sm font-medium text-foreground">{stage.name}</div>
          {stage.durationMs && (
            <div className="text-xs text-muted-foreground">{stage.durationMs}ms</div>
          )}
        </div>
        <CheckIcon className="h-5 w-5 text-success" />
      </div>
    );
  }
  if (stage.status === "PROCESSING") {
    return (
      <div className={`${base} border-brand bg-background`}>
        <div className="text-sm font-medium text-foreground">{stage.name}</div>
        <Spinner />
      </div>
    );
  }
  if (stage.status === "ESCALATE") {
    return (
      <div className={`${base} flex-col items-stretch border-danger/30 bg-danger-soft`}>
        <div className="flex items-start justify-between gap-2">
          <div className="text-sm font-medium text-foreground">{stage.name}</div>
          <XIcon className="h-5 w-5 text-danger" />
        </div>
        {stage.reason && <div className="mt-1 text-xs text-danger">{stage.reason}</div>}
      </div>
    );
  }
  return (
    <div className={`${base} border-border bg-muted/40`}>
      <div className="text-sm font-medium text-muted-foreground">{stage.name}</div>
      <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/40" />
    </div>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}
function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
function Spinner() {
  return (
    <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand border-t-transparent" />
  );
}
