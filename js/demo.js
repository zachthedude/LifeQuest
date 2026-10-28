// Static demo (GitHub Pages): runs the real Python server inside the browser with
// Pyodide and answers /api/* calls from it. The SQLite file lives in IndexedDB,
// so a player's character survives reloads. Only the Pages build loads this file.

const PYODIDE = 'https://cdn.jsdelivr.net/pyodide/v0.27.2/full/';
const bootText = document.querySelector('.boot__text');
const say = (text) => { if (bootText) bootText.textContent = text; };
// Storage can be blocked (private modes, site data off); the demo still runs, it just won't remember.
const store = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* not remembered */ } },
};
// Each demo on this origin needs its own IndexedDB database: IDBFS names it after the mountpoint.
const SAVE = '/save-lifequest';

async function boot() {
  say('Loading the game engine…');
  const { loadPyodide } = await import(PYODIDE + 'pyodide.mjs');
  const py = await loadPyodide({ indexURL: PYODIDE });
  await py.loadPackage(['sqlite3', 'hashlib']);

  say('Restoring your save…');
  py.FS.mkdirTree(SAVE);
  py.FS.mount(py.FS.filesystems.IDBFS, {}, SAVE);
  await new Promise((resolve) => py.FS.syncfs(true, resolve));

  const zip = await (await fetch('server.zip')).arrayBuffer();
  py.unpackArchive(zip, 'zip', { extractDir: '/lifequest' });

  py.runPython(`
import os, sys
os.environ.update(DATABASE_URL='/save-lifequest/lifequest.db', LIFEQUEST_UPLOAD_DIR='/save-lifequest/uploads',
                  AI_PROVIDER='none', OLLAMA_WARM='0')
sys.path.insert(0, '/lifequest')
from server import app, db, security
from server.routing import Request
db.init()
security.purge_expired_sessions()

def handle(method, path, query, headers, body):
    req = Request(method=method, path=path, query=query.to_py(), headers=headers.to_py(),
                  body=body.to_bytes(), remote='demo')
    res = app.dispatch(req)
    return res.status, res.headers, res.body
`);
  const handle = py.globals.get('handle');

  // The session cookie the server sets is kept here and replayed on every call.
  let cookie = store.get('lq_demo_cookie') || '';
  let saving = Promise.resolve();
  const realFetch = window.fetch.bind(window);

  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.origin);
    if (!url.pathname.startsWith('/api/')) return realFetch(input, init);

    const method = (init.method || 'GET').toUpperCase();
    const headers = {};
    new Headers(init.headers).forEach((v, k) => { headers[k] = v; });
    let body = new Uint8Array();
    if (init.body !== undefined) {
      // Let the browser serialise FormData into real multipart, boundary and all.
      const encoded = new Request(url, { method, body: init.body, headers: init.headers });
      const type = encoded.headers.get('content-type');
      if (type) headers['content-type'] = type;
      body = new Uint8Array(await encoded.arrayBuffer());
    }
    if (cookie) headers.cookie = cookie;

    const result = handle(method, url.pathname, Object.fromEntries(url.searchParams), headers, body);
    const [status, resHeaders, resBody] = result.toJs({ dict_converter: Object.fromEntries });
    result.destroy();

    const setCookie = resHeaders['set-cookie'];
    if (setCookie) {
      const pair = setCookie.split(';')[0];
      cookie = /max-age=0|expires=thu, 01 jan 1970/i.test(setCookie) || pair.endsWith('=') ? '' : pair;
      store.set('lq_demo_cookie', cookie);
    }
    // Answer only once the write is in IndexedDB, so a reload straight after can't lose it.
    if (method !== 'GET') {
      saving = saving.then(() => new Promise((r) => py.FS.syncfs(false, (err) => { if (err) console.error('Demo save failed', err); r(); })));
      await saving;
    }

    return new Response(status === 204 ? null : resBody, { status, headers: resHeaders });
  };
}

boot()
  .then(() => import('./main.js'))
  .catch((err) => {
    console.error(err);
    say('The demo could not start in this browser. Try a recent Chrome, Edge, Firefox or Safari.');
  });
