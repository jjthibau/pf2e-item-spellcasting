# Validation and limits

Validated in an isolated synthetic world on Foundry VTT 14.369 / PF2e 8.6.0 with the two focused item modules enabled. The release code passed 54 native workflow assertions and 9 specialty-wand display checks with no browser errors. An earlier revision also passed 10 wand UI and 9 dialog/cancellation checks; the final display change did not alter those resource controls or dialogs.

Coverage includes separate player/GM clients, ownership routing, double clicks, last-copy consumption, native spell damage after a scroll disappears, prepared slot identity, spontaneous staff payment, daily reset, Trick Magic Item success/failure/critical failure and rest, overcharge breakage/destruction, editable uses, explicit potion overrides, unknown potion fallback and cancellation without resource consumption.

No exhaustive coverage of all items, exceptional feats, custom sheets, campaign module combinations, or mobile devices is claimed. GitHub CI runs syntax and packaging checks; it does not run the private licensed native test environment. Reproduce behavior changes in a disposable world before updating a campaign.

## Activation receipts and interrupted staff actions

`npm test` runs 27 workflow tests through the module executor and APIs. The cases include native-style card cancellation, carrying restrictions and changes while choosing a cast, Trick Magic Item, receipt validation, final-scroll deletion, interrupted staff payment and preparation, and retaining native resource edits after an interrupted staff action. `npm run build` and `npm run check:release` verify the explicit ten-file archive, byte parity and checksums.

Focused native receipt checks for the earlier source revision are recorded in [Activation receipt validation](implementation/activation-receipts-20261102.md). See [the API contract](api.md) for integration behavior.
