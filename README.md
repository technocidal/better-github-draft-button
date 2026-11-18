# Better GitHub Draft Button

<a href="https://0rwx.com">
    <img src="https://0rwx.com/static/AI-W.png" width="44"/>
</a>

## Releasing

Push a semver tag (`v1.2.3`) — CI lints, packages, creates a GitHub release,
and publishes to Firefox AMO (via `web-ext sign`) and the Chrome Web Store
(via `scripts/publish-chrome.mjs`).

Required GitHub Actions secrets:

- `AMO_API_KEY`, `AMO_API_SECRET` — from the AMO Developer Hub
- `CWS_SERVICE_ACCOUNT_JSON` — Google Cloud service account key JSON
- `CWS_PUBLISHER_ID` — developer account ID from the Chrome Web Store dashboard
- `CWS_ITEM_ID` — the extension's item ID
