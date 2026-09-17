/* Firebase multiplayer adapter. Five randomized online modes.
 * Victim owns HP / shield. Host owns rounds, roster, timer and pickup claims.
 * This is cooperative prototype authority, not a hardened competitive game server.
 */
(function(root){
  'use strict';const C=root.CA;
  class FirebaseArena{
    constructor(arena,ui){this.arena=arena;this.ui=ui;this.sdk=null;this.db=null;this.uid=null;this.code=null;this.slot=null;this.hostId=null;this.members={};this.roster={};this.states={};this.buffers=new Map();this.shared=null;this.offset=0;this.connected=false;this.unsubs=[];this.globalUnsubs=[];this.disconnects=[];this.lastSend=0;this.lastHostTick=0;this.lastPickupRequest=0;this.lastRoundKey='';this.seenDamage=new Set();this.seenKills=new Set();this.seenGrants=new Set();this.lastSerial=new Map();this.requests={};this.pickupState={};this.hostBusy=false;this.claiming=new Set();this.sending=false;this.lastErrorAt=0;this.lastBombBlastKey='';}
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
      this.globalUnsubs.push(db.onValue(db.ref(this.db,'.info/connected'),s=>{this.connected=s.val()===true;if(this.code){this.ui.status(this.connected?'CONNECTED · RANDOM · 5 MODES':'연결이 끊겼다. 재연결 후 방에 다시 참가한다.');if(this.connected&&this.wasDisconnected){this.leave().then(()=>this.ui.notify('연결이 복구됐다. 방 코드로 다시 참가한다.'));}if(!this.connected)this.wasDisconnected=true;}}));
    }
    memberList(){return Object.entries(this.members).map(([id,m])=>({id,...m})).sort((a,b)=>a.slot-b.slot||a.joinedAt-b.joinedAt||a.id.localeCompare(b.id));}
    async create(nickname){
      if(this.code)throw new Error('이미 방에 참가 중이다.');await this.ensure();
      let code=null;
      for(let attempt=0;attempt<6;attempt++){
        const candidate=String(100000+Math.floor(Math.random()*900000));
        const result=await this.sdk.runTransaction(this.sdk.ref(this.db,'rooms/'+candidate),current=>current?undefined:{meta:{hostId:this.uid,createdAt:this.sdk.serverTimestamp(),schema:3,mode:'RANDOM'},state:{phase:'LOBBY',mode:'TEAM',round:0,score:{BLUE:0,RED:0},mapId:'depot'}},{applyLocally:false});
        if(result.committed){code=candidate;break;}
      }
      if(!code)throw new Error('사용 가능한 방 코드를 만들지 못했다. 다시 시도한다.');await this.join(code,nickname);
    }
    async join(rawCode,nickname){
      if(this.code)throw new Error('이미 방에 참가 중이다.');const code=String(rawCode).trim();if(!/^\d{6}$/.test(code))throw new Error('6자리 숫자 방 코드를 입력한다.');await this.ensure();
      const base=this.sdk.ref(this.db,'rooms/'+code),snapshot=await this.sdk.get(base),room=snapshot.val();
      if(room?.meta?.schema!==3)throw new Error('이 방은 이전 버전이다. 모두 V0.1.5(tem)로 새로고침한 뒤 새 방을 만든다.');if(!room?.meta)throw new Error('해당 코드의 방을 찾을 수 없다.');if(room.state?.phase!=='LOBBY')throw new Error('진행 중인 경기다. 로비로 돌아온 뒤 참가할 수 있다.');
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
        this.subscribe();this.ui.status('CONNECTED · RANDOM · 5 MODES');this.ui.roomChanged();
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
      const mode=Object.keys(C.MODES)[Math.floor(Math.random()*5)],bossIndex=Math.floor(Math.random()*members.length);
      let hunterIndex=0;members.forEach((m,i)=>{const team=C.MODES[mode].ffa?'SOLO':mode==='BOSS'?(i===bossIndex?'BOSS':'HUNTERS'):(i%2?'RED':'BLUE');const spawnIndex=C.MODES[mode].ffa?i:mode==='BOSS'?(team==='BOSS'?0:hunterIndex++):counts[team]++;roster[m.id]={nickname:m.nickname,team,spawnIndex};});
      this.roster=roster;const now=this.now(),matchId=`${now.toFixed(0)}-${Math.random().toString(36).slice(2,7)}`;
      for(const entry of Object.values(roster))entry.matchId=matchId;
      const shared={phase:'PLAYING',mode,mapId:map.id,matchId,round:1,roundStartedAt:now,roundEndsAt:C.MODES[mode].limit?now+C.MODES[mode].limit*1000:0,captureTime:{BLUE:0,RED:0},captureUpdatedAt:now,score:{BLUE:0,RED:0},transitionAt:0};
      if(mode==='EXPLOSION')shared.bomb={planted:false,site:'',x:0,y:0,plantProgress:0,defuseProgress:0,explodeAt:0,detonating:false,resolveAt:0,updatedAt:now};
      await this.sdk.update(this.ref(),{roster,state:shared,pickups:this.initialPickups(map,1,matchId),kills:null});
    }
    initialPickups(map,round,matchId){const out={};map.pickups.forEach((p,i)=>{out['orb-'+i]={active:true,respawnAt:0,round,matchId,type:p.type,x:p.x,y:p.y};});return out;}
    applySharedState(){
      const s=this.shared,a=this.arena;if(!s||!this.code)return;
      if(s.phase==='LOBBY'){if(a.online)a.toLobby();this.ui.roomChanged();return;}
      if(!C.MODES[s.mode]){this.ui.status('지원하지 않는 모드다. 최신 버전으로 새로고침한다.');return;}
      if(!this.roster[this.uid]||this.roster[this.uid].matchId!==s.matchId)return;
      const key=s.matchId+':'+s.round,newRound=key!==this.lastRoundKey;
      if(newRound){
        const newMatch=!this.lastRoundKey.startsWith(s.matchId+':');this.lastRoundKey=key;a.online=true;a.mode=s.mode;a.map=C.MAPS.find(m=>m.id===s.mapId)||C.MAPS[0];a.score={...s.score};a.result=null;this.buffers.clear();this.lastSerial.clear();this.lastShot=null;
        if(newMatch){a.entities=Object.entries(this.roster).map(([id,m],i)=>{const e=C.createEntity(id,m.nickname,m.team,id===this.uid,i,m.team==='BOSS');e.isRemote=id!==this.uid;return e;});a.feed=[];a.captureTime={BLUE:0,RED:0};this.seenKills.clear();this.seenGrants.clear();}
        a.round=s.round-1;a.beginRound();a.round=s.round;a.online=true;
        // Reset every combatant to its host-assigned spawn, with full HP and shield.
        for(const e of a.entities){const r=this.roster[e.id];if(r){const pos=C.MODES[s.mode].ffa?a.map.ffa[r.spawnIndex]:s.mode==='BOSS'?(r.team==='BOSS'?a.map.boss:a.map.hunters[r.spawnIndex]):a.map.spawns[r.team][r.spawnIndex];a.resetEntity(e,pos,s.mode==='INFINITY'?2:0);e.life=0;e.protectionEndsAt=s.mode==='INFINITY'?s.roundStartedAt+2000:0;e.respawnEndsAt=0;}}
        this.lastSend=0;this.sendState(true);this.receivePlayers();this.receivePickups();
      }
      a.score={...s.score};for(const e of a.entities)e.wins=s.score[e.id]||0;
      a.roundEndsAt=s.roundEndsAt?a.time+Math.max(0,(s.roundEndsAt-this.now())/1000):Infinity;
      a.transitionAt=a.time+Math.max(0,((s.transitionAt||0)-this.now())/1000);
      if(s.captureTime)a.captureTime={...s.captureTime};if(s.points)for(const pt of a.points)if(s.points[pt.id])Object.assign(pt,{owner:null,capturing:null},s.points[pt.id]);
      if(s.mode==='EXPLOSION'){
        a.attackTeam=s.round<=5?'RED':'BLUE';a.defendTeam=a.attackTeam==='RED'?'BLUE':'RED';
        const b=s.bomb||{planted:false,site:'',x:0,y:0,plantProgress:0,defuseProgress:0,explodeAt:0,detonating:false,resolveAt:0};
        a.bomb={...b,site:b.site||null,carrierTeam:a.attackTeam,explodeAt:b.explodeAt?a.time+Math.max(0,(b.explodeAt-this.now())/1000):0,resolveAt:b.resolveAt?a.time+Math.max(0,(b.resolveAt-this.now())/1000):0};
        const blastKey=`${s.matchId}:${s.round}`;if(b.detonating&&this.lastBombBlastKey!==blastKey){this.lastBombBlastKey=blastKey;const left=Math.max(.05,(b.resolveAt-this.now())/1000);a.effects.push({type:'bomb-explosion',x:b.x,y:b.y,z:24,life:left,maxLife:2});a.emit('bombExploded',{team:a.attackTeam});}
      }
      if(s.result)a.result=s.result;
      if(a.state!==s.phase){a.setState(s.phase);if(s.phase==='MATCH_END'){a.cheats={aim:false,esp:false,noRecoil:false};a.emit('matchEnd',a.result||{});}}
    }
    onFire(data){if(!this.code)return;this.lastShot={angle:data.angle,pitch:data.pitch,x:data.entity.x,y:data.entity.y,z:this.arena.eye(data.entity)-3,at:this.now()};this.sendState(true);}
    sendState(force=false){
      if(!this.code||!this.arena.online||!this.connected||this.arena.state!=='PLAYING'||this.sending)return;
      const now=this.now();if(!force&&now-this.lastSend<75)return;const e=this.arena.player();if(!e)return;this.lastSend=now;
      const state={x:e.x,y:e.y,angle:e.angle,cameraPitch:e.cameraPitch,recoilPitch:e.recoilPitch,hp:e.hp,shield:e.shield,alive:e.alive,weapon:e.weapon,
        jumpZ:e.jumpZ,jumpV:e.jumpV,crouching:e.crouching,crouchBlend:e.crouchBlend,vx:e.vx,vy:e.vy,walkPhase:e.walkPhase,moveSpeed:e.moveSpeed,
        ammo:C.WEAPONS[e.weapon]?.kind==='melee'?-1:e.ammo[e.weapon],reloadLeft:e.reloadLeft,reloadTotal:e.reloadTotal,shotSerial:e.shotSerial,kills:e.kills,deaths:e.deaths,
        life:e.life||0,respawnEndsAt:e.respawnEndsAt||0,protectionEndsAt:e.protectionEndsAt||0,round:this.shared.round,matchId:this.shared.matchId,updatedAt:this.sdk.serverTimestamp(),lastShot:this.lastShot||{angle:e.angle,pitch:e.cameraPitch,x:e.x,y:e.y,z:52,at:0}};
      this.sending=true;this.sdk.set(this.ref('players/'+this.uid),state).catch(e=>{if(this.shared?.phase==='PLAYING'&&this.shared.round===state.round)this.report(e);}).finally(()=>{this.sending=false;});
    }
    receivePlayers(){
      if(!this.arena.online)return;const a=this.arena;
      for(const e of a.entities){if(e.isPlayer)continue;const s=this.states[e.id];if(!s||s.round!==this.shared?.round||s.matchId!==this.shared?.matchId)continue;
        if(!Number.isFinite(s.x)||!Number.isFinite(s.y)||!C.canStand(a.map,s.x,s.y,17))continue;
        e.hp=C.clamp(s.hp,0,e.maxHp);e.shield=C.clamp(s.shield,0,e.maxShield);if(e.life!==s.life){this.buffers.delete(e.id);e.x=s.x;e.y=s.y;}e.life=s.life||0;e.spawnProtectionUntil=a.time+Math.max(0,((s.protectionEndsAt||0)-this.now())/1000);e.alive=s.alive===true&&e.hp>0;e.weapon=C.clamp(s.weapon|0,0,5);e.kills=s.kills||0;e.deaths=s.deaths||0;e.ammo[e.weapon]=s.ammo<0?Infinity:s.ammo;e.reloadLeft=s.reloadLeft||0;e.reloadTotal=s.reloadTotal||0;e.crouching=!!s.crouching;
        let queue=this.buffers.get(e.id);if(!queue){queue=[];this.buffers.set(e.id,queue);}if(!queue.length||queue[queue.length-1].updatedAt!==s.updatedAt){queue.push({...s,updatedAt:typeof s.updatedAt==='number'?s.updatedAt:this.now()});if(queue.length>8)queue.shift();}
        const old=this.lastSerial.get(e.id);this.lastSerial.set(e.id,s.shotSerial);
        if(old!==undefined&&s.shotSerial>old&&this.now()-(s.lastShot?.at||0)<700){
          const weapon=C.WEAPONS[e.weapon],shot=s.lastShot||s;e.fireFlash=weapon?.kind==='firearm'?.09:0;a.emit('fire',{entity:e,weapon,angle:shot.angle,pitch:shot.pitch});
          if(e.weapon===3){a.projectiles.push({id:e.id+'-'+s.shotSerial,owner:e.id,x:shot.x,y:shot.y,z:shot.z,vx:Math.cos(shot.angle)*760,vy:Math.sin(shot.angle)*760,vz:Math.tan(shot.pitch)*760,life:2.8,damage:0,visualOnly:true});}
          else if(e.weapon===5){const speed=weapon.projectileSpeed;a.projectiles.push({id:e.id+'-'+s.shotSerial,owner:e.id,x:shot.x,y:shot.y,z:shot.z,vx:Math.cos(shot.angle)*speed,vy:Math.sin(shot.angle)*speed,vz:Math.tan(shot.pitch)*speed+125,life:weapon.fuse,damage:0,visualOnly:true,grenade:true,radius:weapon.radius});}
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
      const r=this.sdk.push(this.ref('damage/'+victim.id));this.sdk.set(r,{attacker:this.uid,raw,weapon,life:victim.life||0,round:this.shared.round,matchId:this.shared.matchId,at:this.sdk.serverTimestamp()}).catch(e=>this.report(e));
    }
    async receiveDamage(id,event){
      if(!event||this.seenDamage.has(id)||!this.code)return;this.seenDamage.add(id);
      const ref=this.ref('damage/'+this.uid+'/'+id),a=this.arena,p=a.player();
      if(!a.online||!p||a.state!=='PLAYING'||event.life!==(p.life||0)||event.round!==this.shared?.round||event.matchId!==this.shared?.matchId||this.now()-event.at>5000||event.at>this.now()+2000){await this.sdk.remove(ref);return;}
      const attacker=a.entities.find(e=>e.id===event.attacker),w=C.WEAPONS.find(w=>w.name===event.weapon);if(!attacker||!w||!Number.isFinite(event.raw)||!this.members[event.attacker]||!C.enemy(p,attacker,a.mode)){await this.sdk.remove(ref);return;}
      const result=a.damage(p,C.clamp(event.raw,0,w.damage*(w.pellets||1)),attacker,event.weapon,true);
      // Only this victim subtracts shield and then HP, and publishes the resulting state.
      this.sendState(true);await this.sdk.set(this.ref('acks/'+event.attacker+'/'+id),{victim:this.uid,hp:result.hp,shield:result.shield,round:event.round,matchId:event.matchId,at:this.sdk.serverTimestamp()});await this.sdk.remove(ref);
    }
    onKill(item){
      if(!this.code||item.victimId!==this.uid)return;const p=this.arena.player();p.respawnEndsAt=C.MODES[this.arena.mode].respawn?this.now()+C.MODES[this.arena.mode].respawn*1000:0;const key=this.shared.round+'_'+this.uid+'_'+(p.life||0);this.sendState(true);
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
        const state=this.states[uid],orb=this.arena.pickups.find(o=>o.id===id);if(!orb||!state||!state.alive||!this.members[uid]||request.round!==round||request.matchId!==matchId||now-request.at>2000||state.round!==round||state.matchId!==matchId||C.dist(orb,state)>45||(state.jumpZ||0)>28||!C.los(this.arena.map,state,orb)||(orb.type==='health'?state.hp>=(this.roster[uid]?.team==='BOSS'?2000:100):state.shield>=(this.roster[uid]?.team==='BOSS'?1000:50)))continue;
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
      return this.changeState(s=>{if(s.phase!=='PLAYING'||s.round!==round||s.matchId!==matchId)return;const score={...s.score};if(winner)score[winner]=(score[winner]||0)+1;
        let match=forfeit||!['TEAM','EXPLOSION'].includes(s.mode)||s.mode==='TEAM'&&!!winner&&score[winner]>=7||s.mode==='EXPLOSION'&&s.round>=10;
        let resultWinner=winner||'';let draw=!winner;let resultReason=reason;
        if(s.mode==='EXPLOSION'&&s.round>=10&&!forfeit){const b=score.BLUE||0,r=score.RED||0;resultWinner=b===r?'':b>r?'BLUE':'RED';draw=b===r;resultReason=`10라운드 종료 · ${score.BLUE||0}:${score.RED||0}`;}
        return{...s,phase:'ROUND_END',score,transitionAt:this.now()+3500,result:{winner:resultWinner,name:this.roster[resultWinner]?.nickname||resultWinner||'DRAW',draw,reason:resultReason,match}};});
    }
    hostTick(){
      const s=this.shared,now=this.now();if(!s||this.uid!==this.hostId||now-this.lastHostTick<150)return;this.lastHostTick=now;
      if(s.phase==='PLAYING'){
        this.processPickups();if(now-s.roundStartedAt<1600)return;
        const present=Object.entries(this.roster).filter(([id])=>this.members[id]),ready=present.filter(([id])=>this.states[id]?.round===s.round&&this.states[id]?.matchId===s.matchId);
        if(ready.length<present.length&&now-s.roundStartedAt<8000)return;
        const alive=ready.filter(([id])=>this.states[id].alive);
        const best=(entries,value)=>{const ranked=[...entries].sort((a,b)=>value(b)-value(a));return ranked.length&&(!ranked[1]||Math.abs(value(ranked[0])-value(ranked[1]))>1e-6)?ranked[0][0]:null;};
        if(s.mode==='EXPLOSION'){
          const attackTeam=s.round<=5?'RED':'BLUE',defendTeam=attackTeam==='RED'?'BLUE':'RED';
          const attackers=alive.filter(([,r])=>r.team===attackTeam),defenders=alive.filter(([,r])=>r.team===defendTeam);
          const attackMembers=present.filter(([,r])=>r.team===attackTeam),defendMembers=present.filter(([,r])=>r.team===defendTeam);
          if(!attackMembers.length||!defendMembers.length){this.hostFinish(attackMembers.length?attackTeam:defendMembers.length?defendTeam:null,'상대 팀 연결 종료',true);return;}
          const a=this.arena,map=a.map,bomb={planted:false,site:'',x:0,y:0,plantProgress:0,defuseProgress:0,explodeAt:0,detonating:false,resolveAt:0,updatedAt:now,...s.bomb};
          if(!defenders.length){this.hostFinish(attackTeam,'수비팀 전멸');return;}
          if(!attackers.length&&!bomb.planted){this.hostFinish(defendTeam,'공격팀 전멸 · 폭탄 미설치');return;}
          if(bomb.detonating){if(now>=bomb.resolveAt)this.hostFinish(attackTeam,'폭탄 폭발');return;}
          const dt=C.clamp((now-(bomb.updatedAt||now))/1000,0,.5),fresh=ready.filter(([id])=>now-(this.states[id].updatedAt||0)<2500),sites=map.bombSites||map.points.slice(0,2);
          const inRange=(group,point,radius)=>group.some(([id,r])=>{const st=this.states[id];return st?.alive&&Math.hypot(st.x-point.x,st.y-point.y)<radius&&C.los(map,st,point);});
          if(!bomb.planted){
            if(now>=s.roundEndsAt){this.hostFinish(defendTeam,'설치 시간 종료');return;}
            let site=null;for(const pt of sites){const atk=inRange(fresh.filter(([,r])=>r.team===attackTeam),pt,(pt.radius||104)*.62),def=inRange(fresh.filter(([,r])=>r.team===defendTeam),pt,(pt.radius||104)*.62);if(atk&&!def){site=pt;break;}}
            if(site){bomb.plantProgress=Math.min(4,(bomb.plantProgress||0)+dt);bomb.site=site.id||'A';if(bomb.plantProgress>=4){bomb.planted=true;bomb.x=site.x;bomb.y=site.y;bomb.explodeAt=now+35000;bomb.defuseProgress=0;}}
            else{bomb.plantProgress=Math.max(0,(bomb.plantProgress||0)-dt*1.5);if(!bomb.plantProgress)bomb.site='';}
          }else{
            if(now>=bomb.explodeAt){bomb.detonating=true;bomb.resolveAt=now+2000;bomb.updatedAt=now;this.changeState(v=>v.phase==='PLAYING'&&v.matchId===s.matchId&&v.round===s.round?{...v,bomb}:undefined);return;}
            const point={x:bomb.x,y:bomb.y,z:16},def=inRange(fresh.filter(([,r])=>r.team===defendTeam),point,72),atk=inRange(fresh.filter(([,r])=>r.team===attackTeam),point,72);
            if(def&&!atk){bomb.defuseProgress=Math.min(5,(bomb.defuseProgress||0)+dt);if(bomb.defuseProgress>=5){this.hostFinish(defendTeam,'폭탄 해체');return;}}
            else bomb.defuseProgress=Math.max(0,(bomb.defuseProgress||0)-dt*1.5);
          }
          bomb.updatedAt=now;this.changeState(v=>v.phase==='PLAYING'&&v.matchId===s.matchId&&v.round===s.round?{...v,bomb}:undefined);return;
        }
        if(s.mode==='INFINITY'){
          if(now>=s.roundEndsAt||present.length<2)this.hostFinish(best(Object.entries(this.roster),([id])=>this.states[id]?.kills||0),'경기 종료 · 최다 킬',true);
          return;
        }
        if(s.mode==='BOSS'){
          if(!alive.some(([,r])=>r.team==='BOSS'))this.hostFinish('HUNTERS','BOSS ELIMINATED',true);
          else if(!alive.some(([,r])=>r.team==='HUNTERS'))this.hostFinish('BOSS','ALL HUNTERS ELIMINATED',true);
          return;
        }
        const blueMembers=present.filter(([,r])=>r.team==='BLUE'),redMembers=present.filter(([,r])=>r.team==='RED');
        const blue=alive.filter(([,r])=>r.team==='BLUE'),red=alive.filter(([,r])=>r.team==='RED');
        if(!blueMembers.length||!redMembers.length){this.hostFinish(blueMembers.length?'BLUE':redMembers.length?'RED':null,'상대 팀 연결 종료',true);return;}
        if(s.mode==='CAPTURE'){
          // Integrate only fresh, published positions; carry totals through host migration.
          const dt=C.clamp((now-(s.captureUpdatedAt||now))/1000,0,.5),a=this.arena;
          const entities=a.entities,points=a.points,totals=a.captureTime;
          a.entities=ready.filter(([id])=>now-this.states[id].updatedAt<2500).map(([id,r])=>({...this.states[id],team:r.team}));
          a.points=a.map.points.map(p=>({...p,owner:null,control:0,contested:false,capturing:null,...s.points?.[p.id]}));a.captureTime={...(s.captureTime||{BLUE:0,RED:0})};
          a.updateCapture(dt);const nextPoints=Object.fromEntries(a.points.map(p=>[p.id,{owner:p.owner,control:p.control,contested:p.contested,capturing:p.capturing}])),nextTime={...a.captureTime};
          a.entities=entities;a.points=points;a.captureTime=totals;
          if((s.captureTime?.BLUE||0)>=45||(s.captureTime?.RED||0)>=45)this.hostFinish(s.captureTime.BLUE>=45?'BLUE':'RED','거점 2개 이상 · 누적 45초 달성',true);
          else this.changeState(v=>v.phase==='PLAYING'&&v.matchId===s.matchId&&v.round===s.round?{...v,points:nextPoints,captureTime:nextTime,captureUpdatedAt:now}:undefined);
          return;
        }
        if(!blue.length||!red.length){this.hostFinish(blue.length?'BLUE':red.length?'RED':null,'상대 팀 전멸');return;}
        if(now>=s.roundEndsAt){let winner=null;if(blue.length!==red.length)winner=blue.length>red.length?'BLUE':'RED';else{const total=group=>group.reduce((v,[id])=>v+this.states[id].hp+this.states[id].shield,0),b=total(blue),r=total(red);if(Math.abs(b-r)>1e-6)winner=b>r?'BLUE':'RED';}this.hostFinish(winner,'시간 종료 · 생존 인원 / HP + Shield 판정');}
      }else if(s.phase==='ROUND_END'&&now>=s.transitionAt){
        if(s.result?.match)this.changeState(v=>v.phase==='ROUND_END'&&v.round===s.round?{...v,phase:'MATCH_END',transitionAt:this.now()+7000}:undefined);
        else if(!this.hostBusy){
          this.hostBusy=true;const round=s.round+1,map=C.MAPS.find(m=>m.id===s.mapId),stateRef=this.ref('state'),code=this.code;this.sdk.set(this.ref('pickups'),this.initialPickups(map,round,s.matchId)).then(()=>{if(this.code===code&&this.uid===this.hostId)return this.sdk.runTransaction(stateRef,v=>{if(v.phase!=='ROUND_END'||v.round!==s.round)return;const start=this.now(),next={...v,phase:'PLAYING',round,roundStartedAt:start,roundEndsAt:C.MODES[v.mode].limit?start+C.MODES[v.mode].limit*1000:0,transitionAt:0,result:null};if(v.mode==='EXPLOSION')next.bomb={planted:false,site:'',x:0,y:0,plantProgress:0,defuseProgress:0,explodeAt:0,detonating:false,resolveAt:0,updatedAt:start};return next;},{applyLocally:false});}).catch(e=>this.report(e)).finally(()=>{this.hostBusy=false;});
        }
      }else if(s.phase==='MATCH_END'&&now>=s.transitionAt)this.changeState(v=>v.phase==='MATCH_END'?{...v,phase:'LOBBY',transitionAt:0}:undefined);
    }
    tick(dt){if(!this.code||!this.connected)return;if(this.arena.online){this.interpolate(dt);if(this.shared?.phase==='PLAYING'){const a=this.arena,p=a.player(),now=this.now();a.roundEndsAt=this.shared.roundEndsAt?a.time+Math.max(0,(this.shared.roundEndsAt-now)/1000):Infinity;
          if(p){p.spawnProtectionUntil=a.time+Math.max(0,((p.protectionEndsAt||0)-now)/1000);if(!p.alive&&C.MODES[a.mode].respawn){p.respawnAt=a.time+Math.max(0,((p.respawnEndsAt||now)-now)/1000);if(p.respawnEndsAt&&now>=p.respawnEndsAt){a.resetEntity(p,a.safeSpawn(p),2);p.life=(p.life||0)+1;p.respawnEndsAt=0;p.protectionEndsAt=now+2000;this.lastShot=null;a.emit('respawn',{entity:p});}}}this.sendState();this.requestPickup();}}this.hostTick();}
    async leave(){
      if(!this.code)return;const code=this.code,slot=this.slot,uid=this.uid;for(const u of this.unsubs)u();this.unsubs=[];
      this.code=null;this.members={};this.roster={};this.states={};this.shared=null;this.lastRoundKey='';this.hostId=null;this.pickupState={};this.requests={};this.buffers.clear();this.wasDisconnected=false;
      if(this.connected){try{await this.sdk.update(this.sdk.ref(this.db,'rooms/'+code),{['members/'+uid]:null,['players/'+uid]:null,['seats/'+slot]:null,['pickupRequests/'+uid]:null});for(const d of this.disconnects)await d.cancel();}catch(e){this.report(e);}}
      // On a dead socket keep the registered server cleanup intact.
      this.disconnects=[];if(this.arena.online)this.arena.toLobby();this.ui.roomChanged();this.ui.status('방에서 나왔다.');
    }
  }C.FirebaseArena=FirebaseArena;
})(typeof window!=='undefined'?window:globalThis);
