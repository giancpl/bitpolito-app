import { test, expect } from "@playwright/test";
import { connectAs, localPost, navigate, openProfileView } from "./helpers";

test("phone navigation and actions fit four widths and keyboard-safe pages preserve drafts",async({page},info)=>{
  await connectAs(page,info.project.name==='desktop'?19:20);
  await localPost(page,'/moo/presence',{action:'leave'});
  for(const width of [360,390,768,1440]){
    await page.setViewportSize({width,height:800});
    const check=page.getByRole('button',{name:'I’m in the office',exact:true});
    expect((await check.boundingBox())!.height).toBeGreaterThanOrEqual(48);
    expect((await page.getByRole('button',{name:'Ring the office',exact:true}).boundingBox())!.y).toBeLessThan(800);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await expect(page.getByRole('navigation',{name:'Main navigation'})).toBeInViewport();
  }
  await page.setViewportSize({width:390,height:400});
  await openProfileView(page,'Edit profile');
  await page.getByLabel('About you',{exact:true}).fill('My mobile draft');
  await page.getByRole('link',{name:'Home',exact:true}).last().click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(page.getByLabel('About you',{exact:true})).toHaveValue('My mobile draft');
  await page.getByRole('button',{name:'Save profile',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Profile',exact:true})).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test("office setup records a human sound check, restores audio sessions and recovers failures", async ({
  page,
}, info) => {
  await page.addInitScript(() => {
    const state = ((window as any).audioTest = {
      plays: 0,
      allowed: true,
      sessions: [] as string[],
      vibrations: [] as unknown[],
      source: undefined as any,
    });
    let sessionType = "ambient";
    Object.defineProperty(navigator, "audioSession", {
      configurable: true,
      value: {
        get type() {
          return sessionType;
        },
        set type(value: string) {
          sessionType = value;
          state.sessions.push(value);
        },
      },
    });
    Object.defineProperty(navigator, "vibrate", {
      configurable: true,
      value: (pattern: unknown) => {
        state.vibrations.push(pattern);
        return true;
      },
    });
    (window as any).AudioContext = class {
      state = "running";
      destination = {};
      onstatechange = null;
      resume() {
        return Promise.resolve();
      }
      decodeAudioData() {
        return Promise.resolve({ duration: 2 });
      }
      createBufferSource() {
        const source = {
          buffer: null,
          onended: null as null | (() => void),
          connect() {},
          disconnect() {},
          start() {
            if (!state.allowed) throw Error("Audio interrupted");
            state.plays++;
          },
          stop() {
            source.onended?.();
          },
        };
        state.source = source;
        return source;
      }
    };
  });
  await connectAs(page, info.project.name === "desktop" ? 21 : 22);
  await localPost(page, "/moo/presence", { action: "leave" });
  await openProfileView(page, "Office alerts");
  await expect(
    page.getByRole("heading", { name: "Enable alerts", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Test", exact: true }),
  ).toBeVisible();
  const vibration = page.getByRole("switch", {
    name: "Vibrate with office alerts",
    exact: true,
  });
  await vibration.click();
  await page
    .getByRole("button", { name: "Enable cow sound", exact: true })
    .click();
  await expect(
    page.getByText("Did you hear the sound?", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Last heard by you:/)).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      (window as any).audioTest.vibrations.some((v: unknown) =>
        Array.isArray(v),
      ),
    ),
  ).toBe(false);
  await page.evaluate(() => (window as any).audioTest.source.onended());
  expect(await page.evaluate(() => (navigator as any).audioSession.type)).toBe(
    "ambient",
  );
  await page
    .getByRole("button", { name: "Yes, I heard it", exact: true })
    .click();
  await expect(page.getByText(/Last heard by you:/)).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Reactivate cow sound", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Last heard by you:/)).toBeVisible();
  await localPost(page, "/moo/presence", { action: "arrive" });
  await expect.poll(async()=> (await (await page.request.get("/api/moo/state")).json()).presence.length).toBeGreaterThan(0);
  await page
    .getByRole("button", { name: "Reactivate cow sound", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).audioTest.vibrations.some((v: unknown) =>
          Array.isArray(v),
        ),
      ),
    )
    .toBe(true);
  await page.getByRole("button", { name: "No, help me", exact: true }).click();
  await expect(
    page.getByText(/Turn up your phone’s media volume/),
  ).toBeVisible();
  await page.evaluate(() => {
    (window as any).audioTest.allowed = false;
  });
  await page
    .getByRole("button", { name: "Test cow sound", exact: true })
    .click();
  await expect(
    page.getByText(/Tap again to enable the cow sound/),
  ).toBeVisible();
  expect(await page.evaluate(() => (navigator as any).audioSession.type)).toBe(
    "ambient",
  );
  await page.evaluate(() => {
    (window as any).audioTest.allowed = true;
  });
  await page
    .getByRole("button", { name: "Reactivate cow sound", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Mute cow sound", exact: true })
    .click();
  expect(await page.evaluate(() => (navigator as any).audioSession.type)).toBe(
    "ambient",
  );
  await localPost(page, "/moo/presence", { action: "leave" });
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "vibrate", {
      configurable: true,
      value: undefined,
    }),
  );
  await page.reload();
  await expect(vibration).toHaveCount(0);
});
