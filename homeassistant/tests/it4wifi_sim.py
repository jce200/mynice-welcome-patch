"""A simulated IT4WIFI for the tests: TLS, VERIFY, CONNECT, PAIR, signed STATUS / INFO / CHANGE, pushed events, and the ways a module fails."""
import asyncio, base64, hashlib, os, re, ssl, subprocess, tempfile

MAC = "00:0B:6C:AA:BB:CC"; PWD = base64.b64encode(b"0123456789abcdef0123456789abcdef").decode(); SC = "A1B2C3D4"
_CERT = None

def certificate():
    """A throw-away self-signed certificate, made once per run (needs the openssl command)."""
    global _CERT
    if _CERT is None:
        d = tempfile.mkdtemp(prefix="nicegate-test-")
        cert, key = os.path.join(d, "cert.pem"), os.path.join(d, "key.pem")
        subprocess.run(["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", key, "-out", cert, "-days", "2", "-subj", "/CN=it4wifi"],
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        _CERT = (cert, key)
    return _CERT

class Module:
    """The simulated accessory."""
    def __init__(self):
        self.sessions = 0; self.commands = []; self.status = "closed"; self.conns = []; self.silent = False
        self.pair_error = 0; self.reject = None; self.swallow_change = False; self.bad_sign = 0; self.perm = "user"
    async def start(self):
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER); ctx.load_cert_chain(*certificate())
        self.server = await asyncio.start_server(self.handle, "127.0.0.1", 0, ssl=ctx)
        self.port = self.server.sockets[0].getsockname()[1]
    def frame(self, xml): return b"\x02" + xml.encode() + b"\x03"
    def props(self): return f'<Devices><Device id="1"><Properties><DoorStatus>{self.status}</DoorStatus><Obstruct>0</Obstruct></Properties></Device></Devices>'
    async def push(self, kind="CHANGE", extra=""):
        for w in list(self.conns):
            try:
                w.write(self.frame(f'<Event id="9" source="{MAC}" target="x" protocolType="NHK" type="{kind}"><Timestamp>t</Timestamp>' + (extra or self.props()) + '</Event>')); await w.drain()
            except Exception: pass
    async def kill_all(self):
        for w in list(self.conns):
            w.close()
        self.conns.clear()
    async def handle(self, reader, writer):
        cc = None; authed = False
        try:
            while True:
                await reader.readuntil(b"\x02"); raw = (await reader.readuntil(b"\x03"))[:-1].decode()
                if self.silent: continue   # a half-open connection: the bytes arrive nowhere
                m = re.search(r'<Request id="(\d+)" source="([^"]*)" target="([^"]*)"[^>]*type="(\w+)">', raw); rid, src, _, kind = m.groups()
                head = f'<Response id="{rid}" source="{MAC}" target="{src}" protocolType="NHK" protocolVersion="1.0" type="{kind}">'
                if kind == "PAIR" and not self.pair_error:
                    body = f'<Authentication id="7" username="u" pwd="{PWD}"/>'
                elif kind == "PAIR":
                    head = head.replace('type="PAIR"', 'type="ERROR"'); body = "<Error><Code>%d</Code></Error>" % self.pair_error
                elif kind == "VERIFY":
                    body = f'<Authentication id="7" username="u" perm="{self.perm}"/>'
                elif kind == "CONNECT":
                    cc = re.search(r'cc="([0-9A-F]+)"', raw).group(1); authed = True; self.sessions += 1; self.conns.append(writer)
                    body = f'<Authentication id="7" sc="{SC}"/>'
                else:
                    signed, sign = re.match(r'(.*)<Sign>([^<]*)</Sign>', raw, re.S).groups()
                    sess = hashlib.sha256(base64.b64decode(PWD) + bytes.fromhex(SC)[::-1] + bytes.fromhex(cc)[::-1]).digest()
                    good = base64.b64encode(hashlib.sha256(hashlib.sha256(signed.encode()).digest() + sess).digest()).decode()
                    if not authed or sign != good:
                        self.bad_sign += 1; body = "<Error><Code>2</Code></Error>"
                    elif kind == "STATUS": body = self.props()
                    elif kind == "INFO": body = '<Devices><Device id="1"><Services><DoorAction values="open,stop,close"/><T4Action/></Services><Properties><DoorStatus/><T4_allowed values="1FFFFE"/></Properties></Device></Devices>'
                    elif kind == "CHANGE":
                        cmd = re.search(r'<(?:DoorAction|T4Action)>([^<]*)<', raw).group(1); self.commands.append(cmd)
                        if self.swallow_change: continue
                        if self.reject: body = f"<Error><Code>{self.reject}</Code></Error>"
                        else:
                            body = ""; self.status = {"open": "opening", "close": "closing", "stop": "stopped"}.get(cmd, self.status)
                            writer.write(self.frame(head + body + "</Response>")); await writer.drain(); await self.push(); continue
                    else: body = "<Error><Code>1</Code></Error>"
                if kind == "PAIR" and self.pair_error: head = head.replace('type="PAIR"', 'type="ERROR"'); body = "<Error><Code>%d</Code></Error>" % self.pair_error
                writer.write(self.frame(head + body + "</Response>")); await writer.drain()
        except (asyncio.IncompleteReadError, ConnectionError, OSError): pass
        finally:
            if writer in self.conns: self.conns.remove(writer)
            writer.close()

