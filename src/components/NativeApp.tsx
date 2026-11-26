import { useEffect, lazy, Suspense } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { isAndroid, Native,nativeEventData } from '../lib/native';
import {hubEnabled} from '../lib/hub';
export function NativeLifecycle(){
  const navigate=useNavigate(),location=useLocation(),client=useQueryClient();
  useEffect(()=>{if(!hubEnabled||isAndroid)return;const update=()=>void client.invalidateQueries();window.addEventListener('bitpolito:realtime',update);return()=>window.removeEventListener('bitpolito:realtime',update);},[client]);
  useEffect(()=>{
    if(!isAndroid)return;
    const back=()=>{if(document.querySelector('[role="dialog"],[role="alertdialog"]')){document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));return;}if(location.pathname==='/')void Native.background();else if((history.state?.idx||0)>0)navigate(-1);else navigate('/');};
    const resume=()=>void client.invalidateQueries();
    const request=(event:Event)=>{const id=nativeEventData<{request?:string}>(event)?.request;if(typeof id==='string'&&/^[\w-]{1,80}$/.test(id))navigate(`/moo?request=${id}`);};
    window.addEventListener('bitpolito:realtime',resume);window.addEventListener('bitpolito:back',back);window.addEventListener('bitpolito:resume',resume);window.addEventListener('bitpolito:request',request);
    const initial=()=>void Native.consumeRequest().then(({request,invite})=>{if(invite){const token=invite.split('invite=')[1]||'';sessionStorage.setItem('bitpolito.invite',token);window.dispatchEvent(new CustomEvent('bitpolito:invite',{detail:{token}}));navigate('/');}if(request)navigate(`/moo?request=${request}`);});
    initial();
    window.addEventListener('bitpolito:resume',initial);
    const links=(event:MouseEvent)=>{const link=(event.target as Element).closest<HTMLAnchorElement>('a[href]');if(link&&/^https?:/.test(link.href)&&new URL(link.href).origin!==locationOrigin()){event.preventDefault();void Native.openExternal({url:link.href});}};
    document.addEventListener('click',links);
    return()=>{window.removeEventListener('bitpolito:realtime',resume);window.removeEventListener('bitpolito:back',back);window.removeEventListener('bitpolito:resume',resume);window.removeEventListener('bitpolito:request',request);window.removeEventListener('bitpolito:resume',initial);document.removeEventListener('click',links);};
  },[navigate,location.pathname,client]);
  return null;
}
const locationOrigin=()=>window.location.origin;

const Sandbox = import.meta.env.VITE_ANDROID_SANDBOX === 'true'||import.meta.env.VITE_HUB_PREVIEW==='true' ? lazy(()=>import('./AndroidSandbox')) : ()=>null;
export function AndroidSandbox(){return <Suspense fallback={null}><Sandbox/></Suspense>;}
