// Disposable installed-sandbox check. The caller may temporarily pause one local relay.
import {chromium,expect} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {getPublicKey} from 'nostr-tools/pure';
const adb=(...a)=>execFileSync('.android-local/sdk/platform-tools/adb',a,{encoding:'utf8'}).trim();
let browser;
await expect.poll(async()=>{try{const pid=adb('shell','pidof','it.bitpolito.hub.sandbox');adb('forward','tcp:9222',`localabstract:webview_devtools_remote_${pid}`);browser=await chromium.connectOverCDP('http://127.0.0.1:9222',{noDefaults:true,timeout:3000});return true;}catch{return false;}},{timeout:60000}).toBe(true);
const page=browser.contexts()[0].pages()[0];
const native=(plugin,method,args={})=>page.evaluate(({plugin,method,args})=>window.Capacitor.nativePromise(plugin,method,args),{plugin,method,args});
const command=async(action,input={})=>(await native('BitPolitoHub','execute',{action,input})).value;
let request;
try{
 await page.waitForFunction(()=>window.Capacitor?.nativePromise);
 const configuration=await native('BitPolito','configuration');
 if(!configuration.sandbox||configuration.transport!=='marmot')throw Error('Only the disposable native relay sandbox may be tested.');
 const user=(await command('me')).user;
 const fixtures=[1,2,3,6].map(n=>{const k=new Uint8Array(32);k[31]=n;return getPublicKey(k);});
 if(!user||!fixtures.includes(user.id))throw Error('Connect a disposable fixture first.');
 const state=await command('moo');
 if(state.presence.some(p=>p.id===user.id)||!state.presence.length||state.own&&['waiting','claimed'].includes(state.own.status))throw Error('Use an outside fixture with no active request and at least one present teammate.');
 const key=crypto.randomUUID();
 request=await command('ring',{key});expect(request.status).toBe('waiting');
 expect((await command('ring',{key})).id).toBe(request.id);
 await command('request',{id:request.id,action:'cancel'});
 await page.reload();
 expect((await command('moo')).own.status).toBe('cancelled');
 expect((await command('ring',{key})).status).toBe('cancelled');
 expect((await native('BitPolito','alertsStatus')).listening).toBe(false);
 console.log('PASS: one-relay publication, duplicate retry, cancellation, reload and stopped requester listener. No application backend used.');
}finally{
 if(request)try{const state=await command('moo');if(state.own?.id===request.id&&['waiting','claimed'].includes(state.own.status))await command('request',{id:request.id,action:'cancel'});}catch{}
 await browser.close();
}
