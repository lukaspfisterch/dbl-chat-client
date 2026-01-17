---
description: Run a live contract smoke test against the running gateway
---

This workflow validates that the `dbl-chat-client` matches the `dbl-gateway` authoritative wire contract.

1. Ensure the DBL Gateway is running at http://127.0.0.1:8010.
// turbo
2. Run the smoke test script:
```powershell
node scripts/smoke-test.js
```

The script will:
- Fetch `/capabilities` to find available providers/models.
- Send a strictly-shaped `INTENT` to `/ingress/intent`.
- Verify the `202 Accepted` response.
- Verify the event appears in the `/tail` stream.
