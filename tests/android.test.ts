import {beforeEach,afterEach,it,expect} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {generateSecretKey,getPublicKey,finalizeEvent} from 'nostr-tools/pure';
import {createApp,hash} from '../server/app.js';
const origin='http://127.0.0.1:3280';
let service:Awaited<ReturnType<typeof createApp>>,dir:string,now:number,sent:{token:string;data:Record<string,string>}[],failToken='';
const keys=[generateSecretKey(),generateSecretKey(),generateSecretKey()],ids=keys.map(getPublicKey);
const headers={'x-bitpolito-request':'1'};
const call=(url:string,token?:string,body?:unknown,method:any=body===undefined?'GET':'POST')=>service.app.inject({url,method,headers:{...headers,...(token?{authorization:`Bearer ${token}`}:{})},...(body===undefined?{}:{payload:body as any})});
async function signature(index=0,challenge?:string,path='/api/auth/android/session',patch?:Record<string,unknown>){
  const nonce=challenge||(await call('/api/auth/android/challenge',undefined,{})).json().challenge;
  const payload=JSON.stringify({challenge:nonce}),event=finalizeEvent({kind:27235,created_at:now,content:'',tags:[['u',origin+path],['method','POST'],['payload',hash(payload)]],...patch},keys[index]);
  return {payload,event};
}
async function login(index=0){const {payload,event}=await signature(index);const r=await service.app.inject({url:'/api/auth/android/session',method:'POST',payload,headers:{...headers,'content-type':'application/json',authorization:`Nostr ${Buffer.from(JSON.stringify(event)).toString('base64')}`}});expect(r.statusCode,r.body).toBe(200);return r.json().token as string;}
beforeEach(async()=>{dir=await mkdtemp(join(tmpdir(),'bitpolito-android-'));now=1800000000;sent=[];failToken='';service=await createApp({dataDir:dir,origin,relays:[],pushPublicKey:'',pushPrivateKey:''},{workers:false,clock:()=>now,androidPushSender:async(token,data)=>{if(token===failToken)throw Error('Provider unavailable');sent.push({token,data});}});for(let i=0;i<3;i++)service.store.sqlite.prepare('INSERT INTO users(pubkey,name,role,created_at) VALUES (?,?,?,?)').run(ids[i],['Alice','Bob','Cara'][i],i===0?'admin':'member',now);});
afterEach(async()=>{await service.app.close();await rm(dir,{recursive:true,force:true});});
it('binds native signatures and rejects replay, expiry and cross-client challenges',async()=>{
  const attempt=async(x:Awaited<ReturnType<typeof signature>>)=>service.app.inject({url:'/api/auth/android/session',method:'POST',payload:x.payload,headers:{...headers,'content-type':'application/json',authorization:`Nostr ${Buffer.from(JSON.stringify(x.event)).toString('base64')}`}});
  const signed=await signature();expect((await attempt(signed)).statusCode).toBe(200);expect((await attempt(signed)).statusCode).toBe(401);
  expect((await attempt(await signature(0,undefined,'/api/auth/session'))).statusCode).toBe(401);
  expect((await attempt(await signature(0,undefined,undefined,{created_at:now-61}))).statusCode).toBe(401);
  const c=(await call('/api/auth/challenge')).json().challenge;expect((await attempt(await signature(0,c))).statusCode).toBe(401);
  const expired=await signature();now+=61;expect((await attempt(expired)).statusCode).toBe(401);
  const corrupt=await signature();corrupt.event.sig='0'.repeat(128);expect((await attempt(corrupt)).statusCode).toBe(401);
});
it('keeps browser cookies and native tokens separate and enforces current membership',async()=>{
  const token=await login();expect((await call('/api/resources',token)).statusCode).toBe(200);
  expect((await service.app.inject({url:'/api/resources',headers:{cookie:`bp_session=${token}`}})).statusCode).toBe(401);
  expect((await service.app.inject({url:'/api/me',headers:{authorization:`Bearer ${token}`,cookie:`bp_session=${token}`}})).statusCode).toBe(400);
  service.store.sqlite.prepare("UPDATE users SET role='follower' WHERE pubkey=?").run(ids[0]);expect((await call('/api/resources',token)).statusCode).toBe(403);
});
it('delivers to present members without VAPID and persists per-device deduplication',async()=>{
  const token=await login();await call('/api/push/android/devices',token,{installationId:randomUUID(),token:'fcm-token-alice-1234567890'});
  service.moo.presence(ids[0],'arrive');const r=service.moo.ring(ids[2],randomUUID());
  await service.android.drain();await service.android.drain();expect(sent).toHaveLength(1);expect(sent[0].data.request).toBe(r.id);expect(JSON.stringify(sent[0])).not.toContain('Alice');expect(Object.keys(sent[0].data).sort()).toEqual(['expiresAt','phase','request']);
  now+=60;await service.android.drain();expect(sent).toHaveLength(2);expect(sent[1].data.phase).toBe('reminder');
  service.moo.presence(ids[0],'leave');await service.android.drain();expect(sent).toHaveLength(2);
  expect(service.store.sqlite.prepare("SELECT count(*) AS n FROM android_deliveries WHERE status='sent'").get()).toEqual({n:2});
});
it('retries failed devices without repeating successful deliveries and removes revoked devices',async()=>{
  const token=await login();await call('/api/push/android/devices',token,{installationId:randomUUID(),token:'fcm-token-success-1234567890'});await call('/api/push/android/devices',token,{installationId:randomUUID(),token:'fcm-token-failure-1234567890'});
  service.moo.presence(ids[0],'arrive');service.moo.ring(ids[2],randomUUID());failToken='fcm-token-failure-1234567890';await service.android.drain();expect(sent).toHaveLength(1);failToken='';now+=2;await service.android.drain();expect(sent).toHaveLength(2);expect(sent.map(s=>s.token)).toContain('fcm-token-failure-1234567890');
  await call('/api/auth/logout',token,{});expect((await call('/api/moo/state',token)).statusCode).toBe(401);expect(service.store.sqlite.prepare('SELECT count(*) AS n FROM android_devices').get()).toEqual({n:0});
});
it('makes leaving, claim and expiry obsolete before any provider send',async()=>{
  const token=await login();await call('/api/push/android/devices',token,{installationId:randomUUID(),token:'fcm-token-alice-1234567890'});service.moo.presence(ids[0],'arrive');service.moo.presence(ids[1],'arrive');const r=service.moo.ring(ids[2],randomUUID());service.moo.action(ids[1],r.id,'claim');await service.android.drain();expect(sent).toHaveLength(0);now+=301;await service.android.drain();expect(sent).toHaveLength(0);
});
it('restores native sessions and pending device deliveries after backend restart',async()=>{
  const token=await login();await call('/api/push/android/devices',token,{installationId:randomUUID(),token:'fcm-token-restart-1234567890'});
  service.moo.presence(ids[0],'arrive');const request=service.moo.ring(ids[2],randomUUID());
  await service.app.close();
  service=await createApp({dataDir:dir,origin,relays:[],pushPublicKey:'',pushPrivateKey:''},{workers:false,clock:()=>now,androidPushSender:async(token,data)=>{sent.push({token,data});}});
  expect((await call('/api/moo/state',token)).json().incoming[0].id).toBe(request.id);
  await service.android.drain();await service.android.drain();expect(sent).toHaveLength(1);
});
it('revokes native sessions and devices immediately and releases a claimed request',async()=>{
  const admin=await login(0),bob=await login(1);await call('/api/push/android/devices',bob,{installationId:randomUUID(),token:'fcm-token-revoke-1234567890'});
  service.moo.presence(ids[1],'arrive');const request=service.moo.ring(ids[2],randomUUID());service.moo.action(ids[1],request.id,'claim');
  expect((await call(`/api/admin/members/${ids[1]}`,admin,{role:'follower'},'PUT')).statusCode).toBe(200);
  expect((await call('/api/moo/state',bob)).statusCode).toBe(401);
  expect(service.moo.people().some(p=>p.id===ids[1])).toBe(false);
  expect(service.moo.get(request.id).claimedBy).toBeNull();
  expect(service.store.sqlite.prepare('SELECT count(*) AS n FROM android_devices').get()).toEqual({n:0});
  await service.android.drain();expect(sent).toHaveLength(0);
});
