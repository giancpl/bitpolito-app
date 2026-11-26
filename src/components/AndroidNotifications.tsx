import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {Native} from '../lib/native';
import {hub} from '../lib/hub';
import {useIdentity} from '../lib/identity';
import {Button,Notice} from './ui';
export function AndroidNotifications(){
 const {user}=useIdentity();const [error,setError]=useState(''),[busy,setBusy]=useState(false),[hearing,setHearing]=useState(false);
 const key=`bitpolito.office.sound-test.${user?.id}`;const [heard,setHeard]=useState(()=>Number(localStorage.getItem(key))||0);
 const device=useQuery({queryKey:['android-alerts'],queryFn:()=>Native.alertsStatus(),refetchInterval:5000});
 const connection=useQuery({queryKey:['hub-status'],queryFn:()=>hub.command<{state:string;error:string|null}>('status'),refetchInterval:5000});
 async function run(fn:()=>Promise<unknown>){setError('');setBusy(true);try{await fn();await device.refetch();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <div className="notifications native-notifications">
  <section className="alert-setup-step"><span className="step-label">1 · Allow office alerts</span><h3>Listen while you’re in</h3><p className="small muted">A persistent Android notification keeps the encrypted doorbell connection visible while you’re checked in. Leaving stops it.</p>
   <p role="status">{device.isPending?'Checking…':!device.data?.permission?'Notifications need your permission':device.data.listening?'Office alerts active':device.data.enabled?'Ready for your next check-in':'Office alerts off'}</p>
   <Button busy={busy} onClick={()=>void run(()=>Native.enableAlerts())}>Enable office alerts</Button><Button variant="ghost" onClick={()=>void Native.settings()}>Open Android settings</Button>
  </section>
  <section className="alert-setup-step"><span className="step-label">2 · Test the sound</span><h3>A short moo</h3><Button variant="secondary" busy={busy} onClick={()=>void run(async()=>{await Native.testSound();setHearing(true);})}>Test cow sound</Button>
   {hearing&&<div className="hearing-check"><p>Did you hear the sound?</p><div className="button-row"><Button onClick={()=>{const at=Date.now();localStorage.setItem(key,String(at));setHeard(at);setHearing(false);}}>Yes, I heard it</Button><Button variant="ghost" onClick={()=>setError('Check volume, Do Not Disturb and Bluetooth, then test again.')}>No, help me</Button></div></div>}
   {heard>0&&<p className="small muted">Last confirmed by you: {new Date(heard).toLocaleString('en-GB')}</p>}
   <label className="checkbox"><input type="checkbox" checked={device.data?.vibration||false} onChange={e=>void run(()=>hub.command('alertSettings',{vibration:e.target.checked}))}/>Vibrate with the moo</label>
  </section>
  <p className="small muted">{connection.data?.state==='connected'?'Connected to your team.':'The relay connection may be unavailable.'} Android can pause the listener. After restarting or force-stopping the app, reopen it and check in again. Volume, silent mode and Do Not Disturb stay under your control.</p>
  {device.data?.enabled&&<Button variant="ghost" onClick={()=>void run(()=>Native.disableAlerts())}>Turn office alerts off</Button>}
  {(error||device.error)&&<Notice>{error||device.error?.message}<Button variant="ghost" onClick={()=>void device.refetch()}>Try again</Button></Notice>}
 </div>;
}
