from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
import os

from app.api.dependencies import get_current_user
from app.core.rate_limit import limiter
from app.db.database import get_db
from app.models.user import User, UserRole
from app.schemas.chat import ChatRequest, ChatResponse
from app.services.chat_groq_sql import execute_generated_sql, generate_sql_from_groq, groq_enabled
from app.services.chat_nlp import parse_chat_intent
from app.services.chat_pdf import create_chat_report, get_report_from_token
from app.services.chat_query import run_controlled_chat_query


router = APIRouter()


CHATBOT_ALLOWED_ROLES = {
    UserRole.DISTRICT_ADMIN,
    UserRole.NATION_ADMIN,
    UserRole.RECEPTIONIST,
    UserRole.DOCTOR,
    UserRole.MEDICAL_OFFICER,
    UserRole.DEVELOPER,
}


def _ensure_chatbot_access(current_user: User) -> None:
    allowed_str = {r.value if hasattr(r, 'value') else str(r) for r in CHATBOT_ALLOWED_ROLES}
    user_role_str = current_user.role.value if hasattr(current_user.role, 'value') else str(current_user.role)
    if user_role_str not in allowed_str:
        raise HTTPException(status_code=403, detail=f"Chatbot access is not enabled for your role. (Got: {user_role_str})")


def _effective_chat_hospital_id(current_user: User, requested_hospital_id: int | None, scope_all: bool) -> int | None:
    if current_user.role == UserRole.DISTRICT_ADMIN and scope_all:
        return None
    if current_user.role != UserRole.DISTRICT_ADMIN:
        return current_user.hospital_id
    return requested_hospital_id


@router.post("", response_model=ChatResponse)
@limiter.limit("20/minute")
def chat(
    request: Request,
    chat_request: ChatRequest,
    hospital_id: int | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_chatbot_access(current_user)
    message = chat_request.message.strip()
    if not message:
        return ChatResponse(
            success=False,
            intent="unsupported",
            message="Please enter a question about patients, medicines, beds, or doctor attendance.",
        )

    try:
        effective_hospital_id = _effective_chat_hospital_id(current_user, hospital_id, chat_request.scope_all)
        if groq_enabled():
            generated = generate_sql_from_groq(db, message, current_user, effective_hospital_id)
            result = execute_generated_sql(db, generated, current_user, effective_hospital_id)
        else:
            parsed = parse_chat_intent(message, chat_request.context)
            parsed.filters["raw_message"] = message.lower()
            result = run_controlled_chat_query(db, parsed, current_user, effective_hospital_id)
        report_token = None
        try:
            report_token = create_chat_report(db, current_user, message, result, effective_hospital_id)
        except Exception:
            report_token = None
        return ChatResponse(
            success=result.success,
            intent=result.intent,
            message=result.message,
            data=result.data,
            summary=result.summary,
            pdf_available=bool(report_token),
            report_id=report_token,
            context=result.context,
        )
    except HTTPException:
        raise
    except PermissionError as exc:
        return ChatResponse(
            success=False,
            intent="access_denied",
            message=str(exc),
        )
    except ValueError as exc:
        return ChatResponse(
            success=False,
            intent="unsupported",
            message=f"I could not safely map that request to a read-only database query: {str(exc)}",
        )
    except RuntimeError:
        return ChatResponse(
            success=False,
            intent="ai_planner_unavailable",
            message="The AI query planner is currently unavailable. Please verify the Groq API key, model, and network/TLS settings.",
        )
    except Exception:
        return ChatResponse(
            success=False,
            intent="unsupported",
            message="I could not safely process that request. Please try a patient, medicine, bed, or attendance question.",
        )


@router.get("/reports/{report_token}/download")
def download_chat_report(
    report_token: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_chatbot_access(current_user)
    try:
        report = get_report_from_token(db, report_token, current_user)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    if not report.pdf_url or not os.path.exists(report.pdf_url):
        raise HTTPException(status_code=404, detail="PDF file missing on server")

    return FileResponse(
        path=report.pdf_url,
        filename=os.path.basename(report.pdf_url),
        media_type="application/pdf",
    )
