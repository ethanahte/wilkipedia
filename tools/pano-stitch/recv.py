# Saves images POSTed from the campus page or the stitcher to ./out (local only; nothing leaves the machine).
import http.server, os, re
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')
os.makedirs(OUT, exist_ok=True)
class H(http.server.BaseHTTPRequestHandler):
    def cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
    def do_OPTIONS(self):
        self.send_response(204); self.cors(); self.end_headers()
    def do_POST(self):
        name = re.sub(r'[^a-z0-9_.-]', '', self.path.strip('/').lower()) or 'x.bin'
        n = int(self.headers.get('Content-Length', 0))
        open(os.path.join(OUT, name), 'wb').write(self.rfile.read(n))
        self.send_response(200); self.cors(); self.end_headers(); self.wfile.write(b'ok')
    def log_message(self, *a): pass
http.server.HTTPServer(('127.0.0.1', 8799), H).serve_forever()
