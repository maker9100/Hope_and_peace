'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');const root=path.join(__dirname,'..'),dist=path.join(root,'dist');
for(const name of fs.readdirSync(dist).filter(n=>n.endsWith('.js'))){cp.execFileSync(process.execPath,['--check',path.join(dist,name)]);console.log('Syntax OK:',name);}
const html=fs.readFileSync(path.join(dist,'index.html'),'utf8'),game=fs.readFileSync(path.join(dist,'game.js'),'utf8');
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(ids.length,new Set(ids).size,'DOM ids must be unique');
const declared=game.match(/const ids=\[([^\]]+)\]/)[1];for(const [,id]of declared.matchAll(/'([^']+)'/g))assert.ok(ids.includes(id),'Missing DOM ID: '+id);
for(const [,ref]of html.matchAll(/(?:src|href)="([^"]+)"/g)){if(ref.startsWith('#')||/^[a-z]+:/i.test(ref))continue;assert.ok(fs.existsSync(path.join(dist,ref.split(/[?#]/)[0])),'Missing local asset: '+ref);}
JSON.parse(fs.readFileSync(path.join(dist,'database.rules.json'),'utf8'));
assert.ok(!/showToast\s*\(/.test(fs.readFileSync(path.join(dist,'core.js'),'utf8')+game),'No undefined showToast calls');
assert.ok(!/style\.display/.test(game),'State-driven screen visibility required');
for(const name of fs.readdirSync(dist).filter(n=>n.endsWith('.js'))){const text=fs.readFileSync(path.join(dist,name),'utf8');assert.ok(!/THREE\.|from ['"]three|three\.min/.test(text),'No 3D engine: '+name);assert.ok(!/BEGIN (?:RSA )?PRIVATE KEY/.test(text),'No private key material');}
console.log('DOM OK:',ids.length,'unique IDs; all core references and local assets resolve.');console.log('Rules JSON OK; no general 3D engine or display toggling.');
