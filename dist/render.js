/* Canvas-only 2.5D renderer: DDA walls, depth-clipped billboards and projected floor facilities. */
(function(root){
  'use strict';const C=root.CA,{clamp,mix,TILE}=C;
  const canvas=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
  const rgb=hex=>[parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16)];
  function poly(ctx,points,fill,stroke=null,width=1){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke();}}
  function rect(ctx,x,y,w,h,color){ctx.fillStyle=color;ctx.fillRect(x,y,w,h);}
  class Renderer{
    constructor(world,minimap){
      this.canvas=world;this.ctx=world.getContext('2d',{alpha:false});this.minimap=minimap;this.mctx=minimap.getContext('2d');this.mapId=null;this.textures=[];this.soldier=canvas(160,220);this.sc=this.soldier.getContext('2d');this.casings=[];this.shake=0;this.hurt=0;this.damageAngle=0;this.hit=0;this.lastFire=0;this.resize();
    }
    resize(){const w=root.innerWidth||1280,h=root.innerHeight||720;const s=Math.min(1,1050/w,680/h);this.canvas.width=Math.round(w*s);this.canvas.height=Math.round(h*s);this.w=this.canvas.width;this.h=this.canvas.height;this.f=this.w/(2*Math.tan(103*Math.PI/360));this.zbuffer=new Float32Array(this.w);this.ctx.imageSmoothingEnabled=false;}
    setMap(map){if(this.mapId===map.id)return;this.mapId=map.id;this.map=map;this.floorRGB=rgb(map.palette.floor);this.fogRGB=rgb(map.palette.fog);this.textures=[];
      for(let type=1;type<=5;type++){
        const c=canvas(128,128),x=c.getContext('2d');let base=type===1?map.palette.wall:type===2?(map.id==='depot'?'#497b90':map.id==='cargo'?'#b66447':map.palette.accent):type===3?map.palette.dark:type===4?map.palette.glass:map.palette.accent;
        rect(x,0,0,128,128,base);
        if(type===2){for(let i=0;i<128;i+=12){rect(x,i,0,3,128,'#00000030');rect(x,i+3,0,2,128,'#ffffff18');}rect(x,0,10,128,3,'#0005');rect(x,0,114,128,5,'#0006');rect(x,12,50,52,26,'#162c36b0');x.fillStyle='#ffffffad';x.font='bold 12px monospace';x.fillText(map.id==='depot'?'CA-07':'FR-04',16,67);}
        else if(type===4){rect(x,8,10,111,90,'#9cece340');for(let i=12;i<120;i+=29)rect(x,i,11,3,89,'#1a4b4b80');rect(x,0,99,128,8,'#385c5680');poly(x,[[10,12],[58,12],[25,90],[10,90]],'#ffffff1c');rect(x,0,120,128,8,'#173b3780');}
        else{rect(x,0,0,128,7,'#ffffff22');rect(x,0,121,128,7,'#0005');rect(x,0,0,3,128,'#0004');rect(x,125,0,3,128,'#ffffff18');rect(x,0,82,128,3,'#0003');rect(x,0,86,128,3,'#ffffff15');for(let y=15;y<120;y+=45)for(const xx of[9,119]){rect(x,xx,y,3,3,'#0006');rect(x,xx,y,1,1,'#fff5');}}
        // Deterministic surface grain, generated once per material.
        let seed=type*71;for(let i=0;i<250;i++){seed=(seed*1664525+1013904223)>>>0;const xx=seed%128;seed=(seed*1664525+1013904223)>>>0;rect(x,xx,seed%128,1,1,i%2?'#00000016':'#ffffff14');}
        this.textures[type]=c;
      }

    }
    projection(x,y,z=0){const dx=x-this.cam.x,dy=y-this.cam.y,d=dx*Math.cos(this.cam.angle)+dy*Math.sin(this.cam.angle);if(d<=5)return null;const side=-dx*Math.sin(this.cam.angle)+dy*Math.cos(this.cam.angle);return{x:this.w/2+side*this.f/d,y:this.horizon-(z-this.eye)*this.f/d,d,s:this.f/d};}
    clipDepth(depth,left=0,right=this.w){
      const x=this.ctx;left=Math.max(0,Math.floor(left/2)*2);right=Math.min(this.w,Math.ceil(right));x.beginPath();
      for(let sx=left;sx<right;sx+=2){
        if(depth>=this.zbuffer[sx]+5)continue;
        let top=-1;
        for(let row=0;row<=this.depthRows;row++){
          const visible=row<this.depthRows&&depth<(this.landmarkDepth[row*this.depthCols+Math.floor(sx/2)]??Infinity)+.5;
          if(visible&&top<0)top=row*2;
          if(!visible&&top>=0){x.rect(sx,top,Math.min(2,right-sx),Math.min(this.h,row*2)-top);top=-1;}
        }
      }x.clip();
    }
    landmarkVolumes(){
      const cols=Math.ceil(this.w/2),rows=Math.ceil(this.h/2);
      if(this.depthCols!==cols||this.depthRows!==rows){
        this.depthCols=cols;this.depthRows=rows;this.landmarkDepth=new Float32Array(cols*rows);
        this.volumeCanvas=canvas(cols,rows);this.volumeCtx=this.volumeCanvas.getContext('2d');this.volumeImage=this.volumeCtx.createImageData(cols,rows);
      }
      this.landmarkDepth.fill(Infinity);const pixels=this.volumeImage.data;pixels.fill(0);
      const origin={x:this.cam.x,y:this.cam.y},ca=Math.cos(this.cam.angle),sa=Math.sin(this.cam.angle);
      for(const box of this.map.landmarkParts||[]){
        const corners=[[box.x0,box.y0],[box.x1,box.y0],[box.x1,box.y1],[box.x0,box.y1]];
        if(corners.every(([x,y])=>(x-origin.x)*ca+(y-origin.y)*sa<=.5))continue;
        const projected=corners.map(([x,y])=>this.projection(x,y));
        const left=projected.every(Boolean)?Math.max(0,Math.floor(Math.min(...projected.map(p=>p.x))/2)):0;
        const right=projected.every(Boolean)?Math.min(cols,Math.ceil(Math.max(...projected.map(p=>p.x))/2)):cols;
        const color=rgb(box.color);
        for(let col=left;col<right;col++){
          const offset=Math.atan((col*2+1-this.w/2)/this.f),angle=this.cam.angle+offset,dx=Math.cos(angle),dy=Math.sin(angle),cos=Math.cos(offset);
          const span=C.boxInterval(origin,{x:origin.x+dx*2700,y:origin.y+dy*2700},box,true);if(!span)continue;
          const near=Math.max(.5,span.near*2700*cos),far=span.far*2700*cos;if(far<=.5)continue;
          const top=Math.max(0,Math.floor(Math.min(this.horizon-(box.z1-this.eye)*this.f/near,this.horizon-(box.z1-this.eye)*this.f/far)/2));
          const bottom=Math.min(rows,Math.ceil(Math.max(this.horizon-(box.z0-this.eye)*this.f/near,this.horizon-(box.z0-this.eye)*this.f/far)/2));
          for(let row=top;row<bottom;row++){
            const slope=(this.horizon-(row*2+1))/this.f,z=this.eye+slope*near;
            let depth=near,shade=.86;
            if(z>box.z1){depth=(box.z1-this.eye)/slope;shade=1.10;}
            else if(z<box.z0){depth=(box.z0-this.eye)/slope;shade=.60;}
            const index=row*cols+col;if(depth<near-1e-4||depth>far+1e-4||depth>=this.zbuffer[col*2]||depth>=this.landmarkDepth[index])continue;
            const wx=origin.x+dx*depth/cos,wy=origin.y+dy*depth/cos,hz=this.eye+slope*depth;
            const u=(Math.abs(wx-box.x0)<.5||Math.abs(wx-box.x1)<.5)?(wy-box.y0)/(box.y1-box.y0):(wx-box.x0)/(box.x1-box.x0);
            const v=(hz-box.z0)/(box.z1-box.z0);let tint=color;
            if(shade===.86){
              if(box.detail==='ribs')shade*=Math.floor(u*18)%3===0?.63:1;
              if(box.detail==='glass'){if(u%(.25)<.025||Math.abs(v-.5)<.025)tint=[201,220,204];else shade*=.90+.18*u;}
              if(box.detail==='reactor'&&(Math.abs(u-.5)<.10||v%(.25)<.055))tint=[133,235,210];
              if(box.detail==='hazard'&&(v<.15||v>.85)&&Math.floor(u*12+v*4)%2===0)tint=[51,63,48];
              if(box.detail==='crate'&&(Math.abs(u-.5)<.045||v<.07||v>.93))shade*=.65;
              if(box.detail==='clock'){
                const xx=u-.5,yy=v-.5,r=Math.hypot(xx,yy);
                if(r>.43||Math.abs(xx)<.025&&yy>-.04&&yy<.33||Math.abs(yy)<.025&&xx>0&&xx<.29)tint=[43,73,79];
                else if(r>.34&&Math.abs(Math.sin(Math.atan2(yy,xx)*6))<.23)tint=[66,83,80];
              }
            }
            const fog=clamp((depth-80)/2200,0,.7),at=index*4;this.landmarkDepth[index]=depth;
            for(let k=0;k<3;k++)pixels[at+k]=mix(Math.min(255,tint[k]*shade),this.fogRGB[k],fog);pixels[at+3]=255;
          }
        }
      }
      this.volumeCtx.putImageData(this.volumeImage,0,0);this.ctx.drawImage(this.volumeCanvas,0,0,cols*2,rows*2);
    }
    drawBillboard(image,pos,width,height,z=0){const p=this.projection(pos.x,pos.y,z);if(!p)return;const w=width*p.s,h=height*p.s,left=p.x-w/2,top=p.y-h;if(left>this.w||left+w<0||top>this.h||p.y<0)return;this.ctx.save();this.clipDepth(p.d,left,left+w);this.ctx.drawImage(image,left,top,w,h);this.ctx.restore();}
    worldPoly(points,fill,stroke=null,line=1){const ps=points.map(p=>this.projection(p[0],p[1],p[2]||0));if(ps.some(p=>!p))return;const left=Math.min(...ps.map(p=>p.x)),right=Math.max(...ps.map(p=>p.x));if(right<0||left>this.w)return;this.ctx.save();this.clipDepth(Math.max(...ps.map(p=>p.d)),left,right);poly(this.ctx,ps.map(p=>[p.x,p.y]),fill,stroke,line);this.ctx.restore();}
    render(arena,dt,attract=false){
      if(!arena.map)return;this.setMap(arena.map);this.arena=arena;this.time=arena.time;
      const subject=arena.viewpoint()||arena.entities[0];if(!subject)return;
      this.cam={...subject};if(attract){const m=arena.map;this.cam={x:m.ffa[0].x+28,y:m.ffa[0].y-50,angle:-.72+Math.sin(performance.now()/12000)*.18,cameraPitch:.01,recoilPitch:0,crouchBlend:0,jumpZ:0,landingKick:0};}
      this.eye=52-22*(this.cam.crouchBlend||0)+(this.cam.jumpZ||0)-(this.cam.landingKick||0);
      this.horizon=this.h*.5+Math.tan(clamp((this.cam.cameraPitch||0)+(this.cam.recoilPitch||0),-1.2,1.35))*this.f;
      const x=this.ctx;this.shake*=Math.exp(-16*dt);this.hurt=Math.max(0,this.hurt-dt*1.7);this.hit=Math.max(0,this.hit-dt);x.save();if(!attract&&this.shake>0.05)x.translate((Math.random()-.5)*this.shake,(Math.random()-.5)*this.shake);
      this.background();this.walls();this.landmarkVolumes();
      const objects=[];
      if(arena.mode==='CAPTURE'&&!attract)for(const p of arena.points)objects.push({type:'point',o:p,d:C.dist(this.cam,p)});
      for(const p of arena.pickups)if(p.active)objects.push({type:'orb',o:p,d:C.dist(this.cam,p)});
      for(const e of arena.entities)if(e.alive&&e.id!==subject.id&&!attract)objects.push({type:'soldier',o:e,d:C.dist(this.cam,e)});
      for(const item of objects.sort((a,b)=>b.d-a.d)){
        if(item.type==='point')this.point(item.o);
        if(item.type==='orb')this.orb(item.o);
        if(item.type==='soldier')this.drawSoldier(item.o,subject);
      }
      this.projectiles();this.effects();
      if(!attract){this.esp(subject);if(arena.player()?.alive)this.weapon(arena.player(),dt);this.overlay(arena.player());}x.restore();if(!attract)this.drawMinimap(arena,subject);
    }
    background(){
      const x=this.ctx,p=this.map.palette,w=this.w,h=this.h,hy=this.horizon;
      const sky=x.createLinearGradient(0,0,0,h);sky.addColorStop(0,p.sky);sky.addColorStop(1,p.horizon);x.fillStyle=sky;x.fillRect(0,0,w,h);
      // Distant architectural silhouette follows yaw; the playable landmarks live in the map.
      x.fillStyle=p.dark+'45';const shift=(this.cam.angle*90)%160;for(let i=-2;i<12;i++){const bh=24+((i*71+800)%77);x.fillRect(i*130-shift,hy-70-bh,95,bh+70);}
      if(hy>=h)return;
      const top=Math.max(0,Math.floor(hy)),rows=Math.ceil((h-top)/3),cols=Math.ceil(w/4),img=x.createImageData(cols,rows),data=img.data;
      const ca=Math.cos(this.cam.angle),sa=Math.sin(this.cam.angle),base=this.floorRGB,fog=this.fogRGB;
      for(let ry=0;ry<rows;ry++){
        const sy=top+ry*3,d=this.eye*this.f/Math.max(1,sy-hy),fogMix=clamp((d-120)/1900,.04,.78);
        for(let rx=0;rx<cols;rx++){
          const side=(rx*4-w/2)*d/this.f,wx=this.cam.x+ca*d-sa*side,wy=this.cam.y+sa*d+ca*side;
          const tx=((wx%TILE)+TILE)%TILE,ty=((wy%TILE)+TILE)%TILE;let shade=(Math.floor(wx/TILE)+Math.floor(wy/TILE))%2===0?1:.955;
          if(tx<1.8||ty<1.8)shade*=.8;
          let color=base;
          // Painted loading/traffic lanes provide world scale.
          if((Math.abs(wx-3*TILE)<2||Math.abs(wx-27*TILE)<2)&&Math.floor(wy/64)%3!==0){color=[209,183,103];shade=1;}
          const idx=(ry*cols+rx)*4;data[idx]=mix(color[0]*shade,fog[0],fogMix);data[idx+1]=mix(color[1]*shade,fog[1],fogMix);data[idx+2]=mix(color[2]*shade,fog[2],fogMix);data[idx+3]=255;
        }
      }
      if(!this.floorCanvas||this.floorCanvas.width!==cols||this.floorCanvas.height!==rows){this.floorCanvas=canvas(cols,rows);this.floorCtx=this.floorCanvas.getContext('2d');}
      this.floorCtx.putImageData(img,0,0);x.drawImage(this.floorCanvas,0,top,w,rows*3);
    }
    walls(){const x=this.ctx;
      for(let sx=0;sx<this.w;sx+=2){const offset=Math.atan((sx-this.w/2)/this.f),ray=C.raycast(this.map,this.cam.x,this.cam.y,this.cam.angle+offset,2700),d=ray.d*Math.cos(offset);this.zbuffer[sx]=d;if(sx+1<this.w)this.zbuffer[sx+1]=d;
        if(!ray.hit)continue;const scale=this.f/d,top=this.horizon-(96-this.eye)*scale,bottom=this.horizon+this.eye*scale;
        const texture=this.textures[ray.type]||this.textures[1];x.drawImage(texture,Math.floor(ray.u*2),0,1,128,sx,top,2,bottom-top);
        x.fillStyle=`rgba(10,22,22,${ray.side?.22:.05})`;x.fillRect(sx,top,2,bottom-top);
        const fog=clamp((d-80)/2200,0,.7);x.fillStyle=this.map.palette.fog;x.globalAlpha=fog;x.fillRect(sx,top,2,bottom-top);x.globalAlpha=1;
        x.fillStyle='#1d292754';x.fillRect(sx,bottom-Math.max(1,4*scale),2,Math.max(1,4*scale));
      }
    }
    circleGround(o,r,z,color,stroke,progress=1,start=-Math.PI/2){
      const n=48,pts=[];if(progress<1)pts.push([o.x,o.y,z]);for(let i=0;i<=n;i++){const a=start+i/n*C.TAU*progress;pts.push([o.x+Math.cos(a)*r,o.y+Math.sin(a)*r,z]);}this.worldPoly(pts,color,stroke,Math.max(1,2*this.f/Math.max(80,C.dist(this.cam,o))));
    }
    point(p){
      if(!C.los(this.map,this.cam,p))return;
      const color=p.contested?'#ffffff':p.owner==='BLUE'?'#62bdff':p.owner==='RED'?'#ff6d64':'#ffcc59';
      this.circleGround(p,p.radius,1,color+'28',color);this.circleGround(p,p.radius*.89,1.2,null,color+'7a');
      const r=18;this.worldPoly([[p.x-r,p.y-r,0],[p.x+r,p.y-r,0],[p.x+r,p.y+r,0],[p.x-r,p.y+r,0]],'#28312d',color,2);
      const center=this.projection(p.x,p.y,0),top=this.projection(p.x,p.y,62);if(!center||!top)return;const s=center.s,x=this.ctx;x.save();this.clipDepth(center.d,center.x-90*s,center.x+90*s);
      x.fillStyle='#253331';x.fillRect(center.x-4*s,top.y,8*s,center.y-top.y);rect(x,center.x-2*s,top.y,2*s,center.y-top.y,'#c6d1c2');
      x.shadowBlur=14*s;x.shadowColor=color;rect(x,center.x-11*s,top.y-5*s,22*s,8*s,color);x.shadowBlur=0;
      x.font=`bold ${Math.max(12,22*s)}px monospace`;x.textAlign='center';x.fillStyle=color;x.strokeStyle='#13261cee';x.lineWidth=3;x.strokeText(p.id,top.x,top.y-13*s);x.fillText(p.id,top.x,top.y-13*s);
      const progress=Math.abs(p.control);if(progress>0&&progress<1){x.beginPath();x.arc(top.x,top.y-22*s,24*s,-Math.PI/2,-Math.PI/2+C.TAU*progress);x.strokeStyle=p.capturing==='BLUE'?'#62bdff':'#ff6d64';x.lineWidth=3*s;x.stroke();}
      if(p.contested){x.font=`bold ${Math.max(10,11*s)}px monospace`;x.fillStyle='#fff';x.fillText('CONTESTED',top.x,top.y-50*s);}x.restore();
    }
    orb(p){
      if(!C.los(this.map,this.cam,p))return;const z=19+Math.sin(this.time*2.8+p.x)*3,q=this.projection(p.x,p.y,z);if(!q)return;
      const r=9*q.s;if(q.x+r<0||q.x-r>this.w)return;const x=this.ctx,color=p.type==='health'?'#77f38b':'#ffda51';x.save();this.clipDepth(q.d,q.x-r*3,q.x+r*3);
      const glow=x.createRadialGradient(q.x,q.y,0,q.x,q.y,r*3);glow.addColorStop(0,color+'99');glow.addColorStop(1,color+'00');x.fillStyle=glow;x.fillRect(q.x-r*3,q.y-r*3,r*6,r*6);
      x.beginPath();x.arc(q.x,q.y,r,0,C.TAU);x.fillStyle=color;x.fill();x.strokeStyle='#ffffffb0';x.lineWidth=Math.max(1,q.s);x.stroke();
      if(p.type==='health'){rect(x,q.x-r*.15,q.y-r*.58,r*.3,r*1.16,'#fff');rect(x,q.x-r*.58,q.y-r*.15,r*1.16,r*.3,'#fff');}
      else{poly(x,[[q.x-r*.48,q.y-r*.5],[q.x+r*.48,q.y-r*.5],[q.x+r*.43,q.y+r*.14],[q.x,q.y+r*.61],[q.x-r*.43,q.y+r*.14]],'#fff');}
      x.restore();this.circleGround(p,12,1,color+'16',color+'46');
    }
    drawSoldier(e,view){
      const foe=C.enemy(view,e,this.arena.mode),colors=foe?['#884940','#bb6251','#eb8d68']:['#3b647b','#4f8dae','#88c9e5'];
      const x=this.sc;x.clearRect(0,0,160,220);const crouch=e.crouchBlend||0,jump=e.jumpZ>2;const bob=Math.sin(e.walkPhase*2)*(e.moveSpeed>10?1.5:0);
      const hip=116-crouch*25+bob,foot=198,legCompress=crouch*22+(jump?12:0),stride=e.moveSpeed>10?Math.sin(e.walkPhase)*13:0;
      const facing=C.wrap(e.angle-Math.atan2(this.cam.y-e.y,this.cam.x-e.x));const back=Math.abs(facing)>Math.PI*.62;
      x.fillStyle='#00000035';x.beginPath();x.ellipse(80,207,32,6,0,0,C.TAU);x.fill();
      const leg=(side,phase)=>{
        const hx=80+side*13,kx=hx+phase*.5,ky=hip+35-crouch*8,fx=hx+phase,fy=foot-legCompress+Math.abs(phase)*.2;
        // Articulated thigh → knee pad → shin → boot.
        poly(x,[[hx-10,hip],[hx+10,hip],[kx+9,ky],[kx-10,ky]],colors[0],'#243432',2);
        poly(x,[[kx-8,ky],[kx+9,ky],[fx+8,fy-8],[fx-8,fy-8]],'#465448','#26332e',2);
        rect(x,kx-10,ky-4,20,13,'#253632');rect(x,kx-7,ky-2,14,7,'#707961');
        poly(x,[[fx-9,fy-12],[fx+8,fy-12],[fx+12,fy-1],[fx+12,fy+7],[fx-11,fy+7]],'#25302c','#111c18',2);rect(x,fx-10,fy+5,23,4,'#131f1a');
      };
      leg(-1,stride);leg(1,-stride);
      const torso=hip-54;poly(x,[[53,torso+4],[67,torso-2],[97,torso],[107,torso+13],[104,hip+7],[54,hip+7]],colors[1],'#253a33',3);
      // Plate carrier, pouches, shoulders and bent arms.
      rect(x,61,torso+6,37,36,'#283d36');rect(x,66,torso+9,27,15,colors[0]);for(let i=0;i<3;i++){rect(x,61+i*13,torso+28,11,16,'#6c7660');rect(x,62+i*13,torso+29,9,3,'#a0a289');}
      poly(x,[[53,torso+7],[42,torso+13],[39,torso+37],[53,torso+42],[65,torso+33],[61,torso+23]],colors[1],'#273c32',2);
      poly(x,[[105,torso+9],[116,torso+17],[117,torso+40],[103,torso+47],[86,torso+36],[91,torso+27]],colors[0],'#273c32',2);
      rect(x,42,torso+20,14,10,colors[2]);rect(x,102,torso+20,13,10,colors[2]);rect(x,53,hip,51,8,'#1e312b');rect(x,76,hip,11,8,'#b1ad85');
      const head=torso-26;rect(x,67,head+7,27,27,'#b09674');rect(x,66,head+21,30,9,'#263831');
      poly(x,[[63,head+13],[64,head],[72,head-7],[91,head-7],[101,head+1],[100,head+14]],colors[0],'#22372f',2);rect(x,63,head+11,38,5,'#2c3c31');
      if(!back){rect(x,68,head+14,29,7,'#1c2c27');rect(x,71,head+15,10,4,foe?'#ffd18a':'#b1f7fe');rect(x,85,head+15,9,4,foe?'#ffd18a':'#b1f7fe');}else{rect(x,70,head+4,25,11,colors[1]);rect(x,69,torso+3,25,27,'#3c4c3d');}
      const gy=torso+34;poly(x,[[64,gy-6],[107,gy-6],[115,gy-2],[128,gy-2],[128,gy+4],[99,gy+5],[96,gy+15],[88,gy+15],[86,gy+4],[67,gy+6]],'#182b26','#101e19',2);rect(x,98,gy-9,15,3,'#90a294');rect(x,66,gy,10,11,'#273e32');rect(x,102,gy+2,10,9,'#2d4134');
      if(e.fireFlash>0){poly(x,[[126,gy],[142,gy-9],[137,gy],[151,gy+3],[135,gy+7],[144,gy+15],[126,gy+7]],'#ffec9a');}
      const height=(70-24*crouch)*(e.maxHp>100?1.14:1);this.drawBillboard(this.soldier,e,height*.73,height,e.jumpZ||0);
      if(this.time<e.spawnProtectionUntil){this.circleGround(e,28,2,null,'#ffffff');this.circleGround(e,31,3,null,'#ffffff70');}
      if(!foe&&C.los(this.map,this.cam,e)){const p=this.projection(e.x,e.y,(e.jumpZ||0)+height+9);if(p&&p.d<950){const c=this.ctx;c.save();this.clipDepth(p.d,p.x-80,p.x+80);c.font='bold 10px monospace';c.textAlign='center';c.fillStyle='#bfe6ff';c.strokeStyle='#182c29';c.lineWidth=3;c.strokeText(e.name,p.x,p.y);c.fillText(e.name,p.x,p.y);c.restore();}}
    }
    esp(view){if(!this.arena.cheats.esp)return;const x=this.ctx;
      for(const e of this.arena.entities){if(!e.alive||!C.enemy(view,e,this.arena.mode))continue;
        const b=this.projection(e.x,e.y,e.jumpZ||0),t=this.projection(e.x,e.y,(e.jumpZ||0)+this.arena.height(e));if(!b||!t)continue;const h=b.y-t.y,w=h*.52;if(b.x+w/2<0||b.x-w/2>this.w)continue;
        const left=b.x-w/2,top=t.y,visible=C.los(this.map,this.cam,e);x.save();x.strokeStyle=visible?'#ff8272':'#ff8272aa';x.lineWidth=1;x.setLineDash(visible?[]:[4,3]);x.strokeRect(left,top,w,h);x.setLineDash([]);x.fillStyle='#101a15d9';x.fillRect(left-2,top-35,Math.max(93,w+4),32);
        x.font='bold 10px monospace';x.textAlign='left';x.fillStyle='#ffd0bd';x.fillText(e.name,left,top-23);x.font='9px monospace';x.fillStyle='#ecf2df';x.fillText(`HP ${Math.ceil(e.hp)}`,left,top-11);x.fillStyle='#ffda51';x.fillText(`SH ${Math.ceil(e.shield)}`,left+47,top-11);
        rect(x,left,b.y+4,w,3,'#19291dd9');rect(x,left,b.y+4,w*e.hp/e.maxHp,3,'#9aeda2');rect(x,left,b.y+9,w,3,'#19291dd9');rect(x,left,b.y+9,w*e.shield/e.maxShield,3,'#ffda51');x.restore();
      }
    }
    projectiles(){const x=this.ctx;for(const p of this.arena.projectiles){const a=this.projection(p.x,p.y,p.z),b=this.projection(p.x-p.vx*.025,p.y-p.vy*.025,p.z-p.vz*.025);if(!a||!b)continue;x.save();this.clipDepth(a.d,Math.min(a.x,b.x)-6,Math.max(a.x,b.x)+6);if(p.grenade){x.fillStyle='#59674c';x.beginPath();x.arc(a.x,a.y,Math.max(2,5*a.s),0,C.TAU);x.fill();x.strokeStyle='#18251b';x.stroke();}else{x.strokeStyle='#ffe7b2';x.lineWidth=Math.max(1,2*a.s);x.beginPath();x.moveTo(b.x,b.y);x.lineTo(a.x,a.y);x.stroke();}x.restore();}}
    effects(){const x=this.ctx;for(const f of this.arena.effects){
      if(f.type==='bomb-explosion'){
        const q=C.clamp(1-f.life/f.maxLife,0,1),flash=C.clamp(f.life/.32,0,1);x.save();
        const p=this.projection(f.x,f.y,f.z);if(p){const r=(38+q*235)*p.s;x.globalAlpha=Math.max(.12,1-q*.88);x.fillStyle='#ff8e32';x.beginPath();x.arc(p.x,p.y,r,0,C.TAU);x.fill();x.fillStyle='#fff3bd';x.beginPath();x.arc(p.x,p.y,r*.48,0,C.TAU);x.fill();}
        x.globalAlpha=.68*flash*(1-q*.55);x.fillStyle=q<.18?'#fff1c0':'#f06b2b';x.fillRect(-40,-40,this.w+80,this.h+80);x.globalAlpha=.22*(1-q);x.fillStyle='#17110d';for(let i=0;i<9;i++){const rr=(50+i*19)*q;x.beginPath();x.arc(this.w*(.18+.08*i),this.h*(.35+.04*(i%3)),rr,0,C.TAU);x.fill();}x.restore();continue;
      }
      const p=this.projection(f.x,f.y,f.z);if(!p)continue;
      if(f.type==='tracer'){const a=this.projection(f.x1,f.y1,f.z1);if(!a)continue;x.save();this.clipDepth(p.d,Math.min(a.x,p.x),Math.max(a.x,p.x)+2);x.strokeStyle='#ffe4a252';x.lineWidth=1;x.beginPath();x.moveTo(a.x,a.y);x.lineTo(p.x,p.y);x.stroke();x.restore();}
      else if(f.type==='spark'){x.save();this.clipDepth(p.d,p.x-8,p.x+8);x.fillStyle='#ffdda0';x.globalAlpha=f.life/f.maxLife;x.fillRect(p.x-2,p.y-2,4,4);x.restore();}
      else if(f.type==='explosion'){x.save();this.clipDepth(p.d,p.x-80,p.x+80);const q=1-f.life/f.maxLife,r=(18+q*62)*p.s;x.globalAlpha=Math.max(0,f.life/f.maxLife);x.fillStyle='#ffbe55';x.beginPath();x.arc(p.x,p.y,r,0,C.TAU);x.fill();x.fillStyle='#fff2b8';x.beginPath();x.arc(p.x,p.y,r*.45,0,C.TAU);x.fill();x.restore();}
    }}
    onFire(e){if(!e.isPlayer)return;const w=C.WEAPONS[e.weapon];this.shake=Math.max(this.shake,this.arena?.cheats.noRecoil?0:w.kick*.3);this.lastFire=this.time;if(w.kind==='firearm')this.casings.push({x:this.w*.68,y:this.h*.74,vx:100+Math.random()*140,vy:-120-Math.random()*70,r:0,life:.65});}
    weapon(e,dt){const x=this.ctx,w=this.w,h=this.h,scale=Math.min(h/480,w/630),bob=Math.sin(e.walkPhase)*Math.min(5,e.moveSpeed*.025),kick=e.weaponKick||0,reload=e.reloadLeft>0?Math.sin((1-e.reloadLeft/e.reloadTotal)*Math.PI):0;
      x.save();x.translate(w*.53+bob*scale,h+8+Math.abs(Math.cos(e.walkPhase))*2+reload*92*scale+kick*scale*.6);x.scale(scale,scale);x.rotate(reload*.24);
      // Arms and gloves bracket a perspective weapon, aimed toward the crosshair.
      poly(x,[[32,-18],[79,-106],[111,-110],[160,-55],[188,12]],'#53614a','#263d32',3);poly(x,[[81,-104],[93,-133],[118,-130],[128,-107],[111,-86]],'#283f32','#172a22',3);
      poly(x,[[-117,10],[-83,-61],[-49,-103],[-15,-90],[-24,-53],[-26,10]],'#59694e','#2c4435',3);poly(x,[[-57,-102],[-39,-131],[-13,-133],[5,-101],[-14,-79],[-43,-76]],'#273e31','#172a22',3);
      const id=e.weapon;
      if(id===1||id===4){
        const heavy=id===4;
        poly(x,[[-52,16],[-47,-75],[-18,-121],[34,-116],[85,-11],[76,20]],'#293730','#12251d',3);
        poly(x,[[-46,-64],[-32,-112],[-14,-149],[19,-150],[43,-96],[59,-44],[39,-4],[-22,-10]],heavy?'#48554b':'#435348','#172a21',3);
        poly(x,[[-22,-110],[-12,-205],[5,-240],[21,-204],[32,-108]],'#253b30','#11231b',3);
        poly(x,[[-13,-157],[-7,-218],[7,-247],[17,-218],[24,-157]],'#506258','#172f25',2);
        rect(x,-3,-267,12,42,'#263c31');rect(x,-7,-270,19,8,'#142a20');rect(x,1,-283,5,18,'#729082');
        for(let i=0;i<6;i++){const yy=-158-i*10;rect(x,-10+i*.65,yy,29-i*1.4,4,'#152b22');}
        poly(x,[[-30,-112],[-17,-157],[21,-157],[34,-109]],'#1b3026','#577467',2);rect(x,-7,-145,16,7,'#87a18a');
        poly(x,[[-16,-87],[11,-100],[36,-33],[25,5],[-4,-9]],'#1b2d24','#10251c',2);
        if(heavy){poly(x,[[-36,-100],[-97,-75],[-93,-21],[-48,-14]],'#657454','#253d2a',3);for(let i=0;i<8;i++)poly(x,[[-70+i*7,-108+i*2],[-64+i*7,-108+i*2],[-60+i*7,-88+i*2],[-66+i*7,-88+i*2]],'#c8b06a','#6d603d',1);rect(x,-17,-179,35,7,'#657c6c');}
        else{poly(x,[[-25,-75],[-9,-62],[-3,-2],[-28,1],[-42,-43]],'#334537','#152c21',2);for(let i=0;i<3;i++)rect(x,-31,-45+i*11,21,3,'#152a20');}
      }else if(id===0){x.rotate(Math.sin(clamp(e.cooldown/.48,0,1)*Math.PI)*.8);poly(x,[[-18,2],[-28,-105],[12,-115],[50,-8]],'#293d2c','#142a1d',3);poly(x,[[-26,-105],[-34,-135],[21,-149],[35,-121]],'#2b3d33','#172d22',2);poly(x,[[-24,-135],[-27,-239],[3,-303],[22,-151]],'#a5b5ae','#253d32',3);poly(x,[[-8,-160],[3,-303],[22,-151]],'#d9e5d8');}
      else if(id===2){poly(x,[[-48,10],[-43,-75],[-21,-139],[24,-125],[65,-12],[63,12]],'#574d37','#253627',3);poly(x,[[-30,-94],[-13,-234],[16,-241],[38,-98]],'#273c30','#10291e',3);poly(x,[[-28,-113],[-19,-175],[26,-177],[37,-115]],'#977c46','#4d4d31',3);for(let i=0;i<5;i++)rect(x,-20,-162+i*9,44,4,'#4b4c31');rect(x,-8,-270,14,43,'#273d32');rect(x,9,-261,11,33,'#526552');rect(x,-3,-277,4,8,'#c9bca0');}
      else if(id===3){poly(x,[[-40,8],[-23,-121],[24,-124],[58,6]],'#344d3b','#142d20',3);poly(x,[[-15,-75],[-13,-222],[10,-247],[27,-223],[28,-77]],'#6a7d60','#183624',3);poly(x,[[-12,-186],[-114,-134],[-163,-151],[-178,-181],[-151,-174],[-132,-152],[-12,-207]],'#354e3b','#172d22',3);poly(x,[[22,-186],[128,-143],[164,-161],[174,-190],[149,-178],[130,-164],[21,-207]],'#354e3b','#172d22',3);x.strokeStyle='#b5c39f';x.lineWidth=2;x.beginPath();x.moveTo(-177,-181);x.lineTo(5,-161);x.lineTo(173,-190);x.stroke();rect(x,3,-250,4,101,'#d8c59c');rect(x,-4,-177,17,18,'#233b2c');}
      else if(id===5){x.save();x.translate(0,-92);x.rotate(-.18);x.fillStyle='#4d5c44';x.beginPath();x.arc(0,0,31,0,C.TAU);x.fill();x.strokeStyle='#17251b';x.lineWidth=4;x.stroke();rect(x,-12,-42,24,15,'#6b765e','#18241c',2);rect(x,4,-57,7,18,'#b3a26e');x.restore();}
      if(e.fireFlash>0&&(id===1||id===2||id===4)){const muzzle=id===2?-270:-281,sz=id===2?1.35:1;x.save();x.translate(3,muzzle);x.scale(sz,sz);poly(x,[[0,-7],[-20,-29],[-10,-3],[-35,4],[-11,11],[-18,34],[1,17],[24,28],[15,6],[33,-11],[13,-9],[15,-34]],'#ffc85ddd');poly(x,[[0,-19],[-11,4],[0,18],[14,1]],'#fff6c9');x.restore();}x.restore();
      this.casings=this.casings.filter(c=>(c.life-=dt)>0);for(const c of this.casings){c.x+=c.vx*dt;c.y+=c.vy*dt;c.vy+=490*dt;c.r+=dt*14;x.save();x.translate(c.x,c.y);x.rotate(c.r);rect(x,-3,-1.5,8,3,'#d5b870');x.restore();}
    }
    overlay(player){const x=this.ctx,w=this.w,h=this.h;
      const vg=x.createRadialGradient(w/2,h*.46,h*.14,w/2,h*.5,Math.max(w,h)*.66);vg.addColorStop(0,'#00000000');vg.addColorStop(1,'#09170c78');x.fillStyle=vg;x.fillRect(0,0,w,h);
      if(player?.alive&&player.hp/player.maxHp<.26){const g=x.createRadialGradient(w/2,h/2,h*.23,w/2,h/2,Math.max(w,h)*.62);g.addColorStop(0,'#9c231700');g.addColorStop(1,`rgba(131,17,9,${.35+Math.sin(this.time*7)*.12})`);x.fillStyle=g;x.fillRect(0,0,w,h);}
      if(this.hurt>0){x.fillStyle=`rgba(212,35,20,${this.hurt*.23})`;x.fillRect(0,0,w,h);x.save();x.translate(w/2,h/2);x.rotate(this.damageAngle);poly(x,[[0,-68],[-10,-86],[10,-86]],'#ff755a');x.restore();}
    }
    drawMinimap(arena,view){const x=this.mctx,w=this.minimap.width,h=this.minimap.height,s=w/arena.map.width;
      x.clearRect(0,0,w,h);rect(x,0,0,w,h,'#132014ec');
      for(let yy=0;yy<arena.map.height;yy++)for(let xx=0;xx<arena.map.width;xx++)if(arena.map.grid[yy][xx])rect(x,xx*s,yy*s,s-.5,s-.5,'#697b63');
      for(const b of arena.map.landmarkParts||[])if(b.z0<70)rect(x,b.x0/TILE*s,b.y0/TILE*s,(b.x1-b.x0)/TILE*s,(b.y1-b.y0)/TILE*s,b.color);
      for(const p of arena.pickups)if(p.active){x.fillStyle=p.type==='health'?'#83f18b':'#ffda51';x.beginPath();x.arc(p.x/TILE*s,p.y/TILE*s,2.1,0,C.TAU);x.fill();}
      if(arena.mode==='CAPTURE')for(const p of arena.points){const px=p.x/TILE*s,py=p.y/TILE*s;x.fillStyle=p.owner==='BLUE'?'#62bdff':p.owner==='RED'?'#ff6d64':'#ffcc59';x.beginPath();x.arc(px,py,6,0,C.TAU);x.fill();if(p.contested){x.strokeStyle='#fff';x.lineWidth=2;x.stroke();}x.fillStyle='#162619';x.textAlign='center';x.font='bold 8px monospace';x.fillText(p.id,px,py+3);}
      if(arena.mode==='EXPLOSION'){for(const p of arena.bombSites||[]){const px=p.x/TILE*s,py=p.y/TILE*s;x.fillStyle='#ffcc59';x.beginPath();x.arc(px,py,6,0,C.TAU);x.fill();x.fillStyle='#162619';x.textAlign='center';x.font='bold 8px monospace';x.fillText(p.id,px,py+3);}if(arena.bomb?.planted){x.fillStyle='#ff6d64';x.beginPath();x.arc(arena.bomb.x/TILE*s,arena.bomb.y/TILE*s,4,0,C.TAU);x.fill();}}
      for(const e of arena.entities){if(!e.alive||e.id===view.id)continue;const foe=C.enemy(view,e,arena.mode);if(foe&&!arena.cheats.esp)continue;x.fillStyle=foe?'#ff7865':'#79cfff';x.beginPath();x.arc(e.x/TILE*s,e.y/TILE*s,2.5,0,C.TAU);x.fill();}
      x.save();x.translate(view.x/TILE*s,view.y/TILE*s);x.rotate(view.angle);poly(x,[[6,0],[-4,-4],[-2,0],[-4,4]],'#e3ff70','#293e1c',1);x.fillStyle='#d5fb4e15';x.beginPath();x.moveTo(0,0);x.arc(0,0,29,-103*Math.PI/360,103*Math.PI/360);x.closePath();x.fill();x.restore();
    }
  }C.Renderer=Renderer;
})(typeof window!=='undefined'?window:globalThis);
