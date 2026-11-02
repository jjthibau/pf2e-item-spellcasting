# Validation and limits

Validated in an isolated synthetic world on Foundry VTT 14.369 / PF2e 8.6.0 with the two focused item modules enabled. The release code passed 54 native workflow assertions and 9 specialty-wand display checks with no browser errors. An earlier revision also passed 10 wand UI and 9 dialog/cancellation checks; the final display change did not alter those resource controls or dialogs.

Coverage includes separate player/GM clients, ownership routing, double clicks, last-copy consumption, native spell damage after a scroll disappears, prepared slot identity, spontaneous staff payment, daily reset, Trick Magic Item success/failure/critical failure and rest, overcharge breakage/destruction, editable uses, explicit potion overrides, unknown potion fallback and cancellation without resource consumption.

No exhaustive coverage of all items, exceptional feats, custom sheets, campaign module combinations, or mobile devices is claimed. GitHub CI runs syntax and packaging checks; it does not run the private licensed native test environment. Reproduce behavior changes in a disposable world before updating a campaign.

## Additive activation receipts (unreleased source)

`npm test` now includes 16 portable workflow tests using synthetic actor/item/spell/dialog/transport collaborators. These exercise the actual shared workflow and executor, not a duplicate rules implementation. Coverage includes legacy results/errors and unrelated consume compatibility, awaiting spell cards/resource writes, origin snapshots after final-scroll deletion, busy and cancellation branches, staff charge and slot payment/preparation, Trick Magic Item dismissal/failure/critical failure and awaited lock writes, overcharge and destruction without a cast, missing messages, partial-write errors and a single-dispatch authority timeout without retries. `npm run build` and `npm run check:release` continue to verify the explicit nine-file original/public archive.

This is portable source evidence only. No new native Foundry, emulator, production, release or deployment test occurred for the receipt addition. The historical native assertions above describe the previously published implementation, not new receipt acceptance. The receipt API is documented in [api.md](api.md); native integration of a future consumer remains a separate gate.
