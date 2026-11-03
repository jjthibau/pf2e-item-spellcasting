# Activation receipts — 2026-11-02

Additive `api.receiptsV1` provides plain versioned completion/cancellation/busy/failed-Trick-Magic-Item/unknown outcomes for integrations while preserving legacy API, sheet and consume paths. A marked request uses the same transport and executor; successful casts retain the actual returned spell-card UUID and complete only after existing writes. The source item UUID is captured before final-scroll deletion. Preparation and destruction without a cast are distinguished explicitly. A failed Trick Magic Item attempt awaits its native lock write and is never represented as uncommitted cancellation. Errors and authority timeouts remain unknown, with no automatic retry or inventory-delta inference.

No rules, dialogs, socket/transport implementation, version, manifest, tag or deployment changed. No additional runtime file was needed; the package allowlist remains nine files. API reference documentation is repository documentation and is not an extra runtime dependency.

Validation: 18 synthetic portable tests pass through actual shared workflows and the existing transport/executor. Deferred collaborators verify no early completion; compatibility assertions cover old return/error behavior. Prepared-slot identity/contribution, spontaneous payment, final-copy deletion, all explicit cancellation branches, committed failure/destruction, missing messages/partial writes and single-dispatch timeout uncertainty are covered. Syntax, build and release-archive allowlist/source-parity/privacy/checksum validation pass.

No native lane was used for this source change. Historical published native validation does not establish new receipt behavior in Foundry. Actual provider integration, native authority routing/failure cases and device use remain separate acceptance work. No production world, emulator, old lab, release or installation was touched.

## Known preflight refusal follow-up

The Pocket Table synthetic integration reproduced a refusal with no matching
tradition or Trick Magic Item: no charge or message was consumed, but the API
reported `unknown`, leaving the mobile controls locked with unhelpful uncertainty.
The API now distinguishes only three local eligibility checks before any skill
check or authority dispatch: no eligible casting entry/Trick Magic Item, an
existing Trick Magic Item lock, and no trained eligible skill. A private error
type identifies these exact sites; the receipt API shows their existing message
through native notifications and returns `cancelled`. Error text/name matching
is not used. Legacy callers still receive the same rejected Error/message and
retain responsibility for their existing warning UI.

All check exceptions, remote authority failures and partial/post-dispatch errors
remain unknown. No rules, transport, dialogs, versions or receipt fields changed.
Three focused portable regressions cover four refusal branches with zero native
dispatches/checks/writes, unchanged legacy errors, and a check exception imitating
the safe error's name/message. All 21 portable tests pass. Native verification of
the corrected refusal is pending in the already-owned Pocket Table loopback lane;
the earlier integration cases do not prove this new source fix. This receipt was
also normalized from its original Windows encoding to UTF-8.
