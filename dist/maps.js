/* Hand-authored 30 × 27 arenas. Coordinates below are tile centers, never random. */
(function(root){
  'use strict';const C=root.CA,T=C.TILE;
  const p=(x,y,extra={})=>({x:x*T,y:y*T,...extra});
  const teamSpawns={BLUE:[[2.5,23.5],[3.5,24.5],[4.5,23.5],[2.5,25.5],[5.5,25.5]],RED:[[27.5,2.5],[26.5,3.5],[25.5,2.5],[27.5,4.5],[24.5,1.5]]};
  function landmarkParts(l){
    const out=[],s=l.scale;
    const box=(x,y,w,d,z,h,color,detail='')=>out.push({x0:l.x+(x-w/2)*s,x1:l.x+(x+w/2)*s,y0:l.y+(y-d/2)*s,y1:l.y+(y+d/2)*s,z0:z*s,z1:(z+h)*s,color,detail,landmark:l.type});
    switch(l.type){
      case 'crane':
        for(const x of[-48,48]){box(x,0,13,24,0,132,'#d5ad46','hazard');box(x,0,23,34,0,8,'#626859');}
        box(0,0,116,22,127,17,'#e6bd52','hazard');box(0,0,20,20,112,15,'#536357');box(0,0,2,2,72,40,'#394840');break;
      case 'containers':
        box(0,0,104,42,0,50,'#417997','ribs');box(0,0,82,39,50,49,'#538dad','ribs');break;
      case 'platform':
        box(0,0,110,54,0,18,'#787e69','hazard');box(-20,0,38,34,18,34,'#a39b74','crate');break;
      case 'gate':
        box(-44,0,28,34,0,100,'#ae594a','ribs');box(44,0,28,34,0,100,'#ae594a','ribs');box(0,0,116,34,100,30,'#c16d56','ribs');break;
      case 'forklift':
        box(0,0,68,36,8,31,'#deab46','hazard');
        for(const x of[-24,24])for(const y of[-20,20])box(x,y,18,10,0,20,'#283832');
        for(const x of[-15,21])for(const y of[-15,15])box(x,y,4,4,39,41,'#dbae51');
        box(3,0,44,38,80,5,'#e3ba62');box(1,0,16,19,39,15,'#324b43');
        box(40,0,5,30,0,92,'#536d68');for(const y of[-10,10])box(53,y,28,5,0,4,'#6d8077');break;
      case 'hazard':
        for(const x of[-32,0,32])box(x,0,27,29,0,43,'#c5aa4b','hazard');break;
      case 'laboratory':
        box(0,0,95,34,0,8,'#b5cfc6');box(0,0,95,34,8,69,'#64aa9e','glass');box(0,0,100,38,77,7,'#d4e2d4');break;
      case 'reactor':
        box(0,0,75,61,0,14,'#4e7268');box(0,0,60,48,14,80,'#58bba7','reactor');box(0,0,66,52,94,10,'#8ebcaf');break;
      case 'quarantine':
        box(0,0,90,26,0,87,'#587969','glass');for(const x of[-44,44])box(x,0,8,30,0,92,'#d7ae53','hazard');box(0,0,8,28,0,87,'#d7ae53');box(0,0,98,30,87,8,'#d0d9bc');break;
      case 'monument':
        box(0,0,100,54,0,10,'#b8b296');box(0,0,78,43,10,12,'#959b89');box(0,0,33,30,22,96,'#b5b8a2');box(0,0,21,23,118,25,'#869a89');break;
      case 'steps':
        for(let i=0;i<5;i++)box(0,-22+i*11,110-i*14,11,0,6+i*6,'#adb099','steps');break;
      case 'clock':
        box(0,0,34,29,0,8,'#718b7d');box(0,0,23,20,8,84,'#b7b295');box(0,0,49,23,92,49,'#ede5bc','clock');break;
      default:throw new Error('Missing landmark model: '+l.type);
    }return out;
  }
  function build(spec){
    const grid=Array.from({length:27},(_,y)=>Array.from({length:30},(_,x)=>x===0||y===0||x===29||y===26?1:0));
    for(const [x,y,w,h,type]of spec.blocks)for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)grid[yy][xx]=type;
    const map={...spec,width:30,height:27,grid,spawns:{BLUE:teamSpawns.BLUE.map(([x,y])=>p(x,y,{angle:-.64})),RED:teamSpawns.RED.map(([x,y])=>p(x,y,{angle:2.50}))},
      ffa:spec.ffa.map(([x,y])=>p(x,y)),points:spec.points.map(([id,x,y])=>p(x,y,{id,radius:96})),pickups:spec.orbs.map(([type,x,y])=>p(x,y,{type})),
      landmarks:spec.landmarks.map(([type,name,x,y,scale])=>p(x,y,{type,name,scale})),zones:spec.zones.map(([name,x,y])=>p(x,y,{name}))};
    map.boss=p(3.5,23.5,{angle:-.6});map.hunters=map.ffa.slice(1).map(x=>({...x}));
    map.landmarkParts=map.landmarks.flatMap(landmarkParts);
    const all=[...map.ffa,...map.spawns.BLUE,...map.spawns.RED,map.boss,...map.hunters,...map.points,...map.pickups];
    for(const pos of all)if(!C.canStand(map,pos.x,pos.y,19))throw new Error(`Blocked authored coordinate: ${spec.name} (${pos.x/T},${pos.y/T})`);
    const origin=map.ffa[0];for(const pos of all)if(C.dist(origin,pos)>64&&!C.pathfind(map,origin,pos).length)throw new Error('Unreachable floor '+spec.name);
    return map;
  }
  const MAPS=[
    build({id:'depot',name:'DEPOT',subtitle:'TRANSFER TERMINAL 07',
      palette:{sky:'#879ca2',horizon:'#c3c7b5',floor:'#8f8975',floorDark:'#777361',wall:'#b9ae8c',accent:'#d8aa3d',dark:'#535c60',glass:'#739ca4',fog:'#a7aa94'},
      blocks:[[6,4,5,2,2],[5,10,2,6,3],[9,11,2,3,2],[13,10,4,5,3],[19,4,2,6,1],[23,7,3,2,2],[22,12,4,2,3],[20,17,2,4,2],[10,19,5,2,1],[6,20,2,2,3],[25,19,2,4,1],[13,4,2,2,1]],
      ffa:[[2.5,23.5],[4.5,7.5],[3.5,2.5],[16.5,2.5],[27.5,4.5],[27.5,11.5],[24.5,17.5],[17.5,24.5],[12.5,16.5],[17.5,8.5]],
      points:[['A',8.5,8.5],['B',16.5,17.5],['C',24.5,10.5]],
      orbs:[['health',3.5,12.5],['shield',11.5,7.5],['health',17.5,21.5],['shield',26.5,16.5],['health',22.5,3.5],['shield',8.5,23.5]],
      landmarks:[['crane','GANTRY 07',12,7,1.9],['containers','BLUE STACK',7.5,6.5,1.3],['platform','LOADING 03',15,15.7,1.5]],
      zones:[['BLUE ENTRY',3,24],['BLUE STACK',7,7],['LOADING PLATFORM',15,16],['CRANE LANE',14,7],['RED RECEIVING',25,6],['SOUTH SERVICE',18,24]]}),
    build({id:'cargo',name:'CARGO YARD',subtitle:'FREIGHT SECTOR 04',
      palette:{sky:'#8d9eaa',horizon:'#c2c9c8',floor:'#7c8789',floorDark:'#67757b',wall:'#a1afb3',accent:'#ea9747',dark:'#586a72',glass:'#87a1ad',fog:'#a5b4b7'},
      blocks:[[5,4,6,2,2],[5,8,2,4,3],[10,9,2,4,2],[15,4,2,6,2],[20,6,5,2,3],[24,11,3,5,2],[15,13,6,2,3],[7,16,4,2,2],[4,20,4,2,1],[13,20,2,4,3],[19,19,5,2,2],[22,23,3,2,1]],
      ffa:[[2.5,23.5],[3.5,14.5],[3.5,2.5],[12.5,6.5],[20.5,3.5],[27.5,8.5],[22.5,16.5],[27.5,23.5],[16.5,24.5],[12.5,15.5]],
      points:[['A',8.5,13.5],['B',17.5,17.5],['C',21.5,10.5]],
      orbs:[['health',3.5,8.5],['shield',12.5,3.5],['health',19.5,10.5],['shield',27.5,19.5],['health',10.5,22.5],['shield',5.5,14.5]],
      landmarks:[['gate','RED GATE',13,7.2,1.65],['forklift','FORKLIFT 04',8.5,14.7,1.3],['hazard','HAZMAT',23.5,17.2,1.25]],
      zones:[['BLUE ACCESS',3,24],['RED CONTAINER GATE',12,7],['FORKLIFT',8,14],['HAZMAT',24,17],['NORTH FREIGHT',23,3],['SOUTH FREIGHT',18,23]]}),
    build({id:'lab',name:'LA. WING',subtitle:'RESEARCH & CONTAINMENT',
      palette:{sky:'#728e93',horizon:'#b9d3ca',floor:'#a5b5ad',floorDark:'#899f97',wall:'#d4dfd4',accent:'#e6a359',dark:'#4b706d',glass:'#58b7aa',fog:'#a5c8bc'},
      blocks:[[5,3,2,7,4],[8,3,5,2,1],[11,7,2,4,4],[17,3,2,6,1],[21,6,4,2,4],[23,10,3,2,1],[15,11,3,3,4],[4,14,5,2,1],[10,16,2,5,4],[16,18,5,2,1],[24,17,2,6,4],[4,20,3,2,1],[14,23,6,2,1]],
      ffa:[[2.5,23.5],[3.5,11.5],[9.5,2.5],[15.5,6.5],[27.5,3.5],[20.5,10.5],[27.5,15.5],[21.5,23.5],[13.5,20.5],[8.5,12.5]],
      points:[['A',8.5,8.5],['B',14.5,16.5],['C',21.5,14.5]],
      orbs:[['health',3.5,6.5],['shield',14.5,3.5],['health',26.5,8.5],['shield',21.5,21.5],['health',6.5,18.5],['shield',12.5,14.5]],
      landmarks:[['laboratory','GLASS LAB / 02',8.5,5.7,1.55],['reactor','TEAL REACTOR',18.9,12.5,1.1],['quarantine','QUARANTINE',22.5,8.6,1.25]],
      zones:[['BLUE DECONTAMINATION',3,24],['GLASS LABORATORY',9,7],['TEAL REACTOR',19,13],['QUARANTINE',23,9],['SOUTH CLINIC',17,22],['WEST SERVICE',5,16]]}),
    build({id:'plaza',name:'CENTRAL PLAZA',subtitle:'CIVIC DISTRICT',
      palette:{sky:'#83a0ab',horizon:'#d2d4bf',floor:'#ada38a',floorDark:'#908874',wall:'#c1b497',accent:'#587ca8',dark:'#6c6c65',glass:'#99b5c0',fog:'#bcbda5'},
      blocks:[[5,4,6,2,1],[5,9,2,6,3],[9,10,2,2,1],[13,11,3,3,3],[19,4,2,7,1],[23,7,3,2,2],[21,13,5,2,1],[19,18,2,4,3],[9,18,5,2,1],[4,20,3,2,2],[24,21,3,3,1],[13,4,2,3,2]],
      ffa:[[2.5,23.5],[3.5,12.5],[8.5,2.5],[17.5,7.5],[27.5,3.5],[27.5,12.5],[23.5,18.5],[16.5,24.5],[8.5,16.5],[16.5,15.5]],
      points:[['A',8.5,8.5],['B',14.5,16.5],['C',23.5,11.5]],
      orbs:[['health',3.5,7.5],['shield',11.5,8.5],['health',22.5,4.5],['shield',27.5,17.5],['health',16.5,21.5],['shield',7.5,23.5]],
      landmarks:[['monument','UNITY MONUMENT',14.5,10.5,1.3],['steps','CIVIC STEPS',16.5,17.9,1.5],['clock','PLAZA CLOCK',22.5,9.3,1.2]],
      zones:[['BLUE PROMENADE',3,24],['WEST ARCADE',8,8],['UNITY MONUMENT',14,12],['CIVIC STEPS',15,18],['PLAZA CLOCK',23,10],['EAST PROMENADE',25,19]]})
  ];C.MAPS=MAPS;
})(typeof window!=='undefined'?window:globalThis);
