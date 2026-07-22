import requests
import time
import json
import struct
import zlib
import sys

BASE_URL = "http://127.0.0.1:8000/api/v1"
results = []

def make_1x1_png():
    """Generate a minimal valid 1x1 red PNG in pure Python."""
    def png_chunk(chunk_type, data):
        c = chunk_type + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)

    signature = b'\x89PNG\r\n\x1a\n'
    ihdr_data = struct.pack('>IIBBBBB', 1, 1, 8, 2, 0, 0, 0)
    ihdr = png_chunk(b'IHDR', ihdr_data)
    raw_row = b'\x00\xff\x00\x00'  # filter byte + RGB
    compressed = zlib.compress(raw_row)
    idat = png_chunk(b'IDAT', compressed)
    iend = png_chunk(b'IEND', b'')
    return signature + ihdr + idat + iend

def test(label, method, path, **kwargs):
    url = f"{BASE_URL}{path}"
    start = time.time()
    try:
        resp = method(url, **kwargs)
        elapsed = round((time.time() - start) * 1000)
        try:
            body = resp.json()
        except Exception:
            body = resp.text[:300]
        return resp.status_code, elapsed, body, resp
    except Exception as e:
        elapsed = round((time.time() - start) * 1000)
        return None, elapsed, str(e), None

def log(num, label, status, elapsed, passed, notes=""):
    icon = "✅ PASS" if passed else "❌ FAIL"
    results.append({
        "num": num, "label": label, "status": status,
        "elapsed": elapsed, "passed": passed, "notes": notes
    })
    print(f"\n{'='*60}")
    print(f"Test {num}: {label}")
    print(f"  {icon} | Status: {status} | Time: {elapsed}ms")
    if notes:
        print(f"  Notes: {notes}")

# ── 1. Login (90s timeout for cold start) ─────────────────────────────────────
print("\n[>>] Starting live API audit of", BASE_URL)
print("   (First call uses 90s timeout for Render cold start...)\n")

status, elapsed, body, resp = test(
    "POST /auth/login", requests.post, "/auth/login",
    json={"email": "panneldhruvesh2007@gmail.com", "password": "Dhruv@2007"},
    timeout=90
)

token = None
is_admin = None
if status == 200:
    # Try common token key names
    token = (body.get("access_token") or body.get("token") or
             body.get("data", {}).get("access_token") if isinstance(body, dict) else None)
    is_admin = body.get("is_admin") or body.get("user", {}).get("is_admin") if isinstance(body, dict) else None
    notes = f"is_admin={is_admin} | token={'present' if token else 'NOT FOUND in response'}"
    log(1, "POST /auth/login", status, elapsed, bool(token), notes)
    print(f"  Response keys: {list(body.keys()) if isinstance(body, dict) else 'non-dict'}")
else:
    log(1, "POST /auth/login", status, elapsed, False, f"Login failed: {str(body)[:200]}")
    print("  ⚠️  Cannot continue without token. Dumping response:")
    print(f"  {body}")

headers = {"Authorization": f"Bearer {token}"} if token else {}

# ── 2. GET /users/me ──────────────────────────────────────────────────────────
status, elapsed, body, _ = test("GET /users/me", requests.get, "/users/me",
                                 headers=headers, timeout=30)
passed = status == 200
notes = f"user_id={body.get('id','?')} email={body.get('email','?')}" if passed and isinstance(body, dict) else str(body)[:150]
log(2, "GET /users/me", status, elapsed, passed, notes)

# ── 3. GET /settings/storage-usage ───────────────────────────────────────────
status, elapsed, body, _ = test("GET /settings/storage-usage", requests.get,
                                 "/settings/storage-usage", headers=headers, timeout=30)
passed = status == 200
notes = str(body)[:200] if isinstance(body, dict) else str(body)[:200]
log(3, "GET /settings/storage-usage", status, elapsed, passed, notes)

# ── 4. GET /gallery/ ──────────────────────────────────────────────────────────
status, elapsed, body, _ = test("GET /gallery/", requests.get, "/gallery/",
                                 headers=headers, timeout=30)
passed = status == 200
gallery_items = body if isinstance(body, list) else (body.get("items") or body.get("files") or body.get("data") or []) if isinstance(body, dict) else []
signed_url_check = "N/A (empty gallery)"
if gallery_items:
    first = gallery_items[0] if isinstance(gallery_items, list) else {}
    su = first.get("signed_url") if isinstance(first, dict) else None
    signed_url_check = f"signed_url={'present & non-null ✅' if su else 'NULL or missing ❌'}"
notes = f"count={len(gallery_items)} | {signed_url_check}"
log(4, "GET /gallery/", status, elapsed, passed, notes)

# ── 5. GET /gallery/recent ────────────────────────────────────────────────────
status, elapsed, body, _ = test("GET /gallery/recent", requests.get, "/gallery/recent",
                                 headers=headers, timeout=30)
passed = status == 200
recent_items = body if isinstance(body, list) else (body.get("items") or body.get("files") or body.get("data") or []) if isinstance(body, dict) else []
log(5, "GET /gallery/recent", status, elapsed, passed, f"count={len(recent_items)}")

# ── 6. GET /albums/ ───────────────────────────────────────────────────────────
status, elapsed, body, _ = test("GET /albums/", requests.get, "/albums/",
                                 headers=headers, timeout=30)
passed = status == 200
albums = body if isinstance(body, list) else (body.get("albums") or body.get("data") or []) if isinstance(body, dict) else []
log(6, "GET /albums/", status, elapsed, passed, f"album count={len(albums)}")

# ── 7. POST /albums/ ──────────────────────────────────────────────────────────
status, elapsed, body, _ = test("POST /albums/", requests.post, "/albums/",
                                 json={"name": "Live Audit Album 2"},
                                 headers=headers, timeout=30)
passed = status in (200, 201)
new_album_id = None
if passed and isinstance(body, dict):
    new_album_id = body.get("id") or body.get("album_id") or body.get("data", {}).get("id")
notes = f"album_id={new_album_id}" if new_album_id else str(body)[:150]
log(7, "POST /albums/", status, elapsed, passed, notes)

# ── 8. GET /users/me/settings ─────────────────────────────────────────────────
status, elapsed, body, _ = test("GET /users/me/settings", requests.get,
                                 "/users/me/settings", headers=headers, timeout=30)
passed = status == 200
notes = str(body)[:200] if isinstance(body, dict) else str(body)[:200]
log(8, "GET /users/me/settings", status, elapsed, passed, notes)

# ── 9. PATCH /users/me/settings ──────────────────────────────────────────────
status, elapsed, body, _ = test("PATCH /users/me/settings", requests.patch,
                                 "/users/me/settings",
                                 json={"dark_mode": True},
                                 headers=headers, timeout=30)
passed = status in (200, 204)
notes = str(body)[:200]
log(9, "PATCH /users/me/settings", status, elapsed, passed, notes)

# ── 10. GET /admin/stats ──────────────────────────────────────────────────────
status, elapsed, body, _ = test("GET /admin/stats", requests.get, "/admin/stats",
                                 headers=headers, timeout=30)
passed = status == 200
notes = str(body)[:200]
log(10, "GET /admin/stats", status, elapsed, passed, notes)

# ── 11. GET /admin/users ──────────────────────────────────────────────────────
status, elapsed, body, _ = test("GET /admin/users", requests.get, "/admin/users",
                                 headers=headers, timeout=30)
passed = status == 200
notes = f"users count={len(body) if isinstance(body, list) else '?'}" if status == 200 else str(body)[:150]
log(11, "GET /admin/users", status, elapsed, passed, notes)

# ── 12. GET /admin/activity ───────────────────────────────────────────────────
status, elapsed, body, _ = test("GET /admin/activity", requests.get, "/admin/activity",
                                 headers=headers, timeout=30)
passed = status == 200
notes = str(body)[:200]
log(12, "GET /admin/activity", status, elapsed, passed, notes)

# ── 13. POST /uploads/ ────────────────────────────────────────────────────────
png_bytes = make_1x1_png()
upload_headers = dict(headers)  # don't set Content-Type, let requests handle multipart

status, elapsed, body, _ = test(
    "POST /uploads/", requests.post, "/uploads/",
    headers=upload_headers,
    files={"file": ("test_audit.png", png_bytes, "image/png")},
    timeout=60
)
passed = status in (200, 201)
uploaded_file_id = None
if passed and isinstance(body, dict):
    uploaded_file_id = (body.get("id") or body.get("file_id") or
                        body.get("data", {}).get("id") if isinstance(body.get("data"), dict) else None)
notes = f"file_id={uploaded_file_id} | body={str(body)[:200]}"
log(13, "POST /uploads/ (1x1 PNG)", status, elapsed, passed, notes)
print(f"  Full upload response: {str(body)[:400]}")

# ── 14. GET /gallery/ again — check signed_url ────────────────────────────────
status, elapsed, body, _ = test("GET /gallery/ (post-upload)", requests.get, "/gallery/",
                                 headers=headers, timeout=30)
passed = status == 200
gallery_items2 = body if isinstance(body, list) else (body.get("items") or body.get("files") or body.get("data") or []) if isinstance(body, dict) else []
signed_url_status = "❌ empty gallery"
if gallery_items2:
    first = gallery_items2[0] if isinstance(gallery_items2, list) else {}
    su = first.get("signed_url") if isinstance(first, dict) else None
    signed_url_status = f"✅ signed_url present & non-null: {str(su)[:80]}" if su else "❌ signed_url is NULL or missing"
notes = f"count={len(gallery_items2)} | {signed_url_status}"
log(14, "GET /gallery/ (signed_url check)", status, elapsed, passed, notes)

# ── 15. DELETE uploaded file (soft delete) ────────────────────────────────────
delete_id = uploaded_file_id
if not delete_id and gallery_items2 and isinstance(gallery_items2, list):
    # Try to find the test file we just uploaded
    for item in gallery_items2:
        if isinstance(item, dict) and "test_audit" in str(item.get("filename", item.get("name", ""))):
            delete_id = item.get("id")
            break
    if not delete_id:
        delete_id = gallery_items2[0].get("id") if isinstance(gallery_items2[0], dict) else None

if delete_id:
    status, elapsed, body, _ = test(f"DELETE /uploads/{delete_id}", requests.delete,
                                     f"/uploads/{delete_id}", headers=headers, timeout=30)
    passed = status in (200, 204)
    notes = f"Deleted file_id={delete_id} | {str(body)[:150]}"
    log(15, f"DELETE /uploads/{{file_id}} (soft delete)", status, elapsed, passed, notes)
else:
    log(15, "DELETE /gallery/{file_id} (soft delete)", "SKIP", 0, False, "No file_id to delete")

# ── 16. GET /gallery/trash ────────────────────────────────────────────────────
status, elapsed, body, _ = test("GET /gallery/trash", requests.get, "/gallery/trash",
                                 headers=headers, timeout=30)
passed = status == 200
trash_items = body if isinstance(body, list) else (body.get("items") or body.get("files") or body.get("data") or []) if isinstance(body, dict) else []
notes = f"trash count={len(trash_items)} | deleted file present={'yes ✅' if delete_id and any(str(i.get('id','')) == str(delete_id) for i in (trash_items if isinstance(trash_items, list) else [])) else 'check manually'}"
log(16, "GET /gallery/trash", status, elapsed, passed, notes)

# ── 17. POST /auth/resend-otp ─────────────────────────────────────────────────
status, elapsed, body, _ = test("POST /auth/resend-otp", requests.post,
                                 "/auth/resend-otp",
                                 json={"email": "test@test.com"},
                                 timeout=30)
passed = status in (200, 201)
notes = f"Status {status} — {'✅ returns 200, no crash' if passed else '❌ crashed or unexpected status'} | {str(body)[:150]}"
log(17, "POST /auth/resend-otp (non-existent email)", status, elapsed, passed, notes)

# ── 18. GET /albums/null ──────────────────────────────────────────────────────
status, elapsed, body, _ = test("GET /albums/null", requests.get, "/albums/null",
                                 headers=headers, timeout=30)
passed = status in (404, 422)
crashed = status == 500
notes = (f"✅ Returns {status} — not a crash" if passed else
         f"💥 500 INTERNAL SERVER ERROR — server crashed!" if crashed else
         f"Returned {status} — {str(body)[:150]}")
log(18, "GET /albums/null (crash test)", status, elapsed, passed, notes)

# ── FINAL SUMMARY TABLE ───────────────────────────────────────────────────────
print("\n\n" + "="*72)
print("  LIVE API AUDIT — FINAL SUMMARY TABLE")
print("="*72)
print(f"  {'#':<3} {'Test':<42} {'Status':<7} {'ms':<6} {'Result'}")
print("-"*72)

pass_count = 0
fail_count = 0
for r in results:
    icon = "✅" if r["passed"] else "❌"
    if r["passed"]:
        pass_count += 1
    else:
        fail_count += 1
    status_str = str(r["status"]) if r["status"] is not None else "ERR"
    print(f"  {r['num']:<3} {r['label']:<42} {status_str:<7} {r['elapsed']:<6} {icon}")

print("-"*72)
print(f"  TOTAL: {pass_count} PASSED / {fail_count} FAILED / {len(results)} TESTS")
print("="*72)

# Special checks summary
print("\n  📋 SPECIAL CHECKS:")
print(f"  • signed_url in gallery: see test 14 notes")
print(f"  • is_admin in login response: {results[0]['notes'] if results else 'N/A'}")
print(f"  • /albums/null crash (500): {'💥 YES — BUG!' if results[17]['status'] == 500 else '✅ No crash — returns ' + str(results[17]['status'])}")
print("="*72)
