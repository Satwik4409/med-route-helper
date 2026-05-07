# IKS Health — Agentic Workflow Management System

## Links
- **Live Demo:** https://med-route-helper.vercel.app
- **API / Swagger Docs:** https://med-route-helper.onrender.com/docs
- **GitHub:** https://github.com/Satwik4409/med-route-helper

> Note: Backend is on Render's free tier — first load may take
> 30–60 seconds to wake up. Everything runs normally after that.

## Screenshots (Local Frontend)

Below are screenshots from the local frontend. I can add the actual PNG files into `public/screenshots/` if you confirm — for now the README includes the embedded placeholders.

<img width="1405" height="942" alt="image" src="https://github.com/user-attachments/assets/025692b6-4744-4032-ba3a-10065af6fc27" />

<img width="1378" height="948" alt="image" src="https://github.com/user-attachments/assets/e7bc1205-8f86-4e11-b62a-bd5841cd4fb4" />

<img width="1422" height="907" alt="image" src="https://github.com/user-attachments/assets/4a5582c7-f8e1-4ac0-b3e4-908612176329" />




---

## What Was Built

A full-stack prototype simulating an AI agent pipeline for medical appointment processing.

**Stack:** React 18 + Vite + Tailwind · FastAPI · SQLite

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

**Parallel Execution:** Stages 3+4 run simultaneously — independent after Stage 2.

---

## Priority Scoring

```
score = urgency(0.5) + denial_risk×10(0.3) + log(1+wait)(0.2)
```

- **Urgency Weights:** STAT=10 · Urgent=6 · Routine=3
- **Priority Labels:** HIGH ≥7 · MEDIUM ≥4 · LOW <4

**Design Rationale:** Log scale on wait time prevents aging from dominating urgent cases. A 200-minute-old routine appointment gets ~0.4 boost, while a 15-minute STAT stays top priority.

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

## Facade Design Decisions

| Decision | Choice | Reason |
|---|---|---|
| Agent execution | Frontend mock (setTimeout) | Demo context, no infra needed |
| Database | SQLite | Zero config, identical schema to Postgres |
| Parallel stages | Promise.all | Mirrors production asyncio.gather |
| Resume behavior | Next stage after escalated | Cleaner demo, shows HITL correctly |
| Parallel escalation | Both stop | Can't score denial risk with incomplete auth |
| State sync | PATCH on every stage | Backend always reflects real state |

**Why These Choices:**
- **Frontend mocks:** Production uses actual APIs (X12, payer gateways). Frontend mocks simulate 1-2s latency with 15% escalation rate.
- **SQLite → Postgres:** Schema is identical. Migration requires only connection string change + `alembic upgrade head`.
- **Promise.all:** In production, `asyncio.gather()` on worker nodes. Same semantics.
- **Resume from next stage:** If Stage 3 escalated, Stage 4 already ran (parallel). Resume at Stage 5, not Stage 3.

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



<p align="center">
        <img src="https://github.com/user-attachments/assets/025692b6-4744-4032-ba3a-10065af6fc27" alt="Appointment Queue" style="max-width:100%;height:auto" />
</p>

<p align="center">
        <img src="https://github.com/user-attachments/assets/e7bc1205-8f86-4e11-b62a-bd5841cd4fb4" alt="Pipeline Modal" style="max-width:100%;height:auto" />
</p>

<p align="center">
        <img src="https://github.com/user-attachments/assets/4a5582c7-f8e1-4ac0-b3e4-908612176329" alt="Exception Queue" style="max-width:100%;height:auto" />
</p>


## Bug Fixes Applied

✅ **Mixed Content Security** — API URL now uses environment variables (`VITE_API_URL`)  
✅ **HTTP Status Validation** — All fetch calls validate response before parsing  
✅ **Race Condition in Resolution** — `handleResolve` now awaits backend confirmation  
✅ **Improved Polling Logic** — Skips local state only when both frontend and backend agree on PROCESSING  
✅ **Error Visibility** — Sync errors now logged instead of silently failing  

---

## Tech Details

### Frontend
- **Framework:** React 18 + TanStack Router
- **Build:** Vite
- **Styling:** Tailwind CSS
- **Components:** shadcn/ui (Radix primitives)
- **State:** React hooks (useRef for engine snapshot, useState for appointments)

### Backend
- **Framework:** FastAPI
- **Database:** SQLite (easily migrated to Postgres)
- **CORS:** Enabled for all origins (demo only)
- **Priority Calculation:** Real-time score on every fetch

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
VITE_API_URL=https://your-api.example.com
```

---

## License

MIT

---

## Contact & Feedback

Built as a prototype for agentic medical workflow systems. Questions? Reach out via GitHub Issues.

---

**Last Updated:** May 7, 2026
