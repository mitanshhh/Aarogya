# Aarogya - Next-Gen Healthcare Management System 🏥

Aarogya is a comprehensive, modern healthcare management application designed to unify clinical administration, staff attendance tracking, predictive inventory forecasting, and patient record management. Built with cutting-edge technologies, Aarogya empowers Primary Health Centres (PHCs) and district hospitals to operate with maximum efficiency and data-driven insights.

![Aarogya Architecture Diagram](./.github/assets/architecture.jpg)

## 🚀 Key Features

* **Unified Staff Attendance:** A secure, role-based QR check-in system that accurately logs presence, verifies geolocation within clinic premises, and monitors daily streaks.
* **Predictive Inventory & Forecasting:** Integrated Machine Learning (XGBoost & LightGBM) to forecast medicine demand based on historical data, seasonality, and local footfall, avoiding stockouts.
* **Patient Record Management:** Streamlined registration and admission workflows, allowing rapid processing and automated metadata updates.
* **Role-Based Access Control (RBAC):** Distinct dashboards and capabilities tailored to District Admins, Medical Officers, Doctors, Pharmacists, and Receptionists.
* **Seamless Integration:** Built-in Google Calendar integration for doctors to track personal schedules alongside clinic duties.

## 🛠️ Technical Architecture

Aarogya adopts a modern, decoupled client-server architecture to ensure high performance and scalability:

* **Frontend:** Built with **Next.js 14** (App Router) and **React**, styled using **TailwindCSS** and **Shadcn UI** for a premium, accessible, and responsive user experience. State management and routing are seamlessly integrated to support fast client-side transitions.
* **Backend:** A highly concurrent **Python FastAPI** server that manages business logic, JWT-based authentication, role middleware, and RESTful endpoints.
* **Database:** **PostgreSQL** hosted on **Neon**, utilizing SQLAlchemy ORM and Alembic for robust schema migrations.
* **Machine Learning Pipeline:** Offline training scripts populate robust models (`.pkl`) which are loaded dynamically by FastAPI to serve real-time predictions to the frontend.

## ⚙️ Local Development Setup

### 1. Backend Setup
```bash
cd backend
python -m venv venv
source venv/bin/activate  # (or venv\Scripts\activate on Windows)
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
*Ensure you have a `.env` file configured with your database URL and JWT secrets.*

### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
*Create a `.env.local` to point `NEXT_PUBLIC_API_URL` to your backend.*

## 🔒 Security & Data Privacy
- Passwords are cryptographically hashed using **bcrypt**.
- Endpoints are protected by strict RBAC middleware.
- Environment variables are heavily isolated for production deployments.

## 📦 Deployment
The application is structured to be deployed easily on modern cloud platforms. The frontend is optimized for **Vercel**, while the FastAPI backend and Python ML integrations are structured for deployment on **Render** or **Railway**.

---
*Developed for Codeamble*
