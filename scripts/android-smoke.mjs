// Opt-in checks on the installed, disposable Android sandbox. Requires adb reverse.
import {chromium,expect} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {finalizeEvent,getPublicKey} from 'nostr-tools/pure';
import {createHash,randomUUID} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
const adb=(...args)=>execFileSync('.android-local/sdk/platform-tools/adb',args,{encoding:'utf8'}).trim();
adb('reverse','tcp:3280','tcp:3280');
const check=expect.configure({timeout:20000});
let browser;
await check.poll(async()=>{
 try{
  const pid=adb('shell','pidof','it.bitpolito.hub.sandbox');
  if(!/^\d+$/.test(pid))return false;
  adb('forward','tcp:9222',`localabstract:webview_devtools_remote_${pid}`);
  browser=await chromium.connectOverCDP('http://127.0.0.1:9222',{noDefaults:true,timeout:3000});return true;
 }catch{return false;}
}).toBe(true);
const page=browser.contexts()[0].pages()[0];page.setDefaultTimeout(20000);
const native=(method,args={})=>page.evaluate(({method,args})=>window.Capacitor.nativePromise('BitPolito',method,args),{method,args});
const config=await native('configuration');if(!config.sandbox||config.origin!=='http://127.0.0.1:3280')throw Error('Only the local disposable sandbox is allowed.');
await mkdir('test-results/android',{recursive:true});
async function client(n){
 const key=new Uint8Array(32);key[31]=n;
 const challenge=await (await fetch(config.origin+'/api/auth/android/challenge',{method:'POST',headers:{'Content-Type':'application/json','X-Bitpolito-Request':'1'},body:'{}'})).json();
 const body=JSON.stringify(challenge),event=finalizeEvent({kind:27235,created_at:Math.floor(Date.now()/1000),content:'',tags:[['u',config.origin+'/api/auth/android/session'],['method','POST'],['payload',createHash('sha256').update(body).digest('hex')]]},key);
 const response=await fetch(config.origin+'/api/auth/android/session',{method:'POST',headers:{'Content-Type':'application/json','X-Bitpolito-Request':'1',Authorization:'Nostr '+Buffer.from(JSON.stringify(event)).toString('base64')},body});
 if(!response.ok)throw Error('Fixture authentication failed');const {token}=await response.json();
 return {id:getPublicKey(key),call:async(path,body)=>{const r=await fetch(config.origin+'/api'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','X-Bitpolito-Request':'1'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};}};
}
try{
 if(await page.getByRole('link',{name:'Profile',exact:true}).count()){
  await page.getByRole('link',{name:'Profile',exact:true}).click();if(await page.getByRole('alertdialog').count())await page.getByRole('button',{name:'Discard changes',exact:true}).click();await page.getByRole('button',{name:'Sign out',exact:true}).click();
 }
 await page.getByLabel('Test identity',{exact:true}).selectOption('0');await page.getByRole('button',{name:'Use Alice test identity',exact:true}).click();
 await check(page.getByRole('link',{name:'Home',exact:true})).toBeVisible();await page.getByRole('link',{name:'Home',exact:true}).click();await check(page.getByRole('heading',{name:'Hi, Alice.',exact:true})).toBeVisible();
 const boundary=await native('request',{path:'/api/auth/android/session',method:'POST',body:'{}'}).then(()=>false,()=>true);expect(boundary).toBe(true);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const nativeCall=async(path,body)=>JSON.parse((await native('request',{path:'/api'+path,method:body?'POST':'GET',...(body?{body:JSON.stringify(body)}:{})})).body);
 console.log('Native login and bridge boundary passed.');
 const bob=await client(2),cara=await client(3);
 await nativeCall('/moo/presence',{action:'arrive'});await bob.call('/moo/presence',{action:'arrive'});await cara.call('/moo/presence',{action:'leave'});
 const previous=(await cara.call('/moo/state')).data.own;if(previous&&['waiting','claimed'].includes(previous.status))await cara.call(`/moo/requests/${previous.id}`,{action:'cancel'});
 const ring=await cara.call('/moo/requests',{key:randomUUID()});expect(ring.status,JSON.stringify(ring.data)).toBe(200);
 await check(page.getByRole('button',{name:'I’ll get the door',exact:true})).toBeVisible();expect(await page.getByRole('dialog').count()).toBe(0);
 const claims=await Promise.all([nativeCall(`/moo/requests/${ring.data.id}`,{action:'claim'}),bob.call(`/moo/requests/${ring.data.id}`,{action:'claim'})]);
 const request=(await cara.call('/moo/state')).data.own;expect([getPublicKey(Uint8Array.from([...new Uint8Array(31),1])),bob.id]).toContain(request.claimedBy);
 expect(claims.filter(r=>r.status===409||r.error)).toHaveLength(1);
 expect((await cara.call(`/moo/requests/${request.id}`,{action:'inside'})).status).toBe(200);
 expect((await cara.call('/moo/state')).data.presence.some(p=>p.id===cara.id)).toBe(true);
 await cara.call('/moo/presence',{action:'leave'});expect((await cara.call('/moo/state')).data.presence.some(p=>p.id===cara.id)).toBe(false);
 await nativeCall('/moo/presence',{action:'leave'});await bob.call('/moo/presence',{action:'leave'});
 console.log('Atomic claim, entry and immediate leave passed.');
 await page.getByRole('link',{name:'Tools',exact:true}).click();await check(page.getByRole('heading',{name:'Tools.',exact:true})).toBeVisible();
 await page.getByRole('link',{name:'Profile',exact:true}).click();await page.getByRole('button',{name:'Office alerts',exact:true}).click();await check(page.getByText('Push not configured for this build',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Test cow sound',exact:true}).click();await check(page.getByText('Did you hear the sound?',{exact:true})).toBeVisible();
 // Deliberately do not confirm hearing: automated playback cannot prove audibility.
 adb('shell','input','keyevent','4');await check(page.getByRole('heading',{name:'Profile',exact:true})).toBeVisible();
 const draft='Native draft '+randomUUID();await page.getByRole('button',{name:'Edit profile',exact:true}).click();await page.getByLabel('About you',{exact:true}).fill(draft);adb('shell','input','keyevent','4');
 const guard=page.getByRole('alertdialog');if(!await check(guard).toBeVisible({timeout:2000}).then(()=>true,()=>false))adb('shell','input','keyevent','4');await check(guard).toBeVisible();await page.getByRole('button',{name:'Cancel',exact:true}).click();await check(page.getByLabel('About you',{exact:true})).toHaveValue(draft);
 await page.getByRole('button',{name:'Save profile',exact:true}).click();await check(page.getByRole('heading',{name:'Profile',exact:true})).toBeVisible();await page.getByRole('button',{name:'Identity & recovery',exact:true}).click();
 await check(page.getByText(/Your signer manages its private key/)).toBeVisible();await page.getByRole('button',{name:'Profile',exact:true}).click();await page.getByRole('button',{name:'Help',exact:true}).click();await check(page.getByRole('heading',{name:'Help',exact:true})).toBeVisible();
 await page.screenshot({path:'test-results/android/help.png'});await page.getByRole('link',{name:'Home',exact:true}).click();await page.screenshot({path:'test-results/android/home.png'});
 console.log('PASS: native authentication boundary, Home/Tools/Profile, atomic claim, inside/leave, Android Back, drafts, Help, sound-test UI. Actual FCM and audibility not certified.');
}finally{await browser.close();}
