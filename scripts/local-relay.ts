/** Development-only persistent Nostr relay. Binds loopback; never uses public relays. */
import { createServer } from 'node:http';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import Database from 'better-sqlite3';
import { WebSocketServer, WebSocket } from 'ws';
import { verifyEvent, type Event } from 'nostr-tools/pure';
import { matchFilters, type Filter } from 'nostr-tools/filter';

const port = Number(process.argv[2] || 3480);
if (![3480,3481].includes(port)) throw Error('Local relays use ports 3480 and 3481');
const file = resolve(process.env.LOCAL_RELAY_DATABASE || `data/relay-sandbox/${port}.sqlite`);
mkdirSync(dirname(file), {recursive:true});
const db=new Database(file);
db.pragma('journal_mode = WAL');
db.exec('CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY,created INTEGER NOT NULL,raw TEXT NOT NULL)');
const http=createServer((req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Content-Type','application/nostr+json');
  res.end(JSON.stringify({name:'BitPolito local test relay',supported_nips:[1,11,42],limitation:{max_message_length:2097152,max_content_length:1048576}}));
});
const server=new WebSocketServer({server:http,maxPayload:2097152});
const subscriptions=new Map<WebSocket,Map<string,Filter[]>>();
function send(ws:WebSocket,value:unknown){if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(value));}
server.on('connection',ws=>{
  const own=new Map<string,Filter[]>();subscriptions.set(ws,own);
  ws.on('close',()=>subscriptions.delete(ws));
  ws.on('message',raw=>{
    try{
      const message=JSON.parse(raw.toString());
      if(!Array.isArray(message))throw Error('Expected a Nostr message');
      if(message[0]==='AUTH'){send(ws,['OK',message[1]?.id,true,'']);return;}
      if(message[0]==='CLOSE'){own.delete(message[1]);return;}
      if(message[0]==='REQ'){
        const id=String(message[1]);const filters=message.slice(2) as Filter[];
        if(!filters.length||filters.length>20||own.size>=128)throw Error('Subscription limit');
        own.set(id,filters);
        const limit=Math.min(10000,Math.max(...filters.map(f=>f.limit??10000)));
        remaining[id]=limit;
        for(const row of db.prepare('SELECT raw FROM events ORDER BY created DESC,id LIMIT 10000').all() as {raw:string}[]){
          const event=JSON.parse(row.raw) as Event;
          if(matchFilters(filters,event)){send(ws,['EVENT',id,event]);if(--remaining[id]===0)break;}
        }
        send(ws,['EOSE',id]);return;
      }
      if(message[0]==='EVENT'){
        const event=message[1] as Event;
        if(!event||!verifyEvent(event)){send(ws,['OK',event?.id||'',false,'invalid: signature']);return;}
        const existing=db.prepare('SELECT id FROM events WHERE id=?').get(event.id);
        if(!existing){
          // Test relays retain regular and addressable records; clients select the latest.
          if(event.kind<20000||event.kind>=30000)db.prepare('INSERT INTO events VALUES (?,?,?)').run(event.id,event.created_at,JSON.stringify(event));
          for(const [peer,filters] of subscriptions)for(const [id,list] of filters)if(matchFilters(list,event))send(peer,['EVENT',id,event]);
        }
        send(ws,['OK',event.id,true,existing?'duplicate: already stored':'']);return;
      }
    }catch{send(ws,['NOTICE','Invalid or unsupported relay message']);}
  });
  const remaining:Record<string,number>={};
});
http.listen(port,'127.0.0.1',()=>console.log(`Local Nostr relay: ws://127.0.0.1:${port} · ${file}`));
function close(){for(const peer of server.clients)peer.terminate();server.close();http.close(()=>{db.close();process.exit(0);});}
process.on('SIGTERM',close);process.on('SIGINT',close);
