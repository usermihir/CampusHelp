# CampusHelp

CampusHelp is a comprehensive, centralized digital portal designed exclusively for the IIT Kharagpur community. It bridges the gap between students and campus administration by offering a unified suite of tools for daily campus life—ranging from hall maintenance and secure authentication to AI-driven lost & found and roommate matching.

![CampusHelp Login](frontend/public/vintage-illustration.jpg)

## 🌟 Key Features

### 🔐 Secure, KGP-Exclusive Authentication
- **Strict Domain Validation**: Only users with a valid `@kgpian.iitkgp.ac.in` email address can register, ensuring a secure and verified community.
- **Custom OTP Flow**: A robust dual-mode OTP system (development console logging + production Resend API delivery) integrated seamlessly with Supabase Authentication.
- **Role-Based Access Control (RBAC)**: Centralized authorization routing users to role-specific dashboards (e.g., Student, Hall Admin, Electrician).

### 🛠️ Hall Maintenance & Ticketing
- **Automated SLA Tracking**: Maintenance requests are automatically assigned to the correct authority (e.g., Electrician, Plumber) with strict Service Level Agreement (SLA) deadlines based on issue categories.
- **Role-Specific Dashboards**: Hall authorities get tailored views to manage, escalate, and resolve tickets efficiently.
- **Transparent Status Tracking**: Students can track their complaints in real-time from `Open` to `Resolved`.

### 🔍 AI-Powered Lost & Found
- **Smart Matching Engine**: Leverages vector embeddings to automatically suggest potential matches between reported lost items and found items.
- **Semantic Search**: Users can search for items using natural language, making it easier to reunite with lost belongings.

### 🤝 Roommate Matching
- **Compatibility Scoring**: A sophisticated algorithm that matches students based on lifestyle preferences, habits, and schedules.
- **Secure Profiles**: Privacy-first profile viewing and matching system.

### 🗺️ Campus Navigation
- **Interactive Map**: Integrated OpenStreetMap/Leaflet functionality to help students navigate the vast IIT KGP campus, find halls, and locate academic buildings.

---

## 💻 Technology Stack

**Frontend:**
- React.js (Vite)
- Custom Vintage-Themed CSS & Modern UI Components
- Axios for API communication

**Backend:**
- FastAPI (Python)
- SQLAlchemy (Async ORM)
- PostgreSQL (Supabase) with `pgvector` for AI embeddings
- Celery (Background Tasks & SLA Monitoring)

**Authentication & Infrastructure:**
- Supabase Auth (Admin API integration)
- Resend (Email Delivery)

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+)
- Python (3.10+)
- PostgreSQL (or Supabase remote database)

### Backend Setup
1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Configure your environment variables in `backend/.env`:
   ```env
   DATABASE_URL=postgresql+asyncpg://...
   SUPABASE_URL=https://...
   SUPABASE_KEY=ey...
   OTP_MODE=development
   APP_ENV=development
   ```
4. Start the FastAPI server:
   ```bash
   uvicorn main:app --reload
   ```

### Frontend Setup
1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```

---

## 🛡️ Architecture & Security
CampusHelp employs a strict separation of concerns. The frontend acts purely as a presentation layer, while the FastAPI backend enforces all business logic, RBAC, and data validation before interacting with the PostgreSQL database. Passwords and OTP hashes are securely processed, and Supabase manages the underlying JWT session lifecycle.

## 🤝 Contributing
This project is built for the students, by the students. If you'd like to contribute, please fork the repository, create a feature branch, and submit a pull request!

## 📄 License
This project is licensed under the MIT License.
