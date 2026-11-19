# Activation receipt API

The existing module API (`cast`, `prepare`, `request`, `staffSpells`, `flags`, `maxRank`, `trickLock`) retains its return/error behavior. Native sheet buttons and consumable activation continue to use that API. Integrations may opt into the additive API:

```js
const api = game.modules.get('pf2e-item-spellcasting')?.api?.receiptsV1;
if (api?.apiVersion === 1) {
  const receipt = await api.cast(item, staffSpellKey); // key only needed for a staff
  // Or: await api.prepare(staffItem)
}
```

These methods use the existing dialogs, ownership checks, rules and serialized native request path. They return plain bounded values, never raw Documents, spell sources or arbitrary error details:

```js
{
  apiVersion: 1,
  status: 'completed',
  operation: 'cast',
  itemUuid: 'Actor.example.Item.example',
  createdMessageUuid: 'ChatMessage.example',
  commitObserved: true,
  cast: true
}
```

`itemUuid` is captured before execution; final-scroll deletion does not erase it. Only owned-world item UUID shapes `Actor.<id>.Item.<id>` and `Scene.<id>.Token.<id>.Actor.<id>.Item.<id>` are accepted. IDs contain 1?64 ASCII letters, digits, underscores or hyphens; source UUIDs are capped at 384 characters. Message UUIDs must be world `ChatMessage.<id>` (at most 76 characters). Control characters, compendium/wrong-document paths and oversized values are rejected. Invalid source input returns `itemUuid: null` with an unknown outcome before activation; invalid authority message references also remain unknown and are never echoed.

| Status | Meaning |
| --- | --- |
| `completed` | All awaited work in the existing native executor completed. Casts include the actual spell-card UUID and `cast: true`. Preparation uses operation `prepare`, `commitObserved: true`, without a message. Already-overcharged wand destruction uses operation `destroy-wand`, `commitObserved: true`, `cast: false`, without a message. |
| `cancelled` | A choice or check dialog was cancelled, an eligibility check refused activation, or native chat creation declined to create the final card. Eligibility refusal shows a native warning. Scroll quantity, wand uses and condition, and staff payment are preserved if final card creation is canceled. |
| `busy` | This client already has a cast in progress for the item. No second cast is dispatched by this call. |
| `trick-failed` | Trick Magic Item failed and its existing failure-lock request completed. `commitObserved: true` describes that failed attempt, never a successful cast or uncommitted cancellation. |
| `unknown` | Any other exception, timeout or missing observable spell-card result prevents a completion claim. The outcome may already have committed partially or fully. Check the native world; never automatically retry. |

`itemConsumed: true` is added only after the existing final-scroll native `await item.delete()` succeeds. It is absent for remaining copies, wands, staves, failed deletion and noncompleted outcomes; it is never inferred from disappearance or quantity differences.

Other optional fields are omitted when unsupported by that outcome. `commitObserved` records that the executor observed the awaited workflow complete. Integrations can also use `api.canActivate(item)` to check the native carrying requirement before showing a Cast control. Other casting requirements still apply.

Successful casts await the native card and resource writes. A staff action records its identity on the actor before dispatch or payment. If a staff write fails after a card is created, a subsequent call for the same pending action can resume from the card and document markers. A missing card, changed unpaid resource or intervening rest can require manual reconciliation from Item Spells. Staff preparation uses the same recovery controls for an interrupted slot, reservation or daily marker write. A lost authority reply remains `unknown` even if authority-side execution succeeded. The caller should prompt the player to inspect the world before retrying an unknown result.

The public release adds `receiptsV1` in v0.1.1. Callers should feature-detect it. Validation and supported scope are documented in [testing](testing.md).
