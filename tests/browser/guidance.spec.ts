import {test,expect} from '@playwright/test';
import {connectAs,navigate,openProfileView} from './helpers';
test('optional help stays local, uses pages, preserves browser Back and never sends door requests',async({page,context},info)=>{
  await connectAs(page,info.project.name==='desktop'?29:30);
  const actions:string[]=[];page.on('request',r=>{if(r.method()==='POST'&&r.url().includes('/api/moo/'))actions.push(r.url());});
  const tip=page.getByRole('complementary',{name:'Quick tip'});await expect(tip).toContainText('At the office?');
  const second=await context.newPage();await second.goto('/');await expect(second.getByRole('complementary',{name:'Quick tip'})).toBeVisible();
  await tip.getByRole('button',{name:'Not now',exact:true}).click();await expect(second.getByRole('complementary',{name:'Quick tip'})).toHaveCount(0);await second.close();await page.reload();await expect(tip).toHaveCount(0);
  await openProfileView(page,'Help');await page.getByRole('button',{name:'Office presence',exact:true}).click();await expect(page).toHaveURL(/view=help&topic=presence/);await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();await expect(page.getByText('Check in when you arrive',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Help',exact:true}).click();await page.getByRole('button',{name:'Backup & recovery guide',exact:true}).click();await expect(page.getByText(/Keep both the file and its password/)).toBeVisible();await page.getByRole('button',{name:'Open Identity & recovery',exact:true}).click();await expect(page.getByRole('heading',{name:'Identity & recovery',exact:true})).toBeVisible();await page.goBack();await expect(page.getByRole('heading',{name:'Keep your identity safe',exact:true})).toBeVisible();expect(actions).toEqual([]);
  await page.goto('/account?view=help&topic=toString');await expect(page.getByRole('region',{name:'Help topics',exact:true})).toBeVisible();
  await page.setViewportSize({width:390,height:800});await page.screenshot({path:'/tmp/bitpolito-team-help.png',fullPage:true});
  await navigate(page,'Home');await page.screenshot({path:'/tmp/bitpolito-team-home.png',fullPage:true});
});
test('failed check-in does not complete guidance and success leaves alerts optional',async({page},info)=>{
  await connectAs(page,info.project.name==='desktop'?31:32);
  await page.route('**/api/moo/presence',r=>r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Retry check-in'})}));await page.getByRole('button',{name:'I’m in the office',exact:true}).click();await expect(page.getByText('Retry check-in',{exact:true})).toBeVisible();await page.reload();await expect(page.getByRole('complementary',{name:'Quick tip'})).toContainText('At the office?');await page.unroute('**/api/moo/presence');await page.getByRole('button',{name:'I’m in the office',exact:true}).click();await expect(page.getByRole('button',{name:'Set up office alerts',exact:true})).toBeVisible();await page.getByRole('button',{name:'Not now',exact:true}).click();await page.getByRole('button',{name:'I’m leaving',exact:true}).click();await expect(page.getByRole('complementary',{name:'Quick tip'})).toHaveCount(0);
});
