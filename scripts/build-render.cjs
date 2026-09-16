'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.join(__dirname,'..');
if(process.env.FIREBASE_CONFIG_JSON){
  let config;try{config=JSON.parse(process.env.FIREBASE_CONFIG_JSON);}catch{throw new Error('FIREBASE_CONFIG_JSON must be a valid JSON object. Values have not been logged.');}
  require('../dist/core.js');require('../dist/network.js');
  const publicConfig=globalThis.CA.FirebaseArena.validateConfig(config);
  fs.writeFileSync(path.join(root,'dist/config.js'),'/* Public Firebase Web config, generated at build time. */\nwindow.CHEAT_ARENA_FIREBASE = '+JSON.stringify(publicConfig,null,2)+';\n');
  console.log('Public Firebase Web config generated.');
}
for(const args of [['scripts/validate.cjs'],['--test','tests/core.test.cjs']]){
  const result=cp.spawnSync(process.execPath,args,{cwd:root,stdio:'inherit'});if(result.status!==0)process.exit(result.status||1);
}
console.log('CHEAT ARENA ready. Publish directory: dist');
