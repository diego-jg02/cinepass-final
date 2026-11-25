"""Abre CinePass: levanta un servidor local y abre el navegador. Cierra con Ctrl+C."""
import http.server, socketserver, webbrowser, os, threading, sys
os.chdir(os.path.dirname(os.path.abspath(__file__)))
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
for port in range(8000, 8020):
    try:
        srv = socketserver.TCPServer(("127.0.0.1", port), H); break
    except OSError:
        continue
else:
    print("No hay puertos libres entre 8000 y 8019. Cierra otras ventanas de CinePass e inténtalo de nuevo.")
    sys.exit(1)
url =f"http://localhost:{port}/index.html"
print(f"CinePass corriendo en {url}\nDeja esta ventana abierta. Ctrl+C para cerrar.")
threading.Timer(0.8, lambda: webbrowser.open(url)).start()
try: srv.serve_forever()
except KeyboardInterrupt: print("\nCerrado.")
