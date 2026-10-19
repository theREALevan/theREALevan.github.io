#!/usr/bin/env python3
"""Check mobile joystick input with real Chromium touch events.

Requires a running tools/serve.py and Playwright Chromium. The scene diagnostics
are read only; the rover is driven through browser input, never teleported.
Chromium emulation cannot verify the native iOS text-selection callout itself.
"""
import argparse
import asyncio
import json
import math
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from playwright.async_api import async_playwright

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--url', default='http://127.0.0.1:8766/world.html')
parser.add_argument('--report', type=Path, default=Path(__file__).with_suffix('.json'))
parser.add_argument('--output-dir', type=Path)
args = parser.parse_args()
out = args.output_dir or Path(tempfile.mkdtemp(prefix='mobile-controls-check-'))
out.mkdir(parents=True, exist_ok=True)
report = {'url': args.url, 'checked_at': datetime.now(timezone.utc).isoformat(),
          'checks': [], 'page_errors': [], 'screenshots': [],
          'limitation': 'Chromium mobile emulation does not reproduce native iOS callout UI.'}
flags = ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle',
         '--use-angle=swiftshader', '--enable-unsafe-swiftshader']


def check(name, passed, detail=None):
    item = {'name': name, 'passed': bool(passed), 'detail': detail}
    report['checks'].append(item)
    print(json.dumps(item), flush=True)


async def state(page):
    return await page.evaluate('window.__lunar.getState()')


async def shot(page, name):
    path = out / f'{name}.png'
    await page.screenshot(path=str(path))
    report['screenshots'].append(str(path))


class TouchStick:
    def __init__(self, page, cdp, box):
        self.page, self.cdp = page, cdp
        self.cx, self.cy = box['x'] + box['width']/2, box['y'] + box['height']/2
        self.radius = box['width']*.45

    def point(self, x=0, y=0, ident=1):
        return {'x': self.cx+x*self.radius, 'y': self.cy+y*self.radius,
                'id': ident, 'radiusX': 6, 'radiusY': 6, 'force': 1}

    async def send(self, kind, points):
        await self.cdp.send('Input.dispatchTouchEvent', {'type': kind, 'touchPoints': points})

    async def start(self, x, y):
        await self.send('touchStart', [self.point()])
        await self.send('touchMove', [self.point(x, y)])

    async def end(self, cancel=False):
        await self.send('touchCancel' if cancel else 'touchEnd', [])

    async def settled(self):
        await self.page.wait_for_function('''()=>{const s=window.__lunar.getState();
          return !s.joystick.active && s.joystick.magnitude===0 && Math.abs(s.speed)<.03}''', timeout=10000)
        return await state(self.page)


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=flags)
        report['browser'] = browser.version
        context = await browser.new_context(viewport={'width': 390, 'height': 844},
                                             device_scale_factor=1, is_mobile=True, has_touch=True)
        page = await context.new_page()
        page.on('pageerror', lambda error: report['page_errors'].append(str(error)))
        await page.goto(args.url, wait_until='domcontentloaded')
        await page.wait_for_function('window.__lunar?.getState().ready', timeout=30000)
        stick = TouchStick(page, await context.new_cdp_session(page),
                           await page.locator('#drive-joystick').bounding_box())
        style = await page.locator('#drive-joystick').evaluate('''e=>({
          tag:e.tagName,label:e.getAttribute('aria-label'),text:e.textContent.trim(),
          userSelect:getComputedStyle(e).userSelect,touchAction:getComputedStyle(e).touchAction,
          childSelect:[...e.children].map(c=>getComputedStyle(c).userSelect)})''')
        check('joystick has accessible label and suppresses control selection/gestures',
              style['tag']=='BUTTON' and bool(style['label']) and style['userSelect']=='none'
              and style['touchAction']=='none' and all(v=='none' for v in style['childSelect']), style)

        await stick.start(0, -.03)
        await page.wait_for_timeout(250)
        center = await state(page)
        check('center deadzone does not drive', center['joystick']['active'] and
              center['joystick']['magnitude']==0 and abs(center['speed'])<.03, center['joystick'])
        await stick.end()

        for name, x, y in [('up',0,-1), ('right',1,0), ('down',0,1),
                            ('left',-1,0), ('diagonal',.7,-.7)]:
            await page.keyboard.press('r')
            before = await state(page)
            await stick.start(x,y)
            await page.wait_for_timeout(1200)
            held = await state(page)
            j = held['joystick']
            signs = (abs(j['x'])<.01 if x==0 else j['x']*x>0) and (abs(j['y'])<.01 if y==0 else j['y']*y>0)
            check(f'1.2 s {name} touch hold gives continuous direction and actual driving',
                  j['active'] and j['magnitude']>.8 and signs
                  and math.dist(before['normal'],held['normal'])>.001,
                  {'joystick':j,'speed':held['speed'],'surfaceTravel':math.dist(before['normal'],held['normal'])*held['radius']})
            check(f'{name} hold does not select page text', await page.evaluate('getSelection().toString()')=='')
            if name=='diagonal':
                await shot(page, 'joystick-held-390')
            await stick.end()
            await stick.settled()

        await page.keyboard.press('r')
        await stick.start(0,-1)
        previous=await state(page)
        steering=[]
        for x,y in [(0,-1),(1,0),(0,1)]:
            await stick.send('touchMove',[stick.point(x,y)])
            await page.wait_for_timeout(1000)
            current=await state(page)
            steering.append({'joystick':current['joystick'],
                             'travel':math.dist(previous['normal'],current['normal'])*current['radius'],
                             'headingChange':math.dist(previous['forward'],current['forward'])})
            previous=current
        check('one held gesture steers up then right then down without lifting',
              all(s['joystick']['active'] and s['travel']>.01 for s in steering)
              and steering[0]['joystick']['y']<-.9 and steering[1]['joystick']['x']>.9
              and steering[2]['joystick']['y']>.9
              and all(s['headingChange']>.2 for s in steering[1:]),steering)
        await stick.end()
        await stick.settled()

        magnitudes=[]
        for label, amount in [('partial',.3),('full',1)]:
            await page.keyboard.press('r')
            await stick.start(0,-amount)
            await page.wait_for_timeout(1200)
            s=await state(page)
            magnitudes.append({'label':label,'magnitude':s['joystick']['magnitude'],'speed':s['speed']})
            await stick.end()
            await stick.settled()
        check('partial deflection drives slower than full deflection',
              0<magnitudes[0]['magnitude']<magnitudes[1]['magnitude'] and
              0<magnitudes[0]['speed']<magnitudes[1]['speed']*.8, magnitudes)

        await page.keyboard.press('r')
        await stick.start(0,-1)
        await page.wait_for_timeout(350)
        await stick.send('touchMove',[{'x':10,'y':140,'id':1,'radiusX':6,'radiusY':6,'force':1}])
        await stick.end()
        stopped = await stick.settled()
        await page.wait_for_timeout(300)
        rest = await state(page)
        check('release outside stick stops and recenters input',
              math.dist(stopped['normal'],rest['normal'])<.001 and rest['joystick']['x']==0
              and rest['joystick']['y']==0, {'joystick':rest['joystick'],'speed':rest['speed']})

        await stick.start(0,-1)
        await page.wait_for_timeout(350)
        await stick.end(cancel=True)
        canceled = await stick.settled()
        check('native touchCancel stops and recenters input', not canceled['joystick']['active'] and abs(canceled['speed'])<.03, canceled['joystick'])

        await page.keyboard.press('r')
        await stick.start(0,-1)
        await stick.send('touchStart',[stick.point(0,-1),stick.point(.7,0,2)])
        two = (await state(page))['joystick']
        # CDP touchEnd takes the lifted contact, not the contacts remaining down.
        await stick.send('touchEnd',[stick.point(.7,0,2)])
        one = (await state(page))['joystick']
        check('second finger cannot steal or release active joystick',
              two['active'] and one['active'] and abs(two['x'])<.01 and one['y']<-.8,
              {'twoFingers':two,'primaryRemaining':one})
        await stick.end()
        await stick.settled()

        await stick.start(0,-1)
        await page.wait_for_timeout(250)
        await page.evaluate("window.dispatchEvent(new Event('blur'))")
        blurred = await stick.settled()
        check('window blur clears active stick and speed', not blurred['joystick']['active'] and abs(blurred['speed'])<.03, blurred['joystick'])
        await stick.end()

        await stick.start(0,-1)
        await page.wait_for_timeout(250)
        await page.keyboard.press('r')
        reset = await stick.settled()
        check('return-to-base resets active stick', not reset['joystick']['active'] and abs(reset['speed'])<.03, reset['joystick'])
        await stick.end()

        scope = await page.evaluate('''()=>{const e=document.querySelector('#drive-joystick');
          return Object.fromEntries(['contextmenu','selectstart'].map(type=>[type,!e.dispatchEvent(new Event(type,{bubbles:true,cancelable:true}))]));}''')
        check('selection and contextmenu cancellation is applied to joystick', all(scope.values()), scope)

        await page.keyboard.press('r')
        before = await state(page)
        await page.keyboard.down('w')
        await page.wait_for_timeout(700)
        driven = await state(page)
        await page.keyboard.up('w')
        await stick.settled()
        check('keyboard W continues to drive without touch input', math.dist(before['normal'],driven['normal'])>.01 and not driven['joystick']['active'])

        await page.keyboard.press('r')
        await stick.start(0,-1)
        await page.wait_for_timeout(250)
        await page.locator('#map-surface').get_by_role('button',name='Travel to MosaiChunk',exact=True).click()
        autopilot=await state(page)
        check('map travel clears held joystick and takes over navigation',
              not autopilot['joystick']['active'] and autopilot['joystick']['magnitude']==0
              and (autopilot['destination']=='mosaichunk' or autopilot['nearby']=='mosaichunk'),
              {'joystick':autopilot['joystick'],'destination':autopilot['destination'],'nearby':autopilot['nearby']})
        await stick.end()
        await page.keyboard.press('r')
        await stick.start(0,-1)
        await page.locator('#papers-button').click()
        modal=await state(page)
        check('opening publications clears held joystick and stops rover',not modal['joystick']['active'] and modal['speed']==0,modal['joystick'])
        await stick.end()
        search = page.locator('#paper-search')
        await search.fill('MosaiChunk')
        check('publication search remains editable and filters results', await search.input_value()=='MosaiChunk' and await page.locator('.publication-row').count()==1)
        await search.press('ControlOrMeta+A')
        await search.press('Backspace')
        check('search text can be selected and replaced', await search.input_value()=='' and await page.locator('.publication-row').count()==4)
        await page.get_by_role('button', name='Read MosaiChunk', exact=True).click()
        paper = await page.locator('#paper-title').evaluate('''e=>{
          const range=document.createRange();range.selectNodeContents(e);const selection=getSelection();
          selection.removeAllRanges();selection.addRange(range);
          const result={userSelect:getComputedStyle(e).userSelect,selection:selection.toString(),
            contextmenuCanceled:!e.dispatchEvent(new Event('contextmenu',{bubbles:true,cancelable:true})),
            selectstartCanceled:!e.dispatchEvent(new Event('selectstart',{bubbles:true,cancelable:true}))};
          selection.removeAllRanges();return result;}''')
        check('paper text retains selection and contextmenu behavior', paper['userSelect']!='none' and paper['selection'].startswith('MosaiChunk:') and not paper['contextmenuCanceled'] and not paper['selectstartCanceled'], paper)
        await page.keyboard.press('Escape')
        await page.keyboard.press('r')
        await shot(page,'joystick-rest-390')
        await page.set_viewport_size({'width':320,'height':740})
        await page.wait_for_timeout(200)
        layout = await page.locator('#drive-joystick').evaluate('''e=>{const r=e.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth}}''')
        check('joystick remains inside 320 px viewport without overflow',layout['left']>=0 and layout['right']<=320 and layout['bottom']<=740 and layout['scrollWidth']<=320,layout)
        await shot(page,'joystick-rest-320')
        check('mobile controls have no uncaught JavaScript errors', not report['page_errors'], report['page_errors'])
        await context.close()
        await browser.close()


try:
    asyncio.run(main())
except Exception as error:
    check('test completes', False, f'{type(error).__name__}: {error}')
finally:
    report['summary']={'passed':sum(item['passed'] for item in report['checks']),'total':len(report['checks'])}
    args.report.write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({'report':str(args.report),**report['summary']}),flush=True)
raise SystemExit(0 if all(item['passed'] for item in report['checks']) else 1)
