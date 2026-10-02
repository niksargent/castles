"""Static server for Tapestry with caching disabled (handy while editing). Usage: python tools/serve.py [port]"""
import http.server, sys, os
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()
    def log_message(self, *a):
        pass
port = int(sys.argv[1]) if len(sys.argv) > 1 else 8777
http.server.ThreadingHTTPServer(("127.0.0.1", port), H).serve_forever()
