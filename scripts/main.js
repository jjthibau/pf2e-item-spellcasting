import {transport} from './transport.js';
import {castStaffTransaction,pendingStaff,prepareStaffTransaction,reconcileStaffTransaction,resetStaffPreparation,resumeStaffTransaction,slotPayment} from './staff-transactions.js';
export const ID='pf2e-item-spellcasting';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone=v=>foundry.utils.deepClone(v),flags=i=>i.getFlag(ID,'state')??{},busy=new Set(),staffCache=new Map();
let request;
const entries=a=>a.spellcasting.spellcastingFeatures;
const maxRank=a=>Math.max(0,...entries(a).flatMap(e=>Array.from({length:10},(_,i)=>e.system.slots[`slot${i+1}`].max>0?i+1:0)));
const isStaff=i=>i?.isOfType('weapon','equipment')&&i.traits.has('staff');
const isWand=i=>i?.isOfType('consumable')&&i.category==='wand'||i?.isOfType('equipment')&&i.traits.has('wand');
const isConsumable=i=>i?.isOfType('consumable')&&['wand','scroll'].includes(i.category)&&(i.category==='wand'||!!i.embeddedSpell);
const eligible=i=>(isStaff(i)||isConsumable(i)||isWand(i))&&i.quantity>0&&i.isIdentified;
const statEntries=(a,s)=>entries(a).filter(e=>e.canCast(s)).sort((a,b)=>b.statistic.dc.value-a.statistic.dc.value);
const turnKey=()=>game.combat?.started?`${game.combat.id}:${game.combat.round}:${game.combat.turn}`:null;
const trickLock=(i,a)=>{const lock=flags(i).trickLocks?.[a.id];return lock?.epoch===(a.getFlag(ID,'restEpoch')??0)?lock:{};};
const owned=i=>{if(!i?.actor?.isOwner)throw Error('You must own this character.');};
// Only these local eligibility refusals occur before a check or authority dispatch.
class ActivationUnavailable extends Error {}
export function canActivate(item){
 if(!item||item.isStowed||item.carryType==='dropped')return false;
 return item.system.usage?.type==='held'?item.isHeld&&item.handsHeld>=(item.system.usage.hands??1):item.isEquipped;
}
function requireActivation(item){
 if(item.actor?.items.get(item.id)!==item)throw new ActivationUnavailable('That casting item is no longer available.');
 if(!canActivate(item))throw new ActivationUnavailable('Draw or equip this item before casting.');
}
async function dialog(title,content,buttons){return foundry.applications.api.DialogV2.wait({window:{title},content,buttons,rejectClose:false});}
async function choose(title,content,options){return dialog(title,content,[{action:'choose',label:'Confirm',default:true,callback:(_e,_b,d)=>d.element.querySelector('select')?.value},{action:'cancel',label:'Cancel',callback:()=>false}]);}

export async function staffSpells(item){
 const description=item.system.description.value,key=description;if(staffCache.has(key))return staffCache.get(key);
 const doc=new DOMParser().parseFromString(description,'text/html'),list=[];
 for(const row of doc.querySelectorAll('li')){
  const title=row.querySelector('strong')?.textContent??'',rank=/cantrip/i.test(title)?0:Number(title.match(/\d+/)?.[0]);
  if(!Number.isInteger(rank)||rank<0||rank>10)continue;
  for(const m of row.innerHTML.matchAll(/@UUID\[([^\]]+)\]/g)){const spell=await fromUuid(m[1]);if(!spell?.isOfType('spell'))continue;const source=spell.toObject();source.system.location={value:null,heightenedLevel:rank||null};list.push({key:`${rank}:${spell.id}`,rank,source});}
 }
 staffCache.set(key,list);return list;
}
function spellFrom(source,actor,entry){const data=clone(source);data.system.location={...data.system.location,value:entry.id};return new CONFIG.Item.documentClass(data,{parent:actor});}
async function spellCard(actor,source,entry,origin){
 source=clone(source);source.flags??={};source.flags[ID]={fromItem:origin.uuid};
 const spell=spellFrom(source,actor,entry),message=await spell.toMessage(null,{actualCast:true,create:false,data:{castRank:spell.rank}});
 if(!message)throw Error('The spell card could not be created.');
 const data=message.toObject();foundry.utils.setProperty(data,'flags.pf2e.casting.embeddedSpell',spell.toObject());foundry.utils.setProperty(data,`flags.${ID}.origin`,origin.uuid);
 return data;
}
const worldId='[A-Za-z0-9_-]{1,64}',itemUuidPattern=new RegExp(`^(?:Actor\\.${worldId}|Scene\\.${worldId}\\.Token\\.${worldId}\\.Actor\\.${worldId})\\.Item\\.${worldId}$`),messageUuidPattern=new RegExp(`^ChatMessage\\.${worldId}$`);
const validItemUuid=value=>typeof value==='string'&&value.length<=384&&!/[^A-Za-z0-9_.-]/.test(value)&&itemUuidPattern.test(value);
const validMessageUuid=value=>typeof value==='string'&&value.length<=76&&!/[^A-Za-z0-9_.-]/.test(value)&&messageUuidPattern.test(value);
const receipt=(status,operation,itemUuid,extra={})=>validItemUuid(itemUuid)?{apiVersion:1,status,operation,itemUuid,...extra}:{apiVersion:1,status:'unknown',operation,itemUuid:null};
function completedCast(itemUuid,message,itemConsumed=false){if(!validMessageUuid(message?.uuid))throw Error('The spell card completion could not be observed.');return receipt('completed','cast',itemUuid,{createdMessageUuid:message.uuid,commitObserved:true,cast:true,...(itemConsumed?{itemConsumed:true}:{})});}
async function castingChoice(item,spell,withReceipt=false){
 const a=item.actor,normal=a.spellcasting.filter(e=>e.statistic&&e.canCast(spell,{origin:item})).sort((x,y)=>y.statistic.dc.value-x.statistic.dc.value);
 if(normal.length)return {entry:normal[0].original?.id??normal[0].id};
 if(!a.itemTypes.feat.some(f=>f.slug==='trick-magic-item'))throw new ActivationUnavailable('No matching spellcasting ability or Trick Magic Item.');
 const lock=trickLock(item,a);if(lock.blocked||(turnKey()&&lock.turn===turnKey()))throw new ActivationUnavailable(lock.blocked?'Trick Magic Item is unavailable until daily preparations.':'You cannot retry Trick Magic Item this turn.');
 const map={arcane:'arcana',primal:'nature',occult:'occultism',divine:'religion'},skills=[...new Set([...spell.traditions].map(t=>map[t]).filter(Boolean))].filter(s=>a.skills[s].rank>0);
 if(!skills.length)throw new ActivationUnavailable('You are not trained in an appropriate skill.');
 const skill=await choose('Trick Magic Item',`<p>Choose the skill for ${esc(item.name)}.</p><select>${skills.map(s=>`<option value="${s}">${esc(game.i18n.localize(CONFIG.PF2E.skills[s].label))}</option>`).join('')}</select>`,skills);
 if(!skill)return null;
 requireActivation(item);
 const dc=[14,15,16,18,19,20,22,23,24,26,27,28,30,31,32,34,35,36,38,39,40,42,44,46,48,50][Math.clamp(item.level,0,25)]-(game.pf2e.settings.variants.pwol.enabled?item.level:0);
 const roll=await a.skills[skill].check.roll({dc:{value:dc},item,extraRollOptions:['action:trick-magic-item']});if(!roll)return null;
 if(roll.degreeOfSuccess<2){await request(a,'trickFailure',{item:item.id,critical:roll.degreeOfSuccess===0,turn:turnKey()});return withReceipt?{trickFailed:true}:null;}
 return {entry:`trick-${skill}`,trick:true};
}
async function execute(a,action,d){
 if(action==='rest'){
  await a.setFlag(ID,'restEpoch',(a.getFlag(ID,'restEpoch')??0)+1);
  for(const i of a.itemTypes.consumable.filter(i=>['wand','scroll'].includes(i.category))){const s=flags(i);if(Object.keys(s).length)await i.setFlag(ID,'state',{...s,overcharged:false});}
  const staff=a.items.get(a.getFlag(ID,'day')?.staff);if(isStaff(staff)){const charges=maxRank(a);await staff.setFlag(ID,'state',{preparedBy:a.uuid,expires:game.time.worldTime+86400,charges,max:charges});await a.setFlag(ID,'day',{staff:staff.id,rested:true});}else await a.unsetFlag(ID,'day');
  await resetStaffPreparation(a);
  return {status:'rested'};
 }
 if(action==='reconcileStaff')return reconcileStaffTransaction(a,d.id);
 if(action==='resumeStaff'){
  const pending=pendingStaff(a),origin=a.items.get(pending?.item)?.uuid;
  return staffResult(await resumeStaffTransaction(a,d.id),origin,d.receiptV1);
 }
 const item=a.items.get(d.item),originUuid=item?.uuid;if(!eligible(item))throw Error('That casting item is no longer available.');
 if(action==='trickFailure'){const s=flags(item);await item.setFlag(ID,'state',{...s,trickLocks:{...s.trickLocks,[a.id]:{blocked:!!d.critical,turn:d.turn,epoch:a.getFlag(ID,'restEpoch')??0}}});return {status:'failed'};}
 if(action==='reset'){if(!isConsumable(item)||item.category!=='wand')throw Error('Not a wand.');await item.update({'system.uses.value':item.uses.max,[`flags.${ID}.state`]:{...flags(item),overcharged:false}});return {status:'reset'};}
 if(action==='wandUses'){
  if(!isConsumable(item)||item.category!=='wand'||!['value','max'].includes(d.field))throw Error('Invalid wand usage field.');
  const value=Number(d.value),limit=d.field==='max'?9999:item.uses.max;
  if(!Number.isInteger(value)||value<(d.field==='max'?1:0)||value>limit)throw Error('Enter a valid whole number of daily uses.');
  await item.update(d.field==='max'?{'system.uses.max':value,'system.uses.value':Math.min(item.uses.value,value)}:{'system.uses.value':value});return {status:'uses',value:item.uses.value,max:item.uses.max};
 }
 if(action==='repair'){if(flags(item).condition!=='broken')throw Error('Only a broken wand can be marked repaired.');await item.setFlag(ID,'state',{...flags(item),condition:null});return {status:'repaired'};}
 if(action==='prepare'){
  if(pendingStaff(a))throw Error('Resume or reconcile the pending staff action on Item Spells first.');
  if(!isStaff(item)||!maxRank(a))throw Error('A spellcasting feature with spell slots is required.');
  const day=a.getFlag(ID,'day')??{};if(day.staff&&!day.rested)throw Error('You already prepared a staff today. Use Reset Charges to restore its current daily allocation.');
  const prior=flags(item);if(prior.preparedBy&&prior.preparedBy!==a.uuid&&prior.expires>game.time.worldTime)throw Error('Another character prepared this staff today.');
  const spells=await staffSpells(item);if(!spells.some(s=>statEntries(a,spellFrom(s.source,a,entries(a)[0])).length))throw Error('None of this staff’s spells are on your spell list.');
  let payment=null;
  if(d.slot){
   const e=a.spellcasting.get(d.slot.entry);
   if(!e?.isPrepared||(!e.isFlexible&&d.slot.index==null))throw Error('Invalid prepared slot.');
   payment=slotPayment(e,Number(d.slot.rank),e.isFlexible?undefined:d.slot.index);
  }
  const result=await prepareStaffTransaction(a,item,{payment,charges:maxRank(a)+(payment?.rank??0),previous:day.rested?day.staff:null});
  return staffResult(result,originUuid,d.receiptV1);
 }
 if(action==='charges'){
  if(!isStaff(item)||a.getFlag(ID,'day')?.staff!==item.id||flags(item).preparedBy!==a.uuid)throw Error('Prepare this staff first.');
  const s=flags(item),value=d.reset?s.max:Number(d.value);if(!Number.isInteger(value)||value<0||value>s.max)throw Error('Invalid charge count.');await item.setFlag(ID,'state',{...s,charges:value});return {status:'charges',charges:value};
 }
 if(action!=='cast')throw Error('Unknown casting action.');
 if(!isStaff(item)&&!item.embeddedSpell)throw Error('Assign a spell on this wand’s item sheet before casting.');
 requireActivation(item);
 if(isStaff(item)){
  if(pendingStaff(a))throw Error('Resume or reconcile the pending staff action on Item Spells first.');
  const state=flags(item),day=a.getFlag(ID,'day');if(day?.staff!==item.id||state.preparedBy!==a.uuid)throw Error('Prepare this staff first.');if(state.expires<=game.time.worldTime)throw Error('This staff’s daily charges expired. Complete daily preparations.');
  const row=(await staffSpells(item)).find(s=>s.key===d.spell);if(!row)throw Error('Spell no longer exists on the staff.');
  const e=a.spellcasting.get(d.entry),spell=e&&spellFrom(row.source,a,e);if(!e||!entries(a).includes(e)||!e.canCast(spell)||row.rank>maxRank(a))throw Error('You cannot cast this staff spell.');
  let cost=row.rank,payment=null;
  if(row.rank&&d.slot){const entry=a.spellcasting.get(d.slot.entry),rank=Number(d.slot.rank);if(!entry?.isSpontaneous||rank<row.rank)throw Error('That spontaneous slot is unavailable.');payment=slotPayment(entry,rank);cost=1;}
  if(state.charges<cost)throw Error('Not enough staff charges.');
  const card=await spellCard(a,row.source,e,item);requireActivation(item);
  return staffResult(await castStaffTransaction(a,item,{payment,charges:state.charges,cost,spell:d.spell,card,validate:()=>requireActivation(item)}),originUuid,d.receiptV1);
 }
 const e=a.spellcasting.get(d.entry),spell=item.embeddedSpell,state=flags(item);
 if(!e?.statistic||(!d.trick&&!e.canCast(spell,{origin:item})))throw Error('That spellcasting ability cannot activate this item.');
 const lock=trickLock(item,a);if(d.trick&&(!a.itemTypes.feat.some(f=>f.slug==='trick-magic-item')||lock.blocked||(turnKey()&&lock.turn===turnKey())))throw Error('Trick Magic Item is unavailable.');
 if(item.category==='wand'&&state.condition)throw Error(`This wand is ${state.condition}.`);
 const over=item.category==='wand'&&item.uses.value<1;
 if(over&&!d.overcharge)throw Error('Confirm overcharging first.');
 if(over&&state.overcharged){await item.setFlag(ID,'state',{...state,condition:'destroyed'});return d.receiptV1?receipt('completed','destroy-wand',originUuid,{commitObserved:true,cast:false}):{status:'destroyed'};}
 const card=await spellCard(a,spell.toObject(),e,item);requireActivation(item);
 const message=await ChatMessage.create(card);
 if(!message)return d.receiptV1?receipt('cancelled','cast',originUuid):undefined;
 if(!validMessageUuid(message.uuid))throw Error('The spell card completion could not be observed.');
 let itemConsumed=false;
 if(item.category==='scroll'){
  if(item.quantity>1)await item.update({'system.quantity':item.quantity-1});else{await item.delete();itemConsumed=true;}
 }else if(!over)await item.update({'system.uses.value':Math.max(0,item.uses.value-1)});
 else{
  const roll=await new Roll('1d20').evaluate(),condition=roll.total>=10?'broken':'destroyed';await item.setFlag(ID,'state',{...state,overcharged:true,condition});
  await roll.toMessage({speaker:ChatMessage.getSpeaker({actor:a}),flavor:`${esc(item.name)} — Overcharge DC 10: ${condition}.`});
 }
 return d.receiptV1?completedCast(originUuid,message,itemConsumed):{status:'cast',overcharge:over};
}

function staffResult(result,uuid,withReceipt){
 if(result.cancelled)return withReceipt?receipt('cancelled','cast',uuid):undefined;
 if(result.kind==='prepare')return withReceipt?receipt('completed','prepare',uuid,{commitObserved:true}):{status:'prepared',charges:result.charges};
 return withReceipt?completedCast(uuid,result.message):{status:'cast',cost:result.cost};
}

function resumeOnRetry(item,kind,spell,withReceipt){
 const pending=pendingStaff(item.actor);
 if(!pending)return null;
 if(pending.kind!==kind||pending.item!==item.id||(kind==='cast'&&pending.spell!==spell))throw Error('Resume or reconcile the pending staff action on Item Spells first.');
 return request(item.actor,'resumeStaff',{id:pending.id,receiptV1:withReceipt});
}

export async function cast(item,spellKey){return castWorkflow(item,spellKey);}
async function castWorkflow(item,spellKey,withReceipt=false){
 const originUuid=item?.uuid,cancelled=()=>withReceipt?receipt('cancelled','cast',originUuid):undefined;
 owned(item);if(busy.has(originUuid))return withReceipt?receipt('busy','cast',originUuid):undefined;busy.add(originUuid);
 try{
  if(isStaff(item)){const recovery=resumeOnRetry(item,'cast',spellKey,withReceipt);if(recovery)return await recovery;}
  if(!isStaff(item)&&!item.embeddedSpell)throw Error('Assign a spell on this wand’s item sheet before casting.');
  requireActivation(item);
  let data={item:item.id,...(withReceipt?{receiptV1:true}:{})};
  if(isStaff(item)){
   const row=(await staffSpells(item)).find(s=>s.key===spellKey);if(!row)throw Error('Spell not found.');
   const source=new CONFIG.Item.documentClass(row.source,{parent:item.actor}),e=statEntries(item.actor,source)[0];if(!e)throw Error('This spell is not on your spell list.');data.entry=e.id;data.spell=spellKey;
   if(row.rank>0){const options=entries(item.actor).filter(e=>e.isSpontaneous).flatMap(e=>Array.from({length:11-row.rank},(_,i)=>({e,rank:row.rank+i})).filter(({e,rank})=>e.system.slots[`slot${rank}`].value>0));
    if(options.length){const enough=flags(item).charges>=row.rank;const selected=await dialog('Cast from Staff',`<p>${esc(source.name)} — Rank ${row.rank}</p><select>${options.map((o,i)=>`<option value="${i}">${esc(o.e.name)} — Rank ${o.rank} (${o.e.system.slots[`slot${o.rank}`].value} left)</option>`).join('')}</select>`,[{action:'charges',label:`${row.rank} charges`,disabled:!enough,callback:()=>({})},{action:'slot',label:'1 charge + spell slot',disabled:flags(item).charges<1,callback:(_e,_b,d)=>{const o=options[Number(d.element.querySelector('select').value)];return {slot:{entry:o.e.id,rank:o.rank}};}},{action:'cancel',label:'Cancel',callback:()=>false}]);if(!selected)return cancelled();Object.assign(data,selected);}
   }
  }else{
   const choice=await castingChoice(item,item.embeddedSpell,withReceipt);if(!choice)return cancelled();if(choice.trickFailed)return receipt('trick-failed','cast',originUuid,{commitObserved:true});Object.assign(data,choice);
   if(item.category==='wand'&&item.uses.value<1){const yes=await foundry.applications.api.DialogV2.confirm({window:{title:'Overcharge Wand'},content:`<p>${esc(item.name)}: ${flags(item).overcharged?'another overcharge destroys this wand without casting.':'cast again, then roll DC 10. Success breaks the wand; failure destroys it.'}</p>`});if(!yes)return cancelled();data.overcharge=true;}
  }
  requireActivation(item);
  return await request(item.actor,'cast',data);
 }finally{busy.delete(originUuid);}
}
async function prepare(item){return prepareWorkflow(item);}
async function prepareWorkflow(item,withReceipt=false){
 const originUuid=item?.uuid;owned(item);const a=item.actor,options=[];
 const recovery=resumeOnRetry(item,'prepare',undefined,withReceipt);if(recovery)return recovery;
 for(const e of entries(a).filter(e=>e.isPrepared))for(let rank=1;rank<=10;rank++){const s=e.system.slots[`slot${rank}`];if(!s.max)continue;if(e.isFlexible&&s.value>0)options.push({entry:e.id,rank,label:`${e.name} — Rank ${rank}`});else if(!e.isFlexible)for(const[index,p]of Object.entries(s.prepared))if(!p.expended)options.push({entry:e.id,rank,index,label:`${e.name} — Rank ${rank}: ${a.items.get(p.id)?.name??'Empty slot'}`});}
 const selection=await choose('Prepare Staff',`<p>${esc(item.name)} gains ${maxRank(a)} charges. You may expend one prepared slot for extra charges.</p><select><option value="">No extra slot</option>${options.map((o,i)=>`<option value="${i}">${esc(o.label)}</option>`).join('')}</select>`);
 if(selection===null||selection===undefined||selection===false)return withReceipt?receipt('cancelled','prepare',originUuid):undefined;return request(a,'prepare',{item:item.id,...(withReceipt?{receiptV1:true}:{}),slot:selection===''?null:options[Number(selection)]});
}
function boundedReceipt(value,operation,itemUuid){
 const unknown=()=>receipt('unknown',operation,itemUuid);
 if(value?.apiVersion!==1||value.itemUuid!==(itemUuid??null)||!['completed','cancelled','busy','trick-failed','unknown'].includes(value.status))return unknown();
 if(value.operation!==operation&&!(operation==='cast'&&value.operation==='destroy-wand'))return unknown();
 if(value.status==='completed'){
  if(value.commitObserved!==true)return unknown();
  if(value.operation==='cast'){if(value.cast!==true||!validMessageUuid(value.createdMessageUuid))return unknown();return completedCast(itemUuid,{uuid:value.createdMessageUuid},value.itemConsumed===true);}
  if(value.operation==='destroy-wand'){if(value.cast!==false)return unknown();return receipt('completed','destroy-wand',itemUuid,{commitObserved:true,cast:false});}
  return receipt('completed','prepare',itemUuid,{commitObserved:true});
 }
 if(value.operation!==operation)return unknown();
 if(value.status==='trick-failed')return operation==='cast'&&value.commitObserved===true?receipt('trick-failed','cast',itemUuid,{commitObserved:true}):unknown();
 return receipt(value.status,operation,itemUuid);
}
export const receiptsV1=Object.freeze({apiVersion:1,
 async cast(item,spellKey){const uuid=item?.uuid;if(!validItemUuid(uuid))return receipt('unknown','cast',null);try{return boundedReceipt(await castWorkflow(item,spellKey,true),'cast',uuid);}catch(error){if(error instanceof ActivationUnavailable){globalThis.ui?.notifications?.warn(error.message);return receipt('cancelled','cast',uuid);}warnStaffRecovery(item);return receipt('unknown','cast',uuid);}},
 async prepare(item){const uuid=item?.uuid;if(!validItemUuid(uuid))return receipt('unknown','prepare',null);try{return boundedReceipt(await prepareWorkflow(item,true),'prepare',uuid);}catch{warnStaffRecovery(item);return receipt('unknown','prepare',uuid);}}
});
function warnStaffRecovery(item){
 if(isStaff(item)&&item.actor&&pendingStaff(item.actor))globalThis.ui?.notifications?.warn('A staff action is pending. Open Item Spells to resume or reconcile it.');
}
async function render(sheet,html){
 const a=sheet.actor,root=html instanceof HTMLElement?html:html[0];if(!a.isOfType('character'))return;
 const panel=root.querySelector('.tab.activations[data-tab="activations"]');if(!panel)return;
 panel.querySelector('.item-spellcasting')?.remove();const section=document.createElement('section');section.className='item-spellcasting';panel.prepend(section);
 root.querySelector('.sub-nav [data-tab="activations"]').textContent='Item Spells';
 const recovery=pendingStaff(a);
 bindSheetActions(section,sheet,a,recovery);
 if(recovery&&a.isOwner)section.insertAdjacentHTML('beforeend',`<p role="status">A staff ${recovery.kind==='cast'?'cast':'preparation'} is pending. Resume the recorded action or check the chat card, slots and charges before reconciling it.</p><div class="item-row"><button type="button" data-item-spell-action="resumeStaff">Resume Staff Action</button><button type="button" data-item-spell-action="reconcileStaff">Reconcile Staff Action</button></div>`);
 const items=a.inventory.contents.filter(eligible),button=(action,id,text,disabled=false,extra='')=>`<button type="button" data-item-spell-action="${action}" data-casting-item="${id}" ${disabled?'disabled':''} ${extra}>${text}</button>`;
 for(const category of ['wand','scroll','staff']){
  const group=items.filter(i=>category==='staff'?isStaff(i):category==='wand'?isWand(i):i.category===category);if(!group.length)continue;
  section.insertAdjacentHTML('beforeend',`<h3>${{wand:'Wands',scroll:'Scrolls',staff:'Staves'}[category]}</h3>`);
  for(const i of group){
   panel.querySelector(`[data-container-id="${i.id}-casting"]`)?.setAttribute('hidden','');
   const s=flags(i),prepared=a.getFlag(ID,'day')?.staff===i.id&&s.preparedBy===a.uuid,available=canActivate(i),unusable=!a.isOwner||!available||!!s.condition||(category!=='staff'&&!i.embeddedSpell);
   const wandUses=`<span class="spell-slots-input"><input type="number" min="0" max="${i.uses?.max??1}" value="${i.uses?.value??0}" data-wand-uses="value" data-casting-item="${i.id}" aria-label="${esc(i.name)} daily uses remaining" ${!a.isOwner?'disabled':''}></span><span class="slash">/</span><span class="spell-max-input"><input type="number" min="1" max="9999" value="${i.uses?.max??1}" data-wand-uses="max" data-casting-item="${i.id}" aria-label="${esc(i.name)} maximum daily uses" ${!a.isOwner?'disabled':''}></span>${button('reset',i.id,'<i class="fa-solid fa-arrow-rotate-right" aria-hidden="true"></i>',!a.isOwner,'class="item-uses-reset" aria-label="Reset daily uses" title="Reset daily uses"')}${s.condition?`<span class="status">${esc(s.condition)}</span>`:''}`;
   let controls=category==='staff'?prepared?`<label>Charges <input type="number" min="0" max="${s.max}" value="${s.charges}" data-item-charges="${i.id}" ${!a.isOwner?'disabled':''}></label><span>/ ${s.max}</span>${button('charges',i.id,'Reset',!a.isOwner)}${a.getFlag(ID,'day')?.rested?button('prepare',i.id,'Prepare',!a.isOwner):''}`:button('prepare',i.id,'Prepare',!a.isOwner):`${category==='wand'?wandUses:`<span class="status">${i.quantity} remaining</span>`}${button('cast',i.id,category==='wand'&&i.uses?.value<1?'Overcharge':'Cast',unusable)}`;
   if(category==='wand'&&!i.isOfType('consumable'))controls='<span class="status">Manual activation</span>';
   if(category==='wand'&&s.condition==='broken')controls+=button('repair',i.id,'Mark repaired',!a.isOwner);
   section.insertAdjacentHTML('beforeend',`<div class="item-row"><img src="${esc(i.img)}"><button type="button" class="item-label" data-item-spell-action="open" data-casting-item="${i.id}">${esc(i.name)}</button>${available?'':`<span class="status">${i.isStowed?'Stowed':i.system.usage?.type==='held'?'Draw to cast':'Equip to cast'}</span>`}${controls}</div>`);
   if(category==='wand')section.insertAdjacentHTML('beforeend',`<p class="wand-details">${!i.embeddedSpell?i.isOfType('consumable')?'Assign a spell on the item sheet before casting. ':'No embedded spell; manage this wand’s activation manually. ':''}Click the wand name for its full rules. Apply any special wand effects manually.</p>`);
   if(category==='staff'){
    const spells=await staffSpells(i);if(!spells.length)section.insertAdjacentHTML('beforeend','<p>No ranked spell list found in this staff’s description.</p>');
    for(const row of spells){const sp=new CONFIG.Item.documentClass(row.source,{parent:a}),legal=statEntries(a,sp).length>0&&row.rank<=maxRank(a);section.insertAdjacentHTML('beforeend',`<div class="item-row staff-spells"><span class="item-label">${row.rank?`Rank ${row.rank}`:'Cantrip'} · ${esc(sp.name)}</span>${button('cast',i.id,'Cast',unusable||!prepared||!legal||(!sp.isCantrip&&s.charges<1),`data-staff-spell="${esc(row.key)}"`)}</div>`);}
   }
  }
 }
 if(!items.length)section.insertAdjacentHTML('beforeend','<p>Identified wands, scrolls and staves in your inventory appear here.</p>');
}

function bindSheetActions(section,sheet,a,recovery){
 section.addEventListener('click',async event=>{
  const b=event.target.closest('[data-item-spell-action]');if(!b)return;event.preventDefault();event.stopPropagation();
  const i=b.dataset.castingItem?a.items.get(b.dataset.castingItem):undefined,action=b.dataset.itemSpellAction;b.disabled=true;
  try{
   if(action==='open')await i.sheet.render(true);
   else if(action==='cast')await cast(i,b.dataset.staffSpell);
   else if(action==='prepare')await prepare(i);
   else if(action==='resumeStaff')await request(a,action,{id:recovery.id});
   else if(action==='reconcileStaff'){
    const confirmed=await foundry.applications.api.DialogV2.confirm({window:{title:'Reconcile Staff Action'},content:`<p>Check the staff charges and the selected spell slot${recovery.kind==='cast'?` against chat message ${esc(recovery.id)}`:''}. Apply any missing or incorrect resource changes using the character sheet first. Clearing this record allows a new staff action and leaves chat and resources as shown.</p>`});
    if(confirmed)await request(a,action,{id:recovery.id});
   }else await request(a,action,{item:i.id,reset:action==='charges'});
  }catch(e){ui.notifications.warn(e.message);}finally{b.disabled=false;}
 });
 section.addEventListener('change',async event=>{const input=event.target.closest('[data-item-charges],[data-wand-uses]');if(!input)return;event.stopPropagation();try{if(input.dataset.wandUses)await request(a,'wandUses',{item:input.dataset.castingItem,field:input.dataset.wandUses,value:Number(input.value)});else await request(a,'charges',{item:input.dataset.itemCharges,value:Number(input.value)});}catch(e){ui.notifications.warn(e.message);sheet.render(false);}});
}
Hooks.once('ready',()=>{
 request=transport(ID,execute);game.modules.get(ID).api={cast,staffSpells,prepare,receiptsV1,request:(a,action,data)=>request(a,action,data),flags,maxRank,trickLock,canActivate};
 const proto=CONFIG.PF2E.Item.documentClasses.consumable.prototype,original=proto.consume;
 proto.consume=async function(...args){if(this.actor?.isOfType('character')&&isConsumable(this))return cast(this);return original.apply(this,args);};
 const spellProto=CONFIG.PF2E.Item.documentClasses.spell.prototype,options=spellProto.getRollOptions;
 spellProto.getRollOptions=function(prefix='spell',...args){const result=options.call(this,prefix,...args);return this.getFlag(ID,'fromItem')?result.filter(o=>o!==`${prefix}:spell-slot`):result;};
 Hooks.on('renderCharacterSheetPF2e',(s,h)=>render(s,h).catch(e=>console.error(ID,e)));
 Hooks.on('pf2e.restForTheNight',a=>{if(a.isOwner)request(a,'rest').catch(e=>console.error(ID,e));});
});
