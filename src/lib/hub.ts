import { registerPlugin } from '@capacitor/core';
import { isAndroid,nativeEventData } from './native';
import type { IdentitySigner } from './signers';
import type { EventTemplate } from 'nostr-tools/pure';

export const hubEnabled=isAndroid||import.meta.env.VITE_HUB_PREVIEW==='true';
const bridge=registerPlugin<{
  execute(input:{action:string;input:Record<string,unknown>}):Promise<{value:unknown}>;
  login(input:{pubkey:string;name?:string;invitation?:string}):Promise<{ok:boolean}>;
  cryptoReply(input:{id:string;value?:string;error?:string}):Promise<void>;
}>('BitPolitoHub');
export interface HubClient {
  command<T>(action:string,input?:Record<string,unknown>):Promise<T>;
  connect(signer:IdentitySigner,name?:string):Promise<void>;
}
let signer:IdentitySigner|null=null;
export function clearHubSigner(){signer=null;}
export function setHubSigner(next:IdentitySigner){signer=next;}
if(isAndroid)window.addEventListener('bitpolito:crypto',event=>{
  const detail=nativeEventData<{id:string;action:string;owner?:string;event:EventTemplate&{pubkey?:string};pubkey:string;content:string}>(event);
  if(!detail||typeof detail.id!=='string')return;
  void(async()=>{
    try {
      if(!signer)throw Error('Unlock your identity in the app to continue.');
      if(detail.owner&&detail.owner!==signer.pubkey)throw Error('This identity is not connected.');
      let value:string;
      if(detail.action==='sign'){
        if([0,3].includes(detail.event.kind))throw Error('Public profile and contact publishing is disabled.');
        const {pubkey,...template}=detail.event;
        if(pubkey&&pubkey!==signer.pubkey)throw Error('Signer identity does not match this account.');
        value=JSON.stringify(await signer.signEvent(template as EventTemplate));
      }else if(detail.action==='encrypt'){
        if(!signer.encrypt)throw Error('This signer does not support NIP-44 encryption.');
        value=await signer.encrypt(detail.pubkey,detail.content);
      }else if(detail.action==='decrypt'){
        if(!signer.decrypt)throw Error('This signer does not support NIP-44 decryption.');
        value=await signer.decrypt(detail.pubkey,detail.content);
      }else throw Error('Unsupported identity operation.');
      await bridge.cryptoReply({id:detail.id,value});
    }catch(error){await bridge.cryptoReply({id:detail.id,error:(error as Error).message});}
  })();
});
export const hub:HubClient={
  async command<T>(action:string,input:Record<string,unknown>={}){
    if(isAndroid)return (await bridge.execute({action,input})).value as T;
    if(import.meta.env.VITE_HUB_PREVIEW==='true')return (await import('./hub-simulator')).simulator.command<T>(action,input);
    throw Error('The encrypted team runtime is available in the Android app.');
  },
  async connect(next,name){
    if(!next.encrypt||!next.decrypt)throw Error('Your signer needs NIP-44 support to join the encrypted team.');
    signer=next;
    try{if(isAndroid)await bridge.login({pubkey:next.pubkey,name,invitation:sessionStorage.getItem('bitpolito.invite')||undefined});else if(import.meta.env.VITE_HUB_PREVIEW==='true')await(await import('./hub-simulator')).simulator.connect(next,name);else throw Error('Use the Android app to connect to your team.');}
    catch(e){signer=null;throw e;}
  }
};

/** Compatibility adapter for existing views. These paths are never HTTP requests. */
export async function hubRequest<T>(path:string,method:string,body?:string):Promise<T>{
  const data=body?JSON.parse(body):{};
  let action:string;
  if(path==='/config')action='configuration';
  else if(path==='/me')action='me';
  else if(path==='/auth/logout')action='logout';
  else if(path==='/profile')action='profile';
  else if(path==='/moo/state')action='moo';
  else if(path==='/moo/presence')action='presence';
  else if(path==='/moo/requests')action='ring';
  else if(path.startsWith('/moo/requests/')){action='request';data.id=path.split('/').pop();}
  else if(path==='/resources')action=method==='GET'?'resources':'saveResource';
  else if(path.startsWith('/resources/')){action='saveResource';data.id=path.split('/').pop();}
  else if(path==='/admin/members')action='members';
  else if(path.startsWith('/admin/members/')){action='setRole';data.id=path.split('/').pop();}
  else if(path==='/invites/redeem')action='join';
  else if(path==='/invites')action=method==='GET'?'invites':'createInvite';
  else if(path.startsWith('/invites/')){action='revokeInvite';data.id=path.split('/').pop();}
  else throw Error('This feature is not available in the distributed app.');
  return hub.command<T>(action,data);
}
