#!/usr/bin/env python3
"""Serve the static portfolio locally, including correct MP4 byte ranges."""
import argparse
import functools
import http.server
import os
import re
from pathlib import Path
from urllib.parse import urlsplit

class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # A preview must not mix old markup with scripts from a newer edit.
        suffix = Path(urlsplit(self.path).path).suffix
        if suffix in ('', '.html', '.css', '.js', '.json'):
            self.send_header('Cache-Control', 'no-store, max-age=0')
        super().end_headers()

    def send_head(self):
        path = self.translate_path(self.path)
        if Path(urlsplit(self.path).path).suffix in ('', '.html', '.css', '.js', '.json'):
            # SimpleHTTPRequestHandler otherwise returns a cached 304 response.
            if 'If-Modified-Since' in self.headers:
                del self.headers['If-Modified-Since']
        requested = self.headers.get('Range')
        self.byte_range = None
        if requested and os.path.isfile(path):
            size = os.path.getsize(path)
            match = re.fullmatch(r'bytes=(\d*)-(\d*)', requested.strip())
            if not match or not any(match.groups()):
                self.send_error(416, 'Invalid byte range')
                return None
            start_text, end_text = match.groups()
            start = int(start_text) if start_text else max(0, size-int(end_text))
            end = min(int(end_text), size-1) if start_text and end_text else size-1
            if start >= size or start > end:
                self.send_response(416)
                self.send_header('Content-Range', f'bytes */{size}')
                self.end_headers()
                return None
            stream = open(path, 'rb')
            stream.seek(start)
            self.byte_range = (start, end)
            self.send_response(206)
            self.send_header('Content-Type', self.guess_type(path))
            self.send_header('Content-Length', str(end-start+1))
            self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
            self.send_header('Accept-Ranges', 'bytes')
            self.end_headers()
            return stream
        return super().send_head()

    def copyfile(self, source, outputfile):
        if self.byte_range is None:
            return super().copyfile(source, outputfile)
        remaining = self.byte_range[1]-self.byte_range[0]+1
        while remaining:
            block = source.read(min(65536, remaining))
            if not block:
                break
            outputfile.write(block)
            remaining -= len(block)

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8766)
    parser.add_argument('--bind', default='127.0.0.1')
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    server = http.server.ThreadingHTTPServer((args.bind,args.port), functools.partial(Handler,directory=str(root)))
    print(f'Lunar portfolio: http://{args.bind}:{args.port}/', flush=True)
    server.serve_forever()
