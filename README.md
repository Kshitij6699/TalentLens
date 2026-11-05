# TalentLens — Enterprise Bench Management & Automated Assessment Platform

> **Important Notice:** TalentLens is an enterprise sample and demonstration platform. No production secrets, private database connection strings, or third-party API credentials are included in this repository. Users and evaluators must supply their own Firebase, Neon PostgreSQL, HackerRank, and Chakra credentials to operate the live services.

---

## 1. Project Overview

TalentLens is an enterprise talent management and candidate readiness portal designed to accelerate bench resource deployment. It provides engineering leaders, delivery managers, recruiters, and mentors with a centralized, real-time command center to track candidate progress, coordinate technical evaluations, manage mentor mock interviews, and evaluate multi-stage assessment metrics.

### Key Capabilities
- **Real-Time Executive Dashboard**: Company-wide visibility across bench status, active enrollments, idle talent, and client-interview-ready candidates with actionable KPI breakdowns.
- **Role-Based Access Control (RBAC)**: Fine-grained permissions supporting Admin, Manager, and Mentor personas, with a toggleable `TEMPORARY_ADMIN_TESTING_MODE` for prototype evaluation.
- **Automated Technical Evaluations (HackerRank)**: Direct server-to-server integration to assign difficulty-banded coding tests, dispatch candidate invitations, monitor test lifecycle, and synchronize scorecards.
- **AI-Powered Technical Interviews (Chakra AI)**: Trigger and track conversational AI technical interviews with automated recommendation synchronization and manual fallback CSV import.
- **Mentor Tracking & Mock Interviews**: Schedule and record mock interview ratings, behavioral feedback, attendance records, and readiness clearances.
- **Comprehensive Candidate Profiles**: 360-degree candidate detail drawer displaying primary/secondary skill matrix, mentor assignments, mock histories, and assessment audit logs.

---

## 2. Architecture & Tech Stack

TalentLens is architected as a modular, full-stack TypeScript application deployed on Google Cloud Run.

```
                    +------------------------------------+
                    |        Client (Browser)            |
                    |  React 19 + TypeScript + Tailwind  |
                    +-----------------+------------------+
                                      |
                     Firebase ID Token| (Bearer Authorization)
                                      v
                    +------------------------------------+
                    |        Express Application         |
                    |           (Node.js / tsx)          |
                    +--------+------------------+--------+
                             |                  |
           Drizzle ORM / pg  |                  | HTTPS REST APIs
                             v                  v
+------------------------------+     +-------------------------------+
|       Neon PostgreSQL        |     | External Providers:           |
| (Users, Employees, Mentors,  |     | - Firebase Auth Verification  |
|  Attendance, Mocks, Exams)   |     | - HackerRank for Work v3 API  |
+------------------------------+     | - Chakra AI Technical Platform|
                                     +-------------------------------+
```

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, Lucide Icons, Canvas Confetti.
- **Backend**: Node.js, Express, TypeScript (`tsx` runtime), Firebase Admin SDK.
- **Database & ORM**: Neon Serverless PostgreSQL, Drizzle ORM, `pg` connection pooling.
- **Authentication**: Firebase Authentication (Google Workspace OAuth / Google Sign-In with UID reconciliation).
- **External Integrations**:
  - HackerRank for Work REST APIs (Candidate management & score synchronization).
  - Chakra AI Technical Interview Platform (Interview dispatch & webhook/REST result ingestion).

---

## 3. Prerequisites

Before installing and running TalentLens, ensure you have:

1. **Node.js**: Version `v20.x` or `v22.x` (LTS recommended).
2. **Package Manager**: `npm` (v10+), `bun`, or `pnpm`.
3. **Database**: A Neon PostgreSQL database instance ([neon.tech](https://neon.tech)).
4. **Firebase Project**: A Firebase project with Authentication enabled (Google Sign-In provider).
5. **(Optional) HackerRank for Work Account**: For automated coding assessment invitations.
6. **(Optional) Chakra AI Workspace**: For AI technical interview simulations.

---

## 4. Installation & Setup Instructions

### Step 1: Clone the Repository
```bash
git clone <repository-url>
cd talentlens
```

### Step 2: Install Dependencies
```bash
npm install
```

### Step 3: Configure Environment Variables
Copy the reference environment configuration file to `.env`:
```bash
cp .env.example .env
```
Open `.env` in your text editor and fill in your credentials (see [Environment Variables](#5-environment-variable-setup)).

---

## 5. Environment Variable Setup

Reference `.env.example` for the complete list of configurable variables:

| Variable | Mandatory? | Purpose & Description | Default / Example |
| :--- | :---: | :--- | :--- |
| `PORT` | Optional | Port for the Express server to listen on | `3000` |
| `NODE_ENV` | Optional | Runtime mode (`development` or `production`) | `development` |
| `DATABASE_URL` | **Mandatory** | Neon PostgreSQL connection string with SSL | `postgresql://user:pass@ep-pooler.neon.tech/neondb?sslmode=require` |
| `ADMIN_DATABASE_URL` | Optional | Connection string with DB owner rights for Stage A setup | `postgresql://neondb_owner:...` |
| `DB_POOL_MAX` | Optional | Maximum concurrent database connections | `10` |
| `DB_AUTO_DDL` | Optional | Run table DDL on server boot | `false` |
| `DB_AUTO_SEED` | Optional | Auto-seed mentors/employees if tables are empty | `false` |
| `TEMPORARY_ADMIN_TESTING_MODE` | Optional | Grant Admin rights to all authenticated users for testing | `true` |
| `HACKERRANK_API_KEY` | Optional | Bearer API key from HackerRank for Work | `YOUR_HACKERRANK_API_KEY` |
| `HACKERRANK_TIMEZONE` | Optional | Timezone passed in HackerRank test invitations | `Asia/Kolkata` |
| `HACKERRANK_WEBHOOK_SECRET` | Optional | Secret for inbound assessment webhook | `YOUR_HACKERRANK_WEBHOOK_SECRET` |
| `CHAKRA_INTERVIEW_URL` | Optional | Direct candidate interview link for Chakra AI | `https://app.chakra.ai/interview/...` |
| `CHAKRA_INTERVIEW_NAME` | Optional | Assessment title display label | `Chakra Data Engineer Interview` |
| `CHAKRA_API_RESULTS_URL_TEMPLATE` | Optional | Endpoint template to fetch Chakra results (`{email}`) | `https://www.hackerrank.com/x/api/v3/chakra/results?email={email}` |
| `CHAKRA_API_TOKEN` | Optional | Server-side bearer token for Chakra API | `YOUR_CHAKRA_API_TOKEN` |

---

## 6. Database Provisioning & Seed Data

TalentLens manages database schema initialization and initial seed data via dedicated administrative scripts:

### 1. Provision Neon PostgreSQL
1. Create a project at [Neon](https://neon.tech).
2. Note your connection details under **Dashboard > Connection Details**.

### 2. Run Idempotent Schema Setup (Stage A)
To create the 8 application tables (`users`, `mentors`, `employees`, `attendance`, `mock_interviews`, `mentor_sessions`, `hackerrank_exams`, `chakra_interviews`) without overwriting existing data:

```bash
# Verify schema and seed assets without modifying database
npx tsx scripts/stage_a_admin_init.ts --dry-run

# Execute schema creation and initial Excel seed (requires ADMIN_DATABASE_URL)
ADMIN_DATABASE_URL="postgresql://neondb_owner:password@your-endpoint.neon.tech/neondb?sslmode=require" npx tsx scripts/stage_a_admin_init.ts
```

The script reads initial employee and mentor rosters from `assets/Dashboard_source_bench_updated.xlsx` and `assets/Mentors_list.xlsx` with conflict-safe `ON CONFLICT DO NOTHING` clauses.

---

## 7. Development & Production Commands

| Action | Command | Details |
| :--- | :--- | :--- |
| **Development Server** | `npm run dev` | Boots backend with embedded Vite dev middleware on `http://localhost:3000` |
| **Type Check** | `npm run lint` | Runs `tsc --noEmit` to validate frontend and backend TypeScript types |
| **Production Build** | `npm run build` | Compiles frontend assets into `dist/` |
| **Production Server** | `npm start` | Runs Express production server serving pre-built `dist/` bundle |
| **Run Auth Rules Test** | `npx tsx scripts/verify_auth_rules.ts` | Validates Firebase UID reconciliation and RBAC policies |
| **Run Readiness Sync Test**| `npx tsx scripts/test_readiness_and_sync_integrity.ts` | Tests candidate status synchronization and validation logic |
| **Run RBAC Dashboard Test**| `npx tsx scripts/test_dashboard_rbac_visibility.ts` | Validates company-wide dashboard metrics across roles |

---

## 8. Third-Party Integrations Setup

### HackerRank for Work
1. Log in to [HackerRank for Work](https://www.hackerrank.com/work) as an administrator.
2. Navigate to **Settings > Integrations / API**.
3. Generate a Bearer token with permissions to invite candidates and view candidate reports.
4. Add the token to your `.env` file as `HACKERRANK_API_KEY`.
5. Map test IDs to skill bands in `config/hackerrank-test-catalog.json`.

### Chakra AI Technical Interviews
1. Open your Chakra AI workspace and configure your Technical Interview template.
2. Copy the candidate interview link and set `CHAKRA_INTERVIEW_URL` in `.env`.
3. To enable automatic score sync, set `CHAKRA_API_RESULTS_URL_TEMPLATE` and `CHAKRA_API_TOKEN`.
4. Alternatively, recruiters can import Chakra results directly via the **Import Chakra CSV** button in the employee detail drawer.

---

## 9. Firebase Authentication Setup

TalentLens utilizes Firebase Authentication for Google Workspace Single Sign-On (SSO):

1. Go to the [Firebase Console](https://console.firebase.google.com).
2. Enable **Authentication** and add the **Google** sign-in provider.
3. Under **Authentication > Settings > Authorized domains**, add:
   - `localhost`
   - Your production domain (e.g., `your-app.run.app`).
4. Update `firebase-applet-config.json` and `src/lib/firebase.ts` with your web application's client configuration keys.

---

## 10. Cloud Run & Production Deployment

TalentLens is containerized and ready for Google Cloud Run deployment:

1. Build container image:
   ```bash
   gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/talentlens
   ```
2. Deploy to Cloud Run:
   ```bash
   gcloud run deploy talentlens \
     --image gcr.io/YOUR_PROJECT_ID/talentlens \
     --platform managed \
     --region asia-south1 \
     --allow-unauthenticated \
     --set-env-vars NODE_ENV=production,PORT=8080 \
     --set-secrets DATABASE_URL=talentlens-db-url:latest
   ```
3. Add the issued Cloud Run URL to Firebase Authorized Domains and `CORS_ALLOWED_ORIGINS`.

---

## License

This project is released under the MIT License for demonstration and organizational evaluation purposes.
