import {describe,it,expect} from 'vitest';
import {nativeEventData} from '../src/lib/native';
describe('native event transport',()=>{
 it('reads actual Capacitor-shaped events for signer replies',()=>{const event=Object.assign(new Event('bitpolito:crypto'),{id:'request-1',action:'sign',event:{kind:450}});expect(nativeEventData<{id:string;event:{kind:number}}>(event)).toMatchObject({id:'request-1',event:{kind:450}});});
 it('also accepts browser CustomEvents without losing notification routes',()=>{const event=new CustomEvent('bitpolito:request',{detail:{request:'door-1'}});expect(nativeEventData<{request:string}>(event).request).toBe('door-1');});
});
