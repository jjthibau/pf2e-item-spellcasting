# Architecture

Original browser-side ES modules with no toolbox dependency. `scripts/main.js` integrates the native PF2e item documents, sheets and chat behavior. `scripts/transport.js` validates actor ownership, elects an active actor updater and serializes requests per actor. Module sockets carry requests; no external service or telemetry is involved.

Inventory documents remain the source of truth. Module state is namespaced under `pf2e-item-spellcasting`. Native PF2e documents implement spell cards or effect rules and duration. The module patches only the relevant native methods at startup and forwards unrelated behavior. Avoid other modules automating the same item workflow; wrapper order and custom sheets can affect compatibility.

For staff actions, `scripts/staff-transactions.js` records a pending action on the actor. A staff cast uses that ID for its native chat card and verifies the card before payment. Slot, charge and reservation updates write their completion marker together with the resource changes. A retry skips completed steps and verifies that unpaid slots or charges still match the recorded values before spending them. Conflicts remain visible on Item Spells for reconciliation. The actor's daily staff selection and clearing of the pending action share one final actor update.

The release builder uses an explicit file allowlist. CI checks JavaScript syntax, manifest consistency, source/archive parity and checksums. Native gameplay testing requires the owner's separately installed Foundry and PF2e; those are never distributed here.
