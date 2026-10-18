# Contributing

Open an [issue](https://github.com/jjthibau/pf2e-item-spellcasting/issues) with the Foundry, PF2e and module versions, reproduction steps, expected behavior and actual behavior. Please use a synthetic character and remove private campaign information.

Keep changes focused on this module's scope. Include native gameplay evidence for behavior changes; syntax and packaging checks alone do not establish Foundry compatibility.

Requires Node.js 24 and Python 3. Run `npm test`, `npm run build` and `npm run check:release`. A maintainer publishes by updating the manifest/package versions and versioned download URL, committing, and pushing a matching `vVERSION` tag. Release automation publishes the manifest, ZIP and checksums.

Licensed Foundry files, PF2e packs, credentials, campaign exports and private test artifacts must never be committed. Original contributions are under the MIT license.
