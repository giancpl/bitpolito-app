import { existsSync } from 'node:fs';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type Database from 'better-sqlite3';
import { verifyEvent } from 'nostr-tools/pure';
import { authSchema, signedEventSchema, androidDeviceSchema } from '../shared/contracts.js';
import type { Config } from './config.js';
import type { Moo } from './moo.js';
import { fail } from './errors.js';
const digest = (s: string) => createHash('sha256').update(s).digest('hex');
export type AndroidSender = (token: string, data: Record<string, string>) => Promise<unknown>;
export function androidSupport(app: FastifyInstance, sql: Database.Database, moo: Moo, config: Config, sender?: AndroidSender) {
  const configured = !!sender || !!(process.env.FIREBASE_PROJECT_ID && process.env.GOOGLE_APPLICATION_CREDENTIALS && existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS));
  let firebase: AndroidSender | undefined;
  const send: AndroidSender = async (token, data) => {
    if (sender) return sender(token, data);
    if (!firebase) {
      const { initializeApp, applicationDefault, getApps } = await import('firebase-admin/app');
      const { getMessaging } = await import('firebase-admin/messaging');
      const admin = getApps().find(a => a.name === 'bitpolito-android') || initializeApp({credential: applicationDefault(), projectId: process.env.FIREBASE_PROJECT_ID}, 'bitpolito-android');
      firebase = (token, data) => getMessaging(admin).send({ token, data, android: {priority:'high', ttl: 30000} });
    }
    return firebase(token, data);
  };
  function member(req: FastifyRequest) {
    if (!req.user) fail(401, 'Sign in to continue');
    if (req.user.role === 'follower') fail(403, 'Member access required');
    return req.user;
  }
  app.post('/api/auth/android/challenge', {config:{rateLimit:{max:30,timeWindow:'1 minute'}}}, async () => {
    const challenge = randomBytes(32).toString('hex');
    sql.prepare('DELETE FROM challenges WHERE expires_at<=?').run(moo.clock());
    sql.prepare("INSERT INTO challenges(nonce,expires_at,client) VALUES (?,?,'android')").run(challenge,moo.clock()+60);
    return {challenge};
  });
  app.post('/api/auth/android/session', {config:{rateLimit:{max:30,timeWindow:'1 minute'}}}, async req => {
    const body = authSchema.parse(req.body);
    let event;
    try {
      if (!req.headers.authorization?.startsWith('Nostr ')) throw Error();
      event = signedEventSchema.parse(JSON.parse(Buffer.from(req.headers.authorization.slice(6),'base64').toString()));
    } catch { return fail(401,'A valid Nostr signature is required'); }
    const tags = (name:string) => event.tags.filter(t => t[0]===name);
    const bound = (name:string,value:string) => tags(name).length===1 && tags(name)[0][1]===value;
    if (!verifyEvent(event) || event.kind!==27235 || event.content!=='' || Math.abs(event.created_at-moo.clock())>60 ||
        !bound('u',`${config.origin}/api/auth/android/session`) || !bound('method','POST') || !bound('payload',digest(req.rawBody))) fail(401,'Authentication request binding is invalid');
    const token = randomBytes(32).toString('hex');
    sql.transaction(() => {
      if (!sql.prepare("DELETE FROM challenges WHERE nonce=? AND client='android' AND expires_at>?").run(body.challenge,moo.clock()).changes) fail(401,'Challenge expired or already used');
      sql.prepare('INSERT OR IGNORE INTO users(pubkey,name,created_at) VALUES (?,?,?)').run(event.pubkey,body.name||'',moo.clock());
      if (body.name) sql.prepare('UPDATE users SET name=? WHERE pubkey=?').run(body.name,event.pubkey);
      sql.prepare("INSERT INTO sessions(token,pubkey,expires_at,client) VALUES (?,?,?,'android')").run(digest(token),event.pubkey,moo.clock()+604800);
    })();
    return {token, user:sql.prepare('SELECT pubkey AS id,name,about,role FROM users WHERE pubkey=?').get(event.pubkey)};
  });
  app.get('/api/push/android/devices', async req => {
    const u=member(req);
    return {configured, subscribed:!!sql.prepare('SELECT id FROM android_devices WHERE session_hash=? AND pubkey=?').get(req.sessionHash,u.id)};
  });
  app.post('/api/push/android/devices', async req => {
    const u=member(req), body=androidDeviceSchema.parse(req.body);
    const session = sql.prepare("SELECT token FROM sessions WHERE token=? AND client='android'").get(req.sessionHash);
    if (!session) fail(403,'An Android session is required');
    // Installation ids are scoped to the authenticated identity, not global update rights.
    const id=digest(`${u.id}:${body.installationId}`);
    sql.transaction(() => {
      sql.prepare('DELETE FROM android_devices WHERE token=? AND id<>?').run(body.token,id);
      sql.prepare('INSERT INTO android_devices(id,pubkey,session_hash,token,created_at) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET token=excluded.token,session_hash=excluded.session_hash').run(id,u.id,req.sessionHash,body.token,moo.clock());
    })();
    return {ok:true};
  });
  app.delete('/api/push/android/devices', async req => {
    member(req); sql.prepare('DELETE FROM android_devices WHERE session_hash=?').run(req.sessionHash); return {ok:true};
  });
  app.post('/api/push/android/test', async req => {
    const u=member(req);
    if (!configured || !sql.prepare('SELECT id FROM android_devices WHERE session_hash=?').get(req.sessionHash)) fail(409,'Enable Android notifications first');
    moo.queue(u.id,'test',String(moo.clock()+60),randomUUID()); return {ok:true};
  });
  let busy=false, stopped=false;
  const idle: (()=>void)[]=[];
  async function drain() {
    if (!configured || busy || stopped) return;
    busy=true;
    try {
      moo.settle();
      const rows=sql.prepare(`SELECT j.*,d.id AS device_id,d.token AS device_token,d.session_hash,
        a.status AS delivery_status,a.attempts AS delivery_attempts FROM push_jobs j
        JOIN android_devices d ON d.pubkey=j.pubkey
        JOIN sessions s ON s.token=d.session_hash AND s.expires_at>?
        JOIN users u ON u.pubkey=d.pubkey AND u.role IN ('member','admin')
        LEFT JOIN android_deliveries a ON a.job_id=j.id AND a.device_id=d.id
        WHERE a.id IS NULL OR (a.status='pending' AND a.next_attempt<=?) ORDER BY j.rowid LIMIT 30`).all(moo.clock(),moo.clock()) as any[];
      for (const row of rows) {
        const id=`${row.id}:${row.device_id}`;
        const valid=eligible(row);
        sql.prepare('INSERT OR IGNORE INTO android_deliveries(id,device_id,job_id) VALUES (?,?,?)').run(id,row.device_id,row.id);
        if (!valid) { sql.prepare("UPDATE android_deliveries SET status='obsolete' WHERE id=?").run(id); continue; }
        try {
          // Re-check live membership/session/presence immediately before each provider call.
          if (!eligible(row)) continue;
          await send(row.device_token,{request:row.reference,phase:row.purpose,expiresAt:String(moo.clock()+30)});
          sql.prepare("UPDATE android_deliveries SET status='sent',attempts=attempts+1 WHERE id=?").run(id);
        } catch(e) {
          const code=(e as {code?:string}).code;
          if (['messaging/registration-token-not-registered','messaging/invalid-registration-token'].includes(code||'')) sql.prepare('DELETE FROM android_devices WHERE id=?').run(row.device_id);
          else sql.prepare('UPDATE android_deliveries SET attempts=attempts+1,next_attempt=?,status=? WHERE id=?').run(moo.clock()+Math.min(60,2**(row.delivery_attempts||0)),(row.delivery_attempts||0)>=4?'failed':'pending',id);
        }
      }
    } finally {busy=false;for(const done of idle.splice(0)) done();}
  }
  function eligible(row:any) {
    if (!sql.prepare("SELECT s.token FROM sessions s JOIN users u ON u.pubkey=s.pubkey WHERE s.token=? AND s.expires_at>? AND u.role IN ('member','admin')").get(row.session_hash,moo.clock())) return false;
    if (row.purpose==='test') return Number(row.reference)>moo.clock();
    try {
      const r=moo.get(row.reference);
      if (['ring','reminder'].includes(row.purpose)) return r.status==='waiting' && r.expiresAt>moo.clock() && moo.people().some(p=>p.id===row.pubkey);
      if (row.purpose==='claimed') return r.status==='claimed' && r.expiresAt>moo.clock() && r.requesterId===row.pubkey;
      return ['resolved','cancelled','expired'].includes(r.status) && r.updatedAt>moo.clock()-60;
    } catch {return false;}
  }
  async function stop(){stopped=true;if(busy)await new Promise<void>(resolve=>idle.push(resolve));}
  return {drain,configured,stop};
}
