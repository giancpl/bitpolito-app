import { Capacitor, registerPlugin } from '@capacitor/core';
export const isAndroid = Capacitor.getPlatform() === 'android';
/** Capacitor's triggerWindowJSEvent assigns data to the Event itself; browser CustomEvents use detail. */
export function nativeEventData<T>(event:Event):T {return ((event as CustomEvent<T>).detail??event) as T;}
export interface NativeResult {status:number; body:string}
export const Native = registerPlugin<{
  configuration():Promise<{origin:string;sandbox:boolean;firebase:boolean}>;
  request(input:{path:string;method:string;body?:string;headers?:Record<string,string>}):Promise<NativeResult>;
  authenticate(input:{body:string;authorization:string}):Promise<{ok:boolean}>;
  logout():Promise<void>;
  vaultRead():Promise<{value:string|null}>;
  vaultWrite(input:{value:string}):Promise<void>;
  vaultRemove():Promise<void>;
  exportBackup(input:{content:string;name:string}):Promise<void>;
  importBackup():Promise<{content:string}>;
  signerKey():Promise<{pubkey:string}>;
  signerSign(input:{event:string}):Promise<{event:string}>;
  signerCrypt(input:{type:'nip44_encrypt'|'nip44_decrypt';pubkey:string;content:string}):Promise<{content:string}>;
  alertsStatus():Promise<{permission:boolean;firebase:boolean;enabled:boolean;listening?:boolean;vibration?:boolean}>;
  enableAlerts():Promise<{token:string;installationId:string}>;
  disableAlerts():Promise<void>;
  testSound():Promise<void>;
  alert(input:{request:string;phase:string}):Promise<void>;
  settings():Promise<void>;
  consumeRequest():Promise<{request?:string;invite?:string}>;
  background():Promise<void>;
  openExternal(input:{url:string}):Promise<void>;
}>('BitPolito');
export async function nativeOrigin(){return (await Native.configuration()).origin;}
