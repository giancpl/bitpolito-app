// Tests the real signing worker and Android file picker without writing or replacing the saved vault.
import {chromium,expect} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
const adb=(...args)=>execFileSync('.android-local/sdk/platform-tools/adb',args,{encoding:'utf8'}).trim();
const pid=adb('shell','pidof','it.bitpolito.hub.sandbox');adb('forward','tcp:9222',`localabstract:webview_devtools_remote_${pid}`);
const browser=await chromium.connectOverCDP('http://127.0.0.1:9222',{noDefaults:true});
const page=browser.contexts()[0].pages()[0],check=expect.configure({timeout:30000});
const native=(method,args={})=>page.evaluate(({method,args})=>window.Capacitor.nativePromise('BitPolito',method,args),{method,args});
const fingerprint=async()=>createHash('sha256').update((await native('vaultRead')).value||'').digest('hex');
const workerFile=readdirSync('android/app/src/main/assets/public/assets').find(name=>name.startsWith('vault-worker-')&&name.endsWith('.js'));
const filename=`bitpolito-worker-recovery-${Date.now()}.ncryptsec`,password='Disposable recovery test password 2026';
let before;
function nodes(){try{adb('shell','uiautomator','dump','--compressed','/sdcard/bitpolito-recovery-ui.xml');return adb('shell','cat','/sdcard/bitpolito-recovery-ui.xml');}catch{return '';}}
function tap(xml,pattern){const node=[...xml.matchAll(/<node\b[^>]+>/g)].map(m=>m[0]).find(s=>pattern.test(s));if(!node)throw Error('File picker control missing');const b=node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);adb('shell','input','tap',String(Math.round((+b[1]+ +b[3])/2)),String(Math.round((+b[2]+ +b[4])/2)));}
try{
 const config=await native('configuration');if(!config.sandbox||config.transport!=='marmot')throw Error('Only the distributed sandbox may be tested.');
 before=await fingerprint();
 await page.evaluate(({workerFile})=>{
   let worker,serial=0;const waiting=new Map();
   window.__recoveryReset=()=>{worker?.terminate();worker=new Worker(`/assets/${workerFile}`,{type:'module'});worker.onmessage=({data})=>{const p=waiting.get(data.id);waiting.delete(data.id);data.error?p.reject(Error(data.error)):p.resolve(data.value);};};
   window.__recoveryCall=(action,payload)=>new Promise((resolve,reject)=>{const id=++serial;waiting.set(id,{resolve,reject});worker.postMessage({id,action,payload});});
   window.__recoveryReset();
 },{workerFile});
 const record=await page.evaluate(password=>window.__recoveryCall('create',{password}),password);expect(record.encrypted.startsWith('ncryptsec1')).toBe(true);
 async function exportFile(){await page.evaluate(({content,name})=>{window.__backupResult='waiting';void window.Capacitor.nativePromise('BitPolito','exportBackup',{content,name}).then(()=>window.__backupResult='saved',e=>window.__backupResult=e.message||'cancelled');},{content:record.encrypted,name:filename});}
 await exportFile();await check.poll(()=>nodes().includes('com.google.android.documentsui')).toBe(true);adb('shell','input','keyevent','4');
 await check.poll(()=>page.evaluate(()=>window.__backupResult)).not.toBe('waiting');expect(await page.evaluate(()=>window.__backupResult)).not.toBe('saved');
 await exportFile();let xml;await check.poll(()=>{xml=nodes();return /action_menu_save|text="SAVE"|text="Save"/.test(xml);}).toBe(true);tap(xml,/action_menu_save|text="SAVE"|text="Save"/);
 await check.poll(()=>page.evaluate(()=>window.__backupResult)).toBe('saved');
 expect(adb('shell','cat',`/sdcard/Download/${filename}`)).toBe(record.encrypted);
 await page.evaluate(()=>{window.__recoveryReset();});
 const wrong=await page.evaluate(async({encrypted})=>window.__recoveryCall('unlock',{encrypted,password:'wrong password'}).then(()=>false,()=>true),record);expect(wrong).toBe(true);
 await page.evaluate(()=>{window.__importResult=null;void window.Capacitor.nativePromise('BitPolito','importBackup',{}).then(result=>window.__importResult=result.content);});
 await check.poll(()=>{xml=nodes();return xml.includes(filename);}).toBe(true);tap(xml,new RegExp(`text="${filename.replace(/[.]/g,'\\.')}"`));
 await check.poll(()=>page.evaluate(()=>window.__importResult)).toBe(record.encrypted);
 const restored=await page.evaluate(password=>window.__recoveryCall('restore',{key:window.__importResult,password}),password);expect(restored.pubkey).toBe(record.pubkey);
 await page.evaluate(()=>window.__recoveryReset());
 expect(await page.evaluate(()=>window.__recoveryCall('sign',{event:{kind:30078,created_at:1,tags:[],content:'test'}}).then(()=>false,()=>true))).toBe(true);
 expect(await fingerprint()).toBe(before);
 console.log('PASS: real worker NIP-49 creation, native save/cancellation/import, wrong password, restore and locked worker; existing vault unchanged. No identity published.');
}finally{
 await page.evaluate(()=>window.__recoveryReset?.()).catch(()=>{});
 adb('shell','rm','-f',`/sdcard/Download/${filename}`,'/sdcard/bitpolito-recovery-ui.xml');
 await browser.close();
}
