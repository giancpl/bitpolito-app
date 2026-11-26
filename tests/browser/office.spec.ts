import {test,expect} from '@playwright/test';
import {connectAs,localPost,navigate,openProfileView} from './helpers';
test('Home is a team space, office is a page and navigation is always reachable',async({page})=>{
  await connectAs(page);
  for(const width of [360,390,768,1440]){
    await page.setViewportSize({width,height:800});
    await expect(page.getByRole('heading',{name:'Your tools',exact:true})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.getByRole('link',{name:'View everyone',exact:true}).click();
    await expect(page).toHaveURL(/\/office$/);
    await expect(page.getByRole('heading',{name:'In the office',exact:true})).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await navigate(page,'Home');
  }
  await openProfileView(page,'Help');
  await expect(page.getByRole('heading',{name:'Help',exact:true})).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
test('rings arrive as cards, preserve profile drafts and never open a modal',async({page,browser},info)=>{
  await connectAs(page,info.project.name==='desktop'?13:16);
  await localPost(page,'/moo/presence',{action:'arrive'});
  await openProfileView(page,'Edit profile');
  const draft=page.getByLabel('About you',{exact:true});await draft.fill('Do not interrupt this draft');
  const other=await browser.newContext(),outside=await other.newPage();await connectAs(outside,info.project.name==='desktop'?14:17);
  await outside.getByRole('button',{name:'Ring the office',exact:true}).click();
  await expect(page.getByRole('link',{name:/Someone is at the door/})).toBeVisible();
  await expect(draft).toHaveValue('Do not interrupt this draft');await expect(draft).toBeFocused();await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button',{name:'Save profile',exact:true}).click();await navigate(page,'Home');
  await expect(page.getByRole('button',{name:'I’ll get the door',exact:true})).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();await expect(page.getByRole('button',{name:'I’ll get the door',exact:true})).toBeVisible();await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button',{name:'I’ll get the door',exact:true}).click();
  await outside.getByRole('button',{name:'I’m inside',exact:true}).click();
  await outside.getByRole('button',{name:'I’m leaving',exact:true}).click();
  await localPost(page,'/moo/presence',{action:'leave'});await other.close();
});
test('foreground sound is deduplicated across tabs and never rings for the requester',async({page,context,browser},info)=>{
  const fake=()=>{
    (window as any).plays=0;
    (window as any).AudioContext=class {
      state='running'; destination={};
      resume(){return Promise.resolve();}
      decodeAudioData(){return Promise.resolve({});}
      createBufferSource(){return {buffer:null,connect(){},disconnect(){},stop(){},start(){(window as any).plays++;}};}
    };
  };
  await context.addInitScript(fake);await connectAs(page,info.project.name==='desktop'?7:10);await localPost(page,'/moo/presence',{action:'arrive'});
  await openProfileView(page,'Office alerts');await page.getByRole('button',{name:/^(Enable|Reactivate) cow sound$/,exact:true}).click();await navigate(page,'Home');
  const second=await context.newPage();await second.goto('/');await expect(second.getByRole('heading',{name:/^Hi, /})).toBeVisible();await openProfileView(second,'Office alerts');await second.getByRole('button',{name:/^(Enable|Reactivate) cow sound$/,exact:true}).click();await navigate(second,'Home');
  const outsideContext=await browser.newContext(),outside=await outsideContext.newPage();await outside.addInitScript(fake);await connectAs(outside,info.project.name==='desktop'?9:12);await outside.getByRole('button',{name:'Ring the office',exact:true}).click();
  await expect.poll(async()=>await page.evaluate(()=>(window as any).plays)+await second.evaluate(()=>(window as any).plays)).toBe(3);
  expect(await outside.evaluate(()=>(window as any).plays)).toBe(0);
  await outside.getByRole('button',{name:'Cancel request',exact:true}).click();await localPost(page,'/moo/presence',{action:'leave'});await second.close();await outsideContext.close();
});
