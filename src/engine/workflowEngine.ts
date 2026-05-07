import { escalationReasons, type Appointment, type LogEntry, type Stage } from "@/data/mockData";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function nowTime(): string {
  return new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
}

interface AgentResult {
  result: "COMPLETE" | "ESCALATE";
  reason: string | null;
  durationMs: number;
}

async function runAgent(stageName: string): Promise<AgentResult> {
  await sleep(1000 + Math.random() * 1000);
  const escalate = Math.random() < 0.15;
  return {
    result: escalate ? "ESCALATE" : "COMPLETE",
    reason: escalate ? escalationReasons[stageName] : null,
    durationMs: Math.round(1000 + Math.random() * 1000),
  };
}

export type UpdateAppointment = (
  id: string,
  updater: (prev: Appointment) => Appointment,
) => void;

function pushLog(appt: Appointment, entry: LogEntry): Appointment {
  return { ...appt, log: [...appt.log, entry] };
}

function updateStage(appt: Appointment, idx: number, patch: Partial<Stage>): Appointment {
  const stages = appt.stages.map((s, i) => (i === idx ? { ...s, ...patch } : s));
  return { ...appt, stages };
}

async function processStage(
  apptId: string,
  stageIdx: number,
  update: UpdateAppointment,
): Promise<{ escalated: boolean; stageName: string; reason?: string }> {
  let stageName = "";
  update(apptId, (a) => {
    stageName = a.stages[stageIdx].name;
    const next = updateStage(a, stageIdx, { status: "PROCESSING" });
    return pushLog(next, { time: nowTime(), text: `${stageName}: PROCESSING`, kind: "info" });
  });

  const res = await runAgent(stageName);

  update(apptId, (a) => {
    if (res.result === "COMPLETE") {
      const next = updateStage(a, stageIdx, { status: "COMPLETE", durationMs: res.durationMs });
      return pushLog(next, {
        time: nowTime(),
        text: `${stageName}: COMPLETE (${res.durationMs}ms)`,
        kind: "success",
      });
    } else {
      const next = updateStage(a, stageIdx, {
        status: "ESCALATE",
        reason: res.reason ?? "Escalated",
      });
      return pushLog(next, {
        time: nowTime(),
        text: `${stageName}: ESCALATE — ${res.reason}`,
        kind: "error",
      });
    }
  });

  return {
    escalated: res.result === "ESCALATE",
    stageName,
    reason: res.reason ?? undefined,
  };
}

export async function runPipeline(
  apptId: string,
  startIdx: number,
  getAppt: () => Appointment | undefined,
  update: UpdateAppointment,
) {
  update(apptId, (a) => ({ ...a, status: "PROCESSING" }));

  const a0 = getAppt();
  if (!a0) return;
  const stages = a0.stages;

  let i = startIdx;
  while (i < stages.length) {
    const cur = stages[i];
    if (cur.parallel) {
      // gather contiguous parallel block
      const block: number[] = [];
      let j = i;
      while (j < stages.length && stages[j].parallel) {
        block.push(j);
        j++;
      }
      const results = await Promise.all(block.map((idx) => processStage(apptId, idx, update)));
      const failed = results.find((r) => r.escalated);
      if (failed) {
        update(apptId, (a) => ({
          ...a,
          status: "ESCALATED",
          escalatedStageName: failed.stageName,
          escalationReason: failed.reason,
        }));
        return;
      }
      i = j;
    } else {
      const res = await processStage(apptId, i, update);
      if (res.escalated) {
        update(apptId, (a) => ({
          ...a,
          status: "ESCALATED",
          escalatedStageName: res.stageName,
          escalationReason: res.reason,
        }));
        return;
      }
      i++;
    }
  }

  update(apptId, (a) => ({ ...a, status: "CLEARED" }));
}

export function findResumeIndex(appt: Appointment): number {
  // resume after the escalated stage; mark escalated stage as COMPLETE
  const idx = appt.stages.findIndex((s) => s.status === "ESCALATE");
  return idx === -1 ? 0 : idx + 1;
}
