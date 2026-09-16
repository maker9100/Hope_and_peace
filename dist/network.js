/* Firebase multiplayer adapter. Online = TEAM ELIMINATION ONLY.
 * Victim owns HP / shield. Host owns rounds, roster, timer and pickup claims.
 * This is cooperative prototype authority, not a hardened competitive game server.
 */
(function(root){
  'use strict';const C=root.CA;
  class FirebaseArena{
    constructor(arena,ui){this.arena=arena;this.ui=ui;this.sdk=null;this.db=null;this.uid=null;this.code=null;this.slot=null;this.hostId=null;this.members={};this.roster={};this.states={};this.buffers=new Map();this.shared=null;this.offset=0;this.connected=false;this.unsubs=[];this.globalUnsubs=[];this.disconnects=[];this.lastSend=0;this.lastHostTick=0;this.lastPickupRequest=0;this.lastRoundKey='';this.seenDamage=new Set();this.seenKills=new Set();this.seenGrants=new Set();this.lastSerial=new Map();this.requests={};this.pickupState={};this.hostBusy=false;this.claiming=new Set();this.sending=false;this.lastErrorAt=0;}
    static validateConfig(value){
      if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Firebase 공개 설정 JSON 객체가 필요하다.');
      if('private_key'in value||'privateKey'in value||'client_email'in value||value.type==='service_account')throw new Error('서비스 계정 / 비공개 키는 사용할 수 없다. Web 앱의 공개 설정만 입력한다.');
      for(const key of ['apiKey','authDomain','databaseURL','projectId','appId'])if(typeof value[key]!=='string'||!value[key].trim())throw new Error('Firebase 설정 누락: '+key);
      if(!/^https:\/\/[a-zA-Z0-9.-]+\.(firebaseio\.com|firebasedatabase\.app)\/?$/.test(value.databaseURL))throw new Error('Realtime Database의 https databaseURL을 입력한다.');
      const out={};for(const key of ['apiKey','authDomain','databaseURL','projectId','appId','storageBucket','messagingSenderId','measurementId'])if(typeof value[key]==='string')out[key]=value[key].trim();return out;
    }
    config(){if(root.CHEAT_ARENA_FIREBASE)return root.CHEAT_ARENA_FIREBASE;try{return JSON.parse(localStorage.getItem('ca-firebase')||'null');}catch{return null;}}
    hasConfig(){try{return !!FirebaseArena.validateConfig(this.config());}catch{return false;}}
    resetConnection(){if(this.code)return;for(const u of this.globalUnsubs)u();this.globalUnsubs=[];if(this.app&&this.sdk)this.sdk.deleteApp(this.app).catch(()=>{});this.app=null;this.db=null;this.uid=null;}
    now(){return Date.now()+this.offset;}
    ref(path=''){return this.sdk.ref(this.db,`rooms/${this.code}${path?'/'+path:''}`);}
    report(error){const code=error?.code||'',msg=code.includes('permission')?'Firebase Rules가 요청을 거부했다. 배포된 database.rules.json과 Anonymous Auth 설정을 확인한다.':code.includes('operation-not-allowed')?'Firebase Authentication에서 Anonymous 로그인을 활성화한다.':error?.message||String(error);this.ui.status(msg);if(performance.now()-this.lastErrorAt>4000){this.lastErrorAt=performance.now();this.ui.notify(msg);} }
    async ensure(){
      if(this.db)return;const config=FirebaseArena.validateConfig(this.config());this.ui.status('Firebase에 연결하는 중…');
      // Load network code only on an explicit ONLINE action; AI modes stay offline-capable.
      const [app,auth,db]=await Promise.all([
        import('https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js'),
        import('https://www.gstatic.com/firebasejs/12.4.0/firebase-database.js')
      ]);this.sdk={...app,...auth,...db};
      this.app=app.initializeApp(config,'cheat-arena-'+Date.now());this.auth=auth.getAuth(this.app);await auth.setPersistence(this.auth,auth.inMemoryPersistence);
      const credential=await auth.signInAnonymously(this.auth);this.uid=credential.user.uid;this.db=db.getDatabase(this.app);
      this.globalUnsubs.push(db.onValue(db.ref(this.db,'.info/serverTimeOffset'),s=>{this.offset=s.val()||0;}));
      this.globalUnsubs.push(db.onValue(db.ref(this.db,'.info/connected'),s=>{this.connected=s.val()===true;if(this.code){this.ui.status(this.connected?'CONNECTED · TEAM ELIMINATION ONLY':'연결이 끊겼다. 재연결 후 방에 다시 참가한다.');if(this.connected&&this.wasDisconnected){this.leave().then(()=>this.ui.notify('연결이 복구됐다. 방 코드로 다시 참가한다.'));}if(!this.connected)this.wasDisconnected=true;}}));
    }
    memberList(){return Object.entries(this.members).map(([id,m])=>({id,...m})).sort((a,b)=>a.slot-b.slot||a.joinedAt-b.joinedAt||a.id.localeCompare(b.id));}
    async create(nickname){
      if(this.code)throw new Error('이미 방에 참가 중이다.');await this.ensure();
      let code=null;
      for(let attempt=0;attempt<6;attempt++){
        const candidate=String(100000+Math.floor(Math.random()*900000));
        const result=await this.sdk.runTransaction(this.sdk.ref(this.db,'rooms/'+candidate),current=>current?undefined:{meta:{hostId:this.uid,createdAt:this.sdk.serverTimestamp(),schema:1,mode:'TEAM'},state:{phase:'LOBBY',mode:'TEAM',round:0,score:{BLUE:0,RED:0},mapId:'depot'}},{applyLocally:false});
        if(result.committed){code=candidate;break;}
      }
      if(!code)throw new Error('사용 가능한 방 코드를 만들지 못했다. 다시 시도한다.');await this.join(code,nickname);
    }
    async join(rawCode,nickname){
      if(this.code)throw new Error('이미 방에 참가 중이다.');const code=String(rawCode).trim();if(!/^\d{6}$/.test(code))throw new Error('6자리 숫자 방 코드를 입력한다.');await this.ensure();
      const base=this.sdk.ref(this.db,'rooms/'+code),snapshot=await this.sdk.get(base),room=snapshot.val();
      if(!room?.meta)throw new Error('해당 코드의 방을 찾을 수 없다.');if(room.state?.phase!=='LOBBY')throw new Error('진행 중인 경기다. 로비로 돌아온 뒤 참가할 수 있다.');
      let selected=null;
      for(let slot=0;slot<10;slot++){
        const result=await this.sdk.runTransaction(this.sdk.ref(this.db,`rooms/${code}/seats/${slot}`),current=>current?undefined:{uid:this.uid,joinedAt:this.sdk.serverTimestamp()},{applyLocally:false});if(result.committed){selected=String(slot);break;}
      }
      if(selected===null)throw new Error('방이 가득 찼다. 최대 10명이다.');
      this.code=code;this.slot=selected;this.wasDisconnected=false;this.hostId=room.meta.hostId;this.shared=room.state;this.lastRoundKey='';this.seenDamage.clear();this.seenKills.clear();this.seenGrants.clear();this.lastSerial.clear();this.buffers.clear();
      try{
        // Register cleanup at the server before advertising presence.
        for(const path of[`seats/${selected}`,`members/${this.uid}`,`players/${this.uid}`,`pickupRequests/${this.uid}`]){const d=this.sdk.onDisconnect(this.ref(path));await d.remove();this.disconnects.push(d);}
        await this.sdk.set(this.ref('members/'+this.uid),{nickname:String(nickname).slice(0,18),slot:selected,joinedAt:this.sdk.serverTimestamp()});
        this.subscribe();this.ui.status('CONNECTED · TEAM ELIMINATION ONLY');this.ui.roomChanged();
      }catch(e){await this.leave();throw e;}
    }
    subscribe(){
      const S=this.sdk,listen=(path,fn)=>this.unsubs.push(S.onValue(this.ref(path),snap=>fn(snap.val()),e=>this.report(e)));
      listen('meta/hostId',id=>{this.hostId=id;this.ui.roomChanged();this.electHost();});
      listen('members',m=>{this.members=m||{};this.ui.roomChanged();this.electHost();for(const e of this.arena.entities)if(this.arena.online&&e.isRemote&&!this.members[e.id])e.alive=false;});
      listen('roster',r=>{this.roster=r||{};this.ui.roomChanged();this.applySharedState();});
      listen('state',s=>{if(!s)return;this.shared=s;this.applySharedState();});
      listen('players',states=>{this.states=states||{};this.receivePlayers();});
      listen('pickups',p=>{this.pickupState=p||{};this.receivePickups();});
      listen('pickupRequests',requests=>{this.requests=requests||{};});
      this.unsubs.push(S.onChildAdded(this.ref('damage/'+this.uid),snap=>{this.receiveDamage(snap.key,snap.val()).catch(e=>this.report(e));},e=>this.report(e)));
      this.unsubs.push(S.onChildAdded(this.ref('acks/'+this.uid),snap=>{const ack=snap.val();if(ack?.round===this.shared?.round&&ack?.matchId===this.shared?.matchId&&(ack.hp>0||ack.shield>0)){this.arena.emit('hit',{victim:{isPlayer:false},attacker:this.arena.player(),hpDamage:ack.hp,shieldDamage:ack.shield});}S.remove(snap.ref).catch(e=>this.report(e));},e=>this.report(e)));
      this.unsubs.push(S.onChildAdded(this.ref('kills'),snap=>{const item=snap.val();if(!item||this.seenKills.has(snap.key))return;this.seenKills.add(snap.key);if(item.matchId!==this.shared?.matchId||item.round!==this.shared?.round)return;
        const killer=this.arena.entities.find(e=>e.id===item.attackerId);if(killer?.isPlayer){killer.kills++;this.sendState(true);}
        if(item.victimId!==this.uid){const feed={...item,at:this.arena.time};this.arena.feed.unshift(feed);this.arena.feed=this.arena.feed.slice(0,5);this.arena.emit('kill',feed);}
      },e=>this.report(e)));
    }
    async electHost(){
      if(!this.code||!this.uid||!this.members[this.uid]||this.members[this.hostId])return;
      const candidate=this.memberList()[0];if(candidate?.id!==this.uid||this.electing)return;this.electing=true;
      try{const old=this.hostId;await this.sdk.runTransaction(this.ref('meta/hostId'),value=>value===old||!value?this.uid:undefined,{applyLocally:false});}catch(e){this.report(e);}finally{this.electing=false;}
    }
    async startMatch(){
      if(!this.code||this.uid!==this.hostId)throw new Error('호스트만 경기를 시작할 수 있다.');const members=this.memberList();if(members.length<2)throw new Error('2명 이상 필요하다.');
      if(this.shared?.phase!=='LOBBY')return;const map=C.MAPS[Math.floor(Math.random()*C.MAPS.length)],roster={},counts={BLUE:0,RED:0};
      members.forEach((m,i)=>{const team=i%2?'RED':'BLUE';roster[m.id]={nickname:m.nickname,team,spawnIndex:counts[team]++};});
      this.roster=roster;const now=this.now(),matchId=`${now.toFixed(0)}-${Math.random().toString(36).slice(2,7)}`;
      const shared={phase:'PLAYING',mode:'TEAM',mapId:map.id,matchId,round:1,roundStartedAt:now,roundEndsAt:now+120000,score:{BLUE:0,RED:0},transitionAt:0};
      await this.sdk.update(this.ref(),{roster,state:shared,pickups:this.initialPickups(map,1,matchId),kills:null});
    }
    initialPickups(map,round,matchId){const out={};map.pickups.forEach((p,i)=>{out['orb-'+i]={active:true,respawnAt:0,round,matchId,type:p.type,x:p.x,y:p.y};});return out;}
    applySharedState(){
      const s=this.shared,a=this.arena;if(!s||!this.code)return;
      if(s.phase==='LOBBY'){if(a.online)a.toLobby();this.ui.roomChanged();return;}
      if(s.mode!=='TEAM'){this.ui.status('이 클라이언트의 온라인 모드는 TEAM ELIMINATION 전용이다.');return;}
      if(!this.roster[this.uid])return;
      const key=s.matchId+':'+s.round,newRound=key!==this.lastRoundKey;
      if(newRound){
        const newMatch=!this.lastRoundKey.startsWith(s.matchId+':');this.lastRoundKey=key;a.online=true;a.mode='TEAM';a.map=C.MAPS.find(m=>m.id===s.mapId)||C.MAPS[0];a.score={...s.score};a.result=null;this.buffers.clear();this.lastSerial.clear();this.lastShot=null;
        if(newMatch){a.entities=Object.entries(this.roster).map(([id,m],i)=>{const e=C.createEntity(id,m.nickname,m.team,id===this.uid,i);e.isRemote=id!==this.uid;return e;});a.feed=[];this.seenKills.clear();this.seenGrants.clear();}
        a.round=s.round-1;a.beginRound();a.round=s.round;a.online=true;
        // Reset every combatant to its host-assigned spawn, with full HP and shield.
        for(const e of a.entities){const r=this.roster[e.id];if(r)a.resetEntity(e,a.map.spawns[r.team][r.spawnIndex],0);}
        this.lastSend=0;this.sendState(true);this.receivePlayers();this.receivePickups();
      }
      a.score={...s.score};a.roundEndsAt=a.time+Math.max(0,(s.roundEndsAt-this.now())/1000);
      if(s.result)a.result=s.result;
      if(a.state!==s.phase){a.setState(s.phase);if(s.phase==='MATCH_END'){a.cheats={aim:false,esp:false,noRecoil:false};a.emit('matchEnd',a.result||{});}}
    }
    onFire(data){if(!this.code)return;this.lastShot={angle:data.angle,pitch:data.pitch,x:data.entity.x,y:data.entity.y,z:this.arena.eye(data.entity)-3,at:this.now()};this.sendState(true);}
    sendState(force=false){
      if(!this.code||!this.arena.online||!this.connected||this.arena.state!=='PLAYING'||this.sending)return;
      const now=this.now();if(!force&&now-this.lastSend<75)return;const e=this.arena.player();if(!e)return;this.lastSend=now;
      const state={x:e.x,y:e.y,angle:e.angle,cameraPitch:e.cameraPitch,recoilPitch:e.recoilPitch,hp:e.hp,shield:e.shield,alive:e.alive,weapon:e.weapon,
        jumpZ:e.jumpZ,jumpV:e.jumpV,crouching:e.crouching,crouchBlend:e.crouchBlend,vx:e.vx,vy:e.vy,walkPhase:e.walkPhase,moveSpeed:e.moveSpeed,
        ammo:e.weapon===2?-1:e.ammo[e.weapon],reloadLeft:e.reloadLeft,reloadTotal:e.reloadTotal,shotSerial:e.shotSerial,kills:e.kills,deaths:e.deaths,
        round:this.shared.round,matchId:this.shared.matchId,updatedAt:this.sdk.serverTimestamp(),lastShot:this.lastShot||{angle:e.angle,pitch:e.cameraPitch,x:e.x,y:e.y,z:52,at:0}};
      this.sending=true;this.sdk.set(this.ref('players/'+this.uid),state).catch(e=>{if(this.shared?.phase==='PLAYING'&&this.shared.round===state.round)this.report(e);}).finally(()=>{this.sending=false;});
    }
    receivePlayers(){
      if(!this.arena.online)return;const a=this.arena;
      for(const e of a.entities){if(e.isPlayer)continue;const s=this.states[e.id];if(!s||s.round!==this.shared?.round||s.matchId!==this.shared?.matchId)continue;
        if(!Number.isFinite(s.x)||!Number.isFinite(s.y)||!C.canStand(a.map,s.x,s.y,17))continue;
        e.hp=C.clamp(s.hp,0,100);e.shield=C.clamp(s.shield,0,50);e.alive=s.alive===true&&e.hp>0;e.weapon=C.clamp(s.weapon|0,0,5);e.kills=s.kills||0;e.deaths=s.deaths||0;e.ammo[e.weapon]=s.ammo<0?Infinity:s.ammo;e.reloadLeft=s.reloadLeft||0;e.reloadTotal=s.reloadTotal||0;e.crouching=!!s.crouching;
        let queue=this.buffers.get(e.id);if(!queue){queue=[];this.buffers.set(e.id,queue);}if(!queue.length||queue[queue.length-1].updatedAt!==s.updatedAt){queue.push({...s,updatedAt:typeof s.updatedAt==='number'?s.updatedAt:this.now()});if(queue.length>8)queue.shift();}
        const old=this.lastSerial.get(e.id);this.lastSerial.set(e.id,s.shotSerial);
        if(old!==undefined&&s.shotSerial>old&&this.now()-(s.lastShot?.at||0)<700){
          e.fireFlash=.09;const shot=s.lastShot||s;a.emit('fire',{entity:e,weapon:C.WEAPONS[e.weapon],angle:shot.angle,pitch:shot.pitch});
          if(e.weapon===4){a.projectiles.push({id:e.id+'-'+s.shotSerial,owner:e.id,x:shot.x,y:shot.y,z:shot.z,vx:Math.cos(shot.angle)*760,vy:Math.sin(shot.angle)*760,vz:Math.tan(shot.pitch)*760,life:2.8,damage:0,visualOnly:true});}
        }
      }
    }
    interpolate(dt){const at=this.now()-110;
      for(const e of this.arena.entities){if(!e.isRemote)continue;e.fireFlash=Math.max(0,e.fireFlash-dt);const queue=this.buffers.get(e.id);if(!queue?.length)continue;
        let before=queue[0],after=queue[queue.length-1];for(let i=0;i<queue.length;i++){if(queue[i].updatedAt<=at)before=queue[i];if(queue[i].updatedAt>=at){after=queue[i];break;}}
        const blend=before===after?1:C.clamp((at-before.updatedAt)/Math.max(1,after.updatedAt-before.updatedAt),0,1),nx=C.mix(before.x,after.x,blend),ny=C.mix(before.y,after.y,blend);
        if(C.canStand(this.arena.map,nx,ny,17)){e.x=nx;e.y=ny;}e.angle=C.wrap(before.angle+C.wrap(after.angle-before.angle)*blend);
        for(const k of['cameraPitch','recoilPitch','jumpZ','jumpV','crouchBlend','vx','vy','walkPhase','moveSpeed'])e[k]=C.mix(before[k]||0,after[k]||0,blend);
      }
    }
    sendDamage({victim,raw,attacker,weapon}){
      if(!this.code||attacker.id!==this.uid||this.shared?.phase!=='PLAYING')return;
      const r=this.sdk.push(this.ref('damage/'+victim.id));this.sdk.set(r,{attacker:this.uid,raw,weapon,round:this.shared.round,matchId:this.shared.matchId,at:this.sdk.serverTimestamp()}).catch(e=>this.report(e));
    }
    async receiveDamage(id,event){
      if(!event||this.seenDamage.has(id)||!this.code)return;this.seenDamage.add(id);
      const ref=this.ref('damage/'+this.uid+'/'+id),a=this.arena,p=a.player();
      if(!a.online||!p||event.round!==this.shared?.round||event.matchId!==this.shared?.matchId||this.now()-event.at>5000||event.at>this.now()+2000){await this.sdk.remove(ref);return;}
      const attacker=a.entities.find(e=>e.id===event.attacker),w=C.WEAPONS.find(w=>w.name===event.weapon);if(!attacker||!w||!Number.isFinite(event.raw)||!this.members[event.attacker]||!C.enemy(p,attacker,'TEAM')){await this.sdk.remove(ref);return;}
      const result=a.damage(p,C.clamp(event.raw,0,w.damage*(w.pellets||1)),attacker,event.weapon,true);
      // Only this victim subtracts shield and then HP, and publishes the resulting state.
      this.sendState(true);await this.sdk.set(this.ref('acks/'+event.attacker+'/'+id),{victim:this.uid,hp:result.hp,shield:result.shield,round:event.round,matchId:event.matchId,at:this.sdk.serverTimestamp()});await this.sdk.remove(ref);
    }
    onKill(item){
      if(!this.code||item.victimId!==this.uid)return;const key=this.shared.round+'_'+this.uid;
      this.sdk.set(this.ref('kills/'+key),{attackerId:item.attackerId||'',attacker:item.attacker,victimId:this.uid,victim:item.victim,weapon:item.weapon,round:this.shared.round,matchId:this.shared.matchId,at:this.sdk.serverTimestamp()}).catch(e=>this.report(e));
    }
    receivePickups(){
      if(!this.arena.online)return;const p=this.arena.player();
      for(const orb of this.arena.pickups){const state=this.pickupState[orb.id];if(!state||state.round!==this.shared?.round||state.matchId!==this.shared?.matchId)continue;orb.active=state.active;orb.respawnAt=this.arena.time+Math.max(0,(state.respawnAt-this.now())/1000);
        if(state.claimUid===this.uid&&state.grantId&&!this.seenGrants.has(state.grantId)){
          this.seenGrants.add(state.grantId);if(p?.alive){if(orb.type==='health')p.hp=Math.min(p.maxHp,p.hp+10);else p.shield=Math.min(p.maxShield,p.shield+25);this.arena.emit('pickup',{entity:p,pickup:orb});this.sendState(true);}
        }
      }
    }
    requestPickup(){const p=this.arena.player();if(!p?.alive||this.now()-this.lastPickupRequest<300)return;
      const orb=this.arena.pickups.find(o=>o.active&&C.dist(o,p)<31&&p.jumpZ<28&&(o.type==='health'?p.hp<p.maxHp:p.shield<p.maxShield));if(!orb)return;this.lastPickupRequest=this.now();this.sdk.set(this.ref('pickupRequests/'+this.uid),{pickupId:orb.id,round:this.shared.round,matchId:this.shared.matchId,at:this.sdk.serverTimestamp()}).catch(e=>this.report(e));
    }
    async processPickups(){
      if(this.uid!==this.hostId||this.shared?.phase!=='PLAYING')return;const now=this.now(),round=this.shared.round,matchId=this.shared.matchId;
      for(const [id,state]of Object.entries(this.pickupState))if(!state.active&&state.round===round&&state.matchId===matchId&&state.respawnAt<=now&&!this.claiming.has(id)){
        this.claiming.add(id);this.sdk.runTransaction(this.ref('pickups/'+id),s=>s&&s.round===round&&s.matchId===matchId&&!s.active&&s.respawnAt<=this.now()?{...s,active:true,claimUid:null,grantId:null}:undefined,{applyLocally:false}).catch(e=>this.report(e)).finally(()=>this.claiming.delete(id));
      }
      for(const [uid,request]of Object.entries(this.requests)){
        const id=request.pickupId;if(this.claiming.has(id))continue;
        const state=this.states[uid],orb=this.arena.pickups.find(o=>o.id===id);if(!orb||!state||!state.alive||!this.members[uid]||request.round!==round||request.matchId!==matchId||now-request.at>2000||state.round!==round||state.matchId!==matchId||C.dist(orb,state)>45||(state.jumpZ||0)>28||!C.los(this.arena.map,state,orb)||(orb.type==='health'?state.hp>=100:state.shield>=50))continue;
        this.claiming.add(id);const grantId=`${matchId}_${round}_${id}_${now.toFixed(0)}`,requestRef=this.ref('pickupRequests/'+uid);
        this.sdk.runTransaction(this.ref('pickups/'+id),s=>s?.active&&s.round===round&&s.matchId===matchId?{...s,active:false,respawnAt:this.now()+(orb.type==='health'?9000:11000),claimUid:uid,grantId}:undefined,{applyLocally:false})
          .then(()=>this.sdk.remove(requestRef)).catch(e=>this.report(e)).finally(()=>this.claiming.delete(id));
      }
    }
    async changeState(transform){
      if(this.hostBusy||!this.code||this.uid!==this.hostId)return;this.hostBusy=true;
      try{await this.sdk.runTransaction(this.ref('state'),s=>s?transform(s):undefined,{applyLocally:false});}catch(e){this.report(e);}finally{this.hostBusy=false;}
    }
    hostFinish(winner,reason,forfeit=false){
      const round=this.shared.round,matchId=this.shared.matchId;
      return this.changeState(s=>{if(s.phase!=='PLAYING'||s.round!==round||s.matchId!==matchId)return;const score={...s.score};if(winner)score[winner]++;const match=forfeit||!!winner&&score[winner]>=7;return{...s,phase:'ROUND_END',score,transitionAt:this.now()+3500,result:{winner:winner||'',name:winner||'DRAW',draw:!winner,reason,match}};});
    }
    hostTick(){
      const s=this.shared,now=this.now();if(!s||this.uid!==this.hostId||now-this.lastHostTick<150)return;this.lastHostTick=now;
      if(s.phase==='PLAYING'){
        this.processPickups();if(now-s.roundStartedAt<1600)return;
        const present=Object.entries(this.roster).filter(([id])=>this.members[id]),ready=present.filter(([id])=>this.states[id]?.round===s.round&&this.states[id]?.matchId===s.matchId);
        if(ready.length<present.length&&now-s.roundStartedAt<8000)return;
        const blueMembers=present.filter(([,r])=>r.team==='BLUE'),redMembers=present.filter(([,r])=>r.team==='RED');
        const alive=ready.filter(([id])=>this.states[id].alive),blue=alive.filter(([,r])=>r.team==='BLUE'),red=alive.filter(([,r])=>r.team==='RED');
        if(!blueMembers.length||!redMembers.length){this.hostFinish(blueMembers.length?'BLUE':redMembers.length?'RED':null,'상대 팀 연결 종료',true);return;}
        if(!blue.length||!red.length){this.hostFinish(blue.length?'BLUE':red.length?'RED':null,'상대 팀 전멸');return;}
        if(now>=s.roundEndsAt){let winner=null;if(blue.length!==red.length)winner=blue.length>red.length?'BLUE':'RED';else{const total=group=>group.reduce((v,[id])=>v+this.states[id].hp+this.states[id].shield,0),b=total(blue),r=total(red);if(Math.abs(b-r)>1e-6)winner=b>r?'BLUE':'RED';}this.hostFinish(winner,'시간 종료 · 생존 인원 / HP + Shield 판정');}
      }else if(s.phase==='ROUND_END'&&now>=s.transitionAt){
        if(s.result?.match)this.changeState(v=>v.phase==='ROUND_END'&&v.round===s.round?{...v,phase:'MATCH_END',transitionAt:this.now()+7000}:undefined);
        else if(!this.hostBusy){
          this.hostBusy=true;const round=s.round+1,map=C.MAPS.find(m=>m.id===s.mapId),stateRef=this.ref('state'),code=this.code;this.sdk.set(this.ref('pickups'),this.initialPickups(map,round,s.matchId)).then(()=>{if(this.code===code&&this.uid===this.hostId)return this.sdk.runTransaction(stateRef,v=>v.phase==='ROUND_END'&&v.round===s.round?{...v,phase:'PLAYING',round,roundStartedAt:this.now(),roundEndsAt:this.now()+120000,transitionAt:0,result:null}:undefined,{applyLocally:false});}).catch(e=>this.report(e)).finally(()=>{this.hostBusy=false;});
        }
      }else if(s.phase==='MATCH_END'&&now>=s.transitionAt)this.changeState(v=>v.phase==='MATCH_END'?{...v,phase:'LOBBY',transitionAt:0}:undefined);
    }
    tick(dt){if(!this.code||!this.connected)return;if(this.arena.online){this.interpolate(dt);if(this.shared?.phase==='PLAYING'){this.arena.roundEndsAt=this.arena.time+Math.max(0,(this.shared.roundEndsAt-this.now())/1000);this.sendState();this.requestPickup();}}this.hostTick();}
    async leave(){
      if(!this.code)return;const code=this.code,slot=this.slot,uid=this.uid;for(const u of this.unsubs)u();this.unsubs=[];
      this.code=null;this.members={};this.roster={};this.states={};this.shared=null;this.lastRoundKey='';this.hostId=null;this.pickupState={};this.requests={};this.buffers.clear();this.wasDisconnected=false;
      if(this.connected){try{await this.sdk.update(this.sdk.ref(this.db,'rooms/'+code),{['members/'+uid]:null,['players/'+uid]:null,['seats/'+slot]:null,['pickupRequests/'+uid]:null});for(const d of this.disconnects)await d.cancel();}catch(e){this.report(e);}}
      // On a dead socket keep the registered server cleanup intact.
      this.disconnects=[];if(this.arena.online)this.arena.toLobby();this.ui.roomChanged();this.ui.status('방에서 나왔다.');
    }
  }C.FirebaseArena=FirebaseArena;
})(typeof window!=='undefined'?window:globalThis);
