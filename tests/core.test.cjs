'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
require('../dist/core.js');require('../dist/maps.js');require('../dist/network.js');const C=globalThis.CA;
function arena(mode='TEAM',map=C.MAPS[0]){const a=new C.Arena();a.start(mode,map);a.updateAI=()=>{};return a;}
function advance(a,seconds,input={}){for(let t=0;t<seconds-1e-8;t+=.025)a.tick(Math.min(.025,seconds-t),input);}
function openMap(){return {...C.MAPS[0],landmarkParts:[],landmarks:[],grid:Array.from({length:27},(_,y)=>Array.from({length:30},(_,x)=>!x||!y||x===29||y===26?1:0))};}
function shootingArena(){const a=arena('TEAM',openMap());a.checkRules=()=>{};const p=a.player(),t=a.entities[5];p.x=224;p.y=224;p.angle=0;t.x=340;t.y=224;for(const e of a.entities)if(e!==p&&e!==t)e.alive=false;return {a,p,t};}

test('all four authored maps have reachable, non-overlapping distributed spawn layouts',()=>{
  assert.equal(C.MAPS.length,4);for(const m of C.MAPS){assert.equal(m.width,30);assert.equal(m.height,27);assert.equal(m.ffa.length,10);assert.equal(m.hunters.length,9);assert.equal(m.points.length,3);
    const points=[...m.ffa,...m.spawns.BLUE,...m.spawns.RED,...m.points,...m.pickups];for(const p of points){assert.ok(C.canStand(m,p.x,p.y,19),m.name);if(C.dist(points[0],p)>64)assert.ok(C.pathfind(m,points[0],p).length,m.name);}
    for(let i=0;i<10;i++)for(let j=i+1;j<10;j++)assert.ok(C.dist(m.ffa[i],m.ffa[j])>80);
  }
});

test('V0.1.5 weapon order is knife, AR, shotgun, crossbow, MAC, grenade',()=>{assert.deepEqual(C.WEAPONS.map(w=>w.name),['KNIFE','AR','SHOTGUN','CROSSBOW','MAC','GRENADE']);const a=arena(),p=a.player();assert.equal(p.ammo[5],2);p.weapon=0;a.tick(.025,{forward:1});const knife=p.moveSpeed;p.vx=p.vy=0;p.weapon=1;a.tick(.025,{forward:1});const rifle=p.moveSpeed;assert.ok(knife>rifle*1.14&&knife<rifle*1.16);});
test('grenade quantity is capped at two and does not reload',()=>{const {a,p}=shootingArena();p.weapon=5;assert.equal(p.ammo[5],2);assert.equal(a.fire(p,0,0),true);p.cooldown=0;assert.equal(a.fire(p,0,0),true);p.cooldown=0;assert.equal(a.fire(p,0,0),false);assert.equal(p.ammo[5],0);assert.equal(a.reload(p),false);});
test('every local mode creates exactly 10 combatants with the correct teams',()=>{
  for(const mode of Object.keys(C.MODES)){const a=arena(mode);assert.equal(a.entities.length,10);if(mode==='BOSS'){assert.equal(a.player().maxHp,2000);assert.equal(a.player().maxShield,1000);assert.equal(a.entities.filter(e=>e.team==='HUNTERS').length,9);}else if(!C.MODES[mode].ffa){assert.equal(a.entities.filter(e=>e.team==='BLUE').length,5);assert.equal(a.entities.filter(e=>e.team==='RED').length,5);}else assert.deepEqual(a.entities.slice(1).map(e=>e.name),Array.from({length:9},(_,i)=>'SOLO-'+(i+2)));}
});
test('FFA enemy decisions ignore all team labels and exclude self',()=>{for(const mode of['INFINITY']){const a=arena(mode);for(const e of a.entities)e.team='BLUE';for(const e of a.entities){assert.equal(C.enemy(e,e,mode),false);for(const t of a.entities)if(e!==t)assert.equal(C.enemy(e,t,mode),true);}}});
test('TEAM and EXPLOSION never respawn an eliminated player in the same round',()=>{for(const mode of ['TEAM','EXPLOSION']){const a=arena(mode),p=a.player();a.damage(p,1000,a.entities[5]);advance(a,1);assert.equal(p.alive,false);assert.equal(a.round,1);assert.ok(['PLAYING','ROUND_END'].includes(a.state));}});
test('TEAM seven wins moves through ROUND_END and MATCH_END, returns to lobby, and resets all cheats',()=>{
  const a=arena(),id=a.map.id;a.cheats={aim:true,esp:true,noRecoil:true};for(let round=1;round<=7;round++){a.finishRound('BLUE','test');assert.equal(a.state,'ROUND_END');assert.equal(a.score.BLUE,round);advance(a,3.6);assert.equal(a.map.id,id);if(round<7)assert.equal(a.state,'PLAYING');}
  assert.equal(a.state,'MATCH_END');assert.deepEqual(a.cheats,{aim:false,esp:false,noRecoil:false});advance(a,7.1);assert.equal(a.state,'LOBBY');
});
test('TEAM timeout compares survivor count before combined HP and shield',()=>{const a=arena();a.entities[5].alive=false;a.entities.filter(e=>e.team==='BLUE').forEach(e=>{e.hp=1;e.shield=0;});a.roundEndsAt=0;a.checkRules();assert.equal(a.result.winner,'BLUE');});
test('TEAM timeout uses HP + shield, then draws on an exact tie',()=>{const a=arena();a.entities[0].shield=49;a.roundEndsAt=0;a.checkRules();assert.equal(a.result.winner,'RED');const b=arena();b.roundEndsAt=0;b.checkRules();assert.equal(b.result.draw,true);assert.equal(b.score.BLUE+b.score.RED,0);advance(b,3.6);assert.equal(b.state,'PLAYING');});
test('EXPLOSION uses RED attack for rounds 1-5 and BLUE attack after side swap',()=>{const a=arena('EXPLOSION');assert.equal(a.attackTeam,'RED');assert.equal(a.defendTeam,'BLUE');for(let r=1;r<6;r++){a.finishRound(r%2?'RED':'BLUE','test');advance(a,3.6);}assert.equal(a.round,6);assert.equal(a.attackTeam,'BLUE');assert.equal(a.defendTeam,'RED');});
test('EXPLOSION installs in four seconds, explodes after 35 seconds, and round 10 ends the match',()=>{const a=arena('EXPLOSION'),site=a.bombSites[0];a.entities.forEach(e=>{if(e.team==='RED'){e.x=site.x;e.y=site.y;}else{e.x=a.map.spawns.BLUE[0].x;e.y=a.map.spawns.BLUE[0].y;}});a.updateExplosion(4);assert.equal(a.bomb.planted,true);assert.equal(a.bomb.site,'A');a.time=a.bomb.explodeAt;a.updateExplosion(.01);assert.equal(a.result.winner,'RED');const b=arena('EXPLOSION');b.round=10;b.score={BLUE:4,RED:5};b.finishRound('BLUE','test');assert.equal(b.result.match,true);assert.equal(b.result.draw,true);});
test('INFINITY respawns at four seconds and clears all movement/reload/camera/navigation state',()=>{
  const a=arena('INFINITY'),p=a.player();a.time=3;p.jumpZ=20;p.jumpV=90;p.crouching=true;p.crouchBlend=1;p.reloadLeft=1;p.recoilPitch=.5;p.cameraPitch=.7;p.ammo[1]=0;p.ai.path=[{x:0,y:0}];a.damage(p,1000,a.entities[1]);advance(a,3.975);assert.equal(p.alive,false);advance(a,.05);
  assert.equal(p.alive,true);assert.equal(p.hp,100);assert.equal(p.shield,50);for(const k of['jumpZ','jumpV','crouchBlend','reloadLeft','recoilPitch','cameraPitch'])assert.equal(p[k],0,k);assert.equal(p.crouching,false);assert.equal(p.ammo[1],30);assert.equal(a.spectatorId,null);assert.deepEqual(p.ai.path,[]);assert.ok(p.spawnProtectionUntil-a.time>1.9);
});
test('INFINITY five minute score ties draw, unique kill leader wins',()=>{for(const tie of[false,true]){const a=arena('INFINITY');a.entities[4].kills=15;a.entities[1].kills=tie?15:14;a.roundEndsAt=0;a.checkRules();assert.equal(a.result.match,true);assert.equal(a.result.draw,tie);if(!tie)assert.equal(a.result.winner,a.entities[4].id);}});
test('CAPTURE respawns at five seconds',()=>{const a=arena('CAPTURE'),p=a.player();a.damage(p,1000,a.entities[5]);advance(a,4.975);assert.equal(p.alive,false);advance(a,.05);assert.equal(p.alive,true);assert.equal(p.shield,50);});
test('BOSS is exactly 1 vs 9 and resolves either side without a time limit',()=>{const a=arena('BOSS');assert.equal(a.roundEndsAt,Infinity);a.entities.slice(1).forEach(e=>{e.alive=false;});a.checkRules();assert.equal(a.result.winner,'BOSS');const b=arena('BOSS');b.damage(b.player(),4000,b.entities[1]);b.checkRules();assert.equal(b.result.winner,'HUNTERS');assert.equal(b.result.match,true);});
test('boss reload advantage applies to every firearm, never hunters or a later team match',()=>{
  const a=arena('BOSS'),p=a.player(),h=a.entities[1];
  for(const w of C.WEAPONS.filter(w=>w.reload>0)){
    for(const e of [p,h]){e.weapon=w.id;e.ammo[w.id]=0;e.reloadLeft=0;assert.equal(a.reload(e),true);assert.equal(e.reloadTotal,w.reload*(e===p?.75:1));assert.equal(e.reloadLeft,e.reloadTotal);}
  }
  p.weapon=0;p.reloadLeft=0;assert.equal(a.reload(p),false);p.weapon=5;assert.equal(a.reload(p),false);
  a.start('TEAM',C.MAPS[0]);const normal=a.player();normal.weapon=1;normal.ammo[1]=0;a.reload(normal);assert.equal(normal.reloadLeft,2.1);assert.equal(normal.maxHp,100);assert.equal(normal.maxShield,50);
});
test('boss hunters keep tracking during firing pauses and resume their attack',()=>{
  const a=arena('BOSS',openMap()),p=a.player(),h=a.entities[5],shots=[];
  a.updateAI=C.Arena.prototype.updateAI;a.moveEntity=()=>{};
  a.entities.forEach(e=>{e.alive=e===p||e===h;});Object.assign(p,{x:500,y:500});Object.assign(h,{x:220,y:500,angle:0});
  a.onEvent=(type,data)=>{if(type==='fire'&&data.entity===h)shots.push(a.time);};
  const random=Math.random;Math.random=()=>.5;try{advance(a,8);}finally{Math.random=random;}
  assert.ok(shots.length>10&&shots.length<40,'Hunter must attack, with limited sustained fire');
  assert.ok(shots[0]>=.45,'Initial acquisition gives the boss time to respond');
  assert.ok(shots.at(-1)>7,'Hunter must resume after pauses, not become inactive');
  assert.ok(shots.some((t,i)=>i>0&&t-shots[i-1]>=.6),'At least one recovery window');
  assert.equal(h.ai.target,p.id);assert.equal(h.jumpZ,0);assert.equal(p.maxHp,2000);assert.equal(p.maxShield,1000);
});
test('capture accumulation pauses below two owned points and resumes at the old value',()=>{
  const a=arena('CAPTURE');a.entities.forEach(e=>{e.alive=false;});a.points[0].owner='BLUE';a.points[1].owner='BLUE';a.updateCapture(20);assert.equal(a.captureTime.BLUE,20);a.points[1].owner='RED';a.updateCapture(13);assert.equal(a.captureTime.BLUE,20);a.points[2].owner='BLUE';a.updateCapture(25);assert.equal(a.captureTime.BLUE,45);a.checkRules();assert.equal(a.result.winner,'BLUE');
});
test('capture clocks are independent and contested capture freezes progress',()=>{const a=arena('CAPTURE');a.entities.forEach(e=>{e.alive=false;});a.points[0].owner='RED';a.points[1].owner='RED';a.updateCapture(12);assert.equal(a.captureTime.RED,12);assert.equal(a.captureTime.BLUE,0);const point=a.points[2],blue=a.entities[0],red=a.entities[5];Object.assign(blue,{alive:true,x:point.x-20,y:point.y});Object.assign(red,{alive:true,x:point.x+20,y:point.y});point.control=.35;a.updateCapture(3);assert.equal(point.contested,true);assert.equal(point.control,.35);});
test('neutral capture takes five seconds and opposing ownership must be neutralized',()=>{const a=arena('CAPTURE');a.entities.forEach(e=>{e.alive=false;});const p=a.points[0],b=a.entities[0],r=a.entities[5];Object.assign(b,{alive:true,x:p.x,y:p.y});a.updateCapture(5);assert.equal(p.owner,'BLUE');b.alive=false;Object.assign(r,{alive:true,x:p.x,y:p.y});a.updateCapture(5);assert.equal(p.owner,null);a.updateCapture(5);assert.equal(p.owner,'RED');});
test('shield absorbs damage first and regens only after four seconds, bounded by each maximum',()=>{for(const mode of['TEAM','BOSS']){const a=arena(mode),p=a.player(),sh=p.maxShield;const result=a.damage(p,35,a.entities[5]);assert.equal(result.shield,35);assert.equal(result.hp,0);assert.equal(p.hp,p.maxHp);assert.equal(p.shield,sh-35);advance(a,3.975);assert.equal(p.shield,sh-35);advance(a,1.025);assert.ok(p.shield>sh-22&&p.shield<sh-18);advance(a,5);assert.equal(p.shield,sh);p.alive=false;p.shield=0;advance(a,1);assert.equal(p.shield,0);}});
test('spawn protection blocks both HP and shield damage',()=>{const a=arena('INFINITY'),p=a.player();a.damage(p,10000,a.entities[1]);assert.equal(p.hp,100);assert.equal(p.shield,50);advance(a,2.01);a.damage(p,60,a.entities[1]);assert.equal(p.shield,0);assert.equal(p.hp,90);});
test('orbs are not consumed at maximum and respect health/shield gains and respawn times',()=>{
  const a=arena('BOSS'),p=a.player();a.entities.slice(1).forEach(e=>{e.alive=false;});for(const type of ['health','shield']){const orb=a.pickups.find(p=>p.type===type);p.x=orb.x;p.y=orb.y;a.updatePickups();assert.equal(orb.active,true);if(type==='health')p.hp-=10;else p.shield-=25;a.updatePickups();assert.equal(orb.active,false);assert.equal(type==='health'?p.hp:p.shield,type==='health'?2000:1000);assert.equal(orb.respawnAt-a.time,type==='health'?9:11);p.x=a.map.boss.x;p.y=a.map.boss.y;a.time=orb.respawnAt;a.updatePickups();assert.equal(orb.active,true);}
});
test('segment-circle collision detects a target crossed entirely between frames',()=>{assert.ok(C.segmentCircle(0,0,100,0,50,0,5)>0);assert.equal(C.segmentCircle(0,30,100,30,50,0,5),null);const {a,p,t}=shootingArena();t.x=300;p.weapon=3;a.fire(p,0,0);assert.equal(a.projectiles.length,1);assert.equal(a.projectiles[0].vx,760);a.updateProjectiles(.2);assert.equal(t.shield,0);assert.equal(t.hp,40);assert.equal(a.projectiles.length,0);});
test('crossbow swept collision checks walls before farther targets',()=>{const {a,p,t}=shootingArena();a.map.grid[3][4]=1;t.x=360;p.weapon=3;a.fire(p,0,0);a.updateProjectiles(.3);assert.equal(t.hp,100);assert.equal(t.shield,50);assert.equal(a.projectiles.length,0);});
test('shotgun close hit sums eight 15-damage pellets',()=>{const {a,p,t}=shootingArena();p.weapon=2;t.x=p.x+40;const random=Math.random;Math.random=()=>.5;try{a.fire(p,0,0);}finally{Math.random=random;}assert.equal(t.shield,0);assert.equal(t.hp,30);});
test('AR and MAC continue firing while held and automatically reload',()=>{for(const id of[1,4]){const {a,p,t}=shootingArena();t.y=600;p.weapon=id;advance(a,id===1?7:11,{fire:true});assert.ok(p.shotSerial>C.WEAPONS[id].mag);}});
test('semi-auto requires a new press and independent reload durations match weapon data',()=>{const {a,p,t}=shootingArena();t.y=600;p.weapon=3;a.tick(.025,{fire:true,pressed:true});advance(a,1,{fire:true});assert.equal(p.shotSerial,1);for(const w of C.WEAPONS){if(w.reload<=0)continue;p.weapon=w.id;p.reloadLeft=0;p.ammo[w.id]=0;assert.equal(a.reload(p),true);assert.equal(p.reloadLeft,w.reload);}});
test('recoil decay preserves vertical freelook and NO RECOIL fully cancels MAC recoil',()=>{const {a,p}=shootingArena();p.cameraPitch=.8;p.recoilPitch=.4;advance(a,1);assert.equal(p.cameraPitch,.8);assert.ok(p.recoilPitch<.01);p.weapon=4;a.cheats.noRecoil=true;p.recoilPitch=0;p.cooldown=0;a.fire(p,0,0);assert.equal(p.recoilPitch,0);assert.equal(p.weaponKick,0);assert.equal(p.cameraPitch,.8);});
test('AIM yields to manual look and makes a bounded soft correction otherwise',()=>{const {a,p,t}=shootingArena();t.x=p.x+240;t.y=p.y+40;p.angle=0;a.aimAssist(p,1/60,{looking:true,fire:true});assert.equal(p.angle,0);a.aimAssist(p,1/60,{looking:false,fire:true});assert.ok(p.angle>0&&p.angle<.02);assert.ok(p.angle<Math.atan2(t.y-p.y,t.x-p.x));});
test('jump is a physical arc with landing and crouch changes eye/model height smoothly',()=>{const {a,p}=shootingArena();let landed=false;a.onEvent=t=>{if(t==='landing')landed=true;};a.jump(p);advance(a,.2);assert.ok(p.jumpZ>20);assert.ok(p.jumpV>0);advance(a,.7);assert.equal(p.jumpZ,0);assert.ok(landed);p.crouching=true;advance(a,.3);assert.ok(p.crouchBlend>.9);assert.ok(a.eye(p)<33);assert.ok(a.height(p)<49);});
test('safe FFA respawns avoid the candidate occupied by a living enemy',()=>{const a=arena('INFINITY'),p=a.player();for(let i=1;i<10;i++){a.entities[i].x=a.map.ffa[0].x;a.entities[i].y=a.map.ffa[0].y;}for(let i=0;i<60;i++){const spawn=a.safeSpawn(p);assert.notDeepEqual(spawn,a.map.ffa[0]);assert.ok(C.canStand(a.map,spawn.x,spawn.y,18));}});
test('spectator filters by viewpoint team in TEAM and permits everyone in FFA',()=>{const a=arena();a.player().alive=false;for(let i=0;i<10;i++){a.cycleSpectator();assert.equal(a.viewpoint().team,'BLUE');}const b=arena('INFINITY');b.player().alive=false;const seen=new Set();for(let i=0;i<9;i++){b.cycleSpectator();seen.add(b.spectatorId);}assert.equal(seen.size,9);});
test('movement microsteps and frame clamp cannot tunnel through walls',()=>{const a=arena(),e=a.player();e.x=1.5*64;e.y=24.5*64;for(let i=0;i<150;i++)C.moveCircle(a.map,e,-1000,1000);assert.ok(C.canStand(a.map,e.x,e.y,18));assert.ok(e.x>=64+18);assert.ok(e.y<=26*64-18);});
test('point-blank AI notices a target behind it without auto jumping',()=>{const a=arena('INFINITY',openMap()),e=a.entities[1],p=a.player();e.x=400;e.y=400;e.angle=0;p.x=330;p.y=400;a.entities.slice(2).forEach(t=>t.alive=false);C.Arena.prototype.updateAI.call(a,e,.025);assert.equal(e.ai.target,p.id);assert.equal(e.jumpZ,0);assert.equal(e.jumpV,0);});
test('all modes simulate on every map without invalid positions, NaN, or automatic AI jumping',()=>{
  for(const map of C.MAPS)for(const mode of Object.keys(C.MODES)){const a=new C.Arena();a.start(mode,map);for(let i=0;i<900;i++){a.tick(.025,{});if(i%90===0)for(const e of a.entities){assert.ok(Number.isFinite(e.x+e.y+e.angle+e.hp+e.shield),mode);assert.ok(C.canStand(map,e.x,e.y,e.radius),map.name+' '+e.name);assert.ok(e.hp>=0&&e.shield>=0);if(!e.isPlayer)assert.equal(e.jumpZ,0);}}}
});
test('Firebase adapter sends raw damage without changing remote HP/shield',()=>{const {a,p,t}=shootingArena();a.online=true;t.isRemote=true;let event;a.onEvent=(type,data)=>{if(type==='rawDamage')event=data;};a.damage(t,75,p,'AR');assert.equal(t.hp,100);assert.equal(t.shield,50);assert.equal(event.raw,75);assert.equal(event.victim,t);});
test('Firebase config accepts only public Web config and rejects service accounts',()=>{const cfg={apiKey:'public',authDomain:'test.firebaseapp.com',databaseURL:'https://test-default-rtdb.firebaseio.com',projectId:'test',appId:'test-app'};assert.equal(C.FirebaseArena.validateConfig(cfg).projectId,'test');assert.throws(()=>C.FirebaseArena.validateConfig({...cfg,private_key:'NEVER_STORE'}));assert.throws(()=>C.FirebaseArena.validateConfig({...cfg,databaseURL:'https://example.com'}));});
test('victim-side damage handling applies shield first and deduplicates network events (mock transport)',async()=>{
  const a=arena(),p=a.player(),enemy=a.entities[5];a.online=true;enemy.isRemote=true;const writes=[],net=new C.FirebaseArena(a,{status(){},notify(){},roomChanged(){}});net.code='123456';net.uid=p.id;net.members[enemy.id]={};net.shared={round:1,matchId:'test',phase:'PLAYING'};net.connected=true;net.db={};net.sdk={ref:(_db,path)=>path,set:async(ref,v)=>{writes.push([ref,v]);},remove:async()=>{},serverTimestamp:()=>Date.now()};
  const event={life:0,raw:26,weapon:'AR',attacker:enemy.id,round:1,matchId:'test',at:Date.now()};await net.receiveDamage('event1',event);assert.equal(p.hp,100);assert.equal(p.shield,24);await net.receiveDamage('event1',event);assert.equal(p.shield,24);assert.ok(writes.some(([path,v])=>path.includes('/acks/')&&v.shield===26));
});


test('all six weapons stop at a thin landmark in every local mode',()=>{
  for(const mode of Object.keys(C.MODES))for(const w of C.WEAPONS){
    const a=arena(mode,openMap()),p=a.player(),t=a.entities[5];
    a.entities.forEach(e=>e.alive=e===p||e===t);Object.assign(p,{x:224,y:224,angle:0,weapon:w.id});Object.assign(t,{x:294,y:224});
    a.map.landmarkParts=[{x0:251,x1:258,y0:200,y1:248,z0:0,z1:120}];
    assert.equal(a.fire(p,0,0),true);a.updateProjectiles(.2);
    assert.equal(t.hp,100,mode+' '+w.name);assert.equal(t.shield,50,mode+' '+w.name);assert.equal(a.projectiles.length,0);
  }
});
test('blocking works from either side and does not send online raw damage',()=>{
  for(const reverse of [false,true]){
    const {a,p,t}=shootingArena();a.online=true;t.isRemote=true;p.x=reverse?340:224;t.x=reverse?224:340;
    a.map.landmarkParts=[{x0:275,x1:278,y0:195,y1:255,z0:0,z1:100}];
    let sent=false;a.onEvent=type=>{if(type==='rawDamage')sent=true;};a.fire(p,reverse?Math.PI:0,0);assert.equal(sent,false);
  }
});
test('finite cover blocks low shots but permits shots above its top',()=>{
  const map=openMap();map.landmarkParts=[{x0:260,x1:300,y0:180,y1:260,z0:0,z1:20}];
  for(const z of [10,50])assert.equal(C.traceScene(map,{x:224,y:224,z},{x:350,y:224,z}).hit,z===10);
  assert.ok(C.traceScene(map,{x:224,y:224,z:50},{x:350,y:224,z:-20}).hit);
  assert.equal(C.los(map,{x:224,y:224},{x:350,y:224}),true);
});
test('authored gate and crane passages are open; their supports and beams are solid',()=>{
  for(const source of [C.MAPS[0],C.MAPS[1]]){
    const l=source.landmarks.find(l=>['crane','gate'].includes(l.type)),map=openMap();map.landmarkParts=source.landmarkParts.filter(b=>b.landmark===l.type);
    const from={x:l.x,y:l.y-100,z:49},to={x:l.x,y:l.y+100,z:49};
    assert.equal(C.traceScene(map,from,to).hit,false,l.type);assert.equal(C.clearWalk(map,from,to),true,l.type);
    const post=map.landmarkParts.find(b=>b.z0===0);const x=(post.x0+post.x1)/2;
    assert.equal(C.traceScene(map,{...from,x},{...to,x}).hit,true);assert.equal(C.clearWalk(map,{...from,x},{...to,x}),false);
    const beam=map.landmarkParts.find(b=>b.x0<l.x&&b.x1>l.x&&b.z0>100);const z=(beam.z0+beam.z1)/2;
    assert.equal(C.traceScene(map,{...from,z},{...to,z}).hit,true);
  }
});
test('cover blocks perception and aim assist even at point blank distance',()=>{
  const {a,p,t}=shootingArena();p.angle=.04;t.x=294;t.angle=Math.PI;
  a.map.landmarkParts=[{x0:251,x1:258,y0:200,y1:248,z0:0,z1:120}];
  assert.equal(C.los(a.map,p,t),false);a.aimAssist(p,.05,{});assert.equal(p.angle,.04);
  C.Arena.prototype.updateAI.call(a,t,.025);assert.equal(t.ai.target,null);
});
test('movement and navigation go around the same landmark volume',()=>{
  const map=openMap();map.landmarkParts=[{x0:280,x1:330,y0:160,y1:288,z0:0,z1:100}];
  const a={x:224,y:224},goal={x:416,y:224},path=C.pathfind(map,a,goal);assert.ok(path.length>0);
  let previous=a;for(const point of path){assert.ok(C.clearWalk(map,previous,point));previous=point;}
  const e=C.createEntity('test','TEST','BLUE',true);Object.assign(e,a);for(let i=0;i<40;i++)C.moveCircle(map,e,15,0);
  assert.ok(e.x<=262);assert.ok(C.canStand(map,e.x,e.y,18));
});

function onlineFixture(mode='TEAM',uid='u0'){
  const a=new C.Arena(),n=new C.FirebaseArena(a,{status(){},notify(){},roomChanged(){}});let clock=100000;
  n.now=()=>clock;n.setClock=v=>clock=v;n.code='123456';n.uid=uid;n.hostId='u0';n.connected=true;n.db={};
  n.sdk={ref:(_db,p)=>p,serverTimestamp:()=>clock,set:async()=>{},remove:async()=>{},update:async()=>{},runTransaction:async(_r,fn)=>{const v=fn(n.shared);if(v)n.shared=v;return {committed:!!v};}};
  n.members=Object.fromEntries(Array.from({length:10},(_,i)=>['u'+i,{nickname:'P'+i,slot:i,joinedAt:i}]));
  n.roster=Object.fromEntries(Object.keys(n.members).map((id,i)=>[id,{nickname:id,matchId:'m',team:C.MODES[mode].ffa?'SOLO':mode==='BOSS'?(i===3?'BOSS':'HUNTERS'):(i%2?'RED':'BLUE'),spawnIndex:C.MODES[mode].ffa?i:mode==='BOSS'?(i===3?0:i<3?i:i-1):Math.floor(i/2)}]));
  n.shared={phase:'PLAYING',mode,round:1,matchId:'m',mapId:'depot',roundStartedAt:90000,roundEndsAt:C.MODES[mode].limit?90000+C.MODES[mode].limit*1000:0,score:{BLUE:0,RED:0},captureTime:{BLUE:0,RED:0},captureUpdatedAt:clock};if(mode==='EXPLOSION')n.shared.bomb={planted:false,site:'',x:0,y:0,plantProgress:0,defuseProgress:0,explodeAt:0,updatedAt:clock};n.applySharedState();
  n.sending=false;n.states=Object.fromEntries(a.entities.map(e=>[e.id,{...e,round:1,matchId:'m',updatedAt:clock,ammo:30,life:0}]));return n;
}
test('online every mode applies host spawns, roles, maxima and fixed map on every client',()=>{
 for(const mode of Object.keys(C.MODES))for(const uid of ['u0','u3','u9']){const n=onlineFixture(mode,uid),a=n.arena;assert.equal(a.mode,mode);assert.equal(a.entities.length,10);for(const e of a.entities)assert.ok(C.canStand(a.map,e.x,e.y,19));assert.equal(new Set(a.entities.map(e=>e.x+','+e.y)).size,10);if(mode==='BOSS'){assert.equal(a.entities.find(e=>e.team==='BOSS').maxShield,1000);assert.equal(a.entities.find(e=>e.team==='BOSS').maxHp,2000);assert.equal(a.timeLeft(),Infinity);}if(C.MODES[mode].ffa)assert.equal(a.entities.filter(e=>C.enemy(a.player(),e,mode)).length,9);const map=a.map;n.shared.round++;n.applySharedState();assert.equal(a.map,map);}
});
test('host random match selection covers exactly five modes and random boss role',async()=>{
 const original=Math.random;try{for(let i=0;i<5;i++){const n=onlineFixture();n.shared.phase='LOBBY';let payload;n.sdk.update=async(_r,v)=>payload=v;let seq=[.1,(i+.1)/5,.35,.2];Math.random=()=>seq.shift()??.2;await n.startMatch();assert.equal(payload.state.mode,Object.keys(C.MODES)[i]);assert.equal(Object.keys(payload.roster).length,10);if(i===3)assert.equal(payload.roster.u3.team,'BOSS');}}finally{Math.random=original;}
});
test('online EXPLOSION uses team elimination, INFINITY uses kills, BOSS uses actual assigned boss',()=>{
 let n=onlineFixture('EXPLOSION');for(const [id,s]of Object.entries(n.states))if(n.roster[id].team==='RED')s.alive=false;n.hostTick();assert.equal(n.shared.result.winner,'BLUE');assert.equal(n.shared.score.BLUE,1);
 n=onlineFixture('INFINITY');n.states.u7.kills=6;n.setClock(n.shared.roundEndsAt);n.hostTick();assert.equal(n.shared.result.winner,'u7');assert.equal(n.shared.result.match,true);
 n=onlineFixture('INFINITY');n.setClock(n.shared.roundEndsAt);n.hostTick();assert.equal(n.shared.result.draw,true);
 n=onlineFixture('BOSS');n.states.u3.alive=false;n.hostTick();assert.equal(n.shared.result.winner,'HUNTERS');
 n=onlineFixture('BOSS');for(const [id,s]of Object.entries(n.states))if(id!=='u3')s.alive=false;n.hostTick();assert.equal(n.shared.result.winner,'BOSS');
});
test('online respawn timers reset life state and old-life damage is discarded',async()=>{
 for(const mode of ['INFINITY','CAPTURE']){const n=onlineFixture(mode),a=n.arena,p=a.player();n.hostId='other';p.alive=false;p.hp=0;p.life=2;p.respawnEndsAt=n.now()+C.MODES[mode].respawn*1000;p.jumpZ=30;p.cameraPitch=.4;p.recoilPitch=.3;p.reloadLeft=2;n.tick(.02);assert.equal(p.alive,false);n.setClock(p.respawnEndsAt);n.tick(.02);assert.equal(p.alive,true);assert.equal(p.life,3);assert.equal(p.shield,50);assert.equal(p.jumpZ,0);assert.equal(p.reloadLeft,0);assert.equal(p.recoilPitch,0);assert.equal(p.spawnProtectionUntil-a.time,2);
 await n.receiveDamage('old',{attacker:'u1',raw:26,weapon:'AR',round:1,matchId:'m',life:2,at:n.now()});assert.equal(p.shield,50);}
 for(const mode of ['TEAM','EXPLOSION','BOSS']){const n=onlineFixture(mode);n.hostId='other';n.arena.player().alive=false;n.arena.player().respawnEndsAt=1;n.tick(.02);assert.equal(n.arena.player().alive,false);}
});
test('online boss remote health is not clamped to normal soldier limits',()=>{const n=onlineFixture('BOSS');n.receivePlayers();const b=n.arena.entities.find(e=>e.id==='u3');assert.equal(b.hp,2000);assert.equal(b.shield,1000);});
test('host capture totals pause and survive migration; neutralization clears old owner on clients',()=>{
 const n=onlineFixture('CAPTURE');n.shared.captureTime={BLUE:20,RED:8};n.shared.points={A:{owner:'BLUE',control:1},B:{owner:'BLUE',control:1},C:{owner:'RED',control:-1}};
 for(const s of Object.values(n.states))s.alive=false;n.shared.captureUpdatedAt=n.now()-200;n.hostTick();assert.equal(n.shared.captureTime.BLUE,20.2);assert.equal(n.shared.captureTime.RED,8);
 n.hostBusy=false;n.shared.points.B={control:0,contested:false};n.setClock(n.now()+200);n.hostTick();assert.equal(n.shared.captureTime.BLUE,20.2);n.applySharedState();assert.equal(n.arena.points[1].owner,null);
 n.hostBusy=false;n.shared.captureTime.BLUE=45;n.setClock(n.now()+200);n.hostTick();assert.equal(n.shared.result.winner,'BLUE');
});
test('online state waits for matching roster and all modes return through match end to lobby',async()=>{
 for(const mode of Object.keys(C.MODES)){
 const n=onlineFixture(mode),a=n.arena;n.shared={...n.shared,matchId:'next',phase:'PLAYING'};n.applySharedState();assert.equal(n.lastRoundKey,'m:1');
 for(const r of Object.values(n.roster))r.matchId='next';n.applySharedState();assert.equal(n.lastRoundKey,'next:1');
 a.cheats={aim:true,esp:true,noRecoil:true};n.hostFinish(mode==='BOSS'?'BOSS':'BLUE','test',true);await Promise.resolve();n.applySharedState();assert.equal(a.state,'ROUND_END');
 n.setClock(n.shared.transitionAt+1);n.hostTick();await Promise.resolve();n.applySharedState();assert.equal(a.state,'MATCH_END');assert.equal(a.cheats.esp,false);
 n.setClock(n.shared.transitionAt+1);n.hostTick();await Promise.resolve();n.applySharedState();assert.equal(a.state,'LOBBY');
 }
});
test('each online respawn life publishes a distinct kill record',()=>{
 const n=onlineFixture('INFINITY'),keys=[];n.sdk.set=async(ref)=>keys.push(ref);const p=n.arena.player();n.sending=false;p.alive=false;p.life=0;n.onKill({victimId:p.id,attackerId:'u1',attacker:'u1',victim:p.name,weapon:'AR'});p.life=1;n.onKill({victimId:p.id,attackerId:'u1',attacker:'u1',victim:p.name,weapon:'AR'});assert.equal(new Set(keys.filter(k=>k.includes('/kills/'))).size,2);assert.equal(p.respawnEndsAt,n.now()+4000);
});
