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
| `cancelled` | An existing choice/check dialog was cancelled or dismissed, or a known local eligibility check refused activation before any check or authority dispatch. Eligibility refusal shows a native warning. Cancellation does not refund prior native checks or imply every earlier interaction was mutation-free. |
| `busy` | This client already has a cast in progress for the item. No second cast is dispatched by this call. |
| `trick-failed` | Trick Magic Item failed and its existing failure-lock request completed. `commitObserved: true` describes that failed attempt, never a successful cast or uncommitted cancellation. |
| `unknown` | Any other exception, timeout or missing observable spell-card result prevents a completion claim. The outcome may already have committed partially or fully. Check the native world; never automatically retry. |

`itemConsumed: true` is added only after the existing final-scroll native `await item.delete()` succeeds. It is absent for remaining copies, wands, staves, failed deletion and noncompleted outcomes; it is never inferred from disappearance or quantity differences.

Other optional fields are omitted when unsupported by that outcome. `commitObserved` is an observation that the executor's awaited workflow returned; it is not an atomic transaction, rollback guarantee or permission to replay. Native requests and dialogs are unchanged. There is no custom correlation service, inferred inventory delta, retry, socket replacement or transport version negotiation.

For successful casts the completion receipt is constructed only after both the native spell-card creation and all existing resource updates/deletion/overcharge work have been awaited. Failed later writes return `unknown` even if the spell card already exists. Staff preparation completes only after slot and preparation flags are awaited. A lost authority reply remains `unknown` even if authority-side execution succeeded.

Callers must feature-detect `receiptsV1`; older installed versions do not provide these guarantees. This source addition does not release or install an updated package. See [testing](testing.md) for the source-only evidence and remaining native acceptance limits.
