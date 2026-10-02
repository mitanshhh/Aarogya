# Discrepancies between README / Owner Claims and Actual Code

| Claim | Source | What the code actually shows [evidence] | How the slide treats it |
|---|---|---|---|
| AI Fallback is a "custom trained model/LLM" | Owner Statement §2.7 | `gemini_service.py` simply returns a hardcoded error JSON (`{"executive_summary": "Gemini API key not configured."}`) if the key is missing. No ML fallback exists for analytics. [path:backend/app/services/gemini_service.py:33-39] | The slide will report that the fallback is a deterministic rule-based error handler, not a custom ML model. |
| QR Code is valid for 2 minutes | Owner Statement §2.9 | The initial QR validity is 5 minutes (`timedelta(minutes=5)`). [path:backend/app/api/routes/attendance_routes.py:79] The random re-verification window is 2 minutes. [path:backend/app/core/scheduler.py:27] | Report initial scan as 5 minutes, re-verification as 2 minutes. |
| XGBoost and LightGBM models | Owner Statement §2.4, README | While listed in `requirements.txt`, the actual training code in `forecasting_service.py` uses `sklearn.linear_model.Ridge`. [path:backend/app/services/forecasting_service.py:124] | The slides will note Ridge Regression as the current forecasting algorithm, while tagging XGBoost/LightGBM as "Planned/Future Ensemble". |
| Checkups table linked to Patient ID | Owner Statement §2.12 | There is no `Checkups` or `Visits` table. Patient ID links to `Bed`, `InventoryLog`, and `PatientAuditLog`. [path:backend/app/models/patient.py] | The slide will accurately show links to Bed Allocation, Medicine Dispensing (Inventory Log), and Patient Audit Timeline. |
| Google Calendar API used for attendance | README | Not implemented in the primary models or routes shown (except potentially stubbed). | Omitted per Rule 4 (no Google APIs except Gemini/SMTP). |
| Google Cloud Translate | README | Used in `translate_routes.py`. | Omitted per Rule 4. |

