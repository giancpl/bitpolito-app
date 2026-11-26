// Native notification-coordinator simulation. This does not contact Firebase.
import {chromium,expect} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {finalizeEvent,getPublicKey} from 'nostr-tools/pure';
import {createHash,randomUUID} from 'node:crypto';
const adb=(...args)=>execFileSync('.android-local/sdk/platform-tools/adb',args,{encoding:'utf8'}).trim();
const pid=adb('shell','pidof','it.bitpolito.hub.sandbox');adb('forward','tcp:9222',`localabstract:webview_devtools_remote_${pid}`);
const browser=await chromium.connectOverCDP('http://127.0.0.1:9222',{noDefaults:true});const page=browser.contexts()[0].pages()[0];
const check=expect.configure({timeout:20000});page.setDefaultTimeout(20000);
const native=(method,args={})=>page.evaluate(({method,args})=>window.Capacitor.nativePromise('BitPolito',method,args),{method,args});
const config=await native('configuration');if(!config.sandbox||config.origin!=='http://127.0.0.1:3280')throw Error('Only the disposable local sandbox is allowed.');
const call=async(path,body)=>JSON.parse((await native('request',{path:'/api'+path,method:body?'POST':'GET',...(body?{body:JSON.stringify(body)}:{})})).body);
const notify=(request,phase='ring')=>adb('shell','am','broadcast','-a','it.bitpolito.hub.sandbox.SIMULATE_PUSH','-n','it.bitpolito.hub.sandbox/it.bitpolito.hub.SandboxPushReceiver','--es','request',request,'--es','phase',phase);
const notification=()=>adb('shell','dumpsys','notification','--noredact').split('\n').find(line=>line.includes('NotificationRecord(')&&line.includes('pkg=it.bitpolito.hub.sandbox'))||'';
async function client(n){
 const key=new Uint8Array(32);key[31]=n;
 const challenge=await (await fetch(config.origin+'/api/auth/android/challenge',{method:'POST',headers:{'Content-Type':'application/json','X-Bitpolito-Request':'1'},body:'{}'})).json();
 const body=JSON.stringify(challenge),event=finalizeEvent({kind:27235,created_at:Math.floor(Date.now()/1000),content:'',tags:[['u',config.origin+'/api/auth/android/session'],['method','POST'],['payload',createHash('sha256').update(body).digest('hex')]]},key);
 const response=await fetch(config.origin+'/api/auth/android/session',{method:'POST',headers:{'Content-Type':'application/json','X-Bitpolito-Request':'1',Authorization:'Nostr '+Buffer.from(JSON.stringify(event)).toString('base64')},body});
 if(!response.ok)throw Error('Fixture authentication failed');const {token}=await response.json();
 return {id:getPublicKey(key),call:async(path,body)=>{const r=await fetch(config.origin+'/api'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','X-Bitpolito-Request':'1'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};}};
}
try{
 const me=(await call('/me')).user;
 if(me){if(await page.getByRole('link',{name:'Profile',exact:true}).count())await page.getByRole('link',{name:'Profile',exact:true}).click();await page.getByRole('button',{name:'Sign out',exact:true}).click();}
 await page.getByLabel('Test identity',{exact:true}).selectOption('0');await page.getByRole('button',{name:'Use Alice test identity',exact:true}).click();await check(page.getByRole('link',{name:'Home',exact:true})).toBeVisible();await page.getByRole('link',{name:'Home',exact:true}).click();
 await call('/moo/presence',{action:'arrive'});const cara=await client(3);await cara.call('/moo/presence',{action:'leave'});
 adb('shell','pm','grant','it.bitpolito.hub.sandbox','android.permission.POST_NOTIFICATIONS');adb('shell','input','keyevent','3');
 const ring=await cara.call('/moo/requests',{key:randomUUID()});expect(ring.status,JSON.stringify(ring.data)).toBe(200);
 notify(ring.data.id);await check.poll(notification).not.toBe('');const first=notification();
 notify(ring.data.id);expect(notification()).toBe(first);
 await call('/moo/presence',{action:'leave'});await check.poll(notification).toBe('');
 notify(ring.data.id);expect(notification()).toBe('');
 await cara.call(`/moo/requests/${ring.data.id}`,{action:'cancel'});await call('/moo/presence',{action:'arrive'});
 notify(ring.data.id);expect(notification()).toBe('');notify(randomUUID());expect(notification()).toBe('');
 await call('/moo/presence',{action:'leave'});
 adb('shell','am','start','-n','it.bitpolito.hub.sandbox/it.bitpolito.hub.MainActivity','--es','request',ring.data.id);
 await check.poll(()=>new URL(page.url()).searchParams.get('request')).toBe(ring.data.id);
 await page.getByRole('link',{name:'Home',exact:true}).click();
 console.log('PASS: native background notification simulation, duplicate suppression, leaving, cancelled/unknown request suppression and notification deep link. Real FCM delivery NOT tested.');
}finally{await browser.close();}
