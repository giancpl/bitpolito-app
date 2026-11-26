import {useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {hub} from '../lib/hub';
import {useIdentity} from '../lib/identity';
import {useConfirm,useToast} from './Feedback';
import {Button,Notice} from './ui';
import type {JoinApplication} from '../../shared/hub-contracts';
import type {User} from '../../shared/contracts';

export function HubApplications({members}:{members:User[]}){
 const identity=useIdentity(),confirm=useConfirm(),toast=useToast(),client=useQueryClient();
 const requests=useQuery({queryKey:['applications'],queryFn:()=>hub.command<JoinApplication[]>('applications'),refetchInterval:5000});
 const [error,setError]=useState(''),[busy,setBusy]=useState('');
 async function review(a:JoinApplication,decision:'approve'|'decline'){
  const replace=members.some(u=>u.id===a.pubkey&&u.role!=='follower');
  if(!await confirm({title:decision==='decline'?`Decline ${a.name||'this application'}?`:replace?`Replace ${a.name||'this member'}’s phone?`:`Approve ${a.name||'this member'}?`,description:decision==='decline'?'They will need another invitation to request access again.':replace?'The previous phone will lose access to future group updates. Previously received data cannot be erased.':'This phone will join your encrypted team and receive the current resource catalogue.',action:decision==='decline'?'Decline request':replace?'Approve & replace phone':'Approve member',danger:replace||decision==='decline'}))return;
  setBusy(a.id);setError('');try{await hub.command('reviewApplication',{id:a.id,decision,replace});await client.invalidateQueries();toast(decision==='approve'?'Membership published. The phone can receive its invitation.':'Request declined.');}catch(e){setError((e as Error).message);}finally{setBusy('');}
 }
 const pending=requests.data?.filter(a=>a.status==='pending')||[];
 return <section className="join-applications" aria-label="Membership applications"><h3>Requests to join</h3>
  <p className="small muted">Keep the app open to receive encrypted applications for invitations you issued.</p>
  {pending.map(a=><article className="request-card" key={a.id}><strong>{a.name||'New teammate'}</strong><p className="small muted">{a.pubkey.slice(0,12)}…{a.pubkey.slice(-6)}</p><div className="button-row"><Button disabled={!!busy} busy={busy===a.id} onClick={()=>void review(a,'approve')}>Approve</Button><Button variant="ghost" disabled={!!busy} onClick={()=>void review(a,'decline')}>Decline</Button></div></article>)}
  {!requests.isPending&&!pending.length&&<p className="small muted">No requests waiting.</p>}
  {(error||requests.error)&&<Notice>{error||requests.error?.message}<Button variant="secondary" onClick={identity.open}>Unlock identity or reconnect signer</Button></Notice>}
 </section>;
}
