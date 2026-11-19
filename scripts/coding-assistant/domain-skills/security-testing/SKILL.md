---
name: security-testing
description: Run security and vulnerability checks. Use when asked to audit, harden, or scan.
---

# Security testing

Run after functional tests. Report findings by severity. Do not exploit.

## 1. Dependency audit
- `pnpm audit` or `npm audit` for production deps
- Flag high/critical only unless asked for all
- Note if a fix is a breaking major

## 2. Secret scan
- Search for committed tokens, keys, passwords, connection strings
- Check `.env` is gitignored
- Confirm the secret store is used instead of hardcoded values

## 3. Auth and session
- Missing credentials are rejected
- Session cookies are httpOnly and secure when not on plain localhost
- CSRF on state-changing routes
- Logout actually invalidates the session

## 4. Input and injection
- SQL/query parameters are bound, not concatenated
- File paths cannot escape the repo root
- HTML output is encoded
- Upload types and sizes are limited

## 5. Headers and exposure
- No stack traces in API errors
- No directory listing
- Security headers present if the app sets them (CSP, frame options)
- CORS is not `*` with credentials

## 6. Data
- Least privilege on roles
- No cross-facility reads
- PII is not logged

## Report
- Severity: critical / high / medium / low
- Where (file or route)
- What is wrong
- Smallest fix
- What was not checked
