import { resolve } from 'node:path';
import { createApp } from '../server/app.js';
import { getPublicKey } from 'nostr-tools/pure';
import { sandboxProfiles, sandboxKey } from '../shared/sandbox.js';
if(process.env.NODE_ENV==='production')throw Error('The Android sandbox is local development only');
const service=await createApp({dataDir:resolve('data/android-sandbox'),host:'127.0.0.1',port:3280,origin:'http://127.0.0.1:3280',cookieSecure:false,relays:[]});
for(const profile of sandboxProfiles){const key=sandboxKey(profile.key);service.store.sqlite.prepare('INSERT OR IGNORE INTO users(pubkey,name,role,created_at) VALUES (?,?,?,?)').run(getPublicKey(key),profile.name,profile.role,Math.floor(Date.now()/1000));key.fill(0);}
await service.app.listen({host:'127.0.0.1',port:3280});
console.log('Android sandbox: adb reverse tcp:3280 tcp:3280 · separate data/android-sandbox');
for(const signal of ['SIGTERM','SIGINT'] as const)process.once(signal,()=>void service.app.close().then(()=>process.exit(0)));
