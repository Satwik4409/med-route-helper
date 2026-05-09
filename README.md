# IKS Health — Agentic Workflow Management System

## Links
- **Live Demo:** https://med-route-helper.vercel.app
- **API / Swagger Docs:** https://med-route-helper.onrender.com/docs
- **GitHub:** https://github.com/Satwik4409/med-route-helper

> Note: Backend is on Render's free tier — first load may take
> 30–60 seconds to wake up. Everything runs normally after that.

## Screenshots

<img width="1405" height="942" alt="image" src="https://github.com/user-attachments/assets/025692b6-4744-4032-ba3a-10065af6fc27" />

<img width="1378" height="948" alt="image" src="https://github.com/user-attachments/assets/e7bc1205-8f86-4e11-b62a-bd5841cd4fb4" />

<img width="1422" height="907" alt="image" src="https://github.com/user-attachments/assets/4a5582c7-f8e1-4ac0-b3e4-908612176329" />




---

## What Was Built

A full-stack prototype simulating an AI agent pipeline for medical appointment processing.

**Stack:** React 19 + Vite + Tailwind · FastAPI · SQLite

---

## 6-Agent Pipeline

```
[1. Patient Identity]       → verify MRN, duplicates
                ↓
[2. Insurance Eligibility]  → X12 270/271, coverage check
                ↓
[3. Prior Authorization] ──┐
                           ├→ parallel execution
[4. Provider Matching]   ──┘
                ↓
[5. Denial Risk Scoring]    → ML model + LLM explanation
                ↓
[6. Final Clearance]        → rules engine + confirmation
                ↓
        APPOINTMENT CONFIRMED ✅
```

| Stage | Agent | What it does |
|-------|-------|-------------|
| 1 | Patient Identity | Does this patient exist? Duplicate MRN? Wrong DOB? Catches data errors before anything else runs. |
| 2 | Insurance Eligibility | Is their insurance active? X12 270 = ask payer. X12 271 = payer responds. Coverage terminated = escalate. |
| 3 | Prior Authorization | Does the payer approve this procedure? Most denials happen here. PEND status = escalate for clinical notes. |
| 4 | Provider Matching | Is there an in-network doctor available? No slots = escalate. Runs parallel with Stage 3 — both need eligibility, neither needs each other. |
| 5 | Denial Risk Scoring | XGBoost predicts denial probability from claims history. LLM explains why in plain English for the human reviewer. |
| 6 | Final Clearance | All 5 checks passed. Rules engine confirms billing codes, documentation complete. Hands off to billing. |

**Parallel Execution:** Stages 3+4 run simultaneously — independent after Stage 2.

**Dependency DAG:**
```
         [1. Patient Identity]
                  ↓
         [2. Insurance Eligibility]
                  ↓
        ┌─────────┴──────────┐
        ↓                    ↓
[3. Prior Auth]     [4. Provider Matching]
        └─────────┬──────────┘
                  ↓
         [5. Denial Risk Scoring]
                  ↓
         [6. Final Clearance]
```

Why this DAG:
- Stage 3 needs Stage 2 output — can't request prior auth without confirmed coverage
- Stage 4 needs Stage 2 output — can't match provider without knowing network status
- Stage 3 and Stage 4 do NOT need each other → run in parallel
- Stage 5 needs BOTH Stage 3 and Stage 4 complete — can't score denial risk with incomplete auth or no provider
- If either Stage 3 or Stage 4 escalates → both stop → Stage 5 never runs

---

## Priority Scoring

```
score = urgency(0.5) + denial_risk×10(0.3) + log(1+wait)(0.2)
```

- **Urgency Weights:** STAT=10 · Urgent=6 · Routine=3
- **Priority Labels:** HIGH ≥7 · MEDIUM ≥4 · LOW <4

**Design Rationale:** Log scale on wait time prevents aging from dominating urgent cases. A 200-minute-old routine appointment gets ~0.4 boost, while a 15-minute STAT stays top priority.

**Why high denial risk increases priority (not decreases):**
High denial risk means the claim is likely to be rejected by the payer — exactly the cases that need human intervention earliest. Surfacing them first allows staff to fix documentation, submit prior auth, or escalate before the claim is denied. This is IKS's "preactive RCM" model: catch it before submission, not after rejection.

**New patient edge case (no claims history):**
New patients have no denial risk history so `denial_risk` defaults to `0.0`. They are still processed based on urgency and wait time — they just don't receive the denial risk boost. As they accumulate claims history, the ML model fills in a real score.

```
New STAT patient, 15 min wait, no history:
score = 10×0.5 + 0.0×10×0.3 + log(16)×0.2 = 5.55 → MEDIUM

Emily Davis, STAT, denial_risk 0.91:
score = 10×0.5 + 0.91×10×0.3 + log(16)×0.2 = 8.28 → HIGH
```

---

## HITL (Human-in-the-Loop) Flow

```
Agent cannot resolve autonomously
        ↓
Pipeline pauses → Exception Queue
        ↓
Human resolves with notes
        ↓
Pipeline resumes from next stage
```

**Target:** 85% auto-approve · 15% human review.

---

## Facade Architecture

```
┌─────────────────────────────────┐       ┌──────────────────────┐
│         Browser (React)         │       │   FastAPI (Render)   │
│                                 │       │                      │
│  Dashboard → clicks "Start"     │       │  GET  /appointments  │
│  workflowEngine.ts runs         │◄─────►│  PATCH /apts/{id}    │
│  pipeline (setTimeout mocks)    │       │  POST /apts/{id}/    │
│  syncAppointment() after        │       │       resolve        │
│  every stage change             │       │  GET  /exceptions    │
│                                 │       │  GET  /stats         │
└─────────────────────────────────┘       └──────────┬───────────┘
                                                     │
                                          ┌──────────▼───────────┐
                                          │     SQLite (iks.db)  │
                                          │                      │
                                          │  1 table             │
                                          │  8 rows (seeded)     │
                                          │  stages as JSON col  │
                                          │  agent_log as JSON   │
                                          └──────────────────────┘
```

**The key point:** Pipeline logic runs entirely in the browser. The backend is a persistence layer — it stores what the browser tells it happened. No agent execution on the server.

## Facade Design Decisions

### Agent Execution — Frontend mock (setTimeout)
Production uses real payer API calls (X12 270/271, REST). The facade simulates 1–2s latency with 15% escalation rate using `setTimeout` in the browser. No infra needed — the demo shows the full pipeline behaviour without requiring live payer credentials.

**Tradeoff:** Not a real agent. But the pipeline logic (dependency order, parallel execution, HITL pause/resume) is identical to what LangGraph would run in production.

### Database — SQLite
Zero config, no server, one file. Schema is identical to Postgres — migration is just a connection string change + `alembic upgrade head`. Appointments are pre-seeded at startup via `init_db()`.

**Tradeoff:** No concurrent writes, no replication. Fine at <100/hr. Beyond that, switch to Postgres + Redis.

### Parallel Stages — Promise.all
Stages 3+4 (Prior Auth + Provider Matching) run simultaneously. Both depend on Stage 2 (Eligibility) output but are independent of each other — real dependency DAG, not a flat chain.

**If either escalates:** Both stop. Stage 5 (Denial Risk Scoring) needs complete auth AND provider data. Incomplete input = escalate, not guess.

**Tradeoff:** `Promise.all` in browser mirrors `asyncio.gather()` on production worker nodes. Same semantics, different runtime.

### Resume Behavior — Next stage after escalated
If Stage 3 escalates, Stage 4 already ran (parallel). Human resolves Stage 3 → pipeline resumes at Stage 5, not Stage 3. Re-running Stage 4 would be wasted work.

### State Sync — PATCH on every stage change
Frontend fires `syncAppointment()` after every state update. Backend always reflects real state.

**Tradeoff:** Chatty — one full pipeline run = ~12 PATCH calls. In production you'd use events or batch updates. Acceptable for a facade with 8 appointments.

### UI/UX — What was built and why

| What | Why |
|------|-----|
| Priority score on every card | Staff sees who to process first without clicking in |
| STAT/HIGH badges in red | Visual urgency — zero cognitive load |
| Pipeline modal with per-stage progress | Shows agent doing real work, not a spinner |
| Exception Queue as separate view | Escalations stay visible — staff don't miss them |
| Parallel stages shown side-by-side | Visually communicates simultaneous execution |
| Agent log with timestamps | Audit trail visible to the human resolving it |

**Polling vs WebSockets:** Real-time updates poll every 3s. WebSockets are more efficient but add infra complexity. For a facade, polling is the right tradeoff. Production would use WebSockets or SSE.

### Facade vs Production

| Facade | Production |
|--------|------------|
| setTimeout in browser | Real payer API calls (X12, REST) |
| SQLite | PostgreSQL + Redis |
| No queue | Redis ZADD/ZPOPMAX — atomic, no race condition |
| Promise.all in browser | asyncio.gather on worker nodes |
| No checkpointing | PostgresSaver — resume after server crash |
| No orchestration | LangGraph StateGraph |

---

## Production Architecture

```
Appointment booked
        ↓
POST /appointments → FastAPI
        ↓
Redis ZADD (priority scored, atomic)
        ↓
Worker: ZPOPMAX → no race conditions
        ↓
LangGraph StateGraph:
  Node 1: Identity (deterministic)
  Node 2: Eligibility (X12 270/271)
  Node 3+4: asyncio.gather(Prior Auth, Provider Match)
  Node 5: Denial Risk (XGBoost + LLM)
  Node 6: Final Clearance (rules engine)
        ↓
PostgresSaver checkpoint after every node
        ↓
CLEARED → billing handoff
Any node → interrupt() → Exception Queue
Human → Command(resume=...) → pipeline continues
```

---

## Key Production Decisions

### Why Redis for Priority Queue

500 appointments arrive simultaneously. Two workers both see APT-1001 as highest priority.
- **ZPOPMAX is atomic** — Worker 1 pops it, Worker 2 gets next.
- **No race condition.** No duplicate processing.
- **Fallback:** SQLite priority queue (prototype) works fine at <100/hr.

### Why PostgresSaver for Checkpointing

Pipeline pauses at Stage 3 for human review. Server restarts 6 hours later.
- **Without checkpointing** — state lost. Appointment lost.
- **With PostgresSaver** — resumes from exact node. Zero data loss. Automatic HIPAA audit trail.

### Why LangGraph over Custom State Machine

Built-in features matter:
- `interrupt()` → pause mid-pipeline
- `Command(resume=...)` → resume after restart
- Conditional edges → dynamic routing
- PostgresSaver → immutable audit trail

### Why Async for Agents

Payer APIs are I/O bound (1-20 seconds each).
- **Sequential:** 25+ seconds per appointment
- **Parallel Stage 3+4:** ~8 seconds
- **Improvement:** 3x faster

---

## Failure Handling

### Payer API Down

```
Retry 3x exponential backoff
  ↓
Fallback to cached eligibility snapshot
  ↓
Still failing → escalate with reason
               "Clearinghouse unavailable"
```

### Prior Auth PEND (Return in 2 Days)

```
interrupt() → Exception Queue
  ↓
Staff submits clinical notes → resolves in UI
  ↓
Pipeline resumes → Stage 3 COMPLETE
```

### Server Crash Mid-Pipeline

PostgresSaver has last checkpoint. Resume from last completed node. Zero data loss.

---

## Observability

| Layer | Tool | Purpose |
|---|---|---|
| Structured logs | structlog + Datadog | Every agent action queryable |
| Distributed tracing | LangSmith | Per-node latency, LLM token usage |
| Metrics | Prometheus + Grafana | Auto-approve rate, queue depth, SLA |
| Audit logs | Postgres immutable table | HIPAA §164.312(b), 7yr retention |
| Alerting | PagerDuty | Payer outages, SLA breaches |

### Key Metrics

```
auto_approve_rate        → target 85%
exception_queue_depth    → alert if > 50
payer_api_timeout_total  → alert if > 10 in 5 mins
pipeline_duration{STAT}  → alert if > 30s
```

---

## Scalability

| Volume | Architecture |
|---|---|
| <100/hr | SQLite (this prototype) |
| 100-10k/hr | Postgres + Redis + LangGraph Server |
| >10k/hr | Kafka + LangGraph workers on partitioned streams |

---

## HIPAA Compliance

- PHI sanitized before every LLM boundary
- Azure OpenAI / Bedrock with signed BAA
- Immutable audit log — INSERT only, never deleted
- ABAC on Exception Queue
- CMS-0057-F: 72hr urgent / 7-day routine PA SLAs

---

## Demo Scenarios

### 1. Happy Path

Start any Routine appointment, watch all 6 stages complete, card → CLEARED

### 2. Escalation

Wait for ESCALATE, go to Exception Queue, resolve with notes, watch pipeline resume from Stage 4

### 3. Priority Ordering

- STAT Oncology always first (score 8.28)
- Routine General always last (score 2.92)
- Sort by priority, denial risk, or wait time

---

## Bug Fixes Applied

✅ **Mixed Content Security** — API URL now uses environment variables (`VITE_API_URL`)  
✅ **HTTP Status Validation** — All fetch calls validate response before parsing  
✅ **Race Condition in Resolution** — `handleResolve` now awaits backend confirmation  
✅ **Improved Polling Logic** — Skips local state only when both frontend and backend agree on PROCESSING  
✅ **Error Visibility** — Sync errors now logged instead of silently failing  

---

## Tech Details

### Frontend
- **Framework:** React 19 + TanStack Router
- **Build:** Vite
- **Styling:** Tailwind CSS
- **Components:** shadcn/ui (Radix primitives)
- **State:** React hooks (useRef for engine snapshot, useState for appointments)

### Backend
- **Framework:** FastAPI
- **Database:** SQLite (easily migrated to Postgres)
- **CORS:** Restricted to known origins (Vercel + localhost)
- **Priority Calculation:** Recalculated on every read — seed age + elapsed minutes since created_at

### Engine
- **Workflow:** Sequential + parallel stages
- **State Management:** Immutable updates (functional patterns)
- **Async:** Promise.all for parallel stages
- **Logging:** Structured timestamps, kind (info/success/error)

---

## Getting Started

### Prerequisites
- Node.js 18+
- Python 3.9+
- npm or yarn

### Installation

```bash
# Clone the repo
git clone https://github.com/Satwik4409/med-route-helper
cd med-route-helper

# Frontend dependencies
npm install

# Backend dependencies (in iks-backend/)
cd iks-backend
pip install -r requirements.txt
cd ..
```

### Running Locally

**Terminal 1 — Frontend:**
```bash
npm run dev
# Opens http://localhost:5173
```

**Terminal 2 — Backend:**
```bash
cd iks-backend
python -m uvicorn main:app --reload --port 8000
# Runs on http://localhost:8000
```

### Environment Variables

Create `.env.local` in the project root (frontend):
```
VITE_API_URL=http://localhost:8000
```

For production Vercel deployment:
```
VITE_API_URL=https://med-route-helper.onrender.com
```

---

## License

MIT

---

## Contact & Feedback

Built as a prototype for agentic medical workflow systems. Questions? Reach out via GitHub Issues.

---

**Last Updated:** May 7, 2026
