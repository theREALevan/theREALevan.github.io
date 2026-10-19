#!/usr/bin/env python3
"""Focused real-browser checks for the classic / 3D alternate-view website.

Requires Playwright and Chromium. Start tools/serve.py first, then run:
  python tools/browser-check.py --url http://127.0.0.1:8766/ --report tools/browser-check.json
Screenshots default to a new temporary directory. Reports are generated locally
and are not checked into the repository.
"""
import argparse
import json
import math
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--url', default='http://127.0.0.1:8766/')
parser.add_argument('--output-dir', type=Path)
parser.add_argument('--report', type=Path)
args = parser.parse_args()
base = args.url.rstrip('/') + '/'
world_url = urljoin(base, 'world.html')
out = args.output_dir or Path(tempfile.mkdtemp(prefix='lunar-browser-check-'))
out.mkdir(parents=True, exist_ok=True)
report = {'url': base, 'checked_at': datetime.now(timezone.utc).isoformat(),
          'scope': 'Current classic default and immediate-entry 3D alternate view',
          'checks': [], 'screenshots': [], 'console': [], 'pageerrors': []}
flags = ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle',
         '--use-angle=swiftshader', '--enable-unsafe-swiftshader']


def check(name, passed, detail=None):
    item = {'name': name, 'passed': bool(passed), 'detail': detail}
    report['checks'].append(item)
    print(json.dumps(item), flush=True)


def observe(page, label):
    page.on('pageerror', lambda error: report['pageerrors'].append({'page': label, 'error': str(error)}))
    page.on('console', lambda msg: report['console'].append({'page': label, 'type': msg.type, 'text': msg.text}) if msg.type in ['warning', 'error'] else None)


def state(page):
    return page.evaluate('window.__lunar.getState()')


def ready(page):
    page.wait_for_function('window.__lunar?.getState().ready', timeout=45000)


def screenshot(page, name):
    path = str(out / (name + '.png'))
    page.screenshot(path=path, full_page=True)
    report['screenshots'].append(path)
    print(json.dumps({'screenshot': path}), flush=True)


def viewport_check(page, label, fixed=True):
    size = page.evaluate('({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,height:innerHeight,scrollHeight:document.documentElement.scrollHeight})')
    check(label, size['scrollWidth'] <= size['width'] and (not fixed or size['scrollHeight'] <= size['height']), size)


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=flags)
    report['browser'] = browser.version
    context = browser.new_context(viewport={'width': 1440, 'height': 1000}, device_scale_factor=1)
    page = context.new_page()
    observe(page, 'classic and world')
    page.goto(base, wait_until='domcontentloaded')
    page.locator('h1.name').wait_for()
    page.evaluate('Promise.race([document.fonts.ready, new Promise(resolve=>setTimeout(resolve,2000))])')
    check('default page is classic academic homepage', page.locator('h1.name').inner_text() == 'Yiwen (Evan) Zhang' and page.locator('.paper').count() == 4 and page.locator('#world').count() == 0)
    check('academic homepage shares the Classic / World switch and highlights Classic', page.locator('.view-switch a').count() == 2 and page.locator('.view-switch [aria-current="page"]').inner_text() == 'Classic')
    screenshot(page, 'classic-1440')
    viewport_check(page, 'classic desktop no horizontal overflow', fixed=False)
    for width, height in [(390, 844), (320, 740)]:
        page.set_viewport_size({'width': width, 'height': height})
        viewport_check(page, f'classic {width}px no horizontal overflow', fixed=False)
    page.set_viewport_size({'width': 1440, 'height': 1000})
    page.locator('.view-switch a', has_text='3D World').click()
    page.wait_for_url(world_url)
    ready(page)
    check('classic switch opens world.html', page.url == world_url)
    check('world switch identifies active view', page.locator('.view-switch [aria-current="page"]').inner_text() == '3D World')
    check('3D world opens with centered planet and follow camera', state(page)['exploring'] and state(page)['followRover'], state(page))
    check('no hero or explore gate remains', page.locator('#intro, #explore-button').count() == 0)
    check('touch controls active at entry', not page.locator('#touch-controls').evaluate('(e)=>e.inert'))
    for width, height in [(1440, 1000), (390, 844), (320, 740)]:
        page.set_viewport_size({'width': width, 'height': height})
        page.reload(wait_until='domcontentloaded')
        ready(page)
        page.wait_for_timeout(300)
        screenshot(page, f'world-{width}')
        if width < 761:
            visible = page.locator('.station-label').evaluate_all('(es)=>es.filter(e=>getComputedStyle(e).visibility==="visible").length')
            check(f'initial world {width}px shows all four nearby outpost labels', visible == 4, visible)
        viewport_check(page, f'world {width}px no overflow')
    page.set_viewport_size({'width': 1440, 'height': 1000})
    before = state(page)
    page.keyboard.down('w'); page.wait_for_timeout(1000); page.keyboard.up('w')
    after = state(page)
    check('W drives immediately and enables follow camera', after['followRover'] and math.dist(before['rover'].values(), after['rover'].values()) > .5, {'before': before, 'after': after})
    page.locator('#overview-button').click()
    check('reset restores planet view and leaves controls active', state(page)['followRover'] and not page.locator('#touch-controls').evaluate('(e)=>e.inert'), state(page))
    page.locator('#map-surface button[aria-label="Travel to MosaiChunk"]').click()
    check('map travel enables follow camera', state(page)['followRover'] and state(page)['destination'] == 'mosaichunk')
    page.wait_for_function('__lunar.getState().nearby==="mosaichunk" && __lunar.getState().destination===null', timeout=28000)
    check('map autopilot arrives at publication', state(page)['nearby'] == 'mosaichunk', state(page))
    page.keyboard.press('e')
    check('nearby E opens publication details', page.locator('#paper-dialog').evaluate('(e)=>e.open') and page.locator('#paper-title').inner_text().startswith('MosaiChunk:'))
    screenshot(page, 'world-publication')
    page.keyboard.press('Escape')
    check('Escape closes publication', not page.locator('#paper-dialog').evaluate('(e)=>e.open'))
    page.locator('.view-switch a', has_text='Classic').click()
    page.wait_for_url(base)
    check('world Classic switch returns to default homepage', page.locator('h1.name').count() == 1 and page.locator('.paper').count() == 4)
    context.close()

    mobile = browser.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=1, is_mobile=True, has_touch=True)
    page = mobile.new_page(); observe(page, 'mobile touch')
    page.goto(world_url, wait_until='domcontentloaded'); ready(page)
    before = state(page)
    box = page.locator('#drive-joystick').bounding_box()
    cdp = mobile.new_cdp_session(page)
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': box['x'] + box['width']/2, 'y': box['y'] + box['height']/2}]})
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': box['x'] + box['width']/2, 'y': box['y'] + box['height']*.1}]})
    page.wait_for_timeout(900)
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': 10, 'y': 130}]})
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
    page.wait_for_function('Math.abs(window.__lunar.getState().speed)<.02', timeout=10000); after = state(page)
    page.wait_for_timeout(600); rest = state(page)
    check('touch drives directly and enables follow camera', after['followRover'] and math.dist(before['rover'].values(), after['rover'].values()) > .5, {'before': before, 'after': after})
    check('touch release outside pad stops movement', math.dist(after['rover'].values(), rest['rover'].values()) < .1, {'after': after, 'rest': rest})
    screenshot(page, 'world-mobile-driving')
    mobile.close(); browser.close()

    fallback = p.chromium.launch(headless=True, args=['--no-sandbox', '--disable-dev-shm-usage', '--disable-webgl'])
    page = fallback.new_page(viewport={'width': 390, 'height': 844})
    page.goto(world_url, wait_until='domcontentloaded')
    page.wait_for_function('document.querySelector("#fallback").hidden===false')
    check('3D fallback routes to classic homepage', page.locator('#fallback a[href="./"]').get_attribute('href') == './')
    page.locator('#fallback-papers').click()
    check('3D fallback publications remain available', page.locator('#index-dialog').evaluate('(d)=>d.open') and page.locator('.publication-row').count() == 4)
    fallback.close()

check('current view flows have no runtime JS errors', not report['pageerrors'], report['pageerrors'])
check('current view flows have no console errors', not any(item['type'] == 'error' for item in report['console']), report['console'])
report['summary'] = {'current_passed': sum(item['passed'] for item in report['checks']), 'current_total': len(report['checks'])}
report_path = args.report or out / 'results.json'
report_path.parent.mkdir(parents=True, exist_ok=True)
report_path.write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({'report': str(report_path), **report['summary']}), flush=True)
raise SystemExit(0 if all(item['passed'] for item in report['checks']) else 1)
