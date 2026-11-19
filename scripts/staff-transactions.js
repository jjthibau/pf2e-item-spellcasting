const ID = 'pf2e-item-spellcasting';
const marker = `flags.${ID}.staffOperation`;
const pendingPath = `flags.${ID}.pendingStaff`;
const dayPath = `flags.${ID}.day`;
const statePath = `flags.${ID}.state`;
const stateOf = item => item?.getFlag(ID, 'state') ?? {};
export const pendingStaff = actor => actor.getFlag(ID, 'pendingStaff') || null;

function changed(resource) {
    return Error(`${resource} changed while the staff action was pending. Check the chat card, staff charges and spell slots, then use Reconcile Staff Action on Item Spells.`);
}

export function slotPayment(entry, rank, index) {
    if (!Number.isInteger(rank) || rank < 1 || rank > 10 || !entry) throw Error('Invalid spell slot.');
    const slot = entry.system.slots[`slot${rank}`];
    if (index === undefined) {
        if (!(entry.isSpontaneous || (entry.isPrepared && entry.isFlexible)) || !slot?.max || !(slot.value > 0)) {
            throw Error('That spell slot was spent or is unavailable.');
        }
        return { entry: entry.id, rank, value: slot.value };
    }
    index = Number(index);
    const prepared = slot?.prepared?.[index];
    if (!entry.isPrepared || entry.isFlexible || !Number.isInteger(index) || index < 0 || !slot || index >= slot.max || !prepared || prepared.expended) {
        throw Error('That prepared slot was spent or is unavailable.');
    }
    return { entry: entry.id, rank, index, spell: prepared.id };
}

function paymentUpdate(entry, payment) {
    if (!entry) throw changed('The spellcasting entry');
    const path = `system.slots.slot${payment.rank}`;
    const slot = entry.system.slots[`slot${payment.rank}`];
    if (payment.index === undefined) {
        if (slot.value !== payment.value) throw changed('The ranked spell pool');
        return { [`${path}.value`]: slot.value - 1 };
    }
    const selected = slot.prepared[payment.index];
    if (payment.index >= slot.max || !selected || selected.expended || selected.id !== payment.spell) throw changed('The prepared spell slot');
    const prepared = Array.from({ length: slot.max }, (_, index) =>
        foundry.utils.deepClone(slot.prepared[index] ?? { id: null, expended: false }));
    prepared[payment.index].expended = true;
    return { [`${path}.prepared`]: prepared };
}

// Each payment and its marker are written to the same document. On retry the
// marker distinguishes an acknowledged payment from a later native resource edit.
async function applyStep(document, transaction, step, update) {
    if (!document) throw changed('A casting document');
    const token = `${transaction.id}:${step}`;
    const applied = () => document.getFlag(ID, 'staffOperation') === token;
    if (applied()) return;
    const patch = update();
    try {
        await document.update({ ...patch, [marker]: token });
    } catch (error) {
        if (!applied()) throw error;
    }
    if (!applied()) throw Error(`The ${step} update could not be confirmed. Use Resume Staff Action on Item Spells.`);
}

function releaseReservation(actor, staff) {
    if (stateOf(staff).preparedBy !== actor.uuid) return null;
    return { [`${statePath}.preparedBy`]: null, [`${statePath}.expires`]: 0,
        [`${statePath}.charges`]: 0, [`${statePath}.max`]: 0 };
}

export function prepareStaffTransaction(actor, item, { payment, charges, previous }) {
    return startTransaction(actor, item, {
        kind: 'prepare', payment, charges, previous,
        expires: game.time.worldTime + 86400
    });
}

export function castStaffTransaction(actor, item, { payment, charges, cost, spell, card, validate }) {
    return startTransaction(actor, item, { kind: 'cast', payment, charges, cost, spell }, card, validate);
}

async function startTransaction(actor, item, operation, card, validate) {
    const transaction = { ...operation, item: item.id, id: foundry.utils.randomID(), epoch: actor.getFlag(ID, 'restEpoch') ?? 0 };
    await actor.setFlag(ID, 'pendingStaff', transaction);
    if (pendingStaff(actor)?.id !== transaction.id) throw Error('The staff action could not be recorded.');
    let message;
    if (card) {
        try {
            validate();
            if (operation.payment) paymentUpdate(actor.spellcasting.get(operation.payment.entry), operation.payment);
            if (operation.cost && stateOf(item).charges !== operation.charges) throw changed('The staff charge count');
        } catch (error) {
            await clearStaffTransaction(actor, transaction.id);
            throw error;
        }
        card._id = transaction.id;
        foundry.utils.setProperty(card, `flags.${ID}.staffOperation`, transaction.id);
        message = await ChatMessage.create(card, { keepId: true });
        if (!message) {
            await clearStaffTransaction(actor, transaction.id);
            return { cancelled: true };
        }
    }
    return finishTransaction(actor, transaction, message);
}

export async function resumeStaffTransaction(actor, id) {
    const transaction = pendingStaff(actor);
    if (!transaction || transaction.id !== id) throw Error('The pending staff action changed. Reopen Item Spells.');
    return finishTransaction(actor, transaction);
}

async function finishTransaction(actor, transaction, message) {
    const { kind, item, payment, charges, cost, expires, previous, id } = transaction;
    if (transaction.epoch !== (actor.getFlag(ID, 'restEpoch') ?? 0)) throw changed('The daily preparation');
    if (kind === 'cast') {
        message ??= game.messages?.get(id);
        if (message?.uuid !== `ChatMessage.${id}` || message.getFlag?.(ID, 'staffOperation') !== id) {
            throw Error(`The spell card could not be confirmed (message ID ${id}). Check the chat log, then use Resume or Reconcile Staff Action on Item Spells.`);
        }
    }
    const staff = actor.items.get(item);
    if (!staff) throw changed('The staff');
    const day = actor.getFlag(ID, 'day');
    if (kind === 'cast' && (day?.staff !== item || stateOf(staff).preparedBy !== actor.uuid)) throw changed('The staff preparation');
    if (payment) {
        const entry = actor.spellcasting.get(payment.entry);
        await applyStep(entry, transaction, 'spell slot', () => paymentUpdate(entry, payment));
    }
    if (kind === 'prepare') {
        await applyStep(staff, transaction, 'preparation', () => {
            const state = stateOf(staff);
            if (state.preparedBy && state.preparedBy !== actor.uuid && state.expires > game.time.worldTime) throw changed('The staff reservation');
            return { [`${statePath}.preparedBy`]: actor.uuid, [`${statePath}.expires`]: expires,
                [`${statePath}.charges`]: charges, [`${statePath}.max`]: charges };
        });
        const oldStaff = previous && previous !== item ? actor.items.get(previous) : null;
        const release = releaseReservation(actor, oldStaff);
        if (release) await applyStep(oldStaff, transaction, 'old reservation', () => release);
    } else if (cost) {
        await applyStep(staff, transaction, 'staff charges', () => {
            const state = stateOf(staff);
            if (state.preparedBy !== actor.uuid || state.charges !== charges) throw changed('The staff charge count or reservation');
            return { [`${statePath}.charges`]: charges - cost };
        });
    }
    await clearStaffTransaction(actor, id, { [dayPath]: { staff: item, rested: false } });
    return { item, kind, charges, cost, message };
}

async function clearStaffTransaction(actor, id, patch = {}) {
    if (pendingStaff(actor)?.id !== id) throw Error('The pending staff action changed. Reopen Item Spells.');
    try {
        await actor.update({ ...patch, [pendingPath]: false });
    } catch (error) {
        if (pendingStaff(actor)?.id === id) throw error;
    }
    if (pendingStaff(actor)?.id === id) throw Error('The staff recovery update could not be confirmed.');
}

export async function resetStaffPreparation(actor) {
    const transaction = pendingStaff(actor);
    if (transaction?.kind !== 'prepare') return;
    await reconcileStaffTransaction(actor, transaction.id);
}

export async function reconcileStaffTransaction(actor, id) {
    const transaction = pendingStaff(actor);
    if (!transaction || transaction.id !== id) throw Error('The pending staff action changed. Reopen Item Spells.');
    const staff = actor.items.get(transaction.item);
    const release = releaseReservation(actor, staff);
    if (transaction.kind === 'prepare' && release && transaction.item !== actor.getFlag(ID, 'day')?.staff &&
        staff.getFlag(ID, 'staffOperation') === `${id}:preparation`) {
        await staff.update(release);
        if (stateOf(staff).preparedBy === actor.uuid) throw Error('The incomplete staff reservation could not be released.');
    }
    await clearStaffTransaction(actor, transaction.id);
}
