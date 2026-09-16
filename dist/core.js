/* CHEAT ARENA — simulation. No browser/renderer dependencies. Units: world pixels. */
(function (root) {
  'use strict';
  const CA = root.CA = root.CA || {};
  const TILE = 64, TAU = Math.PI * 2;
  const MATCH_STATE = Object.freeze({ LOBBY:'LOBBY', PLAYING:'PLAYING', ROUND_END:'ROUND_END', MATCH_END:'MATCH_END' });
  const MODES = Object.freeze({
    TEAM:{ name:'TEAM ELIMINATION', icon:'◈', desc:'5 VS 5 · 7선승 · 2분 · 라운드 중 부활 없음', ffa:false, limit:120, respawn:0 },
    SOLO:{ name:'SOLO ELIMINATION', icon:'◎', desc:'10인 개인전 · 7선승 · 2분 · 부활 없음', ffa:true, limit:120, respawn:0 },
    INFINITY:{ name:'INFINITY ELIMINATION', icon:'∞', desc:'10인 개인전 · 5분 · 4초 부활 · 최다 킬 승리', ffa:true, limit:300, respawn:4 },
    BOSS:{ name:'KILLING BOSS', icon:'♜', desc:'1 VS 9 · YOU = BOSS · HP 2000 / Shield 1000 · 부활 없음', ffa:false, limit:0, respawn:0 },
    CAPTURE:{ name:'OBJECT CAPTURE', icon:'⚑', desc:'5 VS 5 · A/B/C · 2개 이상 점령 · 누적 45초 · 5초 부활', ffa:false, limit:0, respawn:5 }
  });
  const WEAPONS = Object.freeze([
    { id:0,name:'AR',label:'ASSAULT RIFLE',auto:true,damage:26,mag:30,reload:2.1,interval:.105,range:1400,spread:.014,recoil:.027,kick:8 },
    { id:1,name:'PISTOL',label:'SERVICE PISTOL',auto:false,damage:34,mag:12,reload:1.3,interval:.27,range:950,spread:.010,recoil:.036,kick:11 },
    { id:2,name:'KNIFE',label:'COMBAT KNIFE',auto:false,damage:65,mag:Infinity,reload:0,interval:.48,range:82,spread:0,recoil:0,kick:0 },
    { id:3,name:'SHOTGUN',label:'BREACH SHOTGUN',auto:false,damage:15,pellets:8,mag:6,reload:2.8,interval:.8,range:720,spread:.10,recoil:.09,kick:20 },
    { id:4,name:'CROSSBOW',label:'TACTICAL CROSSBOW',auto:false,damage:110,mag:1,reload:2.2,interval:.85,range:1800,spread:.004,recoil:.045,kick:13,projectileSpeed:760 },
    { id:5,name:'MAC',label:'MAC · BELT-FED MG',auto:true,damage:23,mag:80,reload:4.1,interval:.075,range:1500,spread:.028,recoil:.072,kick:17 }
  ]);
  const ROLES = [
    {name:'RIFLE',weapon:0,range:400,aggression:.78,skill:.72},
    {name:'BREACHER',weapon:3,range:160,aggression:.96,skill:.64},
    {name:'MARKSMAN',weapon:4,range:650,aggression:.42,skill:.81},
    {name:'SUPPRESSOR',weapon:5,range:440,aggression:.64,skill:.62},
    {name:'SKIRMISHER',weapon:1,range:280,aggression:.72,skill:.76}
  ];
  // Boss-only pacing. Damage, max health/shield, pickups and other modes stay shared.
  const BOSS_BALANCE = Object.freeze({reloadScale:.75,hunterReactionDelay:.30,hunterAimErrorScale:1.6,burstMin:.55,burstJitter:.25,pauseMin:.65,pauseJitter:.35});
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
  const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  const mix=(a,b,t)=>a+(b-a)*t;
  const enemy=(a,b,mode)=>!!a&&!!b&&a.id!==b.id&&(MODES[mode].ffa||a.team!==b.team);
  const wallAt=(map,x,y)=>map.grid[Math.floor(y/TILE)]?.[Math.floor(x/TILE)] || (x<0||y<0||x>=map.width*TILE||y>=map.height*TILE ? 1:0);
  // Shared finite landmark volumes: movement, LOS, hitscan, bolts and renderer.
  function boxInterval(a,b,box,flat=false){
    let near=0,far=1;
    for(const axis of (flat?['x','y']:['x','y','z'])){
      const delta=b[axis]-a[axis],lo=box[axis+'0'],hi=box[axis+'1'];
      if(Math.abs(delta)<1e-9){if(a[axis]<lo||a[axis]>hi)return null;continue;}
      let enter=(lo-a[axis])/delta,leave=(hi-a[axis])/delta;
      if(enter>leave)[enter,leave]=[leave,enter];near=Math.max(near,enter);far=Math.min(far,leave);
      if(near>far)return null;
    }return {near,far};
  }
  function traceScene(map,a,b){
    const length=Math.hypot(b.x-a.x,b.y-a.y),wall=raycast(map,a.x,a.y,Math.atan2(b.y-a.y,b.x-a.x),length);
    let t=wall.hit?wall.d/Math.max(length,1e-9):1,hit=wall.hit,part=null;
    for(const box of map.landmarkParts||[]){const span=boxInterval(a,b,box);if(span&&span.near<=t){t=span.near;hit=true;part=box;}}
    return {hit,t,part,x:mix(a.x,b.x,t),y:mix(a.y,b.y,t),z:mix(a.z,b.z,t)};
  }
  function canStand(map,x,y,r=18){
    for(const box of map.landmarkParts||[]){
      if(box.z0>=70||box.z1<=0)continue;
      if((x-clamp(x,box.x0,box.x1))**2+(y-clamp(y,box.y0,box.y1))**2<r*r)return false;
    }
    const x0=Math.floor((x-r)/TILE), x1=Math.floor((x+r)/TILE), y0=Math.floor((y-r)/TILE),y1=Math.floor((y+r)/TILE);
    for(let gy=y0;gy<=y1;gy++) for(let gx=x0;gx<=x1;gx++){
      if(gy<0||gx<0||gy>=map.height||gx>=map.width||map.grid[gy][gx]){
        const nx=clamp(x,gx*TILE,(gx+1)*TILE),ny=clamp(y,gy*TILE,(gy+1)*TILE);
        if((x-nx)**2+(y-ny)**2<r*r) return false;
      }
    } return true;
  }
  function raycast(map,x,y,angle,max=2200){
    const dx=Math.cos(angle),dy=Math.sin(angle);
    let gx=Math.floor(x/TILE),gy=Math.floor(y/TILE);
    const sx=dx<0?-1:1,sy=dy<0?-1:1,ddx=Math.abs(TILE/(dx||1e-9)),ddy=Math.abs(TILE/(dy||1e-9));
    let tx=(dx<0?x-gx*TILE:(gx+1)*TILE-x)/Math.max(Math.abs(dx),1e-9);
    let ty=(dy<0?y-gy*TILE:(gy+1)*TILE-y)/Math.max(Math.abs(dy),1e-9),side=0,d=0;
    for(let i=0;i<120;i++){
      if(tx<ty){gx+=sx;d=tx;tx+=ddx;side=0;}else{gy+=sy;d=ty;ty+=ddy;side=1;}
      if(d>max) return {d:max,hit:false,side:0,type:0,u:0,x:x+dx*max,y:y+dy*max};
      const type=map.grid[gy]?.[gx];
      if(type===undefined||type){
        const hitX=x+dx*d,hitY=y+dy*d;
        return {d:Math.max(d,.1),hit:true,side,type:type||1,u:((side?hitX:hitY)%TILE+TILE)%TILE,x:hitX,y:hitY,gx,gy};
      }
    }return {d:max,hit:false,type:0,side:0,u:0,x:x+dx*max,y:y+dy*max};
  }
  function los(map,a,b){
    const from={x:a.x,y:a.y,z:a.z??(52+(a.jumpZ||0)-22*(a.crouchBlend||0))};
    const to={x:b.x,y:b.y,z:b.z??(b.type==='health'||b.type==='shield'?19:42+(b.jumpZ||0)-14*(b.crouchBlend||0))};
    return !traceScene(map,from,to).hit;
  }
  function clearWalk(map,a,b,r=19){
    const steps=Math.max(1,Math.ceil(dist(a,b)/8));
    for(let i=0;i<=steps;i++)if(!canStand(map,mix(a.x,b.x,i/steps),mix(a.y,b.y,i/steps),r))return false;
    return true;
  }
  // Earliest segment/circle intersection; used by bullets and swept crossbow bolts.
  function segmentCircle(ax,ay,bx,by,cx,cy,r){
    const dx=bx-ax,dy=by-ay,fx=ax-cx,fy=ay-cy,a=dx*dx+dy*dy,c=fx*fx+fy*fy-r*r;
    if(c<=0)return 0;if(a<1e-9)return null;
    const b=2*(fx*dx+fy*dy),disc=b*b-4*a*c;
    if(disc<0)return null;const t=(-b-Math.sqrt(disc))/(2*a);
    return t>=0&&t<=1?t:null;
  }
  function moveCircle(map,e,dx,dy){
    const len=Math.hypot(dx,dy),scale=len>15?15/len:1; dx*=scale;dy*=scale;
    const steps=Math.max(1,Math.ceil(Math.hypot(dx,dy)/5));
    for(let n=0;n<steps;n++){
      if(canStand(map,e.x+dx/steps,e.y,e.radius))e.x+=dx/steps;
      if(canStand(map,e.x,e.y+dy/steps,e.radius))e.y+=dy/steps;
    }
  }
  // Four-neighbour A*: no corner cutting, all waypoints centered on open cells.
  function pathfind(map,start,goal){
    const w=map.width,h=map.height,sx=clamp(Math.floor(start.x/TILE),1,w-2),sy=clamp(Math.floor(start.y/TILE),1,h-2);
    let tx=clamp(Math.floor(goal.x/TILE),1,w-2),ty=clamp(Math.floor(goal.y/TILE),1,h-2);
    if(map.grid[ty][tx])return[];
    if(!canStand(map,(tx+.5)*TILE,(ty+.5)*TILE,19)){
      const candidates=[];
      for(let oy=-2;oy<=2;oy++)for(let ox=-2;ox<=2;ox++){
        const gx=tx+ox,gy=ty+oy,p={x:(gx+.5)*TILE,y:(gy+.5)*TILE};
        if(gx>0&&gy>0&&gx<w-1&&gy<h-1&&clearWalk(map,p,goal))candidates.push({gx,gy,d:dist(p,goal)});
      }candidates.sort((a,b)=>a.d-b.d);if(!candidates.length)return[];tx=candidates[0].gx;ty=candidates[0].gy;
    }
    const s=sy*w+sx,t=ty*w+tx,g=new Float32Array(w*h).fill(Infinity),from=new Int32Array(w*h).fill(-1),closed=new Uint8Array(w*h),open=[s];g[s]=0;
    let loops=0;
    while(open.length&&loops++<w*h){
      let k=0,best=Infinity;
      for(let i=0;i<open.length;i++){const v=open[i],f=g[v]+Math.abs(v%w-tx)+Math.abs(Math.floor(v/w)-ty);if(f<best){best=f;k=i;}}
      const v=open.splice(k,1)[0]; if(v===t){const out=[];let q=t;while(q!==s&&q!==-1){out.push({x:(q%w+.5)*TILE,y:(Math.floor(q/w)+.5)*TILE});q=from[q];}return out.reverse();}
      closed[v]=1;const x=v%w,y=Math.floor(v/w);
      for(const [nx,ny]of[[x+1,y],[x-1,y],[x,y+1],[x,y-1]]){
        if(nx<1||ny<1||nx>=w-1||ny>=h-1||map.grid[ny][nx])continue;
        if(map.landmarkParts?.length&&!clearWalk(map,v===s?start:{x:(x+.5)*TILE,y:(y+.5)*TILE},{x:(nx+.5)*TILE,y:(ny+.5)*TILE}))continue;
        const n=ny*w+nx;if(closed[n])continue;
        const nearWall=map.grid[ny-1][nx]||map.grid[ny+1][nx]||map.grid[ny][nx-1]||map.grid[ny][nx+1];
        const cost=g[v]+1+(nearWall?.12:0);if(cost<g[n]){g[n]=cost;from[n]=v;if(!open.includes(n))open.push(n);}
      }
    } return[];
  }
  function createEntity(id,name,team,isPlayer,index=0,boss=false){
    const role=ROLES[index%ROLES.length];
    return {id,name,team,isPlayer,isRemote:false,index,role,x:0,y:0,angle:0,cameraPitch:0,recoilPitch:0,radius:18,
      maxHp:boss?2000:100,maxShield:boss?1000:50,hp:boss?2000:100,shield:boss?1000:50,alive:true,
      kills:0,deaths:0,wins:0,weapon:isPlayer?0:role.weapon,ammo:WEAPONS.map(w=>w.mag),cooldown:0,reloadLeft:0,reloadTotal:0,
      jumpZ:0,jumpV:0,crouching:false,crouchBlend:0,landingKick:0,vx:0,vy:0,walkPhase:0,moveSpeed:0,
      lastDamage:-100,attackerId:null,attackerAt:-100,spawnProtectionUntil:0,respawnAt:0,fireFlash:0,weaponKick:0,shotSerial:0,
      ai:{path:[],pathAt:0,thinkAt:0,target:null,goal:null,lastX:0,lastY:0,stuck:0,strafe:index%2?1:-1,burstUntil:0,nextBurstAt:0,reactionUntil:0}};
  }
  class Arena {
    constructor(onEvent=()=>{}){
      this.onEvent=onEvent;this.state=MATCH_STATE.LOBBY;this.mode='TEAM';this.map=null;this.entities=[];this.time=0;
      this.cheats={aim:false,esp:false,noRecoil:false};this.score={BLUE:0,RED:0};this.round=0;this.projectiles=[];this.effects=[];this.feed=[];
      this.captureTime={BLUE:0,RED:0};this.points=[];this.pickups=[];this.spectatorId=null;this.online=false;this.result=null;
    }
    emit(type,data={}){this.onEvent(type,data);}
    setState(state){if(!Object.values(MATCH_STATE).includes(state))throw new Error('Invalid match state');this.state=state;this.emit('state',{state});}
    player(){return this.entities.find(e=>e.isPlayer);}
    viewpoint(){const p=this.player();return p?.alive?p:this.entities.find(e=>e.id===this.spectatorId&&e.alive)||p;}
    start(mode,map,nickname='PLAYER'){
      if(!MODES[mode])throw new Error('Unknown mode');this.online=false;this.mode=mode;this.map=map;this.time=0;this.round=0;this.score={BLUE:0,RED:0};this.captureTime={BLUE:0,RED:0};this.feed=[];this.result=null;
      this.entities=[createEntity('player',nickname,mode==='BOSS'?'BOSS':'BLUE',true,0,mode==='BOSS')];
      for(let i=1;i<10;i++){
        const team=MODES[mode].ffa?'SOLO':mode==='BOSS'?'HUNTERS':i<5?'BLUE':'RED';
        const name=MODES[mode].ffa?`SOLO-${i+1}`:mode==='BOSS'?`HUNTER-${String(i).padStart(2,'0')}`:`${team}-${String(team==='BLUE'?i+1:i-4).padStart(2,'0')}`;
        this.entities.push(createEntity('ai-'+i,name,team,false,i));
      }this.beginRound();
    }
    beginRound(){
      this.round++;this.roundStart=this.time;this.roundEndsAt=MODES[this.mode].limit?this.time+MODES[this.mode].limit:Infinity;this.projectiles=[];this.effects=[];this.spectatorId=null;
      this.points=this.map.points.map(p=>({...p,owner:null,control:0,contested:false,capturing:null}));
      this.pickups=this.map.pickups.map((p,i)=>({...p,id:'orb-'+i,active:true,respawnAt:0}));
      const count={};for(let i=0;i<this.entities.length;i++){
        const e=this.entities[i];let pos;
        if(MODES[this.mode].ffa)pos=this.map.ffa[i];
        else if(this.mode==='BOSS'){pos=e.team==='BOSS'?this.map.boss:this.map.hunters[count.HUNTERS||0];if(e.team!=='BOSS')count.HUNTERS=(count.HUNTERS||0)+1;}
        else{const side=e.team==='BLUE'?'BLUE':'RED';const n=count[side]||0;pos=this.map.spawns[side][n];count[side]=n+1;}
        this.resetEntity(e,pos,this.mode==='INFINITY'?2:0);
      }this.setState(MATCH_STATE.PLAYING);this.emit('roundStart',{round:this.round});
    }
    resetEntity(e,pos,protection=0){
      if(!pos||!canStand(this.map,pos.x,pos.y,e.radius))throw new Error('Invalid spawn '+e.id);
      Object.assign(e,{x:pos.x,y:pos.y,angle:pos.angle??Math.atan2(this.map.height*TILE/2-pos.y,this.map.width*TILE/2-pos.x),cameraPitch:0,recoilPitch:0,
        hp:e.maxHp,shield:e.maxShield,alive:true,ammo:WEAPONS.map(w=>w.mag),cooldown:0,reloadLeft:0,reloadTotal:0,
        jumpZ:0,jumpV:0,crouching:false,crouchBlend:0,landingKick:0,vx:0,vy:0,walkPhase:0,moveSpeed:0,
        lastDamage:this.time-100,attackerId:null,attackerAt:-100,spawnProtectionUntil:this.time+protection,respawnAt:0,fireFlash:0,weaponKick:0});
      e.ai={path:[],pathAt:0,thinkAt:0,target:null,goal:null,lastX:e.x,lastY:e.y,stuck:0,strafe:e.index%2?1:-1,burstUntil:0,nextBurstAt:0,reactionUntil:0};
      if(e.isPlayer)this.spectatorId=null;
    }
    safeSpawn(e){
      const candidates=MODES[this.mode].ffa?this.map.ffa:this.map.spawns[e.team];
      const alive=this.entities.filter(a=>a.alive&&a.id!==e.id);
      const ranked=candidates.filter(p=>canStand(this.map,p.x,p.y,18)).map(p=>{
        let safety=9999;for(const other of alive){const d=dist(p,other);safety=Math.min(safety,d-(enemy(e,other,this.mode)&&los(this.map,p,other)?210:0));}
        return {p,safety};
      }).sort((a,b)=>b.safety-a.safety);
      const noOverlap=ranked.filter(r=>alive.every(a=>dist(r.p,a)>50));const pool=(noOverlap.length?noOverlap:ranked).slice(0,4);
      return pool[Math.floor(Math.random()*pool.length)].p;
    }
    selectWeapon(e,id){if(!WEAPONS[id]||!e.alive)return;e.weapon=id;e.reloadLeft=0;e.reloadTotal=0;e.weaponKick=0;e.cooldown=Math.max(e.cooldown,.14);}
    reload(e){const w=WEAPONS[e.weapon];if(!e.alive||e.weapon===2||e.reloadLeft>0||e.ammo[e.weapon]>=w.mag)return false;const duration=w.reload*(!this.online&&this.mode==='BOSS'&&e.isPlayer?BOSS_BALANCE.reloadScale:1);e.reloadLeft=duration;e.reloadTotal=duration;this.emit('reload',{entity:e,weapon:w});return true;}
    jump(e){if(!e?.alive||e.jumpZ>.05||e.jumpV!==0||e.crouching)return;e.jumpV=255;}
    height(e){return 70-24*e.crouchBlend;}
    eye(e){return 52-22*e.crouchBlend+e.jumpZ-e.landingKick;}
    tick(dt,input={}){
      dt=clamp(dt,0,.05);this.time+=dt;
      this.effects=this.effects.filter(f=>(f.life-=dt)>0);this.feed=this.feed.filter(f=>this.time-f.at<6);
      if(this.state===MATCH_STATE.ROUND_END&&!this.online){if(this.time>=this.transitionAt){if(this.result.match){this.cheats={aim:false,esp:false,noRecoil:false};this.setState(MATCH_STATE.MATCH_END);this.transitionAt=this.time+7;this.emit('matchEnd',this.result);}else this.beginRound();}return;}
      if(this.state===MATCH_STATE.MATCH_END&&!this.online){if(this.time>=this.transitionAt)this.toLobby();return;}
      if(this.state!==MATCH_STATE.PLAYING)return;
      for(const e of this.entities){
        if(!e.alive){if(!this.online&&MODES[this.mode].respawn&&this.time>=e.respawnAt){this.resetEntity(e,this.safeSpawn(e),2);this.emit('respawn',{entity:e});}continue;}
        if(e.isRemote)continue;
        e.cooldown=Math.max(0,e.cooldown-dt);e.fireFlash=Math.max(0,e.fireFlash-dt);e.weaponKick*=Math.exp(-12*dt);
        e.recoilPitch*=Math.exp(-6*dt); // Never changes cameraPitch.
        e.landingKick*=Math.exp(-15*dt);e.crouchBlend=mix(e.crouchBlend,e.crouching?1:0,1-Math.exp(-12*dt));
        if(e.jumpZ>0||e.jumpV>0){e.jumpV-=690*dt;e.jumpZ+=e.jumpV*dt;if(e.jumpZ<=0){e.jumpZ=0;e.jumpV=0;e.landingKick=6;this.emit('landing',{entity:e});}}
        if(e.reloadLeft>0){e.reloadLeft=Math.max(0,e.reloadLeft-dt);if(e.reloadLeft===0)e.ammo[e.weapon]=WEAPONS[e.weapon].mag;}
        if(this.time-e.lastDamage>=4)e.shield=Math.min(e.maxShield,e.shield+15*dt);
        if(e.isPlayer)this.updatePlayer(e,dt,input);else if(!this.online)this.updateAI(e,dt);
        if(e.ammo[e.weapon]===0&&e.reloadLeft===0&&e.cooldown<=0)this.reload(e);
      }
      this.updateProjectiles(dt);
      if(!this.online){this.updatePickups();if(this.mode==='CAPTURE')this.updateCapture(dt);this.checkRules();}
      if(!this.player()?.alive&&(!this.entities.find(e=>e.id===this.spectatorId&&e.alive)))this.cycleSpectator();
    }
    updatePlayer(e,dt,input){
      if(this.cheats.noRecoil)e.recoilPitch=0;
      if(this.cheats.aim)this.aimAssist(e,dt,input);
      const f=input.forward||0,s=input.strafe||0,n=Math.max(1,Math.hypot(f,s)),speed=205*(1-.48*e.crouchBlend);
      const dx=(Math.cos(e.angle)*f-Math.sin(e.angle)*s)/n*speed,dy=(Math.sin(e.angle)*f+Math.cos(e.angle)*s)/n*speed;
      const control=1-Math.exp(-(e.jumpZ>0?3.4:19)*dt);e.vx=mix(e.vx,dx,control);e.vy=mix(e.vy,dy,control);
      this.moveEntity(e,e.vx*dt,e.vy*dt,dt);
      if(input.fire&&(WEAPONS[e.weapon].auto||input.pressed))this.fire(e,e.angle,e.cameraPitch+e.recoilPitch);
    }
    aimAssist(e,dt,input){
      // Direct input wins, including the next 100 ms after a mouse/touch movement.
      if(input.looking)return;
      const candidates=this.entities.filter(t=>t.alive&&enemy(e,t,this.mode)&&dist(e,t)<1200&&los(this.map,e,t)).map(t=>({t,a:wrap(Math.atan2(t.y-e.y,t.x-e.x)-e.angle)})).filter(o=>Math.abs(o.a)<.24).sort((a,b)=>Math.abs(a.a)-Math.abs(b.a));
      if(!candidates.length)return;const {t,a}=candidates[0],strength=(input.fire?3.9:2.1)*dt;
      e.angle=wrap(e.angle+clamp(a*strength,-.035,.035));const p=Math.atan2(t.jumpZ+this.height(t)*.60-this.eye(e),dist(e,t));
      e.cameraPitch=clamp(e.cameraPitch+(p-e.cameraPitch)*strength*.55,-1.12,1.12);
    }
    moveEntity(e,dx,dy,dt){const ox=e.x,oy=e.y;moveCircle(this.map,e,dx,dy);const d=Math.hypot(e.x-ox,e.y-oy);e.moveSpeed=d/Math.max(dt,.001);e.walkPhase+=d*.037;}
    hunterFireReady(e){
      if(this.online||this.mode!=='BOSS'||e.isPlayer||e.team!=='HUNTERS'||e.weapon===2)return true;
      const ai=e.ai;
      if(ai.burstUntil>0&&this.time>=ai.burstUntil){
        ai.nextBurstAt=ai.burstUntil+BOSS_BALANCE.pauseMin+Math.random()*BOSS_BALANCE.pauseJitter;
        ai.burstUntil=0;
      }
      if(this.time<ai.nextBurstAt)return false;
      if(ai.burstUntil===0)ai.burstUntil=this.time+BOSS_BALANCE.burstMin+Math.random()*BOSS_BALANCE.burstJitter;
      return true;
    }
    updateAI(e,dt){
      const ai=e.ai,hunter=!this.online&&this.mode==='BOSS'&&e.team==='HUNTERS';
      if(this.time>=ai.thinkAt){
        ai.thinkAt=this.time+.12+Math.random()*.05;
        const enemies=this.entities.filter(t=>t.alive&&enemy(e,t,this.mode));
        const visible=enemies.filter(t=>{const d=dist(e,t),a=Math.abs(wrap(Math.atan2(t.y-e.y,t.x-e.x)-e.angle));return d<1150&&los(this.map,e,t)&&(d<145||a<(d<300?Math.PI*.62:Math.PI*150/360));});
        const recent=visible.find(t=>t.id===e.attackerId&&this.time-e.attackerAt<5);
        visible.sort((a,b)=>dist(e,a)-dist(e,b));
        const seen=recent||visible[0];
        if(seen&&ai.target!==seen.id)ai.reactionUntil=this.time+.10+(1-e.role.skill)*.28+(hunter?BOSS_BALANCE.hunterReactionDelay:0);
        ai.target=seen?.id||null;
        let goal=null;
        if(e.hp<e.maxHp*.4||e.shield<e.maxShield*.25){
          const orbs=this.pickups.filter(p=>p.active&&(p.type==='health'?e.hp<e.maxHp*.65:e.shield<e.maxShield*.45)).sort((a,b)=>dist(e,a)-dist(e,b));
          if(orbs[0])goal=orbs[0];
        }
        if(!goal&&this.mode==='CAPTURE'){
          const useful=this.points.filter(p=>p.owner!==e.team||p.contested);
          goal=useful.length?useful[(e.index+(Math.floor(this.time/18)%2))%useful.length]:this.points[e.index%3];
        }
        if(!goal){if(seen)goal=seen;else{enemies.sort((a,b)=>dist(e,a)-dist(e,b));goal=enemies[(e.index%3===0&&enemies.length>1)?1:0]||this.map.ffa[e.index];}}
        ai.goal=goal?{x:goal.x,y:goal.y}:null;
        if(goal&&(this.time>=ai.pathAt||ai.stuck>.65||!ai.path.length&&dist(e,goal)>75)){
          ai.path=pathfind(this.map,e,goal);ai.pathAt=this.time+.75+Math.random()*.35;if(ai.stuck>.65){ai.strafe*=-1;ai.stuck=0;}
        }
      }
      const target=this.entities.find(t=>t.id===ai.target&&t.alive);const visible=target&&los(this.map,e,target);let mx=0,my=0;
      if(visible){
        const d=dist(e,target),desiredWeapon=d<67?2:e.role.weapon;
        if(e.weapon!==desiredWeapon&&e.reloadLeft===0)this.selectWeapon(e,desiredWeapon);
        let aimX=target.x,aimY=target.y;
        if(e.weapon===4){const lead=clamp(d/760,0,1.1);aimX+=target.vx*lead;aimY+=target.vy*lead;}
        const desired=Math.atan2(aimY-e.y,aimX-e.x),da=wrap(desired-e.angle);e.angle=wrap(e.angle+clamp(da,-5.5*dt,5.5*dt));
        e.cameraPitch=mix(e.cameraPitch,Math.atan2(target.jumpZ+this.height(target)*.6-this.eye(e),Math.max(d,1)),1-Math.exp(-9*dt));
        const close=d<e.role.range*.66,far=d>e.role.range*1.18,retreat=e.hp<e.maxHp*.27;
        const approach=retreat||close?-1:far?e.role.aggression:0;
        mx=Math.cos(desired)*approach+Math.cos(desired+Math.PI/2)*ai.strafe*.55;
        my=Math.sin(desired)*approach+Math.sin(desired+Math.PI/2)*ai.strafe*.55;
        if(this.time>=ai.reactionUntil&&Math.abs(da)<.15&&e.cooldown<=0&&e.reloadLeft<=0&&this.hunterFireReady(e)){const error=(1-e.role.skill)*.105*(hunter?BOSS_BALANCE.hunterAimErrorScale:1);this.fire(e,e.angle+(Math.random()-.5)*error,e.cameraPitch+(Math.random()-.5)*error*.4);}
        e.crouching=e.role.name==='MARKSMAN'&&d>500&&!retreat;
      }else{
        e.crouching=false;
        while(ai.path.length&&dist(e,ai.path[0])<14)ai.path.shift();
        const wp=ai.path[0];if(wp){const a=Math.atan2(wp.y-e.y,wp.x-e.x);mx=Math.cos(a);my=Math.sin(a);e.angle=wrap(e.angle+clamp(wrap(a-e.angle),-4.5*dt,4.5*dt));e.cameraPitch*=Math.exp(-3*dt);}
      }
      // Objective/healing route remains useful during a fight when target is far away.
      if(visible&&ai.goal&&dist(ai.goal,target)>90&&dist(e,ai.goal)>95&&ai.path[0]){
        const a=Math.atan2(ai.path[0].y-e.y,ai.path[0].x-e.x);mx=mx*.4+Math.cos(a)*.8;my=my*.4+Math.sin(a)*.8;
        if(dist(e,ai.path[0])<20)ai.path.shift();
      }
      for(const other of this.entities){if(other===e||!other.alive)continue;const d=dist(e,other);if(d>0&&d<51){mx+=(e.x-other.x)/d*(51-d)/22;my+=(e.y-other.y)/d*(51-d)/22;}}
      if(ai.stuck>.30){mx+=Math.cos(e.angle+ai.strafe*Math.PI/2)*.85;my+=Math.sin(e.angle+ai.strafe*Math.PI/2)*.85;}
      const len=Math.max(1,Math.hypot(mx,my)),speed=(visible?128:161)*(1-.45*e.crouchBlend);e.vx=mx/len*speed;e.vy=my/len*speed;
      const ox=e.x,oy=e.y;this.moveEntity(e,e.vx*dt,e.vy*dt,dt);
      if(Math.hypot(e.x-ox,e.y-oy)<speed*dt*.12&&Math.hypot(mx,my)>.15)ai.stuck+=dt;else ai.stuck=Math.max(0,ai.stuck-dt*2);
      // No auto-jump and no teleport recovery.
    }
    fire(e,angle,pitch){
      const w=WEAPONS[e.weapon];if(!e.alive||this.state!==MATCH_STATE.PLAYING||e.cooldown>0||e.reloadLeft>0)return false;
      if(e.ammo[e.weapon]<=0){this.emit('empty',{entity:e});this.reload(e);return false;}
      e.ammo[e.weapon]--;e.cooldown=w.interval;e.fireFlash=.09;e.weaponKick=e.isPlayer&&this.cheats.noRecoil?0:w.kick;e.shotSerial++;
      if(!(e.isPlayer&&this.cheats.noRecoil)){e.recoilPitch=clamp(e.recoilPitch+w.recoil,0,.58);if(e.isPlayer&&w.recoil)e.angle=wrap(e.angle+(Math.random()-.5)*w.recoil*.38);}
      this.emit('fire',{entity:e,weapon:w,angle,pitch});
      const z=this.eye(e)-3;
      if(w.projectileSpeed){this.projectiles.push({id:e.id+'-'+e.shotSerial,owner:e.id,x:e.x,y:e.y,z,vx:Math.cos(angle)*w.projectileSpeed,vy:Math.sin(angle)*w.projectileSpeed,vz:Math.tan(pitch)*w.projectileSpeed,life:2.8,damage:w.damage,weapon:e.weapon});return true;}
      const aggregated=new Map();
      for(let n=0;n<(w.pellets||1);n++){
        const a=angle+(Math.random()-.5)*w.spread*2,p=pitch+(Math.random()-.5)*w.spread*.65;
        const wall=traceScene(this.map,{x:e.x,y:e.y,z},{x:e.x+Math.cos(a)*w.range,y:e.y+Math.sin(a)*w.range,z:z+Math.tan(p)*w.range}),bx=wall.x,by=wall.y,travel=w.range*wall.t;
        let hit=null,first=1;
        for(const t of this.entities){if(!t.alive||!enemy(e,t,this.mode))continue;
          const k=segmentCircle(e.x,e.y,bx,by,t.x,t.y,t.radius+(e.weapon===2?16:0));
          if(k===null||k>=first)continue;const hz=z+Math.tan(p)*travel*k;
          if(hz<t.jumpZ-5||hz>t.jumpZ+this.height(t)+5)continue;
          hit=t;first=k;
        }
        if(hit)aggregated.set(hit,(aggregated.get(hit)||0)+w.damage);
        this.effects.push({type:'tracer',x1:e.x,y1:e.y,z1:z,x:mix(e.x,bx,first),y:mix(e.y,by,first),z:z+Math.tan(p)*travel*first,life:.07,maxLife:.07,team:e.team});
        if(wall.hit&&!hit)this.effects.push({type:'spark',x:bx,y:by,z:wall.z,life:.20,maxLife:.20});
      }
      for(const [target,damage]of aggregated)this.damage(target,damage,e,w.name);
      return true;
    }
    updateProjectiles(dt){
      const remaining=[];
      for(const p of this.projectiles){
        p.life-=dt;if(p.life<=0)continue;
        const bx=p.x+p.vx*dt,by=p.y+p.vy*dt,bz=p.z+p.vz*dt,owner=this.entities.find(e=>e.id===p.owner);
        const wall=traceScene(this.map,p,{x:bx,y:by,z:bz});
        let limit=wall.t,hit=null;
        for(const t of this.entities){if(!t.alive||!owner||!enemy(owner,t,this.mode))continue;
          const k=segmentCircle(p.x,p.y,bx,by,t.x,t.y,t.radius+3);if(k===null||k>=limit)continue;
          const z=mix(p.z,bz,k);if(z<t.jumpZ-3||z>t.jumpZ+this.height(t)+3)continue;limit=k;hit=t;
        }
        if(hit){if(!p.visualOnly)this.damage(hit,p.damage,owner,'CROSSBOW');this.effects.push({type:'spark',x:mix(p.x,bx,limit),y:mix(p.y,by,limit),z:mix(p.z,bz,limit),life:.25,maxLife:.25});continue;}
        if(wall.hit){this.effects.push({type:'spark',x:wall.x,y:wall.y,z:wall.z,life:.20,maxLife:.20});continue;}
        if(bz<0||bz>400)continue;
        p.x=bx;p.y=by;p.z=bz;remaining.push(p);
      }this.projectiles=remaining;
    }
    damage(victim,raw,attacker,weapon='AR',fromNetwork=false){
      if(!victim.alive||raw<=0||this.time<victim.spawnProtectionUntil||this.state!==MATCH_STATE.PLAYING)return {hp:0,shield:0};
      if(attacker&&!enemy(attacker,victim,this.mode))return {hp:0,shield:0};
      if(this.online&&victim.isRemote&&!fromNetwork){if(attacker?.isPlayer)this.emit('rawDamage',{victim,raw,attacker,weapon});return {hp:0,shield:0};}
      const shieldDamage=Math.min(victim.shield,raw),hpDamage=Math.min(victim.hp,raw-shieldDamage);
      victim.shield=Math.max(0,victim.shield-shieldDamage);victim.hp=Math.max(0,victim.hp-hpDamage);victim.lastDamage=this.time;victim.attackerAt=this.time;victim.attackerId=attacker?.id||null;
      this.emit('hit',{victim,attacker,hpDamage,shieldDamage});
      if(victim.hp<=0){victim.alive=false;victim.deaths++;victim.vx=0;victim.vy=0;victim.reloadLeft=0;victim.respawnAt=this.time+MODES[this.mode].respawn;
        if(attacker&&(!this.online||attacker.isPlayer))attacker.kills++;
        const item={attacker:attacker?.name||'ARENA',victim:victim.name,weapon,at:this.time,attackerId:attacker?.id,victimId:victim.id};
        this.feed.unshift(item);this.feed=this.feed.slice(0,5);this.emit('kill',item);if(victim.isPlayer)this.cycleSpectator();
      }return {hp:hpDamage,shield:shieldDamage};
    }
    updatePickups(){
      for(const p of this.pickups){if(!p.active){if(this.time>=p.respawnAt)p.active=true;else continue;}
        for(const e of this.entities){if(!e.alive||dist(e,p)>31||e.jumpZ>28||!los(this.map,e,p))continue;
          if(p.type==='health'?e.hp>=e.maxHp:e.shield>=e.maxShield)continue;
          if(p.type==='health')e.hp=Math.min(e.maxHp,e.hp+10);else e.shield=Math.min(e.maxShield,e.shield+25);
          p.active=false;p.respawnAt=this.time+(p.type==='health'?9:11);this.emit('pickup',{entity:e,pickup:p});break;
        }
      }
    }
    updateCapture(dt){
      for(const p of this.points){
        const inside=this.entities.filter(e=>e.alive&&dist(e,p)<p.radius&&los(this.map,e,p));
        const blue=inside.some(e=>e.team==='BLUE'),red=inside.some(e=>e.team==='RED');p.contested=blue&&red;p.capturing=null;
        if(p.contested||!blue&&!red)continue;
        const side=blue?'BLUE':'RED',sign=blue?1:-1;p.capturing=side;
        p.control=clamp(p.control+sign*dt/5,-1,1);
        if(p.owner==='BLUE'&&p.control<=0||p.owner==='RED'&&p.control>=0)p.owner=null;
        if(p.control>=1)p.owner='BLUE';else if(p.control<=-1)p.owner='RED';
      }
      for(const team of ['BLUE','RED'])if(this.points.filter(p=>p.owner===team).length>=2)this.captureTime[team]=Math.min(45,this.captureTime[team]+dt);
      // Losing the majority pauses accumulation. It never resets either total.
    }
    timeLeft(){return Math.max(0,this.roundEndsAt-this.time);}
    checkRules(){
      if(this.state!==MATCH_STATE.PLAYING||this.online)return;
      const alive=this.entities.filter(e=>e.alive);
      if(this.mode==='TEAM'){
        const blue=alive.filter(e=>e.team==='BLUE'),red=alive.filter(e=>e.team==='RED');
        if(!blue.length||!red.length){this.finishRound(blue.length?'BLUE':red.length?'RED':null,'상대 팀 전멸');return;}
        if(this.timeLeft()<=0){let win=null;if(blue.length!==red.length)win=blue.length>red.length?'BLUE':'RED';else{const b=blue.reduce((n,e)=>n+e.hp+e.shield,0),r=red.reduce((n,e)=>n+e.hp+e.shield,0);if(Math.abs(b-r)>1e-6)win=b>r?'BLUE':'RED';}this.finishRound(win,'시간 종료 · 생존 인원 / HP + Shield 판정');}
      }else if(this.mode==='SOLO'){
        if(alive.length<=1){this.finishRound(alive[0]?.id||null,'최후의 생존자');return;}
        if(this.timeLeft()<=0){const sorted=[...alive].sort((a,b)=>b.hp+b.shield-a.hp-a.shield),a=sorted[0],b=sorted[1];this.finishRound(a&&(!b||Math.abs(a.hp+a.shield-b.hp-b.shield)>1e-6)?a.id:null,'시간 종료 · HP + Shield 판정');}
      }else if(this.mode==='INFINITY'){
        if(this.timeLeft()<=0){const ranked=[...this.entities].sort((a,b)=>b.kills-a.kills);this.finishRound(ranked[0].kills===ranked[1].kills?null:ranked[0].id,'5분 종료 · 최다 킬',true);}
      }else if(this.mode==='BOSS'){
        if(!this.player().alive)this.finishRound('HUNTERS','BOSS ELIMINATED',true);
        else if(alive.length===1)this.finishRound('BOSS','ALL 9 HUNTERS ELIMINATED',true);
      }else if(this.mode==='CAPTURE'){
        if(this.captureTime.BLUE>=45||this.captureTime.RED>=45)this.finishRound(this.captureTime.BLUE>=45?'BLUE':'RED','거점 2개 이상 · 누적 45초 달성',true);
      }
    }
    finishRound(winner,reason,match=false){
      if(this.state!==MATCH_STATE.PLAYING)return;
      if(winner&&this.mode==='TEAM'){this.score[winner]++;match=this.score[winner]>=7;}
      if(winner&&this.mode==='SOLO'){const e=this.entities.find(e=>e.id===winner);e.wins++;match=e.wins>=7;}
      const name=this.entities.find(e=>e.id===winner)?.name||winner;
      this.result={winner,name:name||'DRAW',reason,match,draw:!winner};this.transitionAt=this.time+3.5;this.setState(MATCH_STATE.ROUND_END);this.emit('roundEnd',this.result);
    }
    cycleSpectator(){
      const player=this.player();if(!player)return;
      const candidates=this.entities.filter(e=>e.alive&&e.id!==player.id&&(MODES[this.mode].ffa||this.mode==='BOSS'||e.team===player.team));
      const at=candidates.findIndex(e=>e.id===this.spectatorId);this.spectatorId=candidates.length?candidates[(at+1)%candidates.length].id:null;
    }
    toLobby(){this.cheats={aim:false,esp:false,noRecoil:false};this.spectatorId=null;this.projectiles=[];this.online=false;this.setState(MATCH_STATE.LOBBY);this.emit('lobby');}
  }
  Object.assign(CA,{TILE,TAU,MATCH_STATE,MODES,WEAPONS,ROLES,BOSS_BALANCE,clamp,wrap,dist,mix,enemy,wallAt,boxInterval,traceScene,clearWalk,canStand,raycast,los,segmentCircle,moveCircle,pathfind,createEntity,Arena});
})(typeof window!=='undefined'?window:globalThis);
