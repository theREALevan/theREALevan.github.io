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
parser.add_argument('--obstacle-only', action='store_true', help='Only check reversing away from an outpost collision')
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


def dot(a, b):
    return sum(x*y for x,y in zip(a,b))


def cross(a, b):
    return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]


def movement(before, after):
    """Measure displacement and yaw independently of the rover implementation.

    Transport the starting heading along the shortest arc between sampled
    normals, so ordinary curvature of the planet is not mistaken for steering.
    """
    n0,n1=before['normal'],after['normal']
    f0,f1=before['forward'],after['forward']
    axis=cross(n0,n1)
    sine=math.sqrt(dot(axis,axis))
    cosine=max(-1,min(1,dot(n0,n1)))
    angle=math.atan2(sine,cosine)
    transported=f0
    if sine>1e-10:
        axis=[x/sine for x in axis]
        perpendicular=cross(axis,f0)
        transported=[f0[i]*cosine+perpendicular[i]*sine+axis[i]*dot(axis,f0)*(1-cosine) for i in range(3)]
    heading=math.atan2(dot(n1,cross(transported,f1)),dot(transported,f1))
    signed_forward=after['radius']*angle*dot(n1,f0)/sine if sine>1e-10 else 0
    return {'simulatedSeconds':after['simulationTime']-before['simulationTime'],
            'signedForwardDistance':signed_forward,'surfaceDistance':after['radius']*angle,
            'transportedHeadingRadians':heading,'headingAlignment':dot(transported,f1),
            'speed':after['speed'],'joystick':after['joystick']}


async def advance_time(page, start, seconds):
    await page.wait_for_function('(end)=>window.__lunar.getState().simulationTime>=end',
                                 arg=start['simulationTime']+seconds, timeout=20000)
    return await state(page)


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


async def obstacle_reverse(page, stick, travel_started=False):
    if not travel_started:
        await page.keyboard.press('r')
        await page.locator('#map-surface').get_by_role('button',name='Travel to MosaiChunk',exact=True).click()
    await page.wait_for_function('''()=>{const s=window.__lunar.getState();
      return s.destination===null && s.nearby==='mosaichunk' && Math.abs(s.speed)<.03}''',timeout=60000)
    approach=await state(page)
    await stick.start(0,-1)
    await page.wait_for_function('''(start)=>{const s=window.__lunar.getState();
      return Math.hypot(...s.normal.map((v,i)=>v-start[i]))>.02}''',arg=approach['normal'],timeout=15000)
    await page.wait_for_function('Math.abs(window.__lunar.getState().speed)<.03',timeout=15000)
    # A rejected large step can be followed by smaller acceleration steps that
    # approach the boundary. Sample after that approach has settled.
    first_contact=await state(page)
    blocked=await advance_time(page,first_contact,1)
    still_blocked=await advance_time(page,blocked,.3)
    blocked_motion=movement(blocked,still_blocked)
    check('forward throttle stops at the outpost obstacle',
          blocked['joystick']['y']<-.9 and abs(still_blocked['speed'])<.03
          and blocked_motion['surfaceDistance']<.03,blocked_motion)
    await stick.send('touchMove',[stick.point(0,1)])
    backed=await advance_time(page,still_blocked,1)
    motion=movement(still_blocked,backed)
    check('pulling down backs away from the obstacle without turning around',
          motion['speed']<-1 and motion['signedForwardDistance']<-.5
          and motion['headingAlignment']>.999 and abs(motion['transportedHeadingRadians'])<.02,motion)
    await shot(page,'joystick-back-away-from-outpost')
    await stick.end()
    await stick.settled()


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

        if args.obstacle_only:
            await obstacle_reverse(page,stick)
            check('obstacle reverse has no uncaught JavaScript errors',not report['page_errors'],report['page_errors'])
            await browser.close()
            return

        await stick.start(0, -.03)
        await page.wait_for_timeout(250)
        center = await state(page)
        check('center deadzone does not drive', center['joystick']['active'] and
              center['joystick']['magnitude']==0 and abs(center['speed'])<.03, center['joystick'])
        await stick.end()

        async def touch_sample(x,y,seconds=1.2,screenshot=None):
            await page.keyboard.press('r')
            await stick.start(x,y)
            begin=await state(page)
            held=await advance_time(page,begin,seconds)
            result=movement(begin,held)
            result['selection']=await page.evaluate('getSelection().toString()')
            if screenshot:
                await shot(page,screenshot)
            await stick.end()
            await stick.settled()
            return result

        async def keyboard_sample(keys,seconds=1.2):
            await page.keyboard.press('r')
            for key in keys:
                await page.keyboard.down(key)
            begin=await state(page)
            held=await advance_time(page,begin,seconds)
            result=movement(begin,held)
            for key in keys:
                await page.keyboard.up(key)
            await page.keyboard.press('r')
            return result

        forward=await touch_sample(0,-1)
        check('holding stick up drives forward without turning',
              forward['speed']>2 and forward['signedForwardDistance']>1
              and abs(forward['transportedHeadingRadians'])<.02,forward)
        reverse=await touch_sample(0,1,screenshot='joystick-reverse-390')
        check('holding stick down reverses behind current heading without a U-turn',
              reverse['speed']<-1.5 and reverse['signedForwardDistance']<-.5
              and reverse['headingAlignment']>.999 and abs(reverse['transportedHeadingRadians'])<.02,reverse)
        check('forward and reverse long holds do not select page text',
              forward['selection']=='' and reverse['selection']=='')
        keyboard_reverse=await keyboard_sample(['s'])
        reverse_ratio=(reverse['signedForwardDistance']/reverse['simulatedSeconds'])/(keyboard_reverse['signedForwardDistance']/keyboard_reverse['simulatedSeconds'])
        check('joystick down matches keyboard S signed travel and heading',
              keyboard_reverse['speed']<0 and keyboard_reverse['signedForwardDistance']<0
              and .8<reverse_ratio<1.2
              and abs(reverse['speed']-keyboard_reverse['speed'])<.2
              and abs(reverse['transportedHeadingRadians']-keyboard_reverse['transportedHeadingRadians'])<.02,
              {'joystick':reverse,'keyboardS':keyboard_reverse,'distancePerSecondRatio':reverse_ratio})

        for name,x,turn_sign in [('left',-1,1),('right',1,-1)]:
            turned=await touch_sample(x,0)
            check(f'pure {name} stick rotates in place without propulsion',
                  abs(turned['speed'])<.01 and turned['surfaceDistance']<.001
                  and turned['transportedHeadingRadians']*turn_sign>.4,turned)

        for name,x,y,keys,turn_sign in [
                ('forward left',-.7,-.7,['w','a'],1),
                ('forward right',.7,-.7,['w','d'],-1),
                ('reverse left',-.7,.7,['s','a'],-1),
                ('reverse right',.7,.7,['s','d'],1)]:
            analog=await touch_sample(x,y,seconds=1)
            keyboard=await keyboard_sample(keys,seconds=1)
            signed_speed=-1 if y>0 else 1
            analog_turn_rate=analog['transportedHeadingRadians']/analog['simulatedSeconds']
            keyboard_turn_rate=keyboard['transportedHeadingRadians']/keyboard['simulatedSeconds']
            # Analog diagonal steering has less than full horizontal deflection.
            rate_ratio=analog_turn_rate/keyboard_turn_rate
            check(f'{name} diagonal has the same vehicle turn and travel signs as keyboard',
                  analog['speed']*signed_speed>1 and keyboard['speed']*signed_speed>1
                  and analog['signedForwardDistance']*signed_speed>.2
                  and keyboard['signedForwardDistance']*signed_speed>.2
                  and analog['transportedHeadingRadians']*turn_sign>.2
                  and keyboard['transportedHeadingRadians']*turn_sign>.2
                  and abs(rate_ratio-abs(analog['joystick']['x']))<.15,
                  {'joystick':analog,'keyboard':keyboard,'turnRateRatio':rate_ratio})

        await page.keyboard.press('r')
        await stick.start(0,-1)
        begin=await state(page)
        advancing=await advance_time(page,begin,.7)
        await stick.send('touchMove',[stick.point(0,1)])
        await page.wait_for_function('window.__lunar.getState().speed < -1',timeout=10000)
        reversing=await state(page)
        continued=await advance_time(page,reversing,.5)
        change=movement(advancing,continued)
        reverse_motion=movement(reversing,continued)
        check('one held up-to-down gesture crosses into reverse without turning around',
              advancing['speed']>2 and continued['speed']<-1 and continued['joystick']['active']
              and reverse_motion['signedForwardDistance']<-.3
              and abs(change['transportedHeadingRadians'])<.02 and change['headingAlignment']>.999,
              {'forwardSpeed':advancing['speed'],'change':change,'reverseMotion':reverse_motion})
        await stick.send('touchMove',[stick.point()])
        await page.wait_for_function('Math.abs(window.__lunar.getState().speed)<.03',timeout=10000)
        centered=await state(page)
        check('returning held stick to center removes throttle and stops rover',
              centered['joystick']['active'] and centered['joystick']['magnitude']==0 and abs(centered['speed'])<.03,centered['joystick'])
        await stick.end()
        await stick.settled()

        magnitudes=[]
        for label, amount in [('partial',.3),('full',1)]:
            sample=await touch_sample(0,-amount)
            magnitudes.append({'label':label,'magnitude':sample['joystick']['magnitude'],'speed':sample['speed'],'simulatedSeconds':sample['simulatedSeconds']})
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
        await obstacle_reverse(page,stick,travel_started=True)
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
