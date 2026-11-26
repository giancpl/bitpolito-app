import {hubEnabled} from '../lib/hub';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowUpRight, Bell, Check, ChevronRight, DoorOpen, LogOut, Users } from 'lucide-react';
import { useIdentity } from '../lib/identity';
import { useMoo } from '../lib/moo';
import { api, post } from '../lib/api';
import { useGuidance } from '../lib/guidance';
import { ContextTip } from './Help';
import { useToast } from './Feedback';
import { Avatar, AvatarGroup, Button, ErrorState, Loading, Notice, StatusBadge, TransitionView } from './ui';
import type { MooRequest, Resource } from '../../shared/contracts';
export function requestTitle(r:MooRequest,user:string,inside=true) {
  if(r.status==='waiting') return r.requesterId===user?'Waiting for someone to respond':'Someone is at the door';
  if(r.status==='claimed') {const people=r.responders;return people?.length?people.some(p=>p.id===user)?'You’re getting the door':`${people.map(p=>p.name).join(' and ')} ${people.length===1?'is':'are'} coming`:r.claimedBy===user?'You’re getting the door':`${r.claimerName||'A teammate'} is coming`;}
  if(r.status==='resolved') return r.resolvedReason==='inside'?(inside?'You’re inside. Welcome!':'Entry confirmed'):'The door has been opened';
  return r.status==='cancelled'?'Request cancelled':'No response in time';
}
export function MooBanner() {
  const {user}=useIdentity(), {data}=useMoo();
  const active=data?.own && ['waiting','claimed'].includes(data.own.status)?data.own:data?.incoming[0];
  if(!user||!active) return null;
  return <Link className="moo-banner" to={`/moo?request=${active.id}`}><Bell size={20}/><span><strong>{requestTitle(active,user.id)}</strong><small>View request</small></span><ChevronRight size={18}/></Link>;
}
export function OfficePage() {
  const {user}=useIdentity(), query=useMoo(), client=useQueryClient();
  const navigate=useNavigate(), location=useLocation(), [params]=useSearchParams();
  const home=location.pathname==='/', requestPage=location.pathname==='/moo';
  const guidance=useGuidance(user?.id), toast=useToast();
  const operation=useRef(false);
  const [busy,setBusy]=useState(''), [error,setError]=useState('');
  const resources=useQuery({queryKey:['resources'],queryFn:()=>api<Resource[]>('/resources'),enabled:home});
  const latest=query.data?.own;
  useEffect(()=>{
    if(latest&&!['waiting','claimed'].includes(latest.status)) sessionStorage.removeItem('bitpolito.ring.operation');
  },[latest?.id,latest?.status]);
  if(!user) return null;
  if(!query.data) return query.error?<ErrorState error={query.error} retry={()=>void query.refetch()}/>:<Loading/>;
  const data=query.data, inside=data.presence.some(p=>p.id===user.id), own=data.own;
  const active=!!own&&['waiting','claimed'].includes(own.status), disabled=!!busy||!!query.error||(!hubEnabled&&!navigator.onLine);
  async function run(key:string,fn:()=>Promise<void>) {
    if(operation.current) return; operation.current=true; setBusy(key); setError('');
    try {await fn(); await client.invalidateQueries({queryKey:['moo']});}
    catch(e){setError((e as Error).message);} finally{operation.current=false;setBusy('');}
  }
  const action=(r:MooRequest,value:string)=>void run(r.id,async()=>{
    await post(`/moo/requests/${r.id}`,{action:value});
    if(value==='inside'){guidance.complete('inside');guidance.complete('check-in');toast('You’re in. You’re now available to get the door.');}
    if(value==='claim'){guidance.complete('claim');toast('The team knows you’re getting the door.');}
  });
  const ring=()=>void run('ring',async()=>{
    let key=sessionStorage.getItem('bitpolito.ring.operation');
    if(!key){key=crypto.randomUUID();sessionStorage.setItem('bitpolito.ring.operation',key);}
    const result=await post<MooRequest>('/moo/requests',{key});
    guidance.complete('ring');
    navigate(`/moo?request=${result.id}`);
  });
  const checkIn=()=>void run('presence',async()=>{await post('/moo/presence',{action:'arrive'});guidance.complete('check-in');toast('You’re in. Presence clears at midnight.');});
  const leave=()=>void run('presence',async()=>{await post('/moo/presence',{action:'leave'});toast('You’re marked as outside. Office alerts have stopped.');});
  function card(r:MooRequest) {
    const mine=r.requesterId===user!.id, live=['waiting','claimed'].includes(r.status);
    return <article className="request-card" id={`request-${r.id}`} key={r.id} tabIndex={-1}>
      <div className="request-person"><Avatar name={mine?user!.name:r.requesterName}/><span><strong>{mine?'Your door request':r.requesterName}</strong><small>{new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Rome',hour:'2-digit',minute:'2-digit'}).format(r.createdAt*1000)}</small></span></div>
      <TransitionView id={`${r.id}-${r.status}-${r.claimedBy}-${inside}`}><h3 aria-live="polite">{requestTitle(r,user!.id,inside)}</h3></TransitionView>
      {mine?<>
        <p className="small muted">{r.status==='waiting'?'Your request is sent. Follow updates here or keep using the app.':r.status==='claimed'?'Confirm once you’ve stepped inside.':r.status==='resolved'?(inside?'You’re available to get the door. Leaving soon? Check out whenever you need.':'You’re outside now. Your previous entry remains confirmed.'):'Ring again if someone is still present.'}</p>
        {live?<div className="request-buttons"><Button disabled={disabled} busy={busy===r.id} onClick={()=>action(r,'inside')}><Check size={18}/>I’m inside</Button><Button variant="ghost" disabled={disabled} onClick={()=>action(r,'cancel')}>Cancel request</Button></div>:!inside&&<Button disabled={disabled||!data.presence.length} onClick={()=>{sessionStorage.removeItem('bitpolito.ring.operation');ring();}}>Ring again</Button>}
      </>:(r.status==='waiting'||(r.responders&&!r.responders.some(p=>p.id===user!.id)))?<Button disabled={disabled} busy={busy===r.id} onClick={()=>action(r,'claim')}><DoorOpen size={18}/>I’ll get the door</Button>:(r.responders?r.responders.some(p=>p.id===user!.id):r.claimedBy===user!.id)?<><p className="small muted">Go and open. They’ll confirm when they’re inside.</p><Button variant="secondary" disabled={disabled} onClick={()=>action(r,'release')}>I can’t go</Button></>:<p className="small muted">A teammate is on their way.</p>}
    </article>;
  }
  const requests=[...(own&&(requestPage||active)?[own]:[]),...data.incoming];
  const target=params.get('request');
  const sorted=target?[...requests].sort((a,b)=>a.id===target?-1:b.id===target?1:a.createdAt-b.createdAt):requests;
  return <div className={`office-page ${home?'team-home':'office-detail'}`}>
    {!home&&<Button variant="ghost" className="panel-back" onClick={()=>navigate('/')}><ArrowLeft size={18}/>Home</Button>}
    <div className="home-heading"><div><p className="eyebrow">{home?'YOUR TEAM, TOGETHER':'BITPOLITO OFFICE'}</p><h1 tabIndex={-1}>{home?`Hi, ${user.name||'teammate'}.`:requestPage?'Door request':'Office'}</h1></div>{home&&<img src="/brand/cow-icon-blue.svg" alt=""/>}</div>
    {query.error&&<Notice>Office status may be out of date.<Button variant="secondary" onClick={()=>void query.refetch()}>Try again</Button></Notice>}
    {error&&<Notice>{error}</Notice>}
    <section className="office-summary" aria-label="Your office status">
      <div className="section-heading"><h2>At the office</h2><span className="pill">Torino</span></div>
      <div className="presence-bar"><StatusBadge inside={inside}/>{inside?<Button variant="secondary" disabled={!!busy} busy={busy==='presence'} onClick={leave}><LogOut size={16}/>I’m leaving</Button>:<Button variant="secondary" disabled={disabled||active} busy={busy==='presence'} onClick={checkIn}><DoorOpen size={16}/>I’m in the office</Button>}</div>
      <Link className="people-summary" to="/office" aria-label="View everyone"><AvatarGroup people={data.presence}/><span>{data.presence.length} {data.presence.length===1?'person':'people'} in the office</span><ChevronRight size={18}/></Link>
      {!inside&&!active&&<Button className="compact-bell" disabled={disabled||!data.presence.length} busy={busy==='ring'} onClick={ring}><img src="/brand/icon-bell.svg" alt=""/>Ring the office</Button>}
      {!inside&&!data.presence.length&&<p className="small muted">Nobody is marked in the office.</p>}
      <div className="office-meta"><span>Presence clears at midnight · Rome</span><Link to="/account?view=alerts">Office alerts<ChevronRight size={14}/></Link></div>
    </section>
    {sorted.length>0&&<section className="request-list" aria-label="Door requests">{sorted.map(card)}</section>}
    {!home&&!requestPage&&<section className="office-people"><h2>In the office</h2>{data.presence.length?<ul className="presence-list">{data.presence.map(p=><li key={p.id}><Avatar name={p.name}/><span><strong>{p.name}{p.id===user.id?' (you)':''}</strong><small>Available to get the door</small></span><Check size={18}/></li>)}</ul>:<p className="muted">Nobody is marked as in the office.</p>}</section>}
    {requestPage&&!requests.length&&<Notice>No active door request. Return to Home to ring when someone is present.</Notice>}
    {home&&<section className="home-tools"><div className="section-heading"><h2>Your tools</h2><Link to="/resources" className="text-button">View all<ArrowUpRight size={16}/></Link></div><div className="quick-tool-grid"><Link className="quick-tool" to="/office"><img src="/brand/icon-bell.svg" alt=""/><strong>Office</strong><span>Presence & doorbell</span></Link>{resources.data?.filter(r=>r.status==='active').slice(0,3).map(r=><a className="quick-tool" key={r.id} href={r.url} target="_blank" rel="noreferrer"><img src={`/brand/${r.icon}`} alt=""/><strong>{r.title}</strong><span>{r.category}</span></a>)}</div>{resources.isError&&<Button variant="ghost" onClick={()=>void resources.refetch()}>Retry tools</Button>}</section>}
    {home&&!error&&!query.error&&!busy&&!requests.length&&(inside&&!guidance.dismissed('alerts')?<ContextTip title="Office alerts, your way" action="Set up office alerts" onAction={()=>{guidance.dismiss('alerts');navigate('/account?view=alerts');}} onDismiss={()=>guidance.dismiss('alerts')}>Get your phone ready for door alerts. Checking in already makes you available.</ContextTip>:!inside&&!guidance.completed('check-in')&&!guidance.dismissed('presence')?<ContextTip title="At the office? Let the team know" action="How presence works" onAction={()=>{guidance.dismiss('presence');navigate('/account?view=help&topic=presence');}} onDismiss={()=>guidance.dismiss('presence')}>Check in to be available to get the door. Leave whenever you need.</ContextTip>:null)}
  </div>;
}
