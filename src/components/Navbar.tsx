import type { Appointment } from "@/data/mockData";

interface NavbarProps {
  view: "dashboard" | "exceptions";
  onChange: (v: "dashboard" | "exceptions") => void;
  appointments: Appointment[];
}

export function Navbar({ view, onChange, appointments }: NavbarProps) {
  const exceptionCount = appointments.filter((a) => a.status === "ESCALATED").length;

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-sm font-bold text-brand-foreground">
            IK
          </div>
          <div className="leading-tight">
            <div className="text-base font-bold text-foreground">IKS Health</div>
            <div className="text-xs text-muted-foreground">Agentic Workflow</div>
          </div>
        </div>

        <div className="flex-1 flex justify-center">
          <button
            onClick={() => onChange("dashboard")}
            className={`rounded-full px-5 py-1.5 text-sm font-medium transition-colors ${
              view === "dashboard"
                ? "bg-brand text-brand-foreground"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            Dashboard
          </button>
        </div>

        <button
          onClick={() => onChange("exceptions")}
          className={`flex items-center gap-2 text-sm font-medium ${
            exceptionCount > 0 ? "text-danger" : "text-muted-foreground"
          } ${view === "exceptions" ? "underline underline-offset-4" : ""}`}
        >
          Exception Queue
          {exceptionCount > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1.5 text-xs font-semibold text-danger-foreground">
              {exceptionCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
}
