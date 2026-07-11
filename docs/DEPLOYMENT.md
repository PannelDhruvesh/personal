# Deployment Guide — Its Billi ❤️

## Architecture

```
[User Phone]
     │
     ▼
[Vercel - Frontend]  ──────────►  [Render - FastAPI Backend]
   HTML/CSS/JS                            │
                                          ▼
                                  [Supabase PostgreSQL]
                                  [Supabase Storage]
```

---

## Backend — Render

### render.yaml (optional auto-deploy)
```yaml
services:
  - type: web
    name: its-billi-api
    env: python
    rootDir: backend
    buildCommand: pip install -r requirements.txt
    startCommand: uvicorn app.main:app --host 0.0.0.0 --port $PORT
    envVars:
      - key: SUPABASE_URL
        sync: false
      - key: SUPABASE_ANON_KEY
        sync: false
      - key: SUPABASE_SERVICE_ROLE_KEY
        sync: false
      - key: SUPABASE_DB_URL
        sync: false
      - key: JWT_SECRET_KEY
        generateValue: true
      - key: ALLOWED_ORIGINS
        value: https://its-billi.vercel.app
```

### Required Environment Variables on Render
```
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_DB_URL
JWT_SECRET_KEY          (generate a strong random value)
JWT_ALGORITHM=HS256
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=60
JWT_REFRESH_TOKEN_EXPIRE_DAYS=30
ALLOWED_ORIGINS=https://your-app.vercel.app
SUPABASE_BUCKET=its-billi
MAX_UPLOAD_SIZE_MB=100
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@gmail.com
SMTP_PASSWORD=your-app-password
FROM_EMAIL=noreply@itsbilli.app
DEBUG=false
```

---

## Frontend — Vercel

1. Import GitHub repo at [vercel.com/new](https://vercel.com/new)
2. Set **Root Directory** to `frontend`
3. Framework: **Other**
4. No build command needed
5. After deploy, update `frontend/config.js`:

```js
window.APP_CONFIG = {
  API_URL: 'https://your-api-name.onrender.com/api/v1',
};
```

6. Commit and push — Vercel auto-redeploys

---

## Supabase Production Checklist

- [ ] RLS enabled on all tables ✅ (done in policies.sql)
- [ ] Storage bucket set to private ✅
- [ ] Signed URLs used for all file access ✅
- [ ] Service role key only used server-side ✅
- [ ] Database connection via connection pooler for Render

---

## Security Checklist

- [ ] `JWT_SECRET_KEY` is a random 64+ character string
- [ ] `DEBUG=false` in production
- [ ] `ALLOWED_ORIGINS` is set to your exact Vercel domain
- [ ] SMTP credentials use an App Password (not your main password)
- [ ] `.env` is in `.gitignore` — never commit secrets
