import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildInitialAppointment,
  initialAppointments,
  priorityScore,
  priorityLabel,
  URGENCY_WEIGHT,
  type Appointment,
} from "@/data/mockData";
import { findResumeIndex, runPipeline } from "@/engine/workflowEngine";
import { api, syncAppointment } from "@/api/appointmentApi";
import { Navbar } from "@/components/Navbar";
import { FilterBar, type Filters } from "@/components/FilterBar";
import { AppointmentCard } from "@/components/AppointmentCard";
import { PipelineModal } from "@/components/PipelineModal";
import { ExceptionQueue } from "@/components/ExceptionQueue";
import { ResolveModal } from "@/components/ResolveModal";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const [appointments, setAppointments] = useState<Appointment[]>(() =>
    initialAppointments.map(buildInitialAppointment),
  );
  const [view, setView] = useState<"dashboard" | "exceptions">("dashboard");
  const [openId, setOpenId] = useState<string | null>(null);
  const [resolveId, setResolveId] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({
    urgency: "All",
    specialty: "All",
    priority: "All",
    status: "All",
    sortBy: "score",
  });

  // ref so the async engine always reads the latest state
  const apptRef = useRef<Appointment[]>(appointments);
  apptRef.current = appointments;

  // Load from backend on mount; fall back to local seed if backend is down
  useEffect(() => {
    api.getAppointments().then(setAppointments).catch(() => {});
  }, []);

  // Poll every 3 s; keep local state only while both sides agree it's PROCESSING
  // so that backend transitions (e.g. to ESCALATED) are never silently dropped.
  useEffect(() => {
    const id = setInterval(() => {
      api
        .getAppointments()
        .then((fresh: Appointment[]) => {
          setAppointments((prev: Appointment[]) =>
            fresh.map((freshAppt: Appointment) => {
              const local = prev.find((a: Appointment) => a.id === freshAppt.id);
              // Keep local state while backend hasn't caught up yet
              const localAhead =
                local?.status === "PROCESSING" ||
                local?.status === "ESCALATED" ||
                local?.status === "CLEARED";
              if (localAhead && freshAppt.status === "PROCESSING") return local;
              return freshAppt;
            }),
          );
        })
        .catch(() => {});
    }, 3000);
    return () => clearInterval(id);
  }, []);

  // Wrap update so every local state change is also persisted to the backend.
  const update = (id: string, updater: (a: Appointment) => Appointment) => {
    setAppointments((prev: Appointment[]) =>
      prev.map((a: Appointment) => {
        if (a.id !== id) return a;
        const next = updater(a);
        syncAppointment(next); // fire-and-forget
        return next;
      }),
    );
  };

  const startPipeline = (id: string, startIdx: number = 0) => {
    runPipeline(
      id,
      startIdx,
      () => apptRef.current.find((a: Appointment) => a.id === id),
      update,
    );
  };

  const handleStart = (id: string) => {
    const a = appointments.find((x: Appointment) => x.id === id);
    if (!a || a.status !== "NOT STARTED") return;
    startPipeline(id, 0);
  };

  const handleProcessAll = () => {
    appointments
      .filter((a: Appointment) => a.status === "NOT STARTED")
      .forEach((a: Appointment) => startPipeline(a.id, 0));
  };

  const handleResolve = async (id: string, notes: string) => {
    const appt = apptRef.current.find((a: Appointment) => a.id === id);
    if (!appt) return;

    const resumeIdx = findResumeIndex(appt);
    setResolveId(null);

    // Await backend confirmation before resuming — prevents race where frontend
    // and backend both mutate stage state simultaneously.
    try {
      await api.resolveAppointment(id, notes);
    } catch {
      // backend unavailable — continue with local-only resolution
    }

    update(id, (a: Appointment) => {
      const stages = a.stages.map((s) =>
        s.status === "ESCALATE" ? { ...s, status: "COMPLETE" as const } : s,
      );
      return {
        ...a,
        stages,
        escalatedStageName: undefined,
        escalationReason: undefined,
        log: [
          ...a.log,
          {
            time: new Date().toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
              second: "2-digit",
            }),
            text: `Exception resolved: ${notes}`,
            kind: "info" as const,
          },
        ],
      };
    });
    startPipeline(id, resumeIdx);
  };

  const specialties = useMemo(
    () => Array.from(new Set(appointments.map((a: Appointment) => a.specialty))).sort(),
    [appointments],
  );

  const filtered = useMemo(() => {
    let list = appointments.filter((a: Appointment) => {
      if (filters.urgency !== "All" && a.urgency !== filters.urgency) return false;
      if (filters.specialty !== "All" && a.specialty !== filters.specialty) return false;
      if (filters.status !== "All" && a.status !== filters.status) return false;
      if (filters.priority !== "All") {
        if (priorityLabel(priorityScore(a)) !== filters.priority) return false;
      }
      return true;
    });

    list = [...list].sort((a: Appointment, b: Appointment) => {
      switch (filters.sortBy) {
        case "score":   return priorityScore(b) - priorityScore(a);
        case "urgency": return URGENCY_WEIGHT[b.urgency] - URGENCY_WEIGHT[a.urgency];
        case "denial":  return b.denialRisk - a.denialRisk;
        case "wait":    return b.ageInQueue - a.ageInQueue;
        default:        return 0;
      }
    });

    return list;
  }, [appointments, filters]);

  const openAppt = openId ? appointments.find((a: Appointment) => a.id === openId) : null;
  const resolveAppt = resolveId
    ? appointments.find((a: Appointment) => a.id === resolveId)
    : null;

  return (
    <div className="min-h-screen bg-background">
      <Navbar
        view={view}
        onChange={setView}
        appointments={appointments}
        onReset={() => api.getAppointments().then(setAppointments).catch(() => {})}
      />

      <main className="mx-auto max-w-7xl px-6 py-8">
        {view === "dashboard" ? (
          <>
            <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-foreground">Appointment Queue</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {appointments.length} appointments · sorted by priority score
                </p>
              </div>
              <button
                onClick={handleProcessAll}
                className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-brand-foreground hover:bg-brand/90"
              >
                Process All
              </button>
            </div>

            <div className="mb-4 rounded-xl border border-border bg-card p-4">
              <FilterBar filters={filters} onChange={setFilters} specialties={specialties} />
            </div>

            <p className="mb-4 text-xs text-muted-foreground">
              Showing {filtered.length} of {appointments.length} appointments
            </p>

            <div className="space-y-3">
              {filtered.map((a: Appointment) => (
                <AppointmentCard
                  key={a.id}
                  appt={a}
                  onStart={handleStart}
                  onView={(id: string) => setOpenId(id)}
                />
              ))}
              {filtered.length === 0 && (
                <div className="rounded-xl border border-border bg-card py-12 text-center text-sm text-muted-foreground">
                  No appointments match your filters.
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-foreground">Exception Queue</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Pipelines awaiting human resolution.
              </p>
            </div>
            <ExceptionQueue onResolve={(id: string) => setResolveId(id)} />
          </>
        )}
      </main>

      {openAppt && (
        <PipelineModal
          appt={openAppt}
          onClose={() => setOpenId(null)}
          onResolve={(id: string) => {
            setOpenId(null);
            setResolveId(id);
          }}
        />
      )}
      {resolveAppt && (
        <ResolveModal
          appt={resolveAppt}
          onCancel={() => setResolveId(null)}
          onConfirm={handleResolve}
        />
      )}
    </div>
  );
}
