#!/usr/bin/env python3
"""Regression checks for blank first paint and endless 3D startup.

Run against tools/serve.py with Playwright and Chromium installed:
  python tools/loading-check.py --url http://127.0.0.1:8766/
The timeout recovery check deliberately holds app.js for 15 seconds.
"""
import argparse
import asyncio
import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen

from playwright.async_api import async_playwright

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--url', default='http://127.0.0.1:8766/')
parser.add_argument('--report', type=Path, default=Path(__file__).with_suffix('.json'))
args = parser.parse_args()
base = args.url.rstrip('/') + '/'
world_url = urljoin(base, 'world.html')
report = {'url': base, 'checked_at': datetime.now(timezone.utc).isoformat(), 'checks': [], 'unexpected_page_errors': []}
flags = ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']


def check(name, passed, detail=None):
    item = {'name': name, 'passed': bool(passed), 'detail': detail}
    report['checks'].append(item)
    print(json.dumps(item), flush=True)


async def ready(page):
    await page.wait_for_function('window.__lunar?.getState().ready', timeout=30000)


async def paint(page):
    await page.wait_for_function('performance.getEntriesByType("paint").some(e => e.name === "first-contentful-paint")', timeout=5000)
    return await page.evaluate('performance.getEntriesByType("paint").map(e => ({name:e.name, milliseconds:e.startTime}))')


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=flags)
        report['browser'] = browser.version
        for name, options in [('desktop', {'viewport': {'width': 1440, 'height': 1000}}),
                              ('mobile', {'viewport': {'width': 390, 'height': 844}, 'is_mobile': True, 'has_touch': True, 'device_scale_factor': 3})]:
            context = await browser.new_context(**options)
            external = []

            async def local_only(route):
                if urlparse(route.request.url).hostname != urlparse(base).hostname:
                    external.append(route.request.url)
                    await route.abort()
                else:
                    await route.continue_()

            await context.route('**/*', local_only)
            page = await context.new_page()
            page.on('pageerror', lambda e: report['unexpected_page_errors'].append(str(e)))
            await page.goto(base, wait_until='domcontentloaded')
            paints = await paint(page)
            check(f'{name} classic paints without external access', await page.locator('h1.name').is_visible(), paints)
            await page.locator('.view-switch a[href="world.html"]').click()
            await ready(page)
            paints = await paint(page)
            state = await page.evaluate('window.__lunar.getState()')
            check(f'{name} Classic to 3D switch renders offline', page.url == world_url and state['drawCalls'] > 0 and await page.locator('#loading').is_hidden() and await page.locator('#fallback').is_hidden(), {'paint': paints, 'state': state})
            await page.locator('#papers-button').click()
            check(f'{name} publication index remains interactive', await page.locator('#index-dialog').evaluate('(d)=>d.open') and await page.locator('.publication-row').count() == 4)
            await page.keyboard.press('Escape')
            await page.get_by_role('link', name='Classic', exact=True).click()
            check(f'{name} 3D to Classic switch works', await page.locator('h1.name').is_visible())
            check(f'{name} has no external font dependencies', not any('fonts.googleapis.com' in url or 'fonts.gstatic.com' in url for url in external), {'blocked_optional_requests': external})
            await context.close()

        # Font files may be slow too: font-display:swap must still permit paint.
        context = await browser.new_context()
        page = await context.new_page()
        held_fonts = []

        async def hold_font(route):
            held_fonts.append(route)

        await page.route('**/*.woff2', hold_font)
        await page.goto(world_url, wait_until='domcontentloaded')
        await ready(page)
        check('world paints while local font files are stalled', bool(await paint(page)) and bool(held_fonts), {'held_fonts': len(held_fonts)})
        for route in held_fonts:
            await route.abort()
        await context.close()

        context = await browser.new_context()
        page = await context.new_page()
        await page.route('**/world/app.js*', lambda route: route.abort())
        await page.goto(world_url, wait_until='domcontentloaded')
        await page.locator('#fallback').wait_for(state='visible', timeout=5000)
        check('failed entry module ends loading and provides working exits', await page.locator('#loading').is_hidden() and await page.locator('#fallback-papers').is_hidden() and await page.locator('#fallback a', has_text='Reload').is_visible())
        await page.locator('#fallback a', has_text='Classic').click()
        check('failed entry module Classic exit opens homepage', await page.locator('h1.name').is_visible())
        await context.close()

        context = await browser.new_context()
        page = await context.new_page()
        held_modules = []

        async def hold_module(route):
            held_modules.append(route)

        await page.route('**/world/app.js*', hold_module)
        await page.goto(world_url, wait_until='domcontentloaded')
        await paint(page)
        await page.locator('#fallback').wait_for(state='visible', timeout=20000)
        check('15 second entry module timeout ends endless loading', await page.locator('#loading').is_hidden() and await page.locator('#fallback-papers').is_hidden() and bool(held_modules))
        for route in held_modules:
            await route.continue_()
        await ready(page)
        check('late entry module recovers from timeout fallback', not await page.locator('#fallback-papers').evaluate('(e)=>e.hidden') and await page.locator('#fallback').is_hidden() and await page.locator('#loading').is_hidden() and not await page.locator('#touch-controls').evaluate('(e)=>e.inert') and not await page.locator('body').evaluate('(e)=>e.classList.contains("world-unavailable")'))
        await page.locator('#papers-button').click()
        check('late entry module recovery permits publication interaction', await page.locator('#index-dialog').evaluate('(d)=>d.open') and await page.locator('.publication-row').count() == 4)
        await context.close()
        await browser.close()

    for asset in ['world/app.js', 'world/scene.js', 'world/vendor/three.module.min.js', 'world/vendor/three.core.min.js']:
        with urlopen(urljoin(base, asset)) as response:
            check(f'{asset} served as JavaScript', response.status == 200 and response.headers.get_content_type() in ['text/javascript', 'application/javascript'], dict(response.headers))
    request = Request(urljoin(base, 'images/mosaichunk.mp4'), headers={'Range': 'bytes=0-1023'})
    with urlopen(request) as response:
        check('publication video supports byte-range playback', response.status == 206 and response.headers.get_content_type() == 'video/mp4' and response.headers.get('Content-Range', '').startswith('bytes 0-1023/') and len(response.read()) == 1024, dict(response.headers))
    check('normal page flows have no uncaught JavaScript errors', not report['unexpected_page_errors'], report['unexpected_page_errors'])


try:
    asyncio.run(main())
except Exception as error:
    check('test completes', False, f'{type(error).__name__}: {error}')
finally:
    report['summary'] = {'passed': sum(item['passed'] for item in report['checks']), 'total': len(report['checks'])}
    args.report.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'report': str(args.report), **report['summary']}), flush=True)
raise SystemExit(0 if all(item['passed'] for item in report['checks']) else 1)
