import {transport} from './transport.js';
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
async function postSpell(actor,source,entry,origin){
 source=clone(source);source.flags??={};source.flags[ID]={fromItem:origin.uuid};
 const spell=spellFrom(source,actor,entry),message=await spell.toMessage(null,{actualCast:true,create:false,data:{castRank:spell.rank}});
 if(!message)throw Error('The spell card could not be created.');
 const data=message.toObject();foundry.utils.setProperty(data,'flags.pf2e.casting.embeddedSpell',spell.toObject());foundry.utils.setProperty(data,`flags.${ID}.origin`,origin.uuid);
 return ChatMessage.create(data);
}
async function castingChoice(item,spell){
 const a=item.actor,normal=a.spellcasting.filter(e=>e.statistic&&e.canCast(spell,{origin:item})).sort((x,y)=>y.statistic.dc.value-x.statistic.dc.value);
 if(normal.length)return {entry:normal[0].original?.id??normal[0].id};
 if(!a.itemTypes.feat.some(f=>f.slug==='trick-magic-item'))throw Error('No matching spellcasting ability or Trick Magic Item.');
 const lock=trickLock(item,a);if(lock.blocked||(turnKey()&&lock.turn===turnKey()))throw Error(lock.blocked?'Trick Magic Item is unavailable until daily preparations.':'You cannot retry Trick Magic Item this turn.');
 const map={arcane:'arcana',primal:'nature',occult:'occultism',divine:'religion'},skills=[...new Set([...spell.traditions].map(t=>map[t]).filter(Boolean))].filter(s=>a.skills[s].rank>0);
 if(!skills.length)throw Error('You are not trained in an appropriate skill.');
 const skill=await choose('Trick Magic Item',`<p>Choose the skill for ${esc(item.name)}.</p><select>${skills.map(s=>`<option value="${s}">${esc(game.i18n.localize(CONFIG.PF2E.skills[s].label))}</option>`).join('')}</select>`,skills);
 if(!skill)return null;
 const dc=[14,15,16,18,19,20,22,23,24,26,27,28,30,31,32,34,35,36,38,39,40,42,44,46,48,50][Math.clamp(item.level,0,25)]-(game.pf2e.settings.variants.pwol.enabled?item.level:0);
 const roll=await a.skills[skill].check.roll({dc:{value:dc},item,extraRollOptions:['action:trick-magic-item']});if(!roll)return null;
 if(roll.degreeOfSuccess<2){await request(a,'trickFailure',{item:item.id,critical:roll.degreeOfSuccess===0,turn:turnKey()});return null;}
 return {entry:`trick-${skill}`,trick:true};
}
async function execute(a,action,d){
 if(action==='rest'){
  await a.setFlag(ID,'restEpoch',(a.getFlag(ID,'restEpoch')??0)+1);
  for(const i of a.itemTypes.consumable.filter(i=>['wand','scroll'].includes(i.category))){const s=flags(i);if(Object.keys(s).length)await i.setFlag(ID,'state',{...s,overcharged:false});}
  const staff=a.items.get(a.getFlag(ID,'day')?.staff);if(isStaff(staff)){const charges=maxRank(a);await staff.setFlag(ID,'state',{preparedBy:a.uuid,expires:game.time.worldTime+86400,charges,max:charges});await a.setFlag(ID,'day',{staff:staff.id,rested:true});}else await a.unsetFlag(ID,'day');
  return {status:'rested'};
 }
 const item=a.items.get(d.item);if(!eligible(item))throw Error('That casting item is no longer available.');
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
  if(!isStaff(item)||!maxRank(a))throw Error('A spellcasting feature with spell slots is required.');
  const day=a.getFlag(ID,'day')??{};if(day.staff&&!day.rested)throw Error('You already prepared a staff today. Use Reset Charges to restore its current daily allocation.');
  const prior=flags(item);if(prior.preparedBy&&prior.preparedBy!==a.uuid&&prior.expires>game.time.worldTime)throw Error('Another character prepared this staff today.');
  const spells=await staffSpells(item);if(!spells.some(s=>statEntries(a,spellFrom(s.source,a,entries(a)[0])).length))throw Error('None of this staff’s spells are on your spell list.');
  let extra=0;if(d.slot){const e=a.spellcasting.get(d.slot.entry),rank=Number(d.slot.rank),slot=e?.system.slots[`slot${rank}`];if(!e?.isPrepared||!slot?.max)throw Error('Invalid prepared slot.');if(e.isFlexible){if(slot.value<1)throw Error('That slot was spent.');await e.update({[`system.slots.slot${rank}.value`]:slot.value-1});}else{const p=slot.prepared[d.slot.index];if(!p||p.expended)throw Error('That prepared slot was spent.');const prepared=Array.from({length:slot.max},(_,i)=>clone(slot.prepared[i]??{id:null,expended:false}));prepared[d.slot.index].expended=true;await e.update({[`system.slots.slot${rank}.prepared`]:prepared});}extra=rank;}
  const charges=maxRank(a)+extra;await item.setFlag(ID,'state',{preparedBy:a.uuid,expires:game.time.worldTime+86400,charges,max:charges});await a.setFlag(ID,'day',{staff:item.id});return {status:'prepared',charges};
 }
 if(action==='charges'){
  if(!isStaff(item)||a.getFlag(ID,'day')?.staff!==item.id||flags(item).preparedBy!==a.uuid)throw Error('Prepare this staff first.');
  const s=flags(item),value=d.reset?s.max:Number(d.value);if(!Number.isInteger(value)||value<0||value>s.max)throw Error('Invalid charge count.');await item.setFlag(ID,'state',{...s,charges:value});return {status:'charges',charges:value};
 }
 if(action!=='cast')throw Error('Unknown casting action.');
 if(!isStaff(item)&&!item.embeddedSpell)throw Error('Assign a spell on this wand’s item sheet before casting.');
 if(item.isStowed)throw Error('Draw this item before casting.');
 if(isStaff(item)){
  const state=flags(item),day=a.getFlag(ID,'day');if(day?.staff!==item.id||state.preparedBy!==a.uuid)throw Error('Prepare this staff first.');if(state.expires<=game.time.worldTime)throw Error('This staff’s daily charges expired. Complete daily preparations.');
  const row=(await staffSpells(item)).find(s=>s.key===d.spell);if(!row)throw Error('Spell no longer exists on the staff.');
  const e=a.spellcasting.get(d.entry),spell=e&&spellFrom(row.source,a,e);if(!e||!entries(a).includes(e)||!e.canCast(spell)||row.rank>maxRank(a))throw Error('You cannot cast this staff spell.');
  let cost=row.rank,slotEntry,slot;
  if(row.rank&&d.slot){slotEntry=a.spellcasting.get(d.slot.entry);const rank=Number(d.slot.rank);slot=slotEntry?.system.slots[`slot${rank}`];if(!slotEntry?.isSpontaneous||rank<row.rank||!slot?.value)throw Error('That spontaneous slot is unavailable.');cost=1;}
  if(state.charges<cost)throw Error('Not enough staff charges.');
  if(slot)await slotEntry.update({[`system.slots.slot${d.slot.rank}.value`]:slot.value-1});
  if(cost)await item.setFlag(ID,'state',{...state,charges:state.charges-cost});
  if(day.rested)await a.setFlag(ID,'day',{staff:item.id,rested:false});
  await postSpell(a,row.source,e,item);return {status:'cast',cost};
 }
 const e=a.spellcasting.get(d.entry),spell=item.embeddedSpell,state=flags(item);
 if(!e?.statistic||(!d.trick&&!e.canCast(spell,{origin:item})))throw Error('That spellcasting ability cannot activate this item.');
 const lock=trickLock(item,a);if(d.trick&&(!a.itemTypes.feat.some(f=>f.slug==='trick-magic-item')||lock.blocked||(turnKey()&&lock.turn===turnKey())))throw Error('Trick Magic Item is unavailable.');
 if(item.category==='wand'&&state.condition)throw Error(`This wand is ${state.condition}.`);
 const over=item.category==='wand'&&item.uses.value<1;
 if(over&&!d.overcharge)throw Error('Confirm overcharging first.');
 if(over&&state.overcharged){await item.setFlag(ID,'state',{...state,condition:'destroyed'});return {status:'destroyed'};}
 await postSpell(a,spell.toObject(),e,item);
 if(item.category==='scroll'){
  if(item.quantity>1)await item.update({'system.quantity':item.quantity-1});else await item.delete();
 }else if(!over)await item.update({'system.uses.value':Math.max(0,item.uses.value-1)});
 else{
  const roll=await new Roll('1d20').evaluate(),condition=roll.total>=10?'broken':'destroyed';await item.setFlag(ID,'state',{...state,overcharged:true,condition});
  await roll.toMessage({speaker:ChatMessage.getSpeaker({actor:a}),flavor:`${esc(item.name)} — Overcharge DC 10: ${condition}.`});
 }
 return {status:'cast',overcharge:over};
}

export async function cast(item,spellKey){
 owned(item);if(busy.has(item.uuid))return;busy.add(item.uuid);
 try{
  if(!isStaff(item)&&!item.embeddedSpell)throw Error('Assign a spell on this wand’s item sheet before casting.');
  let data={item:item.id};
  if(isStaff(item)){
   const row=(await staffSpells(item)).find(s=>s.key===spellKey);if(!row)throw Error('Spell not found.');
   const source=new CONFIG.Item.documentClass(row.source,{parent:item.actor}),e=statEntries(item.actor,source)[0];if(!e)throw Error('This spell is not on your spell list.');data.entry=e.id;data.spell=spellKey;
   if(row.rank>0){const options=entries(item.actor).filter(e=>e.isSpontaneous).flatMap(e=>Array.from({length:11-row.rank},(_,i)=>({e,rank:row.rank+i})).filter(({e,rank})=>e.system.slots[`slot${rank}`].value>0));
    if(options.length){const enough=flags(item).charges>=row.rank;const selected=await dialog('Cast from Staff',`<p>${esc(source.name)} — Rank ${row.rank}</p><select>${options.map((o,i)=>`<option value="${i}">${esc(o.e.name)} — Rank ${o.rank} (${o.e.system.slots[`slot${o.rank}`].value} left)</option>`).join('')}</select>`,[{action:'charges',label:`${row.rank} charges`,disabled:!enough,callback:()=>({})},{action:'slot',label:'1 charge + spell slot',disabled:flags(item).charges<1,callback:(_e,_b,d)=>{const o=options[Number(d.element.querySelector('select').value)];return {slot:{entry:o.e.id,rank:o.rank}};}},{action:'cancel',label:'Cancel',callback:()=>false}]);if(!selected)return;Object.assign(data,selected);}
   }
  }else{
   const choice=await castingChoice(item,item.embeddedSpell);if(!choice)return;Object.assign(data,choice);
   if(item.category==='wand'&&item.uses.value<1){const yes=await foundry.applications.api.DialogV2.confirm({window:{title:'Overcharge Wand'},content:`<p>${esc(item.name)}: ${flags(item).overcharged?'another overcharge destroys this wand without casting.':'cast again, then roll DC 10. Success breaks the wand; failure destroys it.'}</p>`});if(!yes)return;data.overcharge=true;}
  }
  return await request(item.actor,'cast',data);
 }finally{busy.delete(item.uuid);}
}
async function prepare(item){
 owned(item);const a=item.actor,options=[];
 for(const e of entries(a).filter(e=>e.isPrepared))for(let rank=1;rank<=10;rank++){const s=e.system.slots[`slot${rank}`];if(!s.max)continue;if(e.isFlexible&&s.value>0)options.push({entry:e.id,rank,label:`${e.name} — Rank ${rank}`});else if(!e.isFlexible)for(const[index,p]of Object.entries(s.prepared))if(!p.expended)options.push({entry:e.id,rank,index,label:`${e.name} — Rank ${rank}: ${a.items.get(p.id)?.name??'Empty slot'}`});}
 const selection=await choose('Prepare Staff',`<p>${esc(item.name)} gains ${maxRank(a)} charges. You may expend one prepared slot for extra charges.</p><select><option value="">No extra slot</option>${options.map((o,i)=>`<option value="${i}">${esc(o.label)}</option>`).join('')}</select>`);
 if(selection===null||selection===undefined||selection===false)return;return request(a,'prepare',{item:item.id,slot:selection===''?null:options[Number(selection)]});
}
async function render(sheet,html){
 const a=sheet.actor,root=html instanceof HTMLElement?html:html[0];if(!a.isOfType('character'))return;
 const panel=root.querySelector('.tab.activations[data-tab="activations"]');if(!panel)return;
 panel.querySelector('.item-spellcasting')?.remove();const section=document.createElement('section');section.className='item-spellcasting';panel.prepend(section);
 root.querySelector('.sub-nav [data-tab="activations"]').textContent='Item Spells';
 const items=a.inventory.contents.filter(eligible),button=(action,id,text,disabled=false,extra='')=>`<button type="button" data-item-spell-action="${action}" data-casting-item="${id}" ${disabled?'disabled':''} ${extra}>${text}</button>`;
 for(const category of ['wand','scroll','staff']){
  const group=items.filter(i=>category==='staff'?isStaff(i):category==='wand'?isWand(i):i.category===category);if(!group.length)continue;
  section.insertAdjacentHTML('beforeend',`<h3>${{wand:'Wands',scroll:'Scrolls',staff:'Staves'}[category]}</h3>`);
  for(const i of group){
   panel.querySelector(`[data-container-id="${i.id}-casting"]`)?.setAttribute('hidden','');
   const s=flags(i),prepared=a.getFlag(ID,'day')?.staff===i.id&&s.preparedBy===a.uuid,unusable=!a.isOwner||i.isStowed||!!s.condition||(category!=='staff'&&!i.embeddedSpell);
   const wandUses=`<span class="spell-slots-input"><input type="number" min="0" max="${i.uses?.max??1}" value="${i.uses?.value??0}" data-wand-uses="value" data-casting-item="${i.id}" aria-label="${esc(i.name)} daily uses remaining" ${!a.isOwner?'disabled':''}></span><span class="slash">/</span><span class="spell-max-input"><input type="number" min="1" max="9999" value="${i.uses?.max??1}" data-wand-uses="max" data-casting-item="${i.id}" aria-label="${esc(i.name)} maximum daily uses" ${!a.isOwner?'disabled':''}></span>${button('reset',i.id,'<i class="fa-solid fa-arrow-rotate-right" aria-hidden="true"></i>',!a.isOwner,'class="item-uses-reset" aria-label="Reset daily uses" title="Reset daily uses"')}${s.condition?`<span class="status">${esc(s.condition)}</span>`:''}`;
   let controls=category==='staff'?prepared?`<label>Charges <input type="number" min="0" max="${s.max}" value="${s.charges}" data-item-charges="${i.id}" ${!a.isOwner?'disabled':''}></label><span>/ ${s.max}</span>${button('charges',i.id,'Reset',!a.isOwner)}${a.getFlag(ID,'day')?.rested?button('prepare',i.id,'Prepare',!a.isOwner):''}`:button('prepare',i.id,'Prepare',!a.isOwner):`${category==='wand'?wandUses:`<span class="status">${i.quantity} remaining</span>`}${button('cast',i.id,category==='wand'&&i.uses?.value<1?'Overcharge':'Cast',unusable)}`;
   if(category==='wand'&&!i.isOfType('consumable'))controls='<span class="status">Manual activation</span>';
   if(category==='wand'&&s.condition==='broken')controls+=button('repair',i.id,'Mark repaired',!a.isOwner);
   section.insertAdjacentHTML('beforeend',`<div class="item-row"><img src="${esc(i.img)}"><button type="button" class="item-label" data-item-spell-action="open" data-casting-item="${i.id}">${esc(i.name)}</button>${i.isStowed?'<span class="status">Stowed</span>':''}${controls}</div>`);
   if(category==='wand')section.insertAdjacentHTML('beforeend',`<p class="wand-details">${!i.embeddedSpell?i.isOfType('consumable')?'Assign a spell on the item sheet before casting. ':'No embedded spell; manage this wand’s activation manually. ':''}Click the wand name for its full rules. Apply any special wand effects manually.</p>`);
   if(category==='staff'){
    const spells=await staffSpells(i);if(!spells.length)section.insertAdjacentHTML('beforeend','<p>No ranked spell list found in this staff’s description.</p>');
    for(const row of spells){const sp=new CONFIG.Item.documentClass(row.source,{parent:a}),legal=statEntries(a,sp).length>0&&row.rank<=maxRank(a);section.insertAdjacentHTML('beforeend',`<div class="item-row staff-spells"><span class="item-label">${row.rank?`Rank ${row.rank}`:'Cantrip'} · ${esc(sp.name)}</span>${button('cast',i.id,'Cast',unusable||!prepared||!legal||(!sp.isCantrip&&s.charges<1),`data-staff-spell="${esc(row.key)}"`)}</div>`);}
   }
  }
 }
 if(!items.length)section.textContent='Identified wands, scrolls and staves in your inventory appear here.';
 section.addEventListener('click',async event=>{const b=event.target.closest('[data-item-spell-action]');if(!b)return;event.preventDefault();event.stopPropagation();const i=a.items.get(b.dataset.castingItem),action=b.dataset.itemSpellAction;b.disabled=true;try{if(action==='open')await i.sheet.render(true);else if(action==='cast')await cast(i,b.dataset.staffSpell);else if(action==='prepare')await prepare(i);else await request(a,action,{item:i.id,reset:action==='charges'});}catch(e){ui.notifications.warn(e.message);}finally{b.disabled=false;}});
 section.addEventListener('change',async event=>{const input=event.target.closest('[data-item-charges],[data-wand-uses]');if(!input)return;event.stopPropagation();try{if(input.dataset.wandUses)await request(a,'wandUses',{item:input.dataset.castingItem,field:input.dataset.wandUses,value:Number(input.value)});else await request(a,'charges',{item:input.dataset.itemCharges,value:Number(input.value)});}catch(e){ui.notifications.warn(e.message);sheet.render(false);}});
}
Hooks.once('ready',()=>{
 request=transport(ID,execute);game.modules.get(ID).api={cast,staffSpells,prepare,request:(a,action,data)=>request(a,action,data),flags,maxRank,trickLock};
 const proto=CONFIG.PF2E.Item.documentClasses.consumable.prototype,original=proto.consume;
 proto.consume=async function(...args){if(this.actor?.isOfType('character')&&isConsumable(this))return cast(this);return original.apply(this,args);};
 const spellProto=CONFIG.PF2E.Item.documentClasses.spell.prototype,options=spellProto.getRollOptions;
 spellProto.getRollOptions=function(prefix='spell',...args){const result=options.call(this,prefix,...args);return this.getFlag(ID,'fromItem')?result.filter(o=>o!==`${prefix}:spell-slot`):result;};
 Hooks.on('renderCharacterSheetPF2e',(s,h)=>render(s,h).catch(e=>console.error(ID,e)));
 Hooks.on('pf2e.restForTheNight',a=>{if(a.isOwner)request(a,'rest').catch(e=>console.error(ID,e));});
});
