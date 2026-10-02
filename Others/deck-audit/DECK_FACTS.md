# Aarogya Presentation Audit Facts

## 1.1 Inventory of the system

### Directory Tree & Modules
- `backend/`: FastAPI application.
  - `app/api/routes`: REST controllers (`auth`, `users`, `phc`, `patients`, `beds`, `inventory`, `attendance`, `district`, `analytics`, `translate`, `chat`, `ml`, `forecast`, `federation`, `redistribution`, `resilience`, `notification`).
  - `app/models`: SQLAlchemy ORM (attendance, bed, district, federation, forecast, health_centre, inventory, nation, notification, patient, report, user).
  - `app/services`: Core logic (gemini, chat_nlp, chat_groq_sql, chat_pdf, email, forecasting, health_score, pdf_generator, redistribution).
  - `app/core`: Config, security (JWT, bcrypt), scheduler (APScheduler), rate limiter (slowapi).
  - `federation-aggregator/`: Standalone FastAPI for FedAvg.
- `frontend/`: Next.js 14 App Router application.
  - `src/app`: Pages (attendance, analytics, beds, district-admin, federation, forecasting, health-centre, inventory, login, manage-roles, notifications, patients, phc, redistribution, reports, ai-audit).
  - `src/components`: UI components (layout, attendance, patients, inventory, beds, chat, map, shadcn ui).
  - `src/lib`: `api.ts`, `permissions.ts`.

### Database Tables (PostgreSQL)
- `users`: id, username, email, hashed_password, role, hospital_id, nation_id, created_at. [path:backend/app/models/user.py:18-38]
- `refresh_tokens`: JWT refresh tokens. [path:backend/app/models/user.py:40-49]
- `health_centres`: PHCs/CHCs with location (latitude, longitude) and capacity. [path:backend/app/models/health_centre.py]
- `patients`: Demographics, `patient_code` (unique), status (Admitted/Discharged/Outpatient). [path:backend/app/models/patient.py:6-32]
- `patient_audit_logs`: Action timeline (VIEW/EDIT/CREATE). [path:backend/app/models/patient.py:35-45]
- `inventory_items`: Stock records, thresholds. [path:backend/app/models/inventory.py:6-26]
- `inventory_logs`: Stock movement (RESTOCK/DISPENSE/EXPIRED) linked to user/patient. [path:backend/app/models/inventory.py:29-42]
- `forecast_cache`: Precomputed ML demand. [path:backend/app/models/inventory.py:44-55]
- `daily_qr_sessions`: Daily attendance tokens and GPS device center. [path:backend/app/models/attendance.py:6-21]
- `attendance_records`: User check-in timestamps and status. [path:backend/app/models/attendance.py:23-40]
- `random_attendance_checks`: Re-verification windows for doctors. [path:backend/app/models/attendance.py:42-53]
- `beds`: Bed tracking, status, patient assignment. [path:backend/app/models/bed.py:6-22]
- `resource_requests`: Medicine transfers between PHCs. [path:backend/app/models/district.py:19-35]
- `districts` & `nations`: Logical grouping. [path:backend/app/models/district.py:6-17]
- `federated_model_versions` & `aggregator_local_updates` & `aggregator_global_models`: FedAvg data. [path:backend/app/models/federation.py]
- Database engine: PostgreSQL (Neon recommended per README, psycopg2-binary/asyncpg installed).

### Services
- **Gemini**: `gemini-2.5-flash` via `google-genai` for inventory insights and analytics summaries. No fallback model exists. [path:backend/app/services/gemini_service.py]
- **Forecasting**: XGBoost (mocked via Ridge regression in `forecasting_service.py` currently, but artifacts `.pkl` in `ml_models` according to README. Wait, actually `forecasting_service.py` uses `sklearn.linear_model.Ridge` natively). *I will need to verify if XGBoost is actually used in code.*
- **Federation Aggregator**: Standalone FastAPI app in `backend/federation-aggregator/main.py`. Uses FedAvg (simple mean of coefficients) on Ridge regression weights.
- **Attendance**: Haversine formula (100m radius), 5-minute QR validity, APScheduler for random re-checks with a 2-minute response window.
- **Chat NLP**: Groq (if `GROQ_API_KEY` exists) or rule-based regex fallback (not a trained custom ML model). [path:backend/app/services/chat_nlp.py]

### Roles
Defined in `backend/app/models/user.py`: NATION_ADMIN, DISTRICT_ADMIN, MEDICAL_OFFICER, DOCTOR, RECEPTIONIST, PHARMACIST, LAB_TECHNICIAN, DATA_ENTRY, DEVELOPER. [path:backend/app/models/user.py:7-16]

## 1.2 Feature-by-feature deep dive

1. **Real-time visibility / district dashboard**: District Admin overview caches data for 15s. Aggregates bed occupancy, medicine alerts (quantity <= min_threshold), critical centres (status=Critical or score<50 or 0 beds), doctor presence rate. Endpoint: `/api/v1/district/overview`. [path:backend/app/api/routes/district_routes.py:47-130] Uses Google Maps (`@react-google-maps/api`) for map view.
2. **AI risk analysis**: Uses Gemini 2.5 Flash via `google-genai`. Prompts expect structured JSON. **Fallback**: If Gemini API key is not configured, it returns a hardcoded error JSON (`{"recommendation": "Gemini API key not configured."}`), NOT a custom trained model. [path:backend/app/services/gemini_service.py:5-40]
3. **Automated audits**: Not verified yet.
4. **Attendance**: 
   - Geofence: 100m radius using Haversine formula. [path:backend/app/api/routes/attendance_routes.py:89]
   - QR Validity: 5 minutes. [path:backend/app/api/routes/attendance_routes.py:79]
   - Random Check: Scheduled 1-4 hours after check-in. [path:backend/app/core/scheduler.py:56-68]. User receives notification and must scan within **2 minutes**. [path:backend/app/core/scheduler.py:27] If missed (enforced every minute), marked `ABSENT`. [path:backend/app/core/scheduler.py:69-106]
5. **Smart inventory**: Tracks quantity against `min_threshold`. Raises `ResourceRequest` to District Admin (`/api/v1/district/resource-request/admin-create`). Cross-district medicine transfer workflow: `PENDING_DONOR` -> `SHIPPED` (approve-donation) -> `COMPLETED` (mark-received). [path:backend/app/api/routes/district_routes.py:165-370]
6. **Unique patient registration ID**: Format `PT-XXXXXX` (regex in `chat_nlp.py`). Tied to `Bed`, `InventoryLog`, `PatientAuditLog`. No actual `Checkup` table exists.
7. **Beds**: Status (Available/Occupied/Maintenance), patient linkage. [path:backend/app/models/bed.py]
8. **Forecasting ML**: The code in `forecasting_service.py` uses `sklearn.linear_model.Ridge` for training. While `requirements.txt` has `xgboost` and `lightgbm`, the actual pipeline in `forecasting_service.py` uses `Ridge(alpha=1.0)`. [path:backend/app/services/forecasting_service.py:124] Runs every Sunday via APScheduler.
9. **Groq LLM**: `llama-3.3-70b-versatile`.
10. **BRICS federation aggregator**: Standalone FastAPI running on `0.0.0.0:8001`. Collects `category`, `coef`, `intercept`. `_run_fedavg` computes simple mean. [path:backend/federation-aggregator/main.py:139-165] 
11. **Security**: JWT (HttpOnly cookies implied), bcrypt, RBAC map in frontend (`permissions.ts`), role guards in backend (`require_role`). Haversine geofence. Rate limiting via `slowapi`.

## 1.2b Verified numbers
- **Roles**: 9
- **Database Tables**: 15
- **Backend Endpoints**: ~45 (estimating based on router files)
- **Frontend Pages**: 16
- **ML Models**: 1 (`Ridge` used in code, though XGB/LGB listed in README).

