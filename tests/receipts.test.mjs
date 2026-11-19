import test from 'node:test';
import assert from 'node:assert/strict';
const ID='pf2e-item-spellcasting';
const docs=new Map(),messages=new Map(),dialogs=[],events=[],warnings=[];let ready,socketHandler,messageCounter=0,dialogWait,postWait,writeWait,postError,missingMessage=false,degree=2,rollCancelled=false;
globalThis.ui={notifications:{warn:message=>warnings.push(message)}};
const user={id:'test-owner',active:true};
globalThis.Hooks={once:(_n,f)=>ready=f,on:()=>{}};
globalThis.Math.clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
globalThis.foundry={utils:{deepClone:structuredClone,randomID:()=>`transaction-${++messageCounter}`,setProperty:(o,p,v)=>{const ks=p.split('.');for(const k of ks.slice(0,-1))o=o[k]??={};o[ks.at(-1)]=v;}},applications:{api:{DialogV2:{wait:async()=>{if(dialogWait)await dialogWait;return dialogs.shift();},confirm:async()=>dialogs.shift()}}}};
class Spell{constructor(data,{parent}={}){this.data=data;this.actor=parent;this.id='spell';this.name='Synthetic spell';this.rank=data.system.location?.heightenedLevel??1;this.traditions=new Set(['arcane']);}toObject(){return structuredClone(this.data);}async toMessage(){events.push('post-start');if(postWait)await postWait;if(postError)throw postError;return {toObject:()=>({content:'synthetic'})};}getRollOptions(){return [];}}
class Consumable{async consume(){return 'unrelated-consume';}}
globalThis.CONFIG={Item:{documentClass:Spell},PF2E:{skills:{arcana:{label:'Arcana'}},Item:{documentClasses:{consumable:Consumable,spell:Spell}}}};
globalThis.ChatMessage={create:async data=>{
 events.push('post-complete');if(missingMessage)return null;
 const id=data._id??String(++messageCounter),message={uuid:`ChatMessage.${id}`,getFlag:(_scope,key)=>data.flags?.[ID]?.[key]};
 messages.set(id,message);return message;
},getSpeaker:()=>({})};
globalThis.Roll=class{async evaluate(){return {total:12,toMessage:async()=>events.push('overcharge-roll')};}};
const module={};globalThis.game={user,users:Object.assign([user],{get:()=>user}),modules:new Map([[ID,module]]),messages,socket:{on:(_channel,handler)=>socketHandler=handler,emit:()=>{}},time:{worldTime:0},i18n:{localize:s=>s},pf2e:{settings:{variants:{pwol:{enabled:false}}}}};
globalThis.fromUuid=async id=>docs.get(id);
globalThis.DOMParser=class{parseFromString(){return {querySelectorAll:()=>[{querySelector:()=>({textContent:'1st'}),innerHTML:'@UUID[Spell.synthetic]'}]};}};
const {cast,receiptsV1}=await import('../scripts/main.js');ready();
let seq=0;
function fixture(category='wand',{native=true,staff=false,trick=false}={}){const id=`actor-${++seq}`,state={},spellSource={type:'spell',system:{location:{},traits:{value:[]}}},entryFlags={},itemFlags={state};const entry={id:'entry',statistic:{dc:{value:20}},system:{slots:Object.fromEntries(Array.from({length:10},(_,i)=>[`slot${i+1}`,{max:i===0?1:0,value:i===0?1:0,prepared:{0:{id:'prepared',expended:false}}}]))},canCast:()=>native,getFlag:(_m,k)=>entryFlags[k],update:async patch=>{events.push('slot-write');if(writeWait)await writeWait;for(const[k,v]of Object.entries(patch)){const ks=k.split('.');if(ks[0]==='flags')entryFlags[ks[2]]=v;else entry.system.slots[ks[2]][ks[3]]=v;}},isPrepared:false,isSpontaneous:false};
const spell=new Spell(spellSource),items=new Map(),actorFlags={};const actor={id,uuid:`Actor.${id}`,isOwner:true,primaryUpdater:user,items,itemTypes:{feat:trick?[{slug:'trick-magic-item'}]:[],consumable:[]},skills:{arcana:{rank:1,check:{roll:async()=>rollCancelled?null:{degreeOfSuccess:degree}}}},isOfType:t=>t==='character',testUserPermission:()=>true,getFlag:(_m,k)=>actorFlags[k],setFlag:async(_m,k,v)=>{events.push('actor-write');actorFlags[k]=v;},update:async patch=>{events.push('actor-commit');for(const[k,v]of Object.entries(patch))actorFlags[k.split('.')[2]]=v;},unsetFlag:async(_m,k)=>delete actorFlags[k]};
const casting=[entry];casting.spellcastingFeatures=[entry];casting.get=id=>id===entry.id?entry:null;actor.spellcasting=casting;
const item={id:'item',uuid:actor.uuid+'.Item.item',name:'Synthetic item',actor,category,quantity:1,uses:{value:1,max:1},isIdentified:true,isHeld:true,handsHeld:1,isEquipped:true,traits:new Set(staff?['staff']:[]),system:{description:{value:'Synthetic staff'},usage:{type:'held',hands:1}},embeddedSpell:spell,level:1,isOfType:(...types)=>types.includes(staff?'equipment':'consumable'),getFlag:(_m,k)=>itemFlags[k],async setFlag(_m,_k,v){events.push('item-flag');if(writeWait)await writeWait;Object.assign(state,v);},async update(patch){events.push('item-write');if(writeWait)await writeWait;for(const[k,v]of Object.entries(patch)){if(k==='system.quantity')this.quantity=v;else if(k==='system.uses.value')this.uses.value=v;else if(k.startsWith('flags.'))foundry.utils.setProperty(itemFlags,k.split('.').slice(2).join('.'),v);}},async delete(){events.push('item-delete');items.delete(this.id);this.uuid=null;}};
items.set(item.id,item);docs.set(actor.uuid,actor);docs.set('Spell.synthetic',{id:'synthetic',isOfType:t=>t==='spell',toObject:()=>spellSource});return {actor,item,entry,state,actorFlags};}
const reset=()=>{dialogs.length=0;events.length=0;warnings.length=0;messages.clear();dialogWait=postWait=writeWait=null;postError=null;missingMessage=false;degree=2;rollCancelled=false;delete game.combat;};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const tick=()=>new Promise(r=>setImmediate(r));
function bounded(r){assert.doesNotThrow(()=>structuredClone(r));assert.ok(Object.keys(r).every(k=>['apiVersion','status','operation','itemUuid','createdMessageUuid','commitObserved','cast','itemConsumed'].includes(k)));assert.equal(r.apiVersion,1);}
test('receipt API is additive and legacy wand, preparation and unrelated consumption retain returns',async()=>{reset();assert.equal(module.api.cast,cast);assert.equal(module.api.receiptsV1,receiptsV1);assert.equal(await new Consumable().consume(),'unrelated-consume');const f=fixture();assert.deepEqual(await module.api.cast(f.item),{status:'cast',overcharge:false});const p=fixture('staff',{staff:true});dialogs.push('');assert.deepEqual(await module.api.prepare(p.item),{status:'prepared',charges:1});});
test('completed cast awaits posting and final resource write; exposes only a real message UUID',async()=>{reset();const f=fixture(),post=deferred(),write=deferred();postWait=post.promise;writeWait=write.promise;let settled=false;const pending=receiptsV1.cast(f.item).then(r=>(settled=true,r));await tick();assert.equal(settled,false);post.resolve();await tick();assert.equal(settled,false);write.resolve();const r=await pending;bounded(r);assert.equal(r.status,'completed');assert.equal(r.cast,true);assert.equal(r.commitObserved,true);assert.match(r.createdMessageUuid,/^ChatMessage\./);assert.equal(f.item.uses.value,0);});
test('final scroll receipt snapshots origin before awaited native deletion',async()=>{reset();const f=fixture('scroll'),uuid=f.item.uuid,r=await receiptsV1.cast(f.item);bounded(r);assert.equal(r.itemUuid,uuid);assert.equal(r.status,'completed');assert.equal(f.actor.items.size,0);assert.equal(f.item.uuid,null);assert.equal(r.itemConsumed,true);});
test('busy and overcharge cancellation are explicit while legacy busy and cancellation stay undefined',async()=>{reset();const f=fixture(),wait=deferred();postWait=wait.promise;const pending=receiptsV1.cast(f.item);await tick();assert.equal((await receiptsV1.cast(f.item)).status,'busy');assert.equal(await cast(f.item),undefined);wait.resolve();await pending;postWait=null;dialogs.push(false);assert.equal((await receiptsV1.cast(f.item)).status,'cancelled');dialogs.push(false);assert.equal(await cast(f.item),undefined);});
test('second overcharge destruction is committed but explicitly does not cast',async()=>{reset();const f=fixture();f.item.uses.value=0;f.state.overcharged=true;dialogs.push(true);assert.deepEqual(await receiptsV1.cast(f.item),{apiVersion:1,status:'completed',operation:'destroy-wand',itemUuid:f.item.uuid,commitObserved:true,cast:false});assert.equal(f.state.condition,'destroyed');assert.equal(events.includes('post-start'),false);});
test('first overcharge completion awaits native roll and preserves legacy result',async()=>{reset();const f=fixture();f.item.uses.value=0;dialogs.push(true);const r=await receiptsV1.cast(f.item);assert.equal(r.status,'completed');assert.equal(f.state.condition,'broken');assert.ok(events.includes('overcharge-roll'));const g=fixture();g.item.uses.value=0;dialogs.push(true);assert.deepEqual(await cast(g.item),{status:'cast',overcharge:true});});
test('Trick Magic Item choice and check dismissal are cancelled; failures commit failed attempt only',async()=>{reset();for(const mode of ['choice','roll','failure','critical']){const f=fixture('wand',{native:false,trick:true});degree=mode==='critical'?0:1;rollCancelled=mode==='roll';dialogs.push(mode==='choice'?false:'arcana');const r=await receiptsV1.cast(f.item);bounded(r);assert.equal(r.status,['failure','critical'].includes(mode)?'trick-failed':'cancelled');assert.equal(r.cast,undefined);assert.equal(f.item.uses.value,1);if(r.status==='trick-failed'){assert.equal(r.commitObserved,true);assert.equal(f.state.trickLocks[f.actor.id].blocked,mode==='critical');}}});
test('legacy Trick Magic Item failure remains undefined and legacy errors still reject',async()=>{reset();const f=fixture('wand',{native:false,trick:true});dialogs.push('arcana');degree=1;assert.equal(await cast(f.item),undefined);const denied=fixture();denied.actor.isOwner=false;await assert.rejects(cast(denied.item),/own/);assert.equal((await receiptsV1.cast(denied.item)).status,'unknown');});

test('known local eligibility refusals warn and cancel before any check, card or resource dispatch',async()=>{
 for(const mode of ['no-trick','untrained','blocked','same-turn']){
  reset();const f=fixture('wand',{native:false,trick:mode!=='no-trick'});
  if(mode==='untrained')f.actor.skills.arcana.rank=0;
  if(mode==='blocked')f.state.trickLocks={[f.actor.id]:{blocked:true,epoch:0}};
  if(mode==='same-turn'){game.combat={started:true,id:'combat',round:1,turn:0};f.state.trickLocks={[f.actor.id]:{turn:'combat:1:0',epoch:0}};}
  let checks=0;f.actor.skills.arcana.check.roll=async()=>{checks++;throw Error('Must not roll');};
  const r=await receiptsV1.cast(f.item);bounded(r);
  assert.equal(r.status,'cancelled');assert.equal(r.commitObserved,undefined);assert.equal(r.createdMessageUuid,undefined);
  assert.equal(checks,0);assert.equal(f.item.uses.value,1);assert.equal(events.length,0);assert.equal(warnings.length,1);
  assert.match(warnings[0],/matching spellcasting|not trained|unavailable|cannot retry/);
 }
 reset();
});

test('legacy eligibility refusals still reject without API-owned warnings',async()=>{
 reset();const f=fixture('wand',{native:false});
 await assert.rejects(cast(f.item),/No matching spellcasting ability or Trick Magic Item/);
 assert.deepEqual(warnings,[]);assert.equal(events.length,0);assert.equal(f.item.uses.value,1);
});

test('check exceptions cannot masquerade as safe eligibility refusal by name or message',async()=>{
 reset();const f=fixture('wand',{native:false,trick:true});dialogs.push('arcana');
 f.actor.skills.arcana.check.roll=async()=>{throw Object.assign(Error('No matching spellcasting ability or Trick Magic Item.'),{name:'ActivationUnavailable'});};
 const r=await receiptsV1.cast(f.item);assert.equal(r.status,'unknown');assert.equal(r.commitObserved,undefined);
 assert.deepEqual(warnings,[]);assert.equal(f.item.uses.value,1);
});
test('receipt errors, timeouts and write rejection never claim completion or retry',async()=>{reset();for(const mode of ['post','write']){const f=fixture();postError=mode==='post'?Error('Request timed out; private details'):null;if(mode==='write')f.item.update=async()=>{throw Error('Uncertain write');};const r=await receiptsV1.cast(f.item);bounded(r);assert.equal(r.status,'unknown');assert.equal(r.commitObserved,undefined);assert.equal(r.createdMessageUuid,undefined);}reset();const f=fixture();postError=Error('legacy error');await assert.rejects(cast(f.item),/legacy error/);});
test('prepare cancellation covers close and false; completed prepare awaits native flags',async()=>{reset();for(const selection of [null,undefined,false]){dialogs.push(selection);const f=fixture('staff',{staff:true});assert.equal((await receiptsV1.prepare(f.item)).status,'cancelled');assert.equal(f.state.charges,undefined);}const f=fixture('staff',{staff:true}),wait=deferred();writeWait=wait.promise;dialogs.push('');let settled=false;const pending=receiptsV1.prepare(f.item).then(r=>(settled=true,r));await tick();assert.equal(settled,false);wait.resolve();const r=await pending;assert.equal(r.status,'completed');assert.equal(r.operation,'prepare');assert.equal(r.commitObserved,true);assert.equal(f.state.charges,1);});
test('staff payment cancellation and completed charge payment preserve native path',async()=>{reset();const f=fixture('staff',{staff:true});f.entry.isSpontaneous=true;Object.assign(f.state,{charges:2,preparedBy:f.actor.uuid,expires:86400});f.actorFlags.day={staff:f.item.id};dialogs.push(false);assert.equal((await receiptsV1.cast(f.item,'1:synthetic')).status,'cancelled');assert.equal(f.state.charges,2);dialogs.push({});const r=await receiptsV1.cast(f.item,'1:synthetic');assert.equal(r.status,'completed');assert.equal(f.state.charges,1);dialogs.push({});assert.deepEqual(await cast(f.item,'1:synthetic'),{status:'cast',cost:1});});
test('remote authority timeout returns unknown after one dispatch without retry',async()=>{reset();const f=fixture(),remote={id:'remote-updater',active:true};f.actor.primaryUpdater=remote;const originalTimer=globalThis.setTimeout,originalEmit=game.socket.emit;let dispatches=0;game.socket.emit=()=>dispatches++;globalThis.setTimeout=fn=>{queueMicrotask(fn);return 0;};try{const r=await receiptsV1.cast(f.item);assert.equal(r.status,'unknown');assert.equal(dispatches,1);assert.equal(f.item.uses.value,1);}finally{globalThis.setTimeout=originalTimer;game.socket.emit=originalEmit;}});
test('failed Trick Magic Item awaits lock commit and preparation errors remain uncertain',async()=>{reset();const f=fixture('wand',{native:false,trick:true}),wait=deferred();degree=1;dialogs.push('arcana');writeWait=wait.promise;let settled=false;const pending=receiptsV1.cast(f.item).then(r=>(settled=true,r));await tick();assert.equal(settled,false);wait.resolve();assert.equal((await pending).status,'trick-failed');reset();const p=fixture('staff',{staff:true});dialogs.push('');p.actor.update=async()=>{throw Error('Actor write uncertain after item charges');};const r=await receiptsV1.prepare(p.item);assert.equal(r.status,'unknown');assert.equal(p.state.charges,1);assert.equal(r.commitObserved,undefined);});
test('prepared staff slot contribution and spontaneous slot payment retain native allocation',async()=>{reset();const p=fixture('staff',{staff:true});p.entry.isPrepared=true;dialogs.push('0');const r=await receiptsV1.prepare(p.item);assert.equal(r.status,'completed');assert.equal(p.entry.system.slots.slot1.prepared[0].id,'prepared');assert.equal(p.entry.system.slots.slot1.prepared[0].expended,true);assert.equal(p.state.charges,2);const f=fixture('staff',{staff:true});f.entry.isSpontaneous=true;Object.assign(f.state,{charges:2,preparedBy:f.actor.uuid,expires:86400});f.actorFlags.day={staff:f.item.id};dialogs.push({slot:{entry:f.entry.id,rank:1}});assert.equal((await receiptsV1.cast(f.item,'1:synthetic')).status,'completed');assert.equal(f.entry.system.slots.slot1.value,0);assert.equal(f.state.charges,1);});

test('itemConsumed is emitted only after successful final-scroll deletion and legacy results stay exact',async()=>{reset();const multiple=fixture('scroll');multiple.item.quantity=2;assert.equal((await receiptsV1.cast(multiple.item)).itemConsumed,undefined);const wand=fixture();assert.equal((await receiptsV1.cast(wand.item)).itemConsumed,undefined);const final=fixture('scroll');assert.deepEqual(await cast(final.item),{status:'cast',overcharge:false});const failure=fixture('scroll');failure.item.delete=async()=>{throw Error('Uncertain delete');};const r=await receiptsV1.cast(failure.item);assert.equal(r.status,'unknown');assert.equal(r.itemConsumed,undefined);});
test('older or malformed authority replies remain bounded unknown and valid replies discard extra fields',async()=>{reset();const originalEmit=game.socket.emit;try{for(const outcome of ['legacy','malformed','valid']){const f=fixture();f.actor.primaryUpdater={id:'remote',active:true};game.socket.emit=(channel,request)=>{const value=outcome==='legacy'?{status:'cast',overcharge:false}:outcome==='malformed'?{apiVersion:1,status:'completed',operation:'cast',itemUuid:f.item.uuid,commitObserved:true}:{apiVersion:1,status:'completed',operation:'cast',itemUuid:f.item.uuid,commitObserved:true,cast:true,createdMessageUuid:'ChatMessage.remote',privateDocument:{secret:true}};queueMicrotask(()=>socketHandler({reply:true,id:request.id,value}));};const r=await receiptsV1.cast(f.item);bounded(r);assert.equal(r.status,outcome==='valid'?'completed':'unknown');assert.equal(r.privateDocument,undefined);}}finally{game.socket.emit=originalEmit;}});

test('source receipts accept only bounded world owned-item UUIDs and never echo malformed values',async()=>{reset();const invalid=[null,42,{},'Item.standalone','Actor.a','Compendium.pack.items.Item.a','Actor.a.Item.b.extra','Actor.a.Item.'+'a'.repeat(65),'Actor.a.Item.b\n','Actor.a.Item.b\u0000','Actor.a.Item.b\u2028','Actor.a.Item.'+'x'.repeat(10000)];for(const uuid of invalid){const f=fixture();f.item.uuid=uuid;const before=events.length;for(const invoke of [()=>receiptsV1.cast(f.item),()=>receiptsV1.prepare(f.item)]){const r=await invoke();assert.equal(r.status,'unknown');assert.equal(r.itemUuid,null);assert.ok(JSON.stringify(r).length<120);}assert.equal(events.length,before);}for(const uuid of ['Actor.Ab12Cd34Ef56Gh78.Item.Zy98Xw76Vu54Ts32','Scene.scene-1.Token.token_2.Actor.actor-3.Item.item_4']){const f=fixture();f.item.uuid=uuid;const r=await receiptsV1.cast(f.item);assert.equal(r.status,'completed');assert.equal(r.itemUuid,uuid);}});
test('malformed, wrong-document, control and oversized message UUIDs stay unknown without retry',async()=>{reset();const originalEmit=game.socket.emit;try{for(const uuid of ['Actor.someone','Compendium.test.ChatMessage.a','ChatMessage.','ChatMessage.a.extra','ChatMessage.a\n','ChatMessage.a\u0000','ChatMessage.a\u2028','ChatMessage.'+'x'.repeat(65),'ChatMessage.'+'x'.repeat(10000)]){const f=fixture();f.actor.primaryUpdater={id:'remote',active:true};let calls=0;game.socket.emit=(_channel,request)=>{calls++;queueMicrotask(()=>socketHandler({reply:true,id:request.id,value:{apiVersion:1,status:'completed',operation:'cast',itemUuid:f.item.uuid,commitObserved:true,cast:true,createdMessageUuid:uuid}}));};const r=await receiptsV1.cast(f.item);assert.equal(r.status,'unknown');assert.equal(r.createdMessageUuid,undefined);assert.equal(calls,1);assert.ok(JSON.stringify(r).length<150);}}finally{game.socket.emit=originalEmit;}const create=ChatMessage.create;ChatMessage.create=async()=>({uuid:'Actor.not-a-message'});try{const r=await receiptsV1.cast(fixture().item);assert.equal(r.status,'unknown');assert.equal(r.createdMessageUuid,undefined);}finally{ChatMessage.create=create;}});

function preparedStaff() {
 const f=fixture('staff',{staff:true});
 f.entry.isSpontaneous=true;
 f.entry.system.slots.slot1.value=2;
 Object.assign(f.state,{charges:3,max:3,preparedBy:f.actor.uuid,expires:86400});
 f.actorFlags.day={staff:f.item.id,rested:true};
 return f;
}

test('final chat cancellation preserves scroll stock, normal uses, overcharge condition and staff payment',async()=>{
 for(const category of ['scroll','wand','overcharge','staff']){
  reset();
  const f=category==='staff'?preparedStaff():fixture(category==='overcharge'?'wand':category);
  if(category==='overcharge'){f.item.uses.value=0;dialogs.push(true);}
  if(category==='staff')dialogs.push({slot:{entry:f.entry.id,rank:1}});
  missingMessage=true;
  const r=await receiptsV1.cast(f.item,category==='staff'?'1:synthetic':undefined);
  assert.equal(r.status,'cancelled');
  assert.equal(f.actor.items.get(f.item.id),f.item);
  assert.equal(f.item.uses.value,category==='overcharge'?0:1);
  assert.equal(f.state.condition,undefined);
  assert.equal(f.state.overcharged,undefined);
  assert.equal(events.includes('overcharge-roll'),false);
  if(category==='staff'){
   assert.equal(f.state.charges,3);
   assert.equal(f.entry.system.slots.slot1.value,2);
   assert.equal(f.actorFlags.day.rested,true);
   assert.equal(f.actorFlags.pendingStaff,false);
  }
 }
});

test('standard items require the configured hands before Trick Magic Item and again after preparing the card',async()=>{
 for(const category of ['scroll','wand','staff']){
  reset();
  const f=category==='staff'?preparedStaff():fixture(category,{native:false,trick:true});
  f.actor.skills.arcana.check.roll=async()=>{assert.fail('An undrawn item must not roll Trick Magic Item');};
  for(const stowed of [false,true]){
   Object.assign(f.item,{isHeld:false,handsHeld:0,isStowed:stowed});
   assert.equal((await receiptsV1.cast(f.item,'1:synthetic')).status,'cancelled');
   await assert.rejects(cast(f.item,'1:synthetic'),/Draw or equip/);
   assert.deepEqual(events,[]);
  }
 }
 reset();
 const f=fixture();f.item.system.usage={type:'held',hands:2};
 assert.equal((await receiptsV1.cast(f.item)).status,'cancelled');
 f.item.handsHeld=2;
 const delay=deferred();postWait=delay.promise;
 const castWhileDrawn=receiptsV1.cast(f.item);await tick();f.item.isHeld=false;
 delay.resolve();assert.equal((await castWhileDrawn).status,'cancelled');
 assert.equal(messages.size,0);assert.equal(f.item.uses.value,1);
 f.item.system.usage={type:'worn'};f.item.isEquipped=true;
 assert.equal((await receiptsV1.cast(f.item)).status,'completed');
});

test('staff retries resume the recorded card and payment after dispatch, slot or staff writes',async()=>{
 for(const failure of ['after-card','after-slot','after-charges']){
  reset();const f=preparedStaff(),create=ChatMessage.create,updateItem=f.item.update,updateActor=f.actor.update;
  if(failure==='after-card')ChatMessage.create=async(...args)=>{await create(...args);throw Error('Connection interrupted after post');};
  if(failure==='after-slot')f.item.update=async()=>{throw Error('Interrupted before staff payment');};
  if(failure==='after-charges')f.actor.update=async()=>{throw Error('Interrupted before final actor write');};
  try{
   dialogs.push({slot:{entry:f.entry.id,rank:1}});
   assert.equal((await receiptsV1.cast(f.item,'1:synthetic')).status,'unknown');
   assert.ok(f.actorFlags.pendingStaff.id);
   assert.equal(messages.size,1);
  }finally{ChatMessage.create=create;f.item.update=updateItem;f.actor.update=updateActor;}
  if(failure!=='after-card')f.entry.system.slots.slot1.value=3;
  if(failure==='after-charges')f.state.charges=1;
  const retry=failure==='after-slot'?await cast(f.item,'1:synthetic'):await receiptsV1.cast(f.item,'1:synthetic');
  assert.equal(retry.status,failure==='after-slot'?'cast':'completed');
  assert.equal(messages.size,1);
  assert.equal(f.entry.system.slots.slot1.value,failure==='after-card'?1:3);
  assert.equal(f.state.charges,failure==='after-charges'?1:2);
  assert.equal(f.actorFlags.pendingStaff,false);
 }
});

test('ambiguous staff cards and changed unpaid resources require explicit reconciliation',async()=>{
 reset();const f=preparedStaff(),create=ChatMessage.create;
 ChatMessage.create=async()=>{throw Error('Unknown dispatch');};
 try{
  dialogs.push({});
  assert.equal((await receiptsV1.cast(f.item,'1:synthetic')).status,'unknown');
 }finally{ChatMessage.create=create;}
 const pending=f.actorFlags.pendingStaff;
 assert.equal((await receiptsV1.cast(f.item,'1:synthetic')).status,'unknown');
 assert.equal(messages.size,0);
 assert.equal(f.state.charges,3);
 await assert.rejects(module.api.request(f.actor,'reconcileStaff',{id:'another'}),/changed/);
 await module.api.request(f.actor,'reconcileStaff',{id:pending.id});
 ChatMessage.create=async(...args)=>{await create(...args);f.state.charges=2;throw Error('Reply lost');};
 try{dialogs.push({});assert.equal((await receiptsV1.cast(f.item,'1:synthetic')).status,'unknown');}
 finally{ChatMessage.create=create;}
 await assert.rejects(cast(f.item,'1:synthetic'),/staff charge count or reservation changed/);
 assert.equal(messages.size,1);assert.equal(f.state.charges,2);
});

test('interrupted preparation reuses one flexible slot and preserves its selected spells',async()=>{
 for(const step of ['staff','actor']){
  reset();const f=fixture('staff',{staff:true});f.entry.isPrepared=true;f.entry.isFlexible=true;
  const before=structuredClone(f.entry.system.slots.slot1.prepared),updateItem=f.item.update,updateActor=f.actor.update;
  if(step==='staff')f.item.update=async()=>{throw Error('Interrupted after spell slot');};
  else f.actor.update=async()=>{throw Error('Interrupted after staff flag');};
  dialogs.push('0');assert.equal((await receiptsV1.prepare(f.item)).status,'unknown');
  assert.equal(f.entry.system.slots.slot1.value,0);assert.deepEqual(f.entry.system.slots.slot1.prepared,before);
  f.item.update=updateItem;f.actor.update=updateActor;
  assert.equal((await receiptsV1.prepare(f.item)).status,'completed');
  assert.equal(events.filter(event=>event==='slot-write').length,1);
  assert.equal(f.state.charges,2);assert.equal(f.actorFlags.day.staff,f.item.id);
 }
});

test('native rest retires a pending preparation and switching releases only the original owner’s staff',async()=>{
 reset();
 const f=preparedStaff();delete f.actorFlags.day;
 const updateActor=f.actor.update;f.actor.update=async()=>{throw Error('Stopped after staff flag');};
 dialogs.push('');assert.equal((await receiptsV1.prepare(f.item)).status,'unknown');
 f.actor.update=updateActor;await module.api.request(f.actor,'rest');
 assert.equal(f.actorFlags.pendingStaff,false);assert.equal(f.state.preparedBy,null);
 for(const independentlyReserved of [false,true]){
  const old=preparedStaff(),replacement=fixture('staff',{staff:true});
  replacement.item.id='replacement';replacement.item.uuid=`${old.actor.uuid}.Item.replacement`;replacement.item.actor=old.actor;
  old.actor.items.set(replacement.item.id,replacement.item);
  await module.api.request(old.actor,'rest');
  if(independentlyReserved)old.state.preparedBy='Actor.independent';
  dialogs.push('');assert.equal((await receiptsV1.prepare(replacement.item)).status,'completed');
  assert.equal(old.state.preparedBy,independentlyReserved?'Actor.independent':null);
  assert.equal(old.actorFlags.day.staff,replacement.item.id);
 }
});
