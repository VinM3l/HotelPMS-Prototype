#!/usr/bin/env python3
"""
HotelPMS Launcher
─────────────────
Starts a local web server and opens the Hotel PMS in your default browser.
Keep this window open while using the app. Close it to shut down.
"""
import os, sys, time, threading, webbrowser
import http.server, socketserver

PORT   = 8765
FOLDER = os.path.dirname(os.path.abspath(__file__))

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=FOLDER, **kwargs)
    def log_message(self, fmt, *args):
        pass  # suppress request logs

def open_browser():
    time.sleep(0.8)
    webbrowser.open(f'http://localhost:{PORT}/index.html')

if __name__ == '__main__':
    os.chdir(FOLDER)
    print("=" * 50)
    print("  🏨  Hotel PMS — Starting server…")
    print(f"  📡  http://localhost:{PORT}")
    print("  ⚠️   Keep this window open while using the app.")
    print("  ✋   Press Ctrl+C to stop.")
    print("=" * 50)

    threading.Thread(target=open_browser, daemon=True).start()

    try:
        with socketserver.TCPServer(("", PORT), Handler) as httpd:
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n  Server stopped. Goodbye!")
        sys.exit(0)
    except OSError as e:
        if 'Address already in use' in str(e):
            print(f"\n  Port {PORT} is busy — the app may already be running.")
            print(f"  Try opening http://localhost:{PORT}/index.html in your browser.")
            webbrowser.open(f'http://localhost:{PORT}/index.html')
            input("\n  Press Enter to exit.")
        else:
            raise
