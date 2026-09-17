/* Browser shell, input, HUD and one consistent match-state presentation. */
(function(){
  'use strict';const C=window.CA;
  const ids=['world','minimap','nickname','sound','game-sound','ai-menu','online-menu','mode-cards','panel-label','attract-map','map-name','area-name','mode-name','score-top','timer','alive-line','capture-hud','kill-feed','hit-marker','combat-message','protection','spectator','spectator-label','next-spectator','capture-local','operator-name','hp-value','hp-max','hp-bar','shield-value','shield-max','shield-bar','weapon-name','ammo-value','ammo-reserve','reload-track','reload-label','weapon-slots','resume','exit-match','joystick','stick','touch-fire','touch-reload','touch-jump','touch-crouch','result-eyebrow','result-title','result-detail','result-scores','result-countdown','result-lobby','controls-dialog','controls-open','controls-close','score-dialog','score-open','score-close','score-table','notification','create-room','join-room','room-code','online-connect','room','room-id','room-capacity','room-roster','host-start','leave-room','online-status','credits-open','credits-dialog','credits-close'];
  const dom={};for(const id of ids){dom[id]=document.getElementById(id);if(!dom[id])throw new Error('Required DOM missing: '+id);}
  const storage={get(k){try{return localStorage.getItem('ca-'+k);}catch{return null;}},set(k,v){try{localStorage.setItem('ca-'+k,v);}catch{/* private mode may block local storage */}}};
  const audio=new C.ArenaAudio();if(storage.get('sound')==='off')audio.enabled=false;
  const input={keys:new Set(),mouseFire:false,touchFire:false,tapFire:false,pressed:false,joyX:0,joyY:0,lastLook:-10,crouchToggle:false};
  let renderer,net,notifyUntil=0,combatUntil=0,lastHud=0,lastFeed='',lastRoster='',frameTime=performance.now(),lookPointer=null,joystickPointer=null,dragMouse=false;
  const arena=new C.Arena(handleEvent);renderer=new C.Renderer(dom.world,dom.minimap);
  function notify(message){dom.notification.textContent=message;dom.notification.classList.add('visible');notifyUntil=performance.now()+3600;}
  net=new C.FirebaseArena(arena,{status(message){dom['online-status'].textContent=message;},roomChanged:updateRoom,notify});
  const savedName=storage.get('nickname');if(savedName)dom.nickname.value=savedName;
  const isTouch=matchMedia('(pointer: coarse)').matches||navigator.maxTouchPoints>0;document.body.classList.toggle('touch',isTouch);
  arena.map=C.MAPS[0];arena.entities=[C.createEntity('player','PLAYER','BLUE',true)];arena.resetEntity(arena.entities[0],arena.map.spawns.BLUE[0]);arena.pickups=arena.map.pickups.map((p,i)=>({...p,id:'orb-'+i,active:true}));
  function nickname(){const value=dom.nickname.value.trim().replace(/[\u0000-\u001f]/g,'').slice(0,18)||'PLAYER';dom.nickname.value=value;storage.set('nickname',value);return value;}
  function setPanel(panel){document.body.dataset.panel=panel;dom['panel-label'].textContent=panel==='home'?'DEPLOYMENT':panel==='modes'?'AI COMBAT / MODE SELECT':'ONLINE / SQUAD LOBBY';}
  function clearInput(){input.keys.clear();input.mouseFire=false;input.touchFire=false;input.tapFire=false;input.pressed=false;input.joyX=0;input.joyY=0;lookPointer=null;joystickPointer=null;dragMouse=false;dom.stick.style.transform='translate(0px,0px)';}
  function releasePointer(){clearInput();if(document.pointerLockElement)document.exitPointerLock?.();}
  function lockPointer(){if(isTouch||arena.state!==C.MATCH_STATE.PLAYING)return;try{const p=dom.world.requestPointerLock?.();if(p?.catch)p.catch(()=>{dom.resume.hidden=false;});}catch{dom.resume.hidden=false;}}
  function startLocal(mode){if(net.code){notify('온라인 방에서 나온 뒤 AI 전투를 시작할 수 있다.');return;}audio.unlock();clearInput();input.crouchToggle=false;arena.start(mode,C.MAPS[Math.floor(Math.random()*C.MAPS.length)],nickname());lockPointer();}
  function handleEvent(type,data={}){
    if(type==='state'){
      document.body.dataset.state=arena.state;clearInput();dom.resume.hidden=isTouch||arena.state!==C.MATCH_STATE.PLAYING||!!document.pointerLockElement;
      if(arena.state===C.MATCH_STATE.MATCH_END||arena.state===C.MATCH_STATE.LOBBY){arena.cheats={aim:false,esp:false,noRecoil:false};updateCheats();releasePointer();}
      if(arena.state===C.MATCH_STATE.ROUND_END||arena.state===C.MATCH_STATE.MATCH_END){updateResult();releasePointer();}
      if(arena.state===C.MATCH_STATE.LOBBY){setPanel(net?.code?'online':'home');dom['attract-map'].textContent=arena.map?.name||'DEPOT';}
    }
    if(type==='roundStart'){audio.event('roundStart');input.crouchToggle=false;combatUntil=performance.now()+2200;const role=arena.mode==='EXPLOSION'?`${arena.player()?.team===arena.attackTeam?'ATTACK':'DEFEND'} · ROUND ${arena.round}/10`:arena.mode==='BOSS'?(arena.player()?.team==='BOSS'?'YOU ARE THE BOSS':'HUNT THE BOSS'):`ROUND ${arena.round} · FIGHT`;dom['combat-message'].textContent=role;lastFeed='';}
    if(type==='fire'){
      const view=arena.viewpoint();const d=view?C.dist(view,data.entity):0,volume=data.entity.id===view?.id?1:C.clamp(1-d/1300,0,.65),pan=view?Math.sin(Math.atan2(data.entity.y-view.y,data.entity.x-view.x)-view.angle):0;
      audio.fire(data.weapon.id,volume,pan);renderer?.onFire(data.entity);if(arena.online&&data.entity.isPlayer)net?.onFire(data);
    }
    if(type==='hit'){
      if(data.attacker?.isPlayer){renderer.hit=.16;audio.event('hit');}
      if(data.victim.isPlayer){renderer.hurt=.8;renderer.damageAngle=data.attacker?C.wrap(Math.atan2(data.attacker.y-data.victim.y,data.attacker.x-data.victim.x)-data.victim.angle)+Math.PI/2:0;audio.event('hurt');}
    }
    if(type==='kill'){
      if(data.attackerId===arena.player()?.id){audio.event('kill');combatUntil=performance.now()+1600;dom['combat-message'].textContent='ELIMINATED · '+data.victim;}
      if(arena.online)net?.onKill(data);lastFeed='';
    }
    if(type==='rawDamage')net?.sendDamage(data);
    if(['reload','empty','landing','pickup'].includes(type)&&data.entity?.isPlayer){audio.event(type);if(type==='pickup')notify(data.pickup.type==='health'?'HEALTH +10':'SHIELD +25');}
    if(type==='bombPlanted'){combatUntil=performance.now()+2200;dom['combat-message'].textContent=`BOMB PLANTED · SITE ${data.site}`;notify(`폭탄 설치 완료 · SITE ${data.site}`);}
    if(type==='bombDefused'){combatUntil=performance.now()+2200;dom['combat-message'].textContent='BOMB DEFUSED';notify('폭탄 해체 완료');}
    if(type==='bombExploded'){renderer.shake=Math.max(renderer.shake,26);combatUntil=performance.now()+2200;dom['combat-message'].textContent='BOMB DETONATED';notify('폭탄 폭발 · 2초 후 결과');}
    if(type==='respawn'&&data.entity.isPlayer){clearInput();input.crouchToggle=false;audio.event('roundStart');}
  }
  function updateCheats(){document.querySelectorAll('[data-cheat]').forEach(b=>{const on=arena.cheats[b.dataset.cheat];b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));b.querySelector('span').textContent=on?'ON':'OFF';});}
  function toggleCheat(key){if(arena.state!==C.MATCH_STATE.PLAYING)return;arena.cheats[key]=!arena.cheats[key];if(key==='noRecoil'&&arena.cheats[key]){const p=arena.player();if(p){p.recoilPitch=0;p.weaponKick=0;}renderer.shake=0;}updateCheats();}
  for(const [id,mode]of Object.entries(C.MODES)){const b=document.createElement('button');b.className='mode-card';b.dataset.mode=id;const icon=document.createElement('span');icon.className='mode-icon';icon.textContent=mode.icon;const copy=document.createElement('span'),title=document.createElement('strong'),desc=document.createElement('small'),arrow=document.createElement('span');title.textContent=mode.name;desc.textContent=mode.desc;arrow.className='go';arrow.textContent='›';copy.append(title,desc);b.append(icon,copy,arrow);b.addEventListener('click',()=>startLocal(id));dom['mode-cards'].append(b);}
  for(const w of C.WEAPONS){const b=document.createElement('button');b.dataset.weapon=w.id;b.setAttribute('aria-label',`${w.id+1}: ${w.name}`);b.textContent=String(w.id+1);const small=document.createElement('small');small.textContent=w.name;b.append(small);b.onclick=()=>{const p=arena.player();if(p)arena.selectWeapon(p,w.id);};dom['weapon-slots'].append(b);}
  dom['ai-menu'].onclick=()=>{nickname();setPanel('modes');audio.unlock();};dom['online-menu'].onclick=()=>{nickname();setPanel('online');audio.unlock();if(!net.code)dom['online-status'].textContent=net.hasConfig()?'방을 만들거나 6자리 코드로 참가하세요.':'온라인 서비스를 준비 중입니다. AI 전투는 바로 플레이할 수 있습니다.';updateRoom();};
  document.querySelectorAll('.back').forEach(b=>b.onclick=()=>setPanel('home'));document.querySelector('.brand').onclick=e=>{e.preventDefault();setPanel('home');};
  document.querySelectorAll('[data-cheat]').forEach(b=>b.onclick=()=>toggleCheat(b.dataset.cheat));
  function syncSound(){dom.sound.textContent=audio.enabled?'SOUND ON':'SOUND OFF';dom.sound.setAttribute('aria-pressed',String(audio.enabled));dom['game-sound'].textContent=audio.enabled?'♫':'♫ ×';dom['game-sound'].setAttribute('aria-pressed',String(audio.enabled));}
  function toggleSound(){audio.unlock();audio.toggle();storage.set('sound',audio.enabled?'on':'off');syncSound();}dom.sound.onclick=toggleSound;dom['game-sound'].onclick=toggleSound;syncSound();
  function openDialog(d){releasePointer();if(!d.open)d.showModal();}dom['controls-open'].onclick=()=>openDialog(dom['controls-dialog']);dom['controls-close'].onclick=()=>dom['controls-dialog'].close();
  dom['credits-open'].onclick=()=>openDialog(dom['credits-dialog']);dom['credits-close'].onclick=()=>dom['credits-dialog'].close();
  dom['score-open'].onclick=()=>{updateScoreboard();openDialog(dom['score-dialog']);};dom['score-close'].onclick=()=>dom['score-dialog'].close();
  for(const d of [dom['score-dialog'],dom['controls-dialog'],dom['credits-dialog']])d.addEventListener('click',e=>{if(e.target===d){const b=d.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)d.close();}});
  dom.resume.onclick=lockPointer;dom['next-spectator'].onclick=()=>arena.cycleSpectator();
  async function leaveMatch(){releasePointer();if(net.code)await net.leave();arena.toLobby();}dom['exit-match'].onclick=leaveMatch;dom['result-lobby'].onclick=leaveMatch;
  dom['create-room'].onclick=async()=>{dom['create-room'].disabled=true;try{await net.create(nickname());}catch(e){net.report(e);}finally{dom['create-room'].disabled=false;updateRoom();}};
  dom['join-room'].onclick=async()=>{dom['join-room'].disabled=true;try{await net.join(dom['room-code'].value,nickname());}catch(e){net.report(e);}finally{dom['join-room'].disabled=false;updateRoom();}};
  dom['host-start'].onclick=async()=>{dom['host-start'].disabled=true;try{await net.startMatch();}catch(e){net.report(e);}finally{updateRoom();}};dom['leave-room'].onclick=async()=>{await net.leave();updateRoom();};
  function updateRoom(){
    const inside=!!net.code;dom['online-connect'].hidden=inside;dom.room.hidden=!inside;if(!inside){const ready=net.hasConfig();dom['create-room'].disabled=!ready;dom['join-room'].disabled=!ready;dom['room-code'].disabled=!ready;return;}
    dom['room-id'].textContent=net.code;const members=net.memberList();dom['room-capacity'].textContent=members.length+' / 10';
    const rosterKey=JSON.stringify([members,net.hostId]);if(rosterKey!==lastRoster){lastRoster=rosterKey;dom['room-roster'].replaceChildren();members.forEach((m,i)=>{const team=net.roster[m.id]?.team||(i%2?'RED':'BLUE'),row=document.createElement('div');row.className='roster-row '+team.toLowerCase();const a=document.createElement('span'),b=document.createElement('span');a.textContent=m.nickname+(m.id===net.uid?' · YOU':'');b.textContent=team+(m.id===net.hostId?' / HOST':'');row.append(a,b);dom['room-roster'].append(row);});}
    dom['host-start'].disabled=net.uid!==net.hostId||members.length<2;dom['host-start'].textContent=net.uid===net.hostId?'START MATCH':'WAITING FOR HOST';
  }
  function look(dx,dy){const p=arena.player();if(!p?.alive||arena.state!==C.MATCH_STATE.PLAYING)return;p.angle=C.wrap(p.angle+dx*.0025);p.cameraPitch=C.clamp(p.cameraPitch-dy*.0025,-1.12,1.12);input.lastLook=performance.now();}
  document.addEventListener('mousemove',e=>{if(document.pointerLockElement===dom.world)look(e.movementX,e.movementY);else if(dragMouse&&lookPointer){look(e.clientX-lookPointer.x,e.clientY-lookPointer.y);lookPointer.x=e.clientX;lookPointer.y=e.clientY;}});
  dom.world.addEventListener('pointerdown',e=>{
    if(arena.state!==C.MATCH_STATE.PLAYING)return;e.preventDefault();audio.unlock();
    if(e.pointerType==='mouse'){
      if(e.button!==0)return;if(!arena.player()?.alive){arena.cycleSpectator();return;}
      lockPointer();input.mouseFire=true;input.pressed=true;dragMouse=true;lookPointer={x:e.clientX,y:e.clientY};return;
    }
    if(lookPointer)return;dom.world.setPointerCapture(e.pointerId);lookPointer={id:e.pointerId,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,at:performance.now(),moved:false,firing:false};
  });
  dom.world.addEventListener('pointermove',e=>{if(e.pointerType==='mouse'||!lookPointer||e.pointerId!==lookPointer.id)return;e.preventDefault();const p=lookPointer;look(e.clientX-p.x,e.clientY-p.y);p.x=e.clientX;p.y=e.clientY;if(Math.hypot(p.x-p.startX,p.y-p.startY)>9)p.moved=true;});
  function endLook(e){if(e.pointerType==='mouse'){input.mouseFire=false;dragMouse=false;if(lookPointer?.id===undefined)lookPointer=null;return;}if(!lookPointer||e.pointerId!==lookPointer.id)return;const p=lookPointer;if(e.type==='pointerup'&&!p.moved&&performance.now()-p.at<270){if(!arena.player()?.alive)arena.cycleSpectator();else{input.tapFire=true;input.pressed=true;}}lookPointer=null;}
  window.addEventListener('pointerup',endLook);window.addEventListener('pointercancel',endLook);
  dom.joystick.addEventListener('pointerdown',e=>{if(joystickPointer!==null)return;e.preventDefault();joystickPointer=e.pointerId;dom.joystick.setPointerCapture(e.pointerId);updateJoystick(e);});
  function updateJoystick(e){if(e.pointerId!==joystickPointer)return;const box=dom.joystick.getBoundingClientRect(),dx=e.clientX-box.left-box.width/2,dy=e.clientY-box.top-box.height/2,len=Math.hypot(dx,dy),max=box.width*.32,scale=len>max?max/len:1;input.joyX=dx*scale/max;input.joyY=dy*scale/max;dom.stick.style.transform=`translate(${dx*scale}px,${dy*scale}px)`;}
  dom.joystick.addEventListener('pointermove',updateJoystick);for(const type of['pointerup','pointercancel','lostpointercapture'])dom.joystick.addEventListener(type,e=>{if(e.pointerId===joystickPointer){joystickPointer=null;input.joyX=0;input.joyY=0;dom.stick.style.transform='translate(0px,0px)';}});
  dom['touch-fire'].addEventListener('pointerdown',e=>{e.preventDefault();audio.unlock();dom['touch-fire'].setPointerCapture(e.pointerId);input.touchFire=true;input.pressed=true;});for(const type of ['pointerup','pointercancel','lostpointercapture'])dom['touch-fire'].addEventListener(type,()=>{input.touchFire=false;});
  dom['touch-reload'].onclick=()=>arena.player()&&arena.reload(arena.player());dom['touch-jump'].onclick=()=>arena.jump(arena.player());dom['touch-crouch'].onclick=()=>{input.crouchToggle=!input.crouchToggle;};
  window.addEventListener('keydown',e=>{
    if(/^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName||'')||arena.state===C.MATCH_STATE.LOBBY)return;
    const key=e.key.toLowerCase();if(['f1','f2','f3',' ','control','tab','w','a','s','d','c','r'].includes(key))e.preventDefault();if(dom['score-dialog'].open||dom['controls-dialog'].open||dom['credits-dialog'].open){if(key==='tab')dom['score-dialog'].close();return;}
    input.keys.add(key);if(e.repeat)return;
    if(key==='f1')toggleCheat('aim');if(key==='f2')toggleCheat('esp');if(key==='f3')toggleCheat('noRecoil');
    const p=arena.player();if(!p)return;if(key==='r')arena.reload(p);if(key===' ')arena.jump(p);if(key==='c')input.crouchToggle=!input.crouchToggle;if(/^[1-6]$/.test(key))arena.selectWeapon(p,Number(key)-1);if(key==='tab'){updateScoreboard();openDialog(dom['score-dialog']);}
  });window.addEventListener('keyup',e=>input.keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur',clearInput);document.addEventListener('visibilitychange',()=>{if(document.hidden)clearInput();frameTime=performance.now();});
  document.addEventListener('pointerlockchange',()=>{if(!document.pointerLockElement)input.mouseFire=false;dom.resume.hidden=isTouch||!!document.pointerLockElement||arena.state!==C.MATCH_STATE.PLAYING;});
  document.addEventListener('contextmenu',e=>{if(arena.state!==C.MATCH_STATE.LOBBY)e.preventDefault();});document.addEventListener('dblclick',e=>{if(arena.state!==C.MATCH_STATE.LOBBY)e.preventDefault();});document.addEventListener('gesturestart',e=>{if(arena.state!==C.MATCH_STATE.LOBBY)e.preventDefault();},{passive:false});
  window.addEventListener('resize',()=>renderer.resize());
  function updateHUD(now){
    const p=arena.player(),view=arena.viewpoint()||p;if(!p||!view)return;const mode=arena.mode,w=C.WEAPONS[view.weapon];
    dom['map-name'].textContent=arena.map.name;dom['mode-name'].textContent=C.MODES[mode].name;const zone=[...arena.map.zones].sort((a,b)=>C.dist(a,view)-C.dist(b,view))[0];dom['area-name'].textContent=zone?.name||'';
    dom['operator-name'].textContent=(p.alive?'': 'SPECTATING / ')+view.name;dom['hp-value'].textContent=Math.ceil(view.hp);dom['shield-value'].textContent=Math.ceil(view.shield);dom['hp-max'].textContent='/ '+view.maxHp;dom['shield-max'].textContent='/ '+view.maxShield;dom['hp-bar'].style.width=(view.hp/view.maxHp*100)+'%';dom['shield-bar'].style.width=(view.shield/view.maxShield*100)+'%';
    dom['weapon-name'].textContent=w.label;dom['ammo-value'].textContent=w.kind==='melee'?'∞':view.ammo[view.weapon];dom['ammo-reserve'].textContent=w.kind==='melee'?'MELEE':w.kind==='grenade'?'/ MAX 2':'/ ∞';dom['reload-label'].textContent=view.reloadLeft>0?`RELOADING · ${view.reloadLeft.toFixed(1)}s`:w.kind==='grenade'?`THROWABLE · ${view.ammo[view.weapon]} LEFT`:w.auto?'FULL AUTO':w.kind==='melee'?'CLOSE QUARTERS · +15% MOVE':'SEMI AUTO';dom['reload-track'].firstElementChild.style.width=view.reloadLeft>0?((1-view.reloadLeft/view.reloadTotal)*100)+'%':'0%';
    dom['weapon-slots'].querySelectorAll('button').forEach(b=>b.classList.toggle('active',Number(b.dataset.weapon)===p.weapon));
    const alive=arena.entities.filter(e=>e.alive),blue=alive.filter(e=>e.team==='BLUE').length,red=alive.filter(e=>e.team==='RED').length;
    if(mode==='TEAM'){dom['score-top'].innerHTML=`<span class="blue">${arena.score.BLUE}</span><small>FIRST TO 7</small><span class="red">${arena.score.RED}</span>`;dom['alive-line'].textContent=`BLUE ${blue} ALIVE · RED ${red} ALIVE`;}
    else if(mode==='INFINITY'){const leader=[...arena.entities].sort((a,b)=>b.kills-a.kills)[0];dom['score-top'].textContent=`${p.kills} / ${leader.kills}`;dom['alive-line'].textContent=`YOUR KILLS / TOP KILLS · ${alive.length} ALIVE`;}
    else if(mode==='EXPLOSION'){dom['score-top'].innerHTML=`<span class="blue">${arena.score.BLUE||0}</span><small>ROUND ${arena.round}/10</small><span class="red">${arena.score.RED||0}</span>`;dom['alive-line'].textContent=`${arena.attackTeam} ATTACK · ${arena.defendTeam} DEFEND · BLUE ${blue} / RED ${red}`;}
    else if(mode==='BOSS'){dom['score-top'].textContent='BOSS / '+alive.filter(e=>e.team==='HUNTERS').length;dom['alive-line'].textContent=p.team==='BOSS'?'YOU = BOSS · ELIMINATE ALL HUNTERS':'YOU = HUNTER · ELIMINATE THE BOSS';}
    else{dom['score-top'].innerHTML=`<span class="blue">${arena.captureTime.BLUE.toFixed(1)}</span><small>/ 45s</small><span class="red">${arena.captureTime.RED.toFixed(1)}</span>`;dom['alive-line'].textContent='BLUE / 45s · RED / 45s · 누적 점령';}
    const left=arena.timeLeft(),seconds=Math.ceil(left),noLimit=!C.MODES[mode].limit;dom.timer.textContent=noLimit?'NO LIMIT':`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;dom.timer.classList.toggle('urgent',!noLimit&&left<=10);
    dom['capture-hud'].replaceChildren();dom['capture-local'].textContent='';if(mode==='CAPTURE')for(const pt of arena.points){const chip=document.createElement('span');chip.className='point-chip';chip.style.color=pt.contested?'#ffffff':pt.owner==='BLUE'?'#62bdff':pt.owner==='RED'?'#ff6d64':'#ffcc59';const prog=pt.capturing&&Math.abs(pt.control)<1?` ${Math.round(Math.abs(pt.control)*100)}%`:'';chip.textContent=`${pt.id} ${pt.contested?'CONTESTED':pt.owner||'NEUTRAL'}${prog}`;dom['capture-hud'].append(chip);if(p.alive&&C.dist(p,pt)<pt.radius)dom['capture-local'].textContent=pt.contested?`${pt.id} · CONTESTED`:`${pt.id} · ${pt.owner===p.team?'OWNED':`CAPTURE ${Math.round(Math.abs(pt.control)*100)}%`}`;}
    if(mode==='EXPLOSION'){for(const pt of arena.bombSites||[]){const chip=document.createElement('span');chip.className='point-chip';chip.style.color=arena.bomb?.planted&&arena.bomb.site===pt.id?'#ff6d64':'#ffcc59';chip.textContent=`${pt.id} ${arena.bomb?.planted&&arena.bomb.site===pt.id?'BOMB':'SITE'}`;dom['capture-hud'].append(chip);}if(arena.bomb?.planted){const b=document.createElement('span');b.className='point-chip';b.style.color='#ff6d64';b.textContent=`BOMB ${Math.ceil(Math.max(0,arena.bomb.explodeAt-arena.time))}s · DEFUSE ${Math.round((arena.bomb.defuseProgress||0)/5*100)}%`;dom['capture-hud'].append(b);}else{const b=document.createElement('span');b.className='point-chip';b.textContent=`${arena.attackTeam} PLANT · ${Math.round((arena.bomb?.plantProgress||0)/4*100)}%`;dom['capture-hud'].append(b);}if(p.alive){const near=(arena.bombSites||[]).find(pt=>C.dist(p,pt)<pt.radius*.62);if(!arena.bomb?.planted&&near&&p.team===arena.attackTeam)dom['capture-local'].textContent=`SITE ${near.id} · AUTO PLANT ${Math.round((arena.bomb?.plantProgress||0)/4*100)}%`;else if(arena.bomb?.planted&&p.team===arena.defendTeam&&C.dist(p,arena.bomb)<72)dom['capture-local'].textContent=`DEFUSING · ${Math.round((arena.bomb.defuseProgress||0)/5*100)}%`;}}
    const protection=Math.max(0,p.spawnProtectionUntil-arena.time),respawn=Math.max(0,p.respawnAt-arena.time);dom.protection.textContent=p.alive?(protection>0?`SPAWN PROTECTION · ${protection.toFixed(1)}s`:''):C.MODES[mode].respawn?`RESPAWN IN ${respawn.toFixed(1)}s`:'ELIMINATED · NO RESPAWN THIS ROUND';
    dom.spectator.classList.toggle('active',!p.alive&&arena.state===C.MATCH_STATE.PLAYING);dom['spectator-label'].textContent=view.id!==p.id?'SPECTATING · '+view.name:'NO LIVING OPERATORS';dom['next-spectator'].disabled=view.id===p.id;dom['touch-crouch'].setAttribute('aria-pressed',String(p.crouching));
    const key=arena.feed.map(f=>f.at+f.victim).join('|');if(key!==lastFeed){lastFeed=key;dom['kill-feed'].replaceChildren();for(const item of arena.feed.slice(0,5)){const row=document.createElement('div');row.className='feed-line';const a=document.createElement('b'),g=document.createElement('em'),b=document.createElement('span');a.textContent=item.attacker;g.textContent=item.weapon;b.textContent=item.victim;row.append(a,g,b);dom['kill-feed'].append(row);}}
    if(arena.state==='ROUND_END'||arena.state==='MATCH_END'){const secs=net.code?Math.max(0,(net.shared?.transitionAt-net.now())/1000):Math.max(0,arena.transitionAt-arena.time);dom['result-countdown'].textContent=arena.state==='MATCH_END'?`${Math.ceil(secs)}초 후 로비로 복귀`:`${Math.ceil(secs)}초 후 ${arena.result?.match?'경기 결과':'다음 라운드'}`;}
    if(dom['score-dialog'].open)updateScoreboard();updateCheats();if(p.alive&&p.hp/p.maxHp<.26)audio.heartbeat(arena.time);
    if(now>combatUntil)dom['combat-message'].textContent='';
  }
  function updateResult(){const r=arena.result;if(!r)return;dom['result-eyebrow'].textContent=arena.state==='MATCH_END'?'MATCH COMPLETE':`ROUND ${arena.round} COMPLETE`;dom['result-title'].textContent=r.draw?'DRAW':`${r.name} WINS`;dom['result-title'].style.color=r.winner==='RED'||r.winner==='HUNTERS'?'#ff8875':'#d5fb4e';dom['result-detail'].textContent=r.reason+(r.draw&&!r.match?' · 해당 라운드를 다시 진행한다.':'');dom['result-scores'].textContent=(arena.mode==='TEAM'||arena.mode==='EXPLOSION')?`BLUE ${arena.score.BLUE} : ${arena.score.RED} RED`:arena.mode==='CAPTURE'?`${arena.captureTime.BLUE.toFixed(1)}s / ${arena.captureTime.RED.toFixed(1)}s`:arena.mode==='BOSS'?`HP ${Math.ceil(arena.player().hp)} / SHIELD ${Math.ceil(arena.player().shield)}`:'';}
  function updateScoreboard(){const table=document.createElement('table');table.className='score-table';const thead=document.createElement('thead'),hr=document.createElement('tr');for(const name of ['OPERATOR','K','D','W','STATUS']){const th=document.createElement('th');th.textContent=name;hr.append(th);}thead.append(hr);table.append(thead);const body=document.createElement('tbody');const ranking=[...arena.entities].sort((a,b)=>b.kills-a.kills);for(const e of ranking){const row=document.createElement('tr');if(e.isPlayer)row.className='you';for(const value of [e.name,e.kills,e.deaths,e.wins,e.alive?'ALIVE':'DOWN']){const td=document.createElement('td');td.textContent=String(value);row.append(td);}body.append(row);}table.append(body);dom['score-table'].replaceChildren(table);}
  function frame(now){const dt=Math.min(.05,Math.max(0,(now-frameTime)/1000));frameTime=now;
    const p=arena.player();if(p)p.crouching=input.crouchToggle||input.keys.has('control');
    if(lookPointer?.id!==undefined&&!lookPointer.moved&&now-lookPointer.at>270)lookPointer.firing=true;
    const shoot=input.mouseFire||input.touchFire||input.tapFire||!!lookPointer?.firing;
    arena.tick(dt,{forward:(input.keys.has('w')?1:0)-(input.keys.has('s')?1:0)-input.joyY,strafe:(input.keys.has('d')?1:0)-(input.keys.has('a')?1:0)+input.joyX,fire:shoot,pressed:input.pressed,looking:now-input.lastLook<110});input.pressed=false;input.tapFire=false;
    net.tick(dt);renderer.render(arena,dt,arena.state==='LOBBY');dom['hit-marker'].style.opacity=renderer.hit>0?'1':'0';
    if(now-lastHud>85&&arena.state!=='LOBBY'){lastHud=now;updateHUD(now);}if(now>notifyUntil)dom.notification.classList.remove('visible');requestAnimationFrame(frame);
  }
  // A small structured surface for agents, when the browser supports WebMCP.
  if(document.modelContext?.registerTool){
    const lifecycle=new AbortController();window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
    const tools=[{name:'arena_status',title:'Arena status',description:'Read the current match and local operator status.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:async()=>({state:arena.state,mode:arena.mode,map:arena.map?.name,hp:arena.player()?.hp,shield:arena.player()?.shield})},
      {name:'start_ai_match',title:'Start AI match',description:'Start a new local AI match from the lobby in the selected mode.',inputSchema:{type:'object',properties:{mode:{type:'string',enum:Object.keys(C.MODES)}},required:['mode'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:async(input)=>{if(!input||!C.MODES[input.mode])throw new Error('Invalid mode');if(arena.state!=='LOBBY'||net.code)throw new Error('Return to the local lobby first');startLocal(input.mode);return{state:arena.state,mode:arena.mode,map:arena.map.name};}}];
    for(const tool of tools){try{Promise.resolve(document.modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{/* Optional browser capability. */}}
  }
  window.CHEAT_ARENA={arena,net,renderer,startLocal};updateCheats();requestAnimationFrame(frame);
})();
