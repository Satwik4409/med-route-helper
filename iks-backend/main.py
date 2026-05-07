from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import sqlite3
import json
import math
import uuid
from datetime import datetime

app = FastAPI(title="IKS Health - Agentic Workflow API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_PATH = "iks.db"

URGENCY_SCORE = {"STAT": 10, "Urgent": 6, "Routine": 3}

ESCALATION_REASONS = {
    "Patient Identity": "Identity match confidence below threshold",
    "Insurance Eligibility": "Coverage termination detected",
    "Prior Authorization": "Auth request returned PEND status",
    "Provider Matching": "No in-network slots available",
    "Denial Risk Scoring": "High denial probability detected",
    "Final Clearance": "Billing rules conflict identified",
}

WORKFLOW_CONFIG = [
    {"id": "identity",       "name": "Patient Identity",      "parallel": False},
    {"id": "eligibility",    "name": "Insurance Eligibility", "parallel": False},
    {"id": "prior_auth",     "name": "Prior Authorization",   "parallel": True},
    {"id": "provider_match", "name": "Provider Matching",     "parallel": True},
    {"id": "denial_risk",    "name": "Denial Risk Scoring",   "parallel": False},
    {"id": "clearance",      "name": "Final Clearance",       "parallel": False},
]

MOCK_APPOINTMENTS = [
    {"id": "APT-1001", "patient_name": "Emily Davis",    "specialty": "Oncology",    "urgency": "STAT",    "denial_risk": 0.91, "age_in_queue": 15},
    {"id": "APT-1000", "patient_name": "Sarah Johnson",  "specialty": "Oncology",    "urgency": "STAT",    "denial_risk": 0.82, "age_in_queue": 45},
    {"id": "APT-1003", "patient_name": "Lisa Anderson",  "specialty": "Cardiology",  "urgency": "Urgent",  "denial_risk": 0.73, "age_in_queue": 50},
    {"id": "APT-1002", "patient_name": "Robert Chen",    "specialty": "Cardiology",  "urgency": "Urgent",  "denial_risk": 0.65, "age_in_queue": 30},
    {"id": "APT-1004", "patient_name": "James Wilson",   "specialty": "Orthopedics", "urgency": "Urgent",  "denial_risk": 0.54, "age_in_queue": 60},
    {"id": "APT-1005", "patient_name": "Maria Garcia",   "specialty": "GI",          "urgency": "Routine", "denial_risk": 0.21, "age_in_queue": 120},
    {"id": "APT-1006", "patient_name": "David Martinez", "specialty": "GI",          "urgency": "Routine", "denial_risk": 0.38, "age_in_queue": 90},
    {"id": "APT-1007", "patient_name": "Michael Brown",  "specialty": "General",     "urgency": "Routine", "denial_risk": 0.12, "age_in_queue": 200},
]


def calc_priority_score(urgency, denial_risk, age_in_queue):
    u = URGENCY_SCORE.get(urgency, 3)
    return round(u * 0.5 + denial_risk * 10 * 0.3 + math.log(1 + age_in_queue) * 0.2, 2)


def calc_priority_label(score):
    if score >= 7:
        return "HIGH"
    if score >= 4:
        return "MEDIUM"
    return "LOW"


def make_stages():
    return [
        {**s, "status": "PENDING", "escalation_reason": None, "duration_ms": None}
        for s in WORKFLOW_CONFIG
    ]


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    db = get_db()
    db.execute("""
        CREATE TABLE IF NOT EXISTS appointments (
            id TEXT PRIMARY KEY,
            patient_name TEXT NOT NULL,
            specialty TEXT NOT NULL,
            urgency TEXT NOT NULL,
            denial_risk REAL NOT NULL,
            age_in_queue INTEGER NOT NULL,
            priority_score REAL NOT NULL,
            priority_label TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'NOT_STARTED',
            stages TEXT NOT NULL,
            agent_log TEXT NOT NULL DEFAULT '[]',
            resolved_by TEXT,
            resolved_at TEXT,
            created_at TEXT NOT NULL
        )
    """)
    db.commit()

    count = db.execute("SELECT COUNT(*) FROM appointments").fetchone()[0]
    if count == 0:
        for a in MOCK_APPOINTMENTS:
            score = calc_priority_score(a["urgency"], a["denial_risk"], a["age_in_queue"])
            label = calc_priority_label(score)
            stages = make_stages()
            db.execute("""
                INSERT INTO appointments
                (id, patient_name, specialty, urgency, denial_risk, age_in_queue,
                 priority_score, priority_label, status, stages, agent_log, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'NOT_STARTED', ?, '[]', ?)
            """, (
                a["id"], a["patient_name"], a["specialty"], a["urgency"],
                a["denial_risk"], a["age_in_queue"], score, label,
                json.dumps(stages), datetime.utcnow().isoformat()
            ))
        db.commit()
    db.close()


init_db()


def row_to_dict(row):
    d = dict(row)
    d["stages"] = json.loads(d["stages"])
    d["agent_log"] = json.loads(d["agent_log"])
    return d


# ── Models ────────────────────────────────────────────────

class UpdateAppointmentRequest(BaseModel):
    status: Optional[str] = None
    stages: Optional[list] = None
    agent_log: Optional[list] = None


class ResolveRequest(BaseModel):
    notes: str
    resolved_by: Optional[str] = "Concierge Staff"


# ── Routes ────────────────────────────────────────────────

@app.get("/")
def health():
    return {"status": "ok", "service": "IKS Health Agentic Workflow API"}


@app.get("/workflow-config")
def get_workflow_config():
    return WORKFLOW_CONFIG


@app.get("/appointments")
def get_appointments(
    urgency:   Optional[str] = None,
    specialty: Optional[str] = None,
    priority:  Optional[str] = None,
    status:    Optional[str] = None,
    sort_by:   Optional[str] = "priority_score",
):
    db = get_db()
    query = "SELECT * FROM appointments WHERE 1=1"
    params = []

    if urgency and urgency != "All":
        query += " AND urgency = ?";   params.append(urgency)
    if specialty and specialty != "All":
        query += " AND specialty = ?"; params.append(specialty)
    if priority and priority != "All":
        query += " AND priority_label = ?"; params.append(priority)
    if status and status != "All":
        query += " AND status = ?";    params.append(status.upper().replace(" ", "_"))

    sort_map = {
        "priority_score": "priority_score DESC",
        "urgency":        "CASE urgency WHEN 'STAT' THEN 1 WHEN 'Urgent' THEN 2 ELSE 3 END",
        "denial_risk":    "denial_risk DESC",
        "wait_time":      "age_in_queue DESC",
    }
    query += f" ORDER BY {sort_map.get(sort_by, 'priority_score DESC')}"

    rows = db.execute(query, params).fetchall()
    db.close()
    return [row_to_dict(r) for r in rows]


@app.get("/exceptions")
def get_exceptions():
    db = get_db()
    rows = db.execute(
        "SELECT * FROM appointments WHERE status = 'ESCALATED' ORDER BY priority_score DESC"
    ).fetchall()
    db.close()
    return [row_to_dict(r) for r in rows]


@app.get("/stats")
def get_stats():
    db = get_db()
    rows = db.execute(
        "SELECT status, COUNT(*) as count FROM appointments GROUP BY status"
    ).fetchall()
    db.close()
    stats = {r["status"]: r["count"] for r in rows}
    return {
        "total":       sum(stats.values()),
        "not_started": stats.get("NOT_STARTED", 0),
        "processing":  stats.get("PROCESSING",  0),
        "escalated":   stats.get("ESCALATED",   0),
        "cleared":     stats.get("CLEARED",     0),
    }


# reset-all must be defined before /{apt_id} routes so FastAPI
# matches the static path before treating "reset-all" as an id.
@app.post("/appointments/reset-all")
def reset_all():
    db = get_db()
    stages = make_stages()
    db.execute(
        "UPDATE appointments SET status='NOT_STARTED', stages=?, agent_log='[]', "
        "resolved_by=NULL, resolved_at=NULL",
        (json.dumps(stages),),
    )
    db.commit()
    db.close()
    return {"ok": True}


@app.get("/appointments/{apt_id}")
def get_appointment(apt_id: str):
    db = get_db()
    row = db.execute("SELECT * FROM appointments WHERE id = ?", (apt_id,)).fetchone()
    db.close()
    if not row:
        raise HTTPException(status_code=404, detail="Appointment not found")
    return row_to_dict(row)


@app.patch("/appointments/{apt_id}")
def update_appointment(apt_id: str, data: UpdateAppointmentRequest):
    db = get_db()
    row = db.execute("SELECT * FROM appointments WHERE id = ?", (apt_id,)).fetchone()
    if not row:
        db.close()
        raise HTTPException(status_code=404, detail="Appointment not found")

    updates = {}
    if data.status is not None:
        updates["status"] = data.status.upper().replace(" ", "_")
    if data.stages is not None:
        updates["stages"] = json.dumps(data.stages)
    if data.agent_log is not None:
        updates["agent_log"] = json.dumps(data.agent_log)

    if updates:
        set_clause = ", ".join(f"{k} = ?" for k in updates)
        db.execute(
            f"UPDATE appointments SET {set_clause} WHERE id = ?",
            list(updates.values()) + [apt_id],
        )
        db.commit()

    row = db.execute("SELECT * FROM appointments WHERE id = ?", (apt_id,)).fetchone()
    db.close()
    return row_to_dict(row)


@app.post("/appointments/{apt_id}/resolve")
def resolve_appointment(apt_id: str, data: ResolveRequest):
    db = get_db()
    row = db.execute("SELECT * FROM appointments WHERE id = ?", (apt_id,)).fetchone()
    if not row:
        db.close()
        raise HTTPException(status_code=404, detail="Appointment not found")

    apt = row_to_dict(row)
    stages = apt["stages"]
    agent_log = apt["agent_log"]

    # Mark the escalated stage complete server-side
    for stage in stages:
        if stage["status"] == "ESCALATE":
            stage["status"] = "COMPLETE"
            stage["escalation_reason"] = None
            break

    agent_log.append(
        f"{datetime.now().strftime('%I:%M:%S %p')} — Human resolved by {data.resolved_by}: {data.notes}"
    )

    db.execute(
        """UPDATE appointments
           SET status='PROCESSING', stages=?, agent_log=?, resolved_by=?, resolved_at=?
           WHERE id=?""",
        (json.dumps(stages), json.dumps(agent_log),
         data.resolved_by, datetime.utcnow().isoformat(), apt_id),
    )
    db.commit()
    row = db.execute("SELECT * FROM appointments WHERE id = ?", (apt_id,)).fetchone()
    db.close()
    return row_to_dict(row)


@app.post("/appointments/{apt_id}/reset")
def reset_appointment(apt_id: str):
    db = get_db()
    stages = make_stages()
    db.execute(
        "UPDATE appointments SET status='NOT_STARTED', stages=?, agent_log='[]', "
        "resolved_by=NULL, resolved_at=NULL WHERE id=?",
        (json.dumps(stages), apt_id),
    )
    db.commit()
    db.close()
    return {"ok": True}
