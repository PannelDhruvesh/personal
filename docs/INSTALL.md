# Installation Guide — Its Billi ❤️

## Prerequisites

- Python 3.11+
- A [Supabase](https://supabase.com) project (free tier works)
- A [Render](https://render.com) account (for backend)
- A [Vercel](https://vercel.com) account (for frontend)

---

## 1. Supabase Setup

### 1.1 Create Project
1. Go to [supabase.com](https://supabase.com) → New Project
2. Save your **Project URL**, **anon key**, and **service_role key**

### 1.2 Run Database Schema
In the Supabase SQL Editor, run these files **in order**:
```
database/schema.sql
database/policies.sql
database/storage.sql
```

### 1.3 Storage Bucket
The `storage.sql` script creates a private bucket called `its-billi`.

---

## 2. Backend Setup (Local)

```bash
cd backend
cp ../.env.example .env
# Fill in your values in .env

pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Test: `http://localhost:8000/health`

---

## 3. Frontend Setup (Local)

Edit `frontend/config.js`:
```js
window.APP_CONFIG = {
  API_URL: 'http://localhost:8000/api/v1',
};
```

Open `frontend/index.html` in a browser, or serve with:
```bash
npx serve frontend
```

---

## 4. Deploy Backend to Render

1. Push your code to GitHub
2. New Web Service → Connect your repo
3. **Root Directory**: `backend`
4. **Build Command**: `pip install -r requirements.txt`
5. **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
6. Add all environment variables from `.env.example`

---

## 5. Deploy Frontend to Vercel

1. Import your GitHub repo
2. **Root Directory**: `frontend`
3. **Framework Preset**: Other
4. Deploy — no build step needed (pure HTML/CSS/JS)
5. Update `frontend/config.js` with your Render backend URL

---

## 6. Configure CORS

In your `.env` on Render, set:
```
ALLOWED_ORIGINS=https://your-app.vercel.app
```
