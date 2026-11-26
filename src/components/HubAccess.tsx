import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {Link} from 'react-router-dom';
import {hub} from '../lib/hub';
import {isAndroid} from '../lib/native';
import {useIdentity} from '../lib/identity';
import {useConfirm} from './Feedback';
import {AsyncForm,Button,Field,Notice} from './ui';

export function HubAccess({invite}:{invite:string}){
 const identity=useIdentity(),confirm=useConfirm();const [error,setError]=useState(''),[token,setToken]=useState(invite),[busy,setBusy]=useState(false),[editingInvite,setEditingInvite]=useState(false);
 const status=useQuery({queryKey:['join-status'],queryFn:()=>hub.command<{status:string}>('joinStatus'),enabled:!!identity.user,refetchInterval:3000});
 const waiting=status.data?.status==='pending'&&!editingInvite;
 return <section className="member-welcome"><img src="/brand/loving-cows-blue.svg" alt="Two BitPolito cows"/>
  <span className="eyebrow">BITPOLITO HUB</span><h1>{waiting?'Waiting for approval':identity.user?'Member access required':invite?'Join BitPolito':'Your team. Connected.'}</h1>
  <p>{waiting?'Your administrator will approve your phone from their app. Keep BitPolito open to receive your invitation.':'Connect your Nostr identity and use your personal invitation to join the encrypted team.'}</p>
  {!identity.user?<Button onClick={identity.open}>Connect your identity</Button>:<>
   {status.isPending&&<p role="status">Checking your team access…</p>}
   {!waiting&&!status.isPending&&<AsyncForm submitLabel="Request access" onSubmit={async form=>{
    const token=String(form.get('invite'));
    if(isAndroid){
     const device=await hub.command<{otherInstallations:number}>('deviceReadiness',{token});
     if(device.otherInstallations>0){
      if(!await confirm({title:'Use this phone for your identity?',description:'Another Marmot installation is advertised for this identity. Continuing retires its published KeyPackages across Marmot apps. Existing groups remain there until their administrators remove that phone. Sign out there first, or use a separate identity to keep both installations.',action:'Use this phone',danger:true}))throw Error('No installation was changed. Use another identity or try again when you are ready.');
      await hub.command('preparePhone',{token,confirmed:true});
     }
    }
    if(!identity.user!.name)await hub.command('profile',{name:String(form.get('name')),about:''});await hub.command('join',{token});setEditingInvite(false);await status.refetch();}}>
    {!identity.user.name&&<Field label="Your name"><input name="name" required maxLength={60}/></Field>}
    <Field label="Invitation link or code"><textarea name="invite" rows={3} required value={token} onChange={e=>setToken(e.target.value)} autoComplete="off"/></Field>
    {status.data?.status==='declined'&&<Notice>Request declined. Ask an administrator for another invitation.</Notice>}
    {status.data?.status==='used'&&<Notice>Invitation already used. Ask for another personal invitation.</Notice>}
    {status.data?.status==='expired'&&<Notice>Invitation expired. Ask an administrator for a new invitation.</Notice>}
    {status.data?.status==='revoked'&&<Notice>Invitation revoked. Ask an administrator for another invitation.</Notice>}
   </AsyncForm>}
   {waiting&&<Button variant="secondary" onClick={()=>{setEditingInvite(true);setToken('');}}>Use another invitation</Button>}
   <div className="button-row"><Link className="button secondary" to="/account?view=identity">Identity & recovery</Link><Button variant="ghost" onClick={()=>void identity.logout().catch(e=>setError(e.message))}>Sign out</Button></div>
   {!waiting&&!status.isPending&&<details className="bootstrap-help"><summary>Setting up a new team?</summary><p className="small muted">This creates a separate encrypted team. To join an existing team, use its invitation instead.</p><Button variant="secondary" busy={busy} onClick={()=>void(async()=>{if(!await confirm({title:'Create a new BitPolito team?',description:'You will be its first administrator. This does not reconnect you to an existing team.',action:'Create team'}))return;setBusy(true);setError('');try{await hub.command('createTeam');await identity.refresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}})()}>Create a new team</Button></details>}
  </>}
  {error&&<Notice>{error}</Notice>}
 </section>;
}
export function HubConnection(){const status=useQuery({queryKey:['hub-status'],queryFn:()=>hub.command<{state:string;error:string|null}>('status'),refetchInterval:5000});
 const value=status.data?.state;return <p className="hub-connection small muted" role="status">{value==='simulator'?'Browser simulator · no real relay connection':value==='connected'?'Connected':value==='syncing'?'Synchronizing…':'Reconnecting…'}{status.data?.error&&<span> · {status.data.error}</span>}</p>;}
