# Render Pre-Deploy Checklist

Date: 2026-04-11

## 1. Render Service Setup

- [ ] Confirm Render is deploying from the repository root using render.yaml.
- [ ] Confirm service name is recipe-calculator-backend.
- [ ] Confirm rootDir is backend.
- [ ] Confirm build command is npm install.
- [ ] Confirm start command is npm start.
- [ ] Confirm health check path is /api/recipes.

Reference: render.yaml

## 2. Required Environment Variables In Render

Set these in the Render dashboard before first production deploy:

- [ ] DATABASE_URL (required)
- [ ] ADMIN_BOOTSTRAP_EMAILS (required for initial admin access)
- [ ] NODE_ENV=production
- [ ] PGSSL_REJECT_UNAUTHORIZED=false (as currently configured)

Optional but recommended:

- [ ] PREFERRED_ADMIN_EMAIL
- [ ] PGSSLMODE=require

Safety check:

- [ ] DISABLE_ADMIN_GUARD is NOT set to 1

Reference: backend/.env.example

### Render Dashboard Copy-Paste Block

Add these under Render service settings -> Environment:

| Key | Value | Required | Notes |
| --- | --- | --- | --- |
| DATABASE_URL | your Neon/Postgres connection string | Yes | Must include sslmode=require unless your provider says otherwise. |
| ADMIN_BOOTSTRAP_EMAILS | vanessapringle@westlandhigh.school.nz | Yes | Comma-separate multiple bootstrap admin emails. |
| NODE_ENV | production | Yes | Enables production behavior in backend. |
| PGSSL_REJECT_UNAUTHORIZED | false | Yes (current project setting) | Keep aligned with current backend TLS expectations. |
| PREFERRED_ADMIN_EMAIL | vanessapringle@westlandhigh.school.nz | Optional | Included in admin bootstrap set by middleware. |
| PGSSLMODE | require | Optional | Keep as require unless local/trusted DB only. |
| DISABLE_ADMIN_GUARD | 0 | Optional but strongly recommended | Never set to 1 in production. |

## 3. Server-Side Admin Guard Validation

Expected behavior for protected write endpoints:

- Without x-user-email header -> 401
- With non-admin x-user-email header -> 403
- With approved admin x-user-email header -> 200 on valid request

Validated locally on 2026-04-11:

- [x] PUT /api/permissions/teacher returns 401 without header
- [x] PUT /api/permissions/teacher returns 403 for non-admin header
- [x] PUT /api/permissions/teacher returns 200 for vanessapringle@westlandhigh.school.nz
- [x] POST /api/user_roles/add returns 401 without header
- [x] POST /api/user_roles/add returns 403 for non-admin header
- [x] DELETE /api/ingredients-inventory returns 401 without header
- [x] DELETE /api/ingredients-inventory returns 403 for non-admin header

## 4. Post-Deploy Smoke Tests (Render URL)

After deployment, run these quickly against the hosted URL:

- [ ] GET /api/recipes returns 200
- [ ] GET /api/permissions/all returns 200
- [ ] PUT /api/permissions/teacher without x-user-email returns 401
- [ ] PUT /api/permissions/teacher with non-admin x-user-email returns 403
- [ ] PUT /api/permissions/teacher with admin x-user-email returns 200
- [ ] Admin Permissions page can save changes
- [ ] Admin User Roles page can add/remove roles

### PowerShell Smoke Test Commands

Replace the URL once, then run each command in order.

Preferred one-command run from repository root:

```powershell
.\scripts\render_smoke_test.ps1 -BaseUrl 'https://your-render-service.onrender.com'
```

Optional explicit admin header value:

```powershell
.\scripts\render_smoke_test.ps1 -BaseUrl 'https://your-render-service.onrender.com' -AdminEmail 'vanessapringle@westlandhigh.school.nz'
```

Manual step-by-step commands (fallback):

```powershell
$base = 'https://your-render-service.onrender.com'
```

```powershell
# 1) Basic health/content check
Invoke-WebRequest -Method GET -Uri "$base/api/recipes" -UseBasicParsing | Select-Object StatusCode
```

```powershell
# 2) Permissions metadata should be public/readable
Invoke-WebRequest -Method GET -Uri "$base/api/permissions/all" -UseBasicParsing | Select-Object StatusCode
```

```powershell
# 3) Protected write with no identity header should fail with 401
$body = @{ recipes = $true; add_recipes = $true; inventory = $true; shopping = $true; booking = $true; admin = $false } | ConvertTo-Json -Compress
try {
	Invoke-WebRequest -Method PUT -Uri "$base/api/permissions/teacher" -ContentType 'application/json' -Body $body -UseBasicParsing | Select-Object StatusCode
} catch {
	$_.Exception.Response.StatusCode.value__
}
```

```powershell
# 4) Protected write with non-admin header should fail with 403
try {
	Invoke-WebRequest -Method PUT -Uri "$base/api/permissions/teacher" -Headers @{ 'x-user-email' = 'notadmin@example.com' } -ContentType 'application/json' -Body $body -UseBasicParsing | Select-Object StatusCode
} catch {
	$_.Exception.Response.StatusCode.value__
}
```

```powershell
# 5) Protected write with bootstrap/admin header should pass with 200
try {
	Invoke-WebRequest -Method PUT -Uri "$base/api/permissions/teacher" -Headers @{ 'x-user-email' = 'vanessapringle@westlandhigh.school.nz' } -ContentType 'application/json' -Body $body -UseBasicParsing | Select-Object StatusCode
} catch {
	$_.Exception.Response.StatusCode.value__
}
```

Expected status sequence: 200, 200, 401, 403, 200.

## 5. Rollback Safety

- [ ] Keep one known admin email in ADMIN_BOOTSTRAP_EMAILS during first deployment window.
- [ ] If admin access is lost, temporarily add bootstrap email and redeploy.
- [ ] Do not use DISABLE_ADMIN_GUARD except emergency troubleshooting.
