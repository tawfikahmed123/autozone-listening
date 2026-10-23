import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const dist=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
assert.equal(html,dist,'source and served dist must match');
const registry=JSON.parse(await readFile(new URL('../dist/data/companies.json',import.meta.url),'utf8'));
assert.equal(new Set(registry.companies.map(c=>c.id)).size,15);
assert(registry.companies.every(c=>c.registry_source.startsWith('https://www.balubaid.com/')));
assert(!html.includes('mockLiveReviews')&&!html.includes('btnSimulateRun'),'no simulated genuine reviews');
const code=html.match(/<script>\s*([\s\S]*?)<\/script>/)[1].replace(/\nload\(\);\s*\}\)\(\);/, '\nglobalThis.test={load,filtered,metrics,companyChanged,companySources,loadActs,saveActs,getTopGood,getTopBad};\n})();');
assert(code.includes('globalThis.test'));
const elements=new Map();
const noop=()=>{};
function element(id){
 if(elements.has(id))return elements.get(id);
 let content='';
 const el={id,value:({fDays:'0',fState:'all',fSent:'all'})[id]||'',textContent:'',selectedOptions:id==='fBranch'||id==='fSource'?[]:[{text:'الكل'}],className:'',disabled:false,style:{},dataset:{},
 classList:{add:noop,remove:noop,toggle:noop},addEventListener:noop,querySelectorAll:()=>[],querySelector:()=>({disabled:false}),
 getBoundingClientRect:()=>({width:600,height:240}),getContext:()=>new Proxy({},{get:()=>noop,set:()=>true})};
 Object.defineProperty(el,'innerHTML',{get:()=>content,set:v=>{content=v;if(id.startsWith('f')){const m=v.match(/<option value="([^"]*)"/);if(m){el.value=m[1];el.selectedOptions=[{text:'الكل'}];}}}});
 elements.set(id,el);return el;
}
element('sampleData').textContent=html.match(/id="sampleData">\s*([\s\S]*?)<\/script>/)[1];
const storage=new Map([['autozone_actions_v1',JSON.stringify([{title:'Existing AutoZone action'}])],['bgc_actions_v1_apico',JSON.stringify([{title:'APICO action'}])]]);
let live=[];
const context=vm.createContext({console,Date,devicePixelRatio:1,addEventListener:noop,alert:noop,
 document:{getElementById:element,querySelectorAll:()=>[],addEventListener:noop,documentElement:{dataset:{theme:'light'}}},
 localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
 fetch:async url=>({ok:true,json:async()=>url.includes('records.json')?{records:live}:{runs:[]}})});
vm.runInContext(code,context);
await context.test.load();
assert.equal(context.test.filtered(false).length,10);

// Top good and bad reviews test per platform for AutoZone
const azRecs = context.test.filtered(false);
const azGood = context.test.getTopGood(azRecs);
const azBad = context.test.getTopBad(azRecs);
assert.equal(azGood.length, 5, 'AutoZone has 5 top good reviews');
assert.equal(azBad.length, 5, 'AutoZone has 5 top bad reviews');

// Platform-specific isolation test
const igRecs = azRecs.filter(r => r.source === 'instagram');
assert.equal(context.test.getTopGood(igRecs).length, 1, 'Instagram has 1 top good review');
assert.equal(context.test.getTopBad(igRecs).length, 1, 'Instagram has 1 top bad review');

const xRecs = azRecs.filter(r => r.source === 'x');
assert.equal(context.test.getTopGood(xRecs).length, 1, 'X has 1 top good review');
assert.equal(context.test.getTopBad(xRecs).length, 2, 'X has 2 top bad reviews');

const gpRecs = azRecs.filter(r => r.source === 'google_places');
assert.equal(context.test.getTopGood(gpRecs).length, 3, 'Google Places has 3 top good reviews');
assert.equal(context.test.getTopBad(gpRecs).length, 2, 'Google Places has 2 top bad reviews');

element('fCompany').value='apico';context.test.companyChanged();
assert.equal(context.test.filtered(false).length,0,'APICO must not inherit AutoZone samples');
assert.equal(context.test.getTopGood(context.test.filtered(false)).length, 0, 'APICO must not inherit AutoZone top good reviews');
assert.equal(context.test.getTopBad(context.test.filtered(false)).length, 0, 'APICO must not inherit AutoZone top bad reviews');
assert.equal(context.test.loadActs()[0].title,'APICO action');
assert(!JSON.stringify(context.test.companySources()).includes('@autozoneksa'),'no AutoZone account leakage');
element('fCompany').value='balubaid_parts';context.test.companyChanged();
assert.equal(context.test.filtered(false).length,0,'parts must not inherit AutoZone samples');
assert.equal(context.test.loadActs().length,0,'parts actions remain separate');
element('fCompany').value='autozone';context.test.companyChanged();
assert.equal(context.test.filtered(false).length,10);
assert.equal(context.test.loadActs()[0].title,'Existing AutoZone action','legacy actions preserved');
context.test.saveActs([{title:'Scoped update'}]);
assert.equal(JSON.parse(storage.get('bgc_actions_v1_apico'))[0].title,'APICO action','AutoZone save must not modify APICO');
element('fState').value='live';assert.equal(context.test.filtered(false).length,0,'verified-only excludes samples');
element('fState').value='all';element('fCompany').value='all';
assert.throws(()=>context.test.saveActs([]),/اختر شركة/,'group editing must require company');
live=[{id:'real-apico',company_id:'apico',data_state:'live',source:'google_places',branch:'factory',text:'record',rating:4,published_at:'2026-10-20'},
{id:'unknown-company',company_id:'unknown',data_state:'live'},
{id:'forged-sample',company_id:'balubaid_parts',data_state:'live',data_origin:'synthetic'}];
await context.test.load();element('fCompany').value='apico';context.test.companyChanged();
assert.equal(context.test.filtered(false).length,1,'genuine APICO record isolated');
assert.equal(context.test.metrics(context.test.filtered(false)).rating.v,4);
assert.equal(context.test.getTopGood(context.test.filtered(false)).length, 1, 'genuine APICO 4-star counts as top good');
assert.equal(context.test.getTopBad(context.test.filtered(false)).length, 0, 'genuine APICO has 0 bad reviews');
element('fCompany').value='balubaid_parts';context.test.companyChanged();
assert.equal(context.test.filtered(false).length,0,'synthetic cannot count as genuine');
element('fCompany').value='all';context.test.companyChanged();
assert.equal(context.test.filtered(false).length,11,'group combines eligible real data and labelled samples only');
const collector=await readFile(new URL('../backend/collect-google-places.mjs',import.meta.url),'utf8');
new vm.Script(code);
assert(collector.includes('company_id:b.company_id'));
console.log('PASS: 15-entry registry, source/dist parity, script syntax, company record isolation, source identity isolation, action storage isolation, legacy preservation, group mutation guard, synthetic rejection, aggregate eligibility, and platform top good/bad review isolation.');

