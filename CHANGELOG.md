# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-01-17

### Added
- **Capabilities-Driven Model Selector**: Dynamic dropdown synchronized with Gateway `/capabilities`.
- **Live Contract Smoke Test**: Integration script (`scripts/smoke-test.js`) and Agent workflow for live Gateway validation.
- **Wire Contract Hardening**: Explicit alignment with Gateway v2 `INTENT` shapes (Top-level + Ingress Envelope).
- **Initialization Guard**: `useRef`-based guard in `useGateway` to prevent unintended model selection resets.

### Fixed
- **State Drift**: Resolved bug where UI selection was not propagating to the Gateway execution path.
- **Contract Layer Mismatch**: Fixed path for `requested_model_id` to ensure survival through Gateway admission shaping.
- **Snapshot Constraint**: Reduced snapshot limit to `2000` to comply with Gateway FastAPI validation.

### Changed
- Refactored `sendMessage` into a stable `useCallback` to prevent stale closure issues with model state.
- Improved model selector styling for the "Dark Premium" theme.
