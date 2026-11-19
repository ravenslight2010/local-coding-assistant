---
name: api-testing
description: Test local API endpoints for status, shape, and error handling.
---

# API testing

## Checklist
- Health returns 200
- Auth-required routes reject missing credentials
- Changed routes return the documented shape
- Error bodies do not leak stack traces or secrets
- Idempotent writes do not double-apply

## Method
1. Read the route.
2. Call it against localhost.
3. Assert status and a few key fields.
4. Call the failure path (bad id, missing body).
5. Report the raw status and a short body excerpt.
