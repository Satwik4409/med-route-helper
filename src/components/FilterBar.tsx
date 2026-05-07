import type { AppointmentStatus, Urgency } from "@/data/mockData";

export type PriorityLabel = "All" | "HIGH" | "MEDIUM" | "LOW";
export type SortBy = "score" | "urgency" | "denial" | "wait";

export interface Filters {
  urgency: "All" | Urgency;
  specialty: string;
  priority: PriorityLabel;
  status: "All" | AppointmentStatus;
  sortBy: SortBy;
}

interface FilterBarProps {
  filters: Filters;
  onChange: (f: Filters) => void;
  specialties: string[];
}

const urgencies: Array<"All" | Urgency> = ["All", "STAT", "Urgent", "Routine"];
const priorities: PriorityLabel[] = ["All", "HIGH", "MEDIUM", "LOW"];
const statuses: Array<"All" | AppointmentStatus> = [
  "All",
  "NOT STARTED",
  "PROCESSING",
  "ESCALATED",
  "CLEARED",
];
const sortOptions: { value: SortBy; label: string }[] = [
  { value: "score", label: "Priority Score" },
  { value: "urgency", label: "Urgency" },
  { value: "denial", label: "Denial Risk" },
  { value: "wait", label: "Wait Time" },
];

export function FilterBar({ filters, onChange, specialties }: FilterBarProps) {
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => onChange({ ...filters, [k]: v });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {urgencies.map((u) => (
          <button
            key={u}
            onClick={() => set("urgency", u)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium border transition-colors ${
              filters.urgency === u
                ? "bg-brand text-brand-foreground border-brand"
                : "bg-background text-foreground border-border hover:bg-muted"
            }`}
          >
            {u}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <Select
          label="Specialty"
          value={filters.specialty}
          onChange={(v) => set("specialty", v)}
          options={["All", ...specialties]}
        />
        <Select
          label="Priority"
          value={filters.priority}
          onChange={(v) => set("priority", v as PriorityLabel)}
          options={priorities}
        />
        <Select
          label="Status"
          value={filters.status}
          onChange={(v) => set("status", v as Filters["status"])}
          options={statuses}
        />
        <Select
          label="Sort by"
          value={filters.sortBy}
          onChange={(v) => set("sortBy", v as SortBy)}
          options={sortOptions.map((o) => o.value)}
          render={(v) => sortOptions.find((o) => o.value === v)?.label ?? v}
        />
      </div>
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
  render,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  render?: (v: string) => string;
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="text-muted-foreground">{label}:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {render ? render(o) : o}
          </option>
        ))}
      </select>
    </label>
  );
}
