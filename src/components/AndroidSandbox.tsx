import {useState,useEffect} from "react";
import {Native,isAndroid} from "../lib/native";
import {useIdentity} from "../lib/identity";
import {finalizeEvent,getPublicKey} from "nostr-tools/pure";
import {v2 as nip44} from 'nostr-tools/nip44';
import {Button} from './ui';
// The team bundle excludes this entire module and its disposable keys.
export default function AndroidSandbox(){
  const [sandbox,setSandbox]=useState(false),[error,setError]=useState(''),[selected,setSelected]=useState(0),[busy,setBusy]=useState(false);
  const identity=useIdentity(),names=['Alice','Bob','Cara','Drew'];
  useEffect(()=>{if(isAndroid)void Native.configuration().then(c=>setSandbox(c.sandbox));else setSandbox(import.meta.env.VITE_HUB_PREVIEW==='true');},[]);
  if(!sandbox)return null;
  return <aside className="android-sandbox"><strong>{isAndroid?'Relay sandbox':'Browser simulator'}</strong><span>{identity.user?`${identity.user.name} · test identity`:'Disposable identities'}</span>{!identity.user&&<div className="sandbox-picker"><select aria-label="Test identity" disabled={busy} value={selected} onChange={e=>setSelected(Number(e.target.value))}>{names.map((name,i)=><option value={i} key={name}>{name}</option>)}</select><Button variant="secondary" busy={busy} disabled={busy} onClick={()=>void(async()=>{setBusy(true);setError('');try{const key=new Uint8Array(32);key[31]=selected===3?6:selected+1;await identity.connect({pubkey:getPublicKey(key),signEvent:async e=>finalizeEvent(e,key),encrypt:async(p,c)=>nip44.encrypt(c,nip44.utils.getConversationKey(key,p)),decrypt:async(p,c)=>nip44.decrypt(c,nip44.utils.getConversationKey(key,p)),close:async()=>{key.fill(0);}},names[selected]);}catch(e){setError((e as Error).message);}finally{setBusy(false);}})()}>Use {names[selected]} test identity</Button></div>}{error&&<p role="alert">{error}</p>}</aside>;
}
