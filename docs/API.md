# API Reference — Its Billi ❤️

Base URL: `https://your-api.onrender.com/api/v1`

All protected endpoints require: `Authorization: Bearer <access_token>`

---

## Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/register` | Register new user |
| POST | `/auth/verify-otp` | Verify email OTP |
| POST | `/auth/login` | Login, returns tokens |
| POST | `/auth/refresh` | Refresh access token |
| POST | `/auth/logout` | Revoke refresh token |
| POST | `/auth/forgot-password` | Send reset OTP |
| POST | `/auth/reset-password` | Reset with OTP |

## Users

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/users/me` | Get current user |
| PATCH | `/users/me` | Update profile |
| POST | `/users/me/avatar` | Upload avatar |
| POST | `/users/me/change-password` | Change password |
| GET | `/users/me/settings` | Get settings |
| PATCH | `/users/me/settings` | Update settings |

## Albums

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/albums/` | List albums |
| POST | `/albums/` | Create album |
| GET | `/albums/{id}` | Get album |
| PATCH | `/albums/{id}` | Update album |
| DELETE | `/albums/{id}` | Delete (soft) album |
| POST | `/albums/{id}/restore` | Restore from trash |
| POST | `/albums/{id}/favorite` | Toggle favorite |
| GET | `/albums/trash` | Get deleted albums |

## Gallery

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/gallery/` | Get all files |
| GET | `/gallery/recent` | Recent uploads |
| GET | `/gallery/search?q=` | Search files |
| GET | `/gallery/trash` | Deleted files |

## Uploads

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/uploads/` | Upload single file |
| POST | `/uploads/multi` | Upload multiple (max 20) |
| GET | `/uploads/{id}` | Get file + signed URL |
| DELETE | `/uploads/{id}` | Delete (soft) file |
| POST | `/uploads/{id}/restore` | Restore from trash |
| POST | `/uploads/{id}/favorite` | Toggle favorite |

## Downloads

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/download/file/{id}` | Get signed download URL |
| GET | `/download/album/{id}/zip` | Download album as ZIP |

## Settings

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/settings/storage-usage` | Storage breakdown |
| DELETE | `/settings/trash/empty` | Empty all trash |

---

## Response Format

```json
{
  "success": true,
  "message": "Success",
  "data": { ... }
}
```

### Paginated Response
```json
{
  "success": true,
  "data": [ ... ],
  "pagination": {
    "total": 100,
    "page": 1,
    "limit": 30,
    "pages": 4,
    "has_next": true,
    "has_prev": false
  }
}
```

### Error Response
```json
{
  "success": false,
  "message": "Error description"
}
```
