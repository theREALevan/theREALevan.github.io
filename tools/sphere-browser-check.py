#!/usr/bin/env python3
"""Exercise the tiny planet through real keyboard, touch, and publication controls.

Requires a running tools/serve.py plus Playwright/Chromium. Diagnostics are read
only: this test never teleports the rover or mutates scene objects.
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
out = args.output_dir or Path(tempfile.mkdtemp(prefix='sphere-browser-check-'))
out.mkdir(parents=True, exist_ok=True)
report = {'url': args.url, 'checked_at': datetime.now(timezone.utc).isoformat(), 'checks': [], 'page_errors': [], 'console_errors': [], 'screenshots': []}
flags = ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
papers = [('mosaichunk', 'MosaiChunk', 'video'), ('deltanet', 'Video DeltaNet', 'video'), ('archworld', 'ArchWorld', 'video'), ('extremeview', 'Extreme-View Geometry', 'image')]


def check(name, passed, detail=None):
    item = {'name': name, 'passed': bool(passed), 'detail': detail}
    report['checks'].append(item)
    print(json.dumps(item), flush=True)


async def state(page):
    return await page.evaluate('window.__lunar.getState()')


async def ready(page):
    await page.wait_for_function('window.__lunar?.getState().ready', timeout=30000)


async def shot(page, name):
    path = out / f'{name}.png'
    await page.screenshot(path=str(path))
    report['screenshots'].append(str(path))
    print(json.dumps({'screenshot': str(path)}), flush=True)


def pose_check(name, value):
    normal, forward = value['normal'], value['forward']
    detail = {'normal_length': math.sqrt(sum(x*x for x in normal)), 'forward_length': math.sqrt(sum(x*x for x in forward)), 'normal_dot_forward': sum(a*b for a,b in zip(normal, forward)), 'surfaceError': value['surfaceError'], 'orientationError': value['orientationError'], 'planetScreen': value['planetScreen']}
    check(name, abs(detail['normal_length']-1) < 1e-6 and abs(detail['forward_length']-1) < 1e-6 and abs(detail['normal_dot_forward']) < 1e-6 and abs(value['surfaceError']) < 1e-5 and abs(value['orientationError']) < 1e-6 and max(abs(x) for x in value['planetScreen'][:2]) < 1e-6, detail)


async def travel(page, paper, through_index=False):
    pid, title, media_type = paper
    if through_index:
        await page.locator('#papers-button').click()
        await page.locator('#index-dialog').get_by_role('button', name=f'Travel to {title}', exact=True).click()
    else:
        await page.locator('#map-surface').get_by_role('button', name=f'Travel to {title}', exact=True).click()
    print(json.dumps({'travel': pid, 'via': 'publication index' if through_index else 'map'}), flush=True)
    try:
        await page.wait_for_function('(id)=>{const s=window.__lunar.getState();return s.nearby===id && s.destination===null}', arg=pid, timeout=60000)
    except Exception:
        check(f'{title} autopilot timeout state', False, await state(page))
        await shot(page, f'planet-{pid}-failure')
        raise
    arrived = await state(page)
    check(f'{title} autopilot arrives and stops', arrived['nearby'] == pid and arrived['destination'] is None and abs(arrived['speed']) < .1, arrived)
    pose_check(f'{title} keeps rover radial and planet centered', arrived)
    await page.wait_for_function('(id)=>{const p=window.__lunar.getState().preview;return p.id===id&&p.ready&&p.visible&&!p.error}', arg=pid, timeout=20000)
    preview = (await state(page))['preview']
    check(f'{title} hologram displays actual {media_type}', preview['type'] == media_type and preview['ready'] and preview['visible'], preview)
    await page.wait_for_timeout(200)
    bounds = (await state(page))['preview'].get('bounds')
    viewport = page.viewport_size
    check(f'{title} hologram remains readable inside viewport', bounds and bounds['left'] >= 0 and bounds['top'] >= 0 and bounds['right'] <= viewport['width'] and bounds['bottom'] <= viewport['height'] and bounds['mediaWidth'] >= (210 if viewport['width'] < 761 else 260)-.1, bounds)
    if media_type == 'video':
        await page.wait_for_function('window.__lunar.getState().preview.playing', timeout=15000)
        first = (await state(page))['preview']['currentTime']
        await page.wait_for_timeout(500)
        media = await page.locator('body > video[aria-hidden="true"]').evaluate('(v)=>({muted:v.muted,loop:v.loop,inline:v.playsInline,paused:v.paused,time:v.currentTime,ready:v.readyState,width:v.videoWidth,src:v.currentSrc})')
        check(f'{title} video advances muted and loops inline', media['muted'] and media['loop'] and media['inline'] and not media['paused'] and media['ready'] >= 2 and media['width'] > 0 and media['time'] > first, media)
    await shot(page, f'planet-{pid}-{page.viewport_size["width"]}')


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=flags)
        report['browser'] = browser.version
        context = await browser.new_context(viewport={'width': 1440, 'height': 1000}, device_scale_factor=1)
        page = await context.new_page()
        page.on('pageerror', lambda e: report['page_errors'].append(str(e)))
        page.on('console', lambda m: report['console_errors'].append(m.text) if m.type == 'error' else None)
        await page.goto(args.url, wait_until='domcontentloaded')
        await ready(page)
        await shot(page, 'planet-desktop-entry')
        initial = await state(page)
        pose_check('entry rover is tangent to spherical terrain and globe is centered', initial)
        check('tiny planet uses enlarged rover and stations', initial['roverScale'] > 1 and initial['stationScale'] > 1, {'radius': initial['radius'], 'roverScale': initial['roverScale'], 'stationScale': initial['stationScale']})
        await page.keyboard.down('w')
        await page.wait_for_timeout(1000)
        moving = await state(page)
        await page.keyboard.up('w')
        check('keyboard drive moves along surface and camera follows with lag', math.dist(initial['normal'], moving['normal']) > .03 and moving['cameraLag'] > .005, {'before': initial, 'moving': moving})
        pose_check('moving rover retains radial pose and centered planet', moving)
        await page.wait_for_function('Math.abs(window.__lunar.getState().speed)<.03', timeout=15000)
        await page.wait_for_function('(lag)=>window.__lunar.getState().cameraLag<lag*.25', arg=moving['cameraLag'], timeout=10000)
        settled = await state(page)
        check('camera lag decays after rover stops', settled['cameraLag'] < moving['cameraLag']*.25 and abs(settled['speed']) < .03, {'movingLag': moving['cameraLag'], 'settledLag': settled['cameraLag'], 'settledSpeed': settled['speed']})
        await page.keyboard.press('r')
        await page.keyboard.down('w')
        await page.wait_for_function('window.__lunar.getState().normal[1]<-.2', timeout=45000)
        far_side = await state(page)
        pose_check('keyboard drive crosses into far hemisphere without leaving surface', far_side)
        await shot(page, 'planet-far-hemisphere')
        await page.wait_for_function('window.__lunar.getState().normal[1]>.97 && window.__lunar.getState().normal[2]<0', timeout=60000)
        full_circle = await state(page)
        await page.keyboard.up('w')
        pose_check('keyboard drive completes a circuit and returns upright', full_circle)
        check('actual continuous keyboard drive circumnavigates planet', far_side['normal'][1] < -.2 and full_circle['normal'][1] > .97, {'farSide': far_side['normal'], 'returned': full_circle['normal']})
        await page.keyboard.press('r')
        await travel(page, papers[0])
        await page.locator('#preview-button').click()
        await page.wait_for_timeout(200)
        check('explicit preview pause stops playback', not (await state(page))['preview']['playing'] and (await state(page))['preview']['pausedByUser'])
        await page.locator('#preview-button').click()
        await page.wait_for_function('window.__lunar.getState().preview.playing')
        await page.keyboard.press('e')
        check('nearby E opens matching paper and pauses hologram', await page.locator('#paper-dialog').evaluate('(d)=>d.open') and (await page.locator('#paper-title').inner_text()).startswith('MosaiChunk:') and not (await state(page))['preview']['playing'])
        paused_time = (await state(page))['preview']['currentTime']
        await page.wait_for_timeout(500)
        check('hologram remains paused throughout paper modal', abs((await state(page))['preview']['currentTime']-paused_time) < .05)
        await page.keyboard.press('Escape')
        await page.wait_for_function('window.__lunar.getState().preview.playing')
        check('closing paper resumes nearby preview', (await state(page))['preview']['playing'])
        await page.keyboard.down('s')
        await page.wait_for_function('window.__lunar.getState().preview.id===null', timeout=15000)
        await page.keyboard.up('s')
        check('driving away from outpost unloads and stops its media', (await state(page))['preview']['id'] is None and not (await state(page))['preview']['playing'] and await page.locator('body > video[aria-hidden="true"]').count() == 0)
        await page.keyboard.press('r')
        for index, paper in enumerate(papers[1:]):
            await travel(page, paper, through_index=index%2 == 0)
        check('image outpost has no hidden playing video', await page.locator('body > video[aria-hidden="true"]').count() == 0 and not (await state(page))['preview']['playing'])
        await page.locator('#credits-button').click()
        links = await page.locator('#credits-dialog .credit-links a').evaluate_all('(es)=>es.map(e=>({href:e.href,text:e.textContent}))')
        check('source and credits dialog identifies source Three.js and inspirations', await page.locator('#credits-dialog').evaluate('(d)=>d.open') and len(links) == 4 and any('github.com/theREALevan/theREALevan.github.io' in x['href'] for x in links) and any('threejs.org' in x['href'] for x in links), links)
        await shot(page, 'planet-credits')
        await page.keyboard.press('Escape')
        await context.close()

        for width, height in [(390, 844), (320, 740)]:
            context = await browser.new_context(viewport={'width': width, 'height': height}, device_scale_factor=1, is_mobile=True, has_touch=True)
            page = await context.new_page()
            page.on('pageerror', lambda e: report['page_errors'].append(str(e)))
            await page.goto(args.url, wait_until='domcontentloaded')
            await ready(page)
            await page.wait_for_timeout(200)
            size = await page.evaluate('({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight})')
            check(f'{width}px world fits viewport', size['scrollWidth'] <= size['width'] and size['scrollHeight'] <= size['height'], size)
            pose_check(f'{width}px globe stays centered', await state(page))
            await shot(page, f'planet-mobile-{width}')
            before = await state(page)
            box = await page.locator('[data-drive="ArrowUp"]').bounding_box()
            cdp = await context.new_cdp_session(page)
            await cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': box['x']+box['width']/2, 'y': box['y']+box['height']/2}]})
            await page.wait_for_timeout(900)
            await cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': 10, 'y': 130}]})
            await cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
            await page.wait_for_function('Math.abs(window.__lunar.getState().speed)<.03', timeout=15000)
            after = await state(page)
            check(f'{width}px touch drives and release outside stops', math.dist(before['normal'], after['normal']) > .03 and abs(after['speed']) < .03, {'before': before['normal'], 'after': after['normal'], 'speed': after['speed']})
            pose_check(f'{width}px touch drive retains radial pose', after)
            await page.locator('#overview-button').click()
            await travel(page, papers[0], through_index=True)
            await shot(page, f'planet-mobile-{width}-preview')
            await page.locator('#interact-button').click()
            check(f'{width}px nearby paper action opens details', await page.locator('#paper-dialog').evaluate('(d)=>d.open'))
            await context.close()
        await browser.close()
    check('sphere flows have no uncaught JavaScript errors', not report['page_errors'], report['page_errors'])
    check('sphere flows have no console errors', not report['console_errors'], report['console_errors'])


try:
    asyncio.run(main())
except Exception as error:
    check('test completes', False, f'{type(error).__name__}: {error}')
finally:
    report['summary'] = {'passed': sum(item['passed'] for item in report['checks']), 'total': len(report['checks'])}
    args.report.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'report': str(args.report), **report['summary']}), flush=True)
raise SystemExit(0 if all(item['passed'] for item in report['checks']) else 1)
