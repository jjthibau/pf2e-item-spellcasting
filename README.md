# PF2e Item Spellcasting

Wands, scrolls and staves together on **Spellcasting → Item Spells**, using your character's inventory and native PF2e spell cards. No daily-preparation toolbox or dependency.

## Install

In Foundry Setup → Add-on Modules → Install Module, paste this manifest URL, install, then enable **PF2e Item Spellcasting** in the world:

```
https://github.com/jjthibau/pf2e-item-spellcasting/releases/latest/download/module.json
```

Tested on **Foundry VTT 14.369 / PF2e 8.6.0**. Intended for native character sheets. Foundry's normal module update workflow follows this repository's latest release.

## Use

- **Wands:** editable current/maximum daily uses and reset arrow, native spellcasting eligibility or trained Trick Magic Item, second-use overcharge confirmation and DC 10 breakage/destruction. Broken/destroyed wands remain labeled; resetting uses does not repair them.
- **Scrolls:** cast with the appropriate spellcasting ability or Trick Magic Item; native spell cards retain their spell after the final inventory copy is consumed.
- **Staves:** Prepare once per day for charges based on your highest spell-slot rank. Prepared casters can select one actual prepared slot to spend for extra charges. Spontaneous casters choose spell-rank charges or one charge plus a same-or-higher-rank spontaneous slot. Insufficient payment options are disabled; cantrips are free.
- **Daily rest:** native Rest for the Night resets wand overcharge tracking and recharges the chosen staff. Usage and charges can also be edited/reset on the tab. After resting, staff preparation can be adjusted until its first cast.

Items must be identified and in inventory. Draw stowed items before casting. Click an item's name to open its full native rules.

## Specialty items and limitations

**Specialty wands are displayed with their real item names, but their extra effects must be handled manually.** Consumable wands retain editable native usage. Casting uses the embedded spell; it does not add special persistent damage, duration changes or recurring missiles. Consumable wands without an assigned spell appear with Cast disabled and instructions to assign it. Native equipment wand templates also appear, labeled Manual activation, with a link to their full item sheet; the module does not invent a spell or usage resource for them.

Standard staff spells are read from structured ranked lists in the native item description. Unusual descriptions and exceptional staff rules such as Staff Nexus, makeshift staves and Runelord features are not automated. Custom sheets and other modules that replace these same workflows may require an adapter. This module does not manage action costs or every item-specific rule.

See [testing](docs/testing.md), [architecture](docs/architecture.md), [changelog](CHANGELOG.md) and [contributing](CONTRIBUTING.md). Original implementation under [MIT](LICENSE). Not affiliated with Paizo or Foundry Gaming; no licensed game content is bundled.
