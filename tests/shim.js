// In-memory GAS shim so the real Code.gs runs in the browser
(function(){
const sheets={};
function Sheet(name){this.name=name;this.rows=[]}
Sheet.prototype.appendRow=function(r){this.rows.push(r.slice())};
Sheet.prototype.setFrozenRows=function(){};
Sheet.prototype.getLastRow=function(){return this.rows.length};
Sheet.prototype.deleteRow=function(i){this.rows.splice(i-1,1)};
Sheet.prototype.getDataRange=function(){return this.getRange(1,1,this.rows.length,3)};
Sheet.prototype.getRange=function(r,c,nr,nc){const sh=this;if(typeof r==='string')return{setNumberFormat(){}};nr=nr||1;nc=nc||1;return{
 getValues(){const o=[];for(let i=0;i<nr;i++){const row=sh.rows[r-1+i]||[];const x=[];for(let j=0;j<nc;j++)x.push(row[c-1+j]===undefined?'':row[c-1+j]);o.push(x)}return o},
 setValues(v){for(let i=0;i<nr;i++)for(let j=0;j<nc;j++){sh.rows[r-1+i][c-1+j]=v[i][j]}},
 setValue(v){sh.rows[r-1][c-1]=(typeof v==='string'&&/^\d+$/.test(v)&&!sh.text)?Number(v):v}}};
window.SpreadsheetApp={getActive(){return{getSheetByName(n){return sheets[n]||null},insertSheet(n){return sheets[n]=new Sheet(n)}}},getActiveSpreadsheet(){return this.getActive()}};
window.__sheets=sheets;
const files={};let fid=0;
function blob(bytes,mime,name){return{bytes,mime,name,getBytes(){return this.bytes},getContentType(){return this.mime}}}
window.DriveApp={getFoldersByName(){const f={createFile(b){const id='F'+(++fid);files[id]={b,trashed:false};return{getId:()=>id,getName:()=>b.name}}};let used=false;return{hasNext(){return!used&&window.__folder},next(){used=true;return f}}},createFolder(){window.__folder=true;return this.getFoldersByName().next()},
 getFileById(id){const f=files[id];if(!f)throw new Error('no file');return{getBlob:()=>f.b,getName:()=>f.b.name,setTrashed(t){f.trashed=t}}}};
window.__files=files;
window.Utilities={getUuid(){return Math.random().toString(16).slice(2,10)+'-x'},formatDate(d){return d.toISOString().slice(0,16).replace('T',' ')},
 base64Encode(b){let s='';for(const x of b)s+=String.fromCharCode(x&255);return btoa(s)},base64Decode(s){const t=atob(s);return Array.from(t,c=>c.charCodeAt(0))},newBlob:blob};
window.LockService={getScriptLock(){return{waitLock(){},releaseLock(){}}}};
const props={ANTHROPIC_API_KEY:'test'};
window.PropertiesService={getScriptProperties(){return{getProperty:k=>props[k],setProperty:(k,v)=>props[k]=v}}};
window.ContentService={MimeType:{JSON:1},createTextOutput(t){return{setMimeType(){return this},t}}};
window.__mockParsed={kind:'見積書',company:'山田工務店',date:'2026-11-05',subtotal:1000000,tax:100000,total:1100000,title:'テスト'};
window.UrlFetchApp={fetch(url,o){const body=JSON.parse(o.payload);window.__aiCalls=(window.__aiCalls||0)+1;return{getResponseCode:()=>200,getContentText:()=>JSON.stringify({content:[{type:'text',text:'```json\n'+JSON.stringify(window.__mockParsed)+'\n```'}]})}}};
window.fetch=async function(url,o){const out=doPost({postData:{contents:o.body}});return{json:async()=>JSON.parse(out.t)}};
})();
