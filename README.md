# Aarogya 🏥

Aarogya is a comprehensive, next-generation healthcare management application designed to unify clinical administration, staff attendance tracking, predictive inventory forecasting, and patient record management. Built with a decoupled microservices architecture, Aarogya empowers Primary Health Centres (PHCs) and district hospitals to operate with maximum efficiency and data-driven insights.

![Aarogya Architecture Diagram](./.github/assets/architecture.jpg)

## 🌟 Google Technologies Powered

Aarogya strongly leverages the Google Cloud ecosystem to deliver intelligent, scalable, and highly interactive capabilities:
- **Google Gemini AI (`google-genai`)**: Powers the natural language chatbot for intelligent patient health insights and NLP-driven clinical data extraction.
- **Google Cloud Translate API**: Dynamically translates medical prescriptions and patient instructions into multiple regional languages, breaking down communication barriers in rural healthcare.
- **Google Maps API (`@react-google-maps/api`)**: Used extensively on the frontend for precise geolocation tracking during staff attendance QR check-ins and mapping interactive health centre locations.
- **Google Calendar API**: Fully integrated into the doctor's dashboard, allowing healthcare professionals to seamlessly sync and track their personal schedules alongside their clinical shifts.

## 🚀 Key Features

* **Unified Staff Attendance:** A secure, role-based QR check-in system that accurately logs presence, verifies GPS geolocation within clinic premises, and monitors daily streaks.
* **Predictive Inventory & Forecasting:** Integrated Machine Learning models (XGBoost & LightGBM) to forecast medicine demand based on historical data, seasonality, and local patient footfall, ensuring critical drugs never stock out.
* **Patient Record Management:** Streamlined registration and admission workflows, allowing rapid processing and automated metadata updates.
* **Smart Dashboards:** Specialized overview dashboards providing KPI metrics, anomaly detection, and predictive insights.

## 🔐 Role-Based Access Control (RBAC)

Aarogya enforces strict security and capabilities tailored to specific staff roles:
* **District Admin:** Full oversight across all Primary Health Centres, macro-level inventory forecasting, and staff anomaly monitoring.
* **Medical Officer (MO):** Managerial access to a specific PHC, staff attendance logs, and high-level patient statistics.
* **Doctor:** Access to assigned patient diagnoses, prescription issuance, and integrated Google Calendar scheduling.
* **Pharmacist:** Dedicated access to drug dispensing workflows, inventory stock alerts, and ML demand forecasts.
* **Receptionist:** Streamlined access for patient admission, queuing, and basic administrative data entry.

## 🛠️ Technical Architecture

Aarogya adopts a modern, decoupled client-server architecture:

### Frontend
- **Next.js 14** (App Router) & **React**
- **TailwindCSS** & **Shadcn UI** for a premium, accessible, and responsive user experience.
- **Google Maps API** for geolocation mapping.

### Backend
- **Python FastAPI** server that manages high-concurrency business logic, JWT-based authentication, and RESTful endpoints.
- **Google Gemini & Cloud Translate APIs** for intelligent processing.
- Strict Role Middleware protecting all sensitive endpoints.

### Database
- **PostgreSQL (Neon)**: Fully managed, serverless Postgres database.
- **SQLAlchemy ORM & Alembic**: Robust database querying and schema migrations.

### Machine Learning Pipeline
- Offline training scripts populate robust models (`.pkl`) utilizing **XGBoost** and **LightGBM**.
- Models are loaded dynamically into the FastAPI backend (via `joblib` & `scikit-learn`) to serve real-time demand predictions to the frontend.

## ⚙️ Local Development Setup

### 1. Backend Setup
```bash
cd backend
python -m venv venv
source venv/bin/activate  # (or venv\Scripts\activate on Windows)
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
*Ensure you have a `.env` file configured with your database URL, JWT secrets, and Google API keys.*

### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
*Create a `.env.local` to point `NEXT_PUBLIC_API_URL` to your backend and add your `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`.*
