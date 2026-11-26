// Runs only against the USB-connected local sandbox after android-smoke.mjs.
import {chromium,expect} from '@playwright/test';
import {execFileSync} from 'node:child_process';
const adb=(...a)=>execFileSync('.android-local/sdk/platform-tools/adb',a,{encoding:'utf8'}).trim();
const pid=adb('shell','pidof','it.bitpolito.hub.sandbox');adb('forward','tcp:9222',`localabstract:webview_devtools_remote_${pid}`);
const browser=await chromium.connectOverCDP('http://127.0.0.1:9222',{noDefaults:true});
const page=browser.contexts()[0].pages()[0],check=expect.configure({timeout:30000});page.setDefaultTimeout(30000);
const native=(method,args={})=>page.evaluate(({method,args})=>window.Capacitor.nativePromise('BitPolito',method,args),{method,args});
if(!(await native('configuration')).sandbox)throw Error('Only the disposable sandbox is allowed.');
if((await native('vaultRead')).value)throw Error('Existing encrypted vault found. Use a clean disposable emulator; no keys were replaced.');
const password='Android recovery test password 2026';
function nodes(){try{adb('shell','rm','-f','/sdcard/bitpolito-test-ui.xml');adb('shell','uiautomator','dump','--compressed','/sdcard/bitpolito-test-ui.xml');return adb('shell','cat','/sdcard/bitpolito-test-ui.xml');}catch{return '';}}
function tapNode(xml,pattern){const node=[...xml.matchAll(/<node\b[^>]+>/g)].map(m=>m[0]).find(s=>pattern.test(s));if(!node)throw Error('Native file picker control not found: '+pattern);const b=node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);adb('shell','input','tap',String(Math.round((+b[1]+ +b[3])/2)),String(Math.round((+b[2]+ +b[4])/2)));}
try{
 if(await page.getByRole('link',{name:'Profile',exact:true}).count()){await page.getByRole('link',{name:'Profile',exact:true}).click();await page.getByRole('button',{name:'Sign out',exact:true}).click();}
 await page.getByRole('button',{name:'Sign in with Nostr',exact:true}).click();await page.getByRole('button',{name:/Create an identity/}).click();
 if(await page.getByRole('alertdialog').count())await page.getByRole('button',{name:'Replace saved keys',exact:true}).click();
 await page.getByLabel('Your name',{exact:true}).fill('Android Recovery');await page.getByLabel('Key encryption password',{exact:true}).fill(password);await page.getByLabel('Confirm password',{exact:true}).fill(password);await page.getByRole('button',{name:'Create identity',exact:true}).click();
 const finish=page.getByRole('button',{name:'Continue to BitPolito',exact:true});await check(finish).toBeDisabled();
 await page.getByRole('button',{name:'Download encrypted backup',exact:true}).click();
 await check.poll(()=>nodes().includes('com.google.android.documentsui')).toBe(true);adb('shell','input','keyevent','4');if(!await check(page.getByText(/Backup save cancelled/)).toBeVisible({timeout:1500}).then(()=>true,()=>false))adb('shell','input','keyevent','4');
 await check(page.getByText(/Backup save cancelled/)).toBeVisible();await check(finish).toBeDisabled();
 await page.getByRole('button',{name:'Download encrypted backup',exact:true}).click();
 let xml;await check.poll(()=>{xml=nodes();return xml.includes('action_menu_save')||xml.includes('text="SAVE"')||xml.includes('text="Save"');}).toBe(true);
 tapNode(xml,/resource-id="com.google.android.documentsui:id\/action_menu_save"|text="SAVE"|text="Save"/);
 await page.getByRole('checkbox').check();await check(finish).toBeEnabled();await finish.click();await check(page.getByRole('heading',{name:'Member access required',exact:true})).toBeVisible();
 const original=JSON.parse((await native('vaultRead')).value);expect(original.encrypted.startsWith('ncryptsec1')).toBe(true);
 const listing=adb('shell','find','/sdcard/Download','-name',`bitpolito-${original.pubkey.slice(0,8)}*`);expect(listing).toBeTruthy();
 const exported=adb('shell','cat',listing.split('\n')[0]);expect(exported).toBe(original.encrypted);
 await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.getByRole('button',{name:'Sign in with Nostr',exact:true}).click();await page.getByRole('button',{name:/Unlock saved identity/}).click();
 await page.getByLabel('Key encryption password',{exact:true}).fill('wrong password');await page.getByRole('button',{name:'Unlock and continue',exact:true}).click();await check(page.getByText('The password or recovery backup is incorrect.',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Close dialog',exact:true}).click();if(await page.getByRole('alertdialog').count())await page.getByRole('button',{name:'Discard changes',exact:true}).click();await page.getByRole('button',{name:'Sign in with Nostr',exact:true}).click();await page.getByRole('button',{name:'Restore identity',exact:true}).click();
 await page.getByRole('button',{name:'Choose encrypted backup',exact:true}).click();await check.poll(()=>nodes().includes('com.google.android.documentsui')).toBe(true);
 xml=nodes();tapNode(xml,new RegExp('text="bitpolito-'+original.pubkey.slice(0,8)+'[^"\\n]*"'));
 await check(page.getByLabel('Or paste your key',{exact:true})).toHaveValue(original.encrypted);
 await page.getByLabel('Backup password',{exact:true}).fill(password);await page.getByRole('button',{name:'Restore and continue',exact:true}).click();await page.getByRole('button',{name:'Replace saved keys',exact:true}).click();
 await check(page.getByRole('heading',{name:'Member access required',exact:true})).toBeVisible();expect(JSON.parse((await native('vaultRead')).value).pubkey).toBe(original.pubkey);
 console.log('PASS: mandatory backup, Android save cancellation, actual file write, encrypted export, wrong password and native file-picker restore.');
}finally{await browser.close();}
