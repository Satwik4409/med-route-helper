import type { Appointment } from "@/data/mockData";

interface ExceptionQueueProps {
  appointments: Appointment[];
  onResolve: (id: string) => void;
}

export function ExceptionQueue({ appointments: escalated, onResolve }: ExceptionQueueProps) {

  if (escalated.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card py-24 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <svg className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="mt-4 text-lg font-semibold text-foreground">No exceptions</h2>
        <p className="mt-1 text-sm text-muted-foreground">All pipelines are running clean.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-3">Patient</th>
            <th className="px-4 py-3">Specialty</th>
            <th className="px-4 py-3">Urgency</th>
            <th className="px-4 py-3">Escalated Stage</th>
            <th className="px-4 py-3">Reason</th>
            <th className="px-4 py-3">Waiting</th>
            <th className="px-4 py-3 text-right">Action</th>
          </tr>
        </thead>
        <tbody>
          {escalated.map((a: Appointment) => (
            <tr key={a.id} className="border-t border-border">
              <td className="px-4 py-3 font-medium text-foreground">{a.patientName}</td>
              <td className="px-4 py-3 text-muted-foreground">{a.specialty}</td>
              <td className="px-4 py-3">{a.urgency}</td>
              <td className="px-4 py-3">{a.escalatedStageName}</td>
              <td className="px-4 py-3 text-muted-foreground">{a.escalationReason}</td>
              <td className="px-4 py-3">{a.ageInQueue}m</td>
              <td className="px-4 py-3 text-right">
                <button
                  onClick={() => onResolve(a.id)}
                  className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-brand-foreground hover:bg-brand/90"
                >
                  Resolve
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
