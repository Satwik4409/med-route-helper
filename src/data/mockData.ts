export type Urgency = "STAT" | "Urgent" | "Routine";
export type StageStatus = "PENDING" | "PROCESSING" | "COMPLETE" | "ESCALATE";
export type AppointmentStatus = "NOT STARTED" | "PROCESSING" | "ESCALATED" | "CLEARED";

export interface StageConfig {
  id: string;
  name: string;
  parallel: boolean;
}

export interface Stage {
  id: string;
  name: string;
  parallel: boolean;
  status: StageStatus;
  durationMs?: number;
  reason?: string;
}

export interface LogEntry {
  time: string;
  text: string;
  kind: "info" | "success" | "error";
}

export interface Appointment {
  id: string;
  patientName: string;
  specialty: string;
  urgency: Urgency;
  denialRisk: number;
  ageInQueue: number;
  status: AppointmentStatus;
  stages: Stage[];
  log: LogEntry[];
  escalatedStageName?: string;
  escalationReason?: string;
}

export const workflowConfig: StageConfig[] = [
  { id: "identity", name: "Patient Identity", parallel: false },
  { id: "eligibility", name: "Insurance Eligibility", parallel: false },
  { id: "prior_auth", name: "Prior Authorization", parallel: true },
  { id: "provider_match", name: "Provider Matching", parallel: true },
  { id: "denial_risk", name: "Denial Risk Scoring", parallel: false },
  { id: "clearance", name: "Final Clearance", parallel: false },
];

export const escalationReasons: Record<string, string> = {
  "Patient Identity": "Identity match confidence below threshold",
  "Insurance Eligibility": "Coverage termination detected",
  "Prior Authorization": "Auth request returned PEND status",
  "Provider Matching": "No in-network slots available",
  "Denial Risk Scoring": "High denial probability detected",
  "Final Clearance": "Billing rules conflict identified",
};

export const initialAppointments: Omit<Appointment, "stages" | "log" | "status">[] = [
  { id: "APT-1001", patientName: "Emily Davis", specialty: "Oncology", urgency: "STAT", denialRisk: 0.91, ageInQueue: 15 },
  { id: "APT-1000", patientName: "Sarah Johnson", specialty: "Oncology", urgency: "STAT", denialRisk: 0.82, ageInQueue: 45 },
  { id: "APT-1003", patientName: "Lisa Anderson", specialty: "Cardiology", urgency: "Urgent", denialRisk: 0.73, ageInQueue: 50 },
  { id: "APT-1002", patientName: "Robert Chen", specialty: "Cardiology", urgency: "Urgent", denialRisk: 0.65, ageInQueue: 30 },
  { id: "APT-1004", patientName: "James Wilson", specialty: "Orthopedics", urgency: "Urgent", denialRisk: 0.54, ageInQueue: 60 },
  { id: "APT-1005", patientName: "Maria Garcia", specialty: "GI", urgency: "Routine", denialRisk: 0.21, ageInQueue: 120 },
  { id: "APT-1006", patientName: "David Martinez", specialty: "GI", urgency: "Routine", denialRisk: 0.38, ageInQueue: 90 },
  { id: "APT-1007", patientName: "Michael Brown", specialty: "General", urgency: "Routine", denialRisk: 0.12, ageInQueue: 200 },
];

export function buildInitialAppointment(
  base: Omit<Appointment, "stages" | "log" | "status">,
): Appointment {
  return {
    ...base,
    status: "NOT STARTED",
    log: [],
    stages: workflowConfig.map((s) => ({ ...s, status: "PENDING" })),
  };
}

export const URGENCY_WEIGHT: Record<Urgency, number> = { STAT: 10, Urgent: 6, Routine: 3 };

export function priorityScore(a: Pick<Appointment, "urgency" | "denialRisk" | "ageInQueue">) {
  return URGENCY_WEIGHT[a.urgency] * 0.5 + a.denialRisk * 10 * 0.3 + Math.log(1 + a.ageInQueue) * 0.2;
}

export function priorityLabel(score: number): "HIGH" | "MEDIUM" | "LOW" {
  if (score >= 7) return "HIGH";
  if (score >= 4) return "MEDIUM";
  return "LOW";
}
