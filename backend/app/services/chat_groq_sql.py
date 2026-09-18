import json
import os
import re
import ssl
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from typing import Any, Dict, List, Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.health_centre import HealthCentre
from app.models.user import User, UserRole
from app.services.chat_query import ChatQueryResult

try:
    from dotenv import dotenv_values
except Exception:  # pragma: no cover - python-dotenv is in requirements, this is defensive
    dotenv_values = None


ALLOWED_CHAT_TABLES = {
    "chat_health_centres",
    "chat_patients",
    "chat_patient_audit_logs",
    "chat_inventory_items",
    "chat_inventory_logs",
    "chat_beds",
    "chat_doctors",
    "chat_daily_qr_sessions",
    "chat_attendance_records",
}

BASE_TABLES = {
    "health_centres", "patients", "patient_audit_logs", "inventory_items",
    "inventory_logs", "beds", "doctors", "daily_qr_sessions", "attendance_records",
    "users", "refresh_tokens", "notifications", "reports", "resource_requests",
}

BANNED_SQL_TOKENS = {
    "insert", "update", "delete", "drop", "alter", "truncate", "create", "grant",
    "revoke", "copy", "call", "do", "execute", "prepare", "deallocate", "vacuum",
    "analyze", "set", "reset", "show", "merge", "replace", "attach", "detach",
    "information_schema", "pg_catalog", "pg_user", "pg_shadow", "pg_settings",
    "current_setting", "version", "dblink",
}


SCHEMA_OVERVIEW = """
Use only these read-only virtual tables. They are already scoped by the backend to the authorized PHC/hospital when required.

chat_health_centres:
- id, name, type, district, state, total_beds, available_beds, total_staff
- latitude, longitude, contact_number, email, medical_officer, phc_id, admin_email, admin_mobile, location, health_score, status
- Terms: PHC, facility, health centre, hospital, district, location.
- Meaning: one row is one healthcare facility. Use id as hospital_id when joining patient, inventory, bed, doctor, and attendance data.

chat_patients:
- id, hospital_id, patient_code, name, age, gender, contact, address, medical_history, status, admitted_at, discharged_at
- Terms: patient, Patient ID, ABHA ID, patient_code, footfall, visit, history.
- Footfall means count of patients by admitted_at date.
- Meaning: patient_code is the Patient ID / ABHA ID. hospital_id links the patient to a PHC.

chat_patient_audit_logs:
- id, patient_id, user_id, action, timestamp, details
- Terms: patient history, record viewed/edited/created.
- Meaning: audit timeline for actions against patient records.

chat_inventory_items:
- id, hospital_id, name, category, quantity, unit, price, min_threshold, expiry_date, batch_number, status
- Terms: medicines, medicine stock, inventory, pharmacy, dispensary, low stock, out of stock, restocking.
- Low stock means quantity <= min_threshold. Out of stock means quantity <= 0.
- Meaning: this is the live inventory/medicine stock table. "Inventory" means query this table. Match medicine names with ILIKE.

chat_inventory_logs:
- id, inventory_id, item_name, change_type, change_amount, reason, performed_by_user_id, timestamp
- Terms: medicine received by patient, billed medicine, dispensed medicine.
- Meaning: stock movement history. Join to chat_inventory_items through inventory_id when PHC or current stock context is needed.

chat_beds:
- id, hospital_id, bed_number, ward, bed_type, status, patient_id, admitted_at
- Terms: beds, available beds, occupied beds, ICU, ward.
- Meaning: one row is one bed. Available beds usually means status = 'Available'.

chat_doctors:
- id, hospital_id, name, specialization, phone, email, shift, user_id
- Terms: doctor, physician, staff doctor, Dr Sharma.
- Meaning: one row is one doctor assigned to a PHC.

chat_daily_qr_sessions:
- id, hospital_id, date, qr_token, is_active, created_at, updated_at
- Terms: attendance day/session.
- Meaning: one attendance session per PHC/date.

chat_attendance_records:
- id, doctor_id, session_id, doctor_name, hospital_id, session_date, timestamp, status, scanned_via
- Terms: doctor attendance, present doctors, absent doctors.
- A doctor is absent for a date if they are in chat_doctors but have no PRESENT attendance row for that date.
- Meaning: doctor attendance scan rows joined to their session and PHC.
"""


@dataclass
class GeneratedSql:
    sql: str
    intent: str = "live_database_query"
    explanation: str = ""
    params: Dict[str, Any] = field(default_factory=dict)


def _env_value(name: str, default: str = "") -> str:
    if name in os.environ:
        return os.environ[name]
    if dotenv_values:
        env_values = dotenv_values(".env")
        value = env_values.get(name)
        if value is not None:
            return str(value)
    return default


def _env_bool(name: str, default: bool = True) -> bool:
    value = _env_value(name, str(default)).strip().lower()
    return value not in {"0", "false", "no", "off"}


def groq_enabled() -> bool:
    return bool(_env_value("GROQ_API_KEY"))


def _groq_chat(messages: List[Dict[str, str]], temperature: float = 0.0) -> str:
    payload = {
        "model": _env_value("GROQ_MODEL", "llama-3.3-70b-versatile"),
        "messages": messages,
        "temperature": temperature,
    }
    req = urllib.request.Request(
        "https://api.groq.com/openai/v1/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {_env_value('GROQ_API_KEY')}",
            "Content-Type": "application/json",
            "User-Agent": "Aarogya-Health-Engine/1.0",
        },
        method="POST",
    )
    try:
        context = None if _env_bool("GROQ_SSL_VERIFY", True) else ssl._create_unverified_context()
        with urllib.request.urlopen(req, timeout=20, context=context) as response:
            data = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")[:300]
        raise RuntimeError(f"Groq request failed: {detail}") from exc
    return data["choices"][0]["message"]["content"]


def _json_from_llm(text_value: str) -> Dict[str, Any]:
    cleaned = text_value.strip()
    if cleaned.startswith("```json"):
        cleaned = cleaned[7:-3].strip()
    elif cleaned.startswith("```"):
        cleaned = cleaned[3:-3].strip()
    return json.loads(cleaned)


def _extract_terms(message: str) -> Dict[str, str]:
    filters: Dict[str, str] = {}
    today_pattern = re.search(r"\btoday\b", message, re.IGNORECASE)
    if today_pattern:
        filters["date_hint"] = "today"
    return filters


PHC_MATCH_STOP_WORDS = {
    "a", "an", "and", "are", "at", "availability", "available", "beds", "by",
    "count", "data", "doctor", "doctors", "for", "from", "get", "give", "how",
    "in", "inventory", "is", "many", "medicine", "medicines", "of", "out",
    "patient", "patients", "pharmacy", "please", "show", "stock", "the", "today",
    "total", "what", "whats", "which",
}


def _normalize_match_text(value: str) -> str:
    return " ".join(re.findall(r"[a-z0-9]+", value.lower()))


def _message_ngrams(message: str) -> List[str]:
    tokens = [
        token for token in re.findall(r"[a-z0-9]+", message.lower())
        if token not in PHC_MATCH_STOP_WORDS
    ]
    values = set()
    for size in range(1, min(6, len(tokens)) + 1):
        for index in range(0, len(tokens) - size + 1):
            values.add(" ".join(tokens[index:index + size]))
    return list(values) or [_normalize_match_text(message)]


def _centre_score(message_terms: List[str], centre: HealthCentre) -> float:
    searchable = [
        centre.name or "",
        centre.phc_id or "",
        centre.district or "",
        centre.location or "",
    ]
    best = 0.0
    for raw_field in searchable:
        field = _normalize_match_text(raw_field)
        if not field:
            continue
        for term in message_terms:
            if not term:
                continue
            score = SequenceMatcher(None, field, term).ratio()
            if field in term or term in field:
                score = max(score, 0.88)
            field_tokens = set(field.split())
            term_tokens = set(term.split())
            if field_tokens:
                overlap = len(field_tokens & term_tokens) / len(field_tokens)
                score = max(score, overlap)
            best = max(best, score)
    return best


def _health_centre_matches(db: Session, message: str, limit: int = 5) -> List[Dict[str, Any]]:
    terms = _message_ngrams(message)
    centres = db.query(HealthCentre).limit(1000).all()
    scored = []
    for centre in centres:
        score = _centre_score(terms, centre)
        if score >= 0.55:
            scored.append((score, centre))
    scored.sort(key=lambda item: (-item[0], item[1].name.lower()))
    return [
        {
            "id": centre.id,
            "name": centre.name,
            "phc_id": centre.phc_id,
            "district": centre.district,
            "location": centre.location,
            "score": round(score, 3),
        }
        for score, centre in scored[:limit]
    ]


def _current_health_centre(db: Session, hospital_id: Optional[int]) -> Optional[HealthCentre]:
    if not hospital_id:
        return None
    return db.query(HealthCentre).filter(HealthCentre.id == hospital_id).first()


def _scope_context(db: Session, message: str, current_user: User, hospital_id: Optional[int]) -> str:
    if current_user.role == UserRole.DISTRICT_ADMIN:
        matches = _health_centre_matches(db, message)
        match_text = json.dumps(matches, default=str) if matches else "[]"
        selected_centre = _current_health_centre(db, hospital_id)
        selected_payload = {
            "id": selected_centre.id,
            "name": selected_centre.name,
            "phc_id": selected_centre.phc_id,
            "district": selected_centre.district,
            "location": selected_centre.location,
        } if selected_centre else None
        selected_text = (
            f"Selected PHC filter from request: {json.dumps(selected_payload, default=str)}"
            if selected_payload
            else "No selected PHC filter from request."
        )
        return f"""
Role: DISTRICT_ADMIN.
Access scope: {"one selected health centre" if hospital_id else "all health centres"} in the scoped virtual tables.
{selected_text}
PHC name mapping: compare facility names, PHC IDs, districts, and locations from chat_health_centres.
Closest PHC matches detected from this query: {match_text}
If the user names a PHC/facility and a close match is listed, filter with that matched chat_health_centres.id.
If the user asks district-wide/all-PHC data, do not add a single-PHC filter.
"""

    assigned_hospital_id = current_user.hospital_id
    if not assigned_hospital_id:
        return "Access scope: this user has no assigned PHC/hospital and must not receive PHC-scoped data."

    centre = _current_health_centre(db, assigned_hospital_id)
    centre_payload = {
        "id": assigned_hospital_id,
        "name": centre.name if centre else None,
        "phc_id": centre.phc_id if centre else None,
        "district": centre.district if centre else None,
        "location": centre.location if centre else None,
    }
    return f"""
Role: {current_user.role.value}.
Access scope: exactly one assigned PHC/hospital. The backend CTEs are restricted to hospital_id={assigned_hospital_id}.
Assigned PHC context: {json.dumps(centre_payload, default=str)}
If the user names another PHC, do not attempt cross-PHC access; answer only from this assigned PHC's scoped rows.
"""

def _clean_explanation(explanation: str) -> str:
    lines = explanation.split('\n')
    cleaned = []
    for line in lines:
        s = line.strip()
        if '|' in s and s.count('|') >= 2:
            continue
        cleaned.append(line)
    return '\n'.join(cleaned).strip()


def generate_sql_from_groq(db: Session, message: str, current_user: User, hospital_id: Optional[int]) -> GeneratedSql:
    scope_text = (
        f"Hospital scope is hospital_id={hospital_id or current_user.hospital_id}."
        if (hospital_id or current_user.hospital_id)
        else "District scope: all health centres may be queried."
    )
    detailed_scope = _scope_context(db, message, current_user, hospital_id)
    prompt = f"""
You convert natural-language healthcare operations questions into one safe PostgreSQL SELECT query.

Rules:
- Return ONLY valid JSON: {{"intent":"short_intent", "sql":"SELECT ...", "explanation":"short explanation"}}
- Keep the explanation brief (1-2 sentences). Do NOT include markdown tables, bullet points, or raw data in the explanation. The frontend will render the data tables automatically.
- SQL must be a single read-only SELECT query.
- Do not include semicolons, comments, DDL, DML, stored procedure calls, temp tables, functions with side effects, or multiple statements.
- Use only the virtual tables listed below. Never use base table names such as patients or inventory_items.
- Do not select secrets, tokens, password hashes, refresh tokens, or database credentials.
- Prefer aggregate summaries for broad questions.
- Include LIMIT 50 unless the query returns a single aggregate row.
- For date words like today/yesterday, calculate dates using India local time: (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date.
- For PHC names, match case-insensitively with ILIKE.
- For medicine/inventory names, match case-insensitively with ILIKE against chat_inventory_items.name.
- To answer inventory by PHC, join chat_inventory_items to chat_health_centres on chat_health_centres.id = chat_inventory_items.hospital_id.
- To answer attendance by PHC, join doctors/attendance records to chat_health_centres through hospital_id.

Authorization context:
{scope_text}
{detailed_scope}

Available schema and term overview:
{SCHEMA_OVERVIEW}

User question:
{message}
"""
    content = _groq_chat([
        {"role": "system", "content": "You are a PostgreSQL query planner. You output JSON only."},
        {"role": "user", "content": prompt},
    ])
    data = _json_from_llm(content)
    return GeneratedSql(
        sql=str(data.get("sql", "")).strip(),
        intent=str(data.get("intent", "live_database_query")).strip() or "live_database_query",
        explanation=_clean_explanation(str(data.get("explanation", ""))),
        params=_extract_terms(message),
    )


def validate_generated_sql(sql: str) -> str:
    normalized = sql.strip()
    lowered = normalized.lower()
    if not normalized:
        raise ValueError("No SQL was generated.")
    if ";" in normalized or "--" in normalized or "/*" in normalized or "*/" in normalized:
        raise ValueError("Only one comment-free SELECT statement is allowed.")
    if not lowered.startswith("select "):
        raise ValueError("Only SELECT statements are allowed.")
    tokens = set(re.findall(r"\b[a-z_][a-z0-9_]*\b", lowered))
    if tokens & BANNED_SQL_TOKENS:
        raise ValueError("The generated SQL used a disallowed operation.")
    if tokens & BASE_TABLES:
        raise ValueError("The generated SQL referenced base tables instead of scoped chat tables.")

    referenced_chat_tables = tokens & ALLOWED_CHAT_TABLES
    if not referenced_chat_tables:
        raise ValueError("The generated SQL did not reference an allowed chat table.")

    disallowed_chat_refs = {token for token in tokens if token.startswith("chat_") and token not in ALLOWED_CHAT_TABLES}
    if disallowed_chat_refs:
        raise ValueError("The generated SQL referenced an unknown chat table.")

    if " limit " not in lowered and not re.search(r"\bcount\s*\(|\bsum\s*\(|\bavg\s*\(|\bmin\s*\(|\bmax\s*\(", lowered):
        normalized = f"{normalized} LIMIT 50"
    return normalized


def _scope_for_user(current_user: User, hospital_id: Optional[int]) -> tuple[int, Optional[int], Optional[int]]:
    if current_user.role == UserRole.DISTRICT_ADMIN or current_user.role == UserRole.NATION_ADMIN:
        if hospital_id:
            return 0, hospital_id, current_user.nation_id
        return 1, None, current_user.nation_id
    if not current_user.hospital_id:
        raise PermissionError("You are not assigned to any health centre.")
    return 0, current_user.hospital_id, current_user.nation_id


def _scoped_sql(sql: str) -> str:
    return f"""
WITH
chat_health_centres AS (
    SELECT id, name, type, district, state, total_beds, available_beds, total_staff,
           latitude, longitude, contact_number, email, medical_officer, phc_id,
           admin_email, admin_mobile, location, health_score, status, nation_id
    FROM health_centres
    WHERE (:scope_all = 1 OR id = :hospital_id)
      AND (:nation_id IS NULL OR nation_id = :nation_id)
),
chat_patients AS (
    SELECT id, hospital_id, patient_code, name, age, gender, contact, address,
           medical_history, status, admitted_at, discharged_at
    FROM patients
    WHERE (:scope_all = 1 OR hospital_id = :hospital_id)
      AND hospital_id IN (SELECT id FROM chat_health_centres)
),
chat_patient_audit_logs AS (
    SELECT l.id, l.patient_id, l.user_id, l.action, l.timestamp, l.details
    FROM patient_audit_logs l
    JOIN chat_patients p ON p.id = l.patient_id
),
chat_inventory_items AS (
    SELECT id, hospital_id, name, category, quantity, unit, price, min_threshold,
           expiry_date, batch_number, status
    FROM inventory_items
    WHERE (:scope_all = 1 OR hospital_id = :hospital_id)
      AND hospital_id IN (SELECT id FROM chat_health_centres)
),
chat_inventory_logs AS (
    SELECT l.id, l.inventory_id, i.name AS item_name, l.change_type, l.change_amount,
           l.reason, l.performed_by_user_id, l.timestamp
    FROM inventory_logs l
    JOIN chat_inventory_items i ON i.id = l.inventory_id
),
chat_beds AS (
    SELECT id, hospital_id, bed_number, ward, bed_type, status, patient_id, admitted_at
    FROM beds
    WHERE (:scope_all = 1 OR hospital_id = :hospital_id)
      AND hospital_id IN (SELECT id FROM chat_health_centres)
),
chat_doctors AS (
    SELECT id, hospital_id, name, specialization, phone, email, shift, user_id
    FROM doctors
    WHERE (:scope_all = 1 OR hospital_id = :hospital_id)
      AND hospital_id IN (SELECT id FROM chat_health_centres)
),
chat_daily_qr_sessions AS (
    SELECT id, hospital_id, date, qr_token, is_active, created_at, updated_at
    FROM daily_qr_sessions
    WHERE (:scope_all = 1 OR hospital_id = :hospital_id)
      AND hospital_id IN (SELECT id FROM chat_health_centres)
),
chat_attendance_records AS (
    SELECT r.id, r.doctor_id, r.session_id, d.name AS doctor_name, d.hospital_id,
           s.date AS session_date, r.timestamp, r.status, r.scanned_via
    FROM attendance_records r
    JOIN chat_doctors d ON d.id = r.doctor_id
    JOIN chat_daily_qr_sessions s ON s.id = r.session_id
)
{sql}
"""


def execute_generated_sql(
    db: Session,
    generated: GeneratedSql,
    current_user: User,
    hospital_id: Optional[int],
) -> ChatQueryResult:
    safe_sql = validate_generated_sql(generated.sql)
    scope_all, scoped_hospital_id, nation_id = _scope_for_user(current_user, hospital_id)

    if db.bind and db.bind.dialect.name == "postgresql":
        db.execute(text("SET LOCAL statement_timeout = '5s'"))
        db.execute(text("SET LOCAL transaction_read_only = on"))

    result = db.execute(
        text(_scoped_sql(safe_sql)),
        {"scope_all": scope_all, "hospital_id": scoped_hospital_id, "nation_id": nation_id},
    )
    rows = [dict(row._mapping) for row in result.fetchmany(100)]
    if db.bind and db.bind.dialect.name == "postgresql":
        db.rollback()
    message = generated.explanation or "Live database results."
    pretty_message = prettify_result_with_groq(generated.intent, message, rows)
    return ChatQueryResult(
        success=True,
        intent=generated.intent or "live_database_query",
        message=pretty_message,
        data=rows,
        summary={"rows": len(rows), "source": "Database"},
    )


def prettify_result_with_groq(intent: str, explanation: str, rows: List[Dict[str, Any]]) -> str:
    if not groq_enabled() or not rows:
        return explanation if rows else "No matching live database records were found."
    sample_rows = rows[:20]
    prompt = f"""
Write a concise healthcare-operations answer for a dashboard user.
Do not mention SQL. Do not expose raw JSON. Use the data faithfully.
CRITICAL RULE: DO NOT INCLUDE A MARKDOWN TABLE OR ANY TABULAR DATA FORMATTING.
The frontend UI will automatically render the data rows in a native HTML table below your response.
Your job is ONLY to provide a 1-2 sentence conversational summary or insight about the data.
Intent: {intent}
Planner explanation: {explanation}
Rows: {json.dumps(sample_rows, default=str)}
"""
    try:
        content = _groq_chat([
            {"role": "system", "content": "You format database results for a healthcare operations dashboard."},
            {"role": "user", "content": prompt},
        ], temperature=0.2)
        return _clean_explanation(content.strip()[:1500])
    except Exception:
        return explanation
