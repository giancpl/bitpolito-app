/** Browser-only UX fixture. Not a Marmot client; excluded from the team APK. */
import {getPublicKey} from 'nostr-tools/pure';
import {sandboxProfiles,sandboxKey} from '../../shared/sandbox';
import {catalogue} from '../../shared/catalogue';
import type {HubClient} from './hub';
import type {User,Resource,MooRequest} from '../../shared/contracts';
type Request=MooRequest&{responders:{id:string;name:string;until:number}[]};
interface State {users:User[];resources:Resource[];presence:Record<string,number>;requests:Request[];invites:any[];applications:any[]}
const storage='bitpolito.simulator.v1',session='bitpolito.simulator.user';
const now=()=>Math.floor(Date.now()/1000);
function midnight(){const f=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Rome'}),day=f.format(Date.now());let low=now(),high=low+26*3600;while(high-low>1){const mid=Math.floor((low+high)/2);if(f.format(mid*1000)===day)low=mid;else high=mid;}return high;}
function read():State {const raw=localStorage.getItem(storage);if(raw)return JSON.parse(raw);return {users:sandboxProfiles.map(p=>({id:getPublicKey(sandboxKey(p.key)),name:p.name,about:'Disposable preview identity',role:p.role})),resources:catalogue.map(r=>({...r,type:'tool',status:'active',updatedAt:now()})),presence:{},requests:[],invites:[],applications:[]};}
window.addEventListener('storage',e=>{if(e.key===storage)window.dispatchEvent(new Event('bitpolito:realtime'));});
export const simulator:HubClient={
 async connect(signer,name){const s=read();if(!s.users.some(u=>u.id===signer.pubkey))s.users.push({id:signer.pubkey,name:name||'',about:'',role:'follower'});sessionStorage.setItem(session,signer.pubkey);localStorage.setItem(storage,JSON.stringify(s));},
 async command<T>(action:string,data:Record<string,unknown>={}){
  const s=read(),me=s.users.find(u=>u.id===sessionStorage.getItem(session));let result:unknown={ok:true};
  const member=()=>{if(!me||me.role==='follower')throw Error('Member access required');return me;};
  const admin=()=>{const u=member();if(u.role!=='admin')throw Error('Administrator access required');return u;};
  for(const r of s.requests){r.responders=r.responders.filter(p=>p.until>now());if(['waiting','claimed'].includes(r.status)){r.status=r.expiresAt<=now()?'expired':r.responders.length?'claimed':'waiting';r.claimedBy=r.responders[0]?.id||null;r.claimerName=r.responders[0]?.name||null;}}
  switch(action){
   case 'configuration':result={transport:'simulator',sandbox:true,relays:[],timezone:'Europe/Rome',pushPublicKey:null};break;
   case 'status':result={state:'simulator',error:null};break;
   case 'me':result={user:me||null};break;
   case 'logout':sessionStorage.removeItem(session);break;
   case 'createTeam':if(!me)throw Error('Connect your identity first');me.role='admin';break;
   case 'profile':if(!me)throw Error('Connect your identity first');me.name=String(data.name);me.about=String(data.about||'');break;
   case 'resources':member();result=s.resources;break;
   case 'members':admin();result=s.users;break;
   case 'saveResource':admin();{const row={...data,id:data.id||crypto.randomUUID(),updatedAt:now(),icon:data.icon||'icon-linkedin.svg'} as Resource;const old=s.resources.findIndex(r=>r.id===row.id);if(old>=0)s.resources[old]=row;else s.resources.push(row);result=row;}break;
   case 'setRole':admin();{const u=s.users.find(u=>u.id===data.id);if(!u)throw Error('Member not found');if(u.role==='admin'&&data.role!=='admin'&&s.users.filter(u=>u.role==='admin').length===1)throw Error('The last administrator cannot be removed');u.role=data.role as User['role'];if(u.role==='follower')delete s.presence[u.id];}break;
   case 'presence':{const u=member();if(data.action==='leave')delete s.presence[u.id];else s.presence[u.id]=midnight();}break;
   case 'ring':{const u=member();if((s.presence[u.id]||0)>now())throw Error('Choose I’m leaving before ringing');if(!Object.values(s.presence).some(t=>t>now()))throw Error('Nobody is marked as in the office');const own=[...s.requests].reverse().find(r=>r.requesterId===u.id);if(own&&['waiting','claimed'].includes(own.status)){result=own;break;}if(own&&own.createdAt+60>now())throw Error('Wait 60 seconds before ringing again');const r:Request={id:String(data.key),requesterId:u.id,requesterName:u.name,createdAt:now(),updatedAt:now(),expiresAt:now()+180,status:'waiting',responders:[],claimedBy:null,claimerName:null,claimUntil:null,resolvedReason:null};s.requests.push(r);result=r;}break;
   case 'request':{const u=member(),r=s.requests.find(r=>r.id===data.id);if(!r)throw Error('Request not found');if(r.status==='resolved'&&data.action==='inside'){result=r;break;}if(!['waiting','claimed'].includes(r.status))throw Error('This request has ended');if(['inside','cancel'].includes(String(data.action))){if(u.id!==r.requesterId)throw Error('Only the requester can do this');r.status=data.action==='inside'?'resolved':'cancelled';if(data.action==='inside'){s.presence[u.id]=midnight();r.resolvedReason='inside';}}else{if((s.presence[u.id]||0)<=now()||u.id===r.requesterId)throw Error('Only office members can respond');r.responders=r.responders.filter(p=>p.id!==u.id);if(data.action==='claim'){r.responders.push({id:u.id,name:u.name,until:now()+90});r.expiresAt=Math.max(r.expiresAt,Math.min(r.createdAt+300,now()+90));}r.status=r.responders.length?'claimed':'waiting';r.claimedBy=r.responders[0]?.id||null;r.claimerName=r.responders[0]?.name||null;}result=r;}break;
   case 'moo':{const u=member();result={office:'BitPolito Office',serverTime:now(),presence:Object.entries(s.presence).filter(([id,t])=>t>now()&&s.users.some(u=>u.id===id&&u.role!=='follower')).map(([id,expiresAt])=>({id,expiresAt,name:s.users.find(u=>u.id===id)?.name||'Teammate'})),own:[...s.requests].reverse().find(r=>r.requesterId===u.id)||null,incoming:(s.presence[u.id]||0)>now()?s.requests.filter(r=>r.requesterId!==u.id&&['waiting','claimed'].includes(r.status)):[]};}break;
   case 'invites':admin();result=s.invites;break;
   case 'createInvite':admin();{const id=crypto.randomUUID();s.invites.push({id,label:String(data.label),expiresAt:now()+604800,usedAt:null,revokedAt:null});result={token:id};}break;
   case 'revokeInvite':admin();{const invite=s.invites.find(i=>i.id===data.id);if(invite)invite.revokedAt=now();}break;
   case 'join':if(!me)throw Error('Connect your identity first');{const token=String(data.token).split('invite=').pop(),i=s.invites.find(i=>i.id===token);if(!i||i.revokedAt||i.expiresAt<=now())throw Error('Invitation expired');if(i.usedAt)throw Error('Invitation already used');if(!s.applications.some(a=>a.pubkey===me.id&&a.status==='pending'))s.applications.push({id:crypto.randomUUID(),pubkey:me.id,name:me.name,invite:i.id,status:'pending'});result={status:'pending'};}break;
   case 'joinStatus':result={status:[...s.applications].reverse().find(a=>a.pubkey===me?.id)?.status||'none'};break;
   case 'applications':admin();result=s.applications;break;
   case 'reviewApplication':admin();{const a=s.applications.find(a=>a.id===data.id);if(!a)throw Error('Application not found');if(a.status==='pending'){a.status=data.decision==='approve'?'approved':'declined';if(a.status==='approved'){s.users.find(u=>u.id===a.pubkey)!.role='member';s.invites.find(i=>i.id===a.invite).usedAt=now();}}}break;
   default:throw Error('This feature is available in the Android app.');
  }
  localStorage.setItem(storage,JSON.stringify(s));return result as T;
 }
};
