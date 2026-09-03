// Server pentru simulatorul de răcire: servește frontend-ul (index.html) și
// oferă un API REST pentru planurile de apartament, stocate în SQLite.
import express from 'express';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listPlans, getPlan, createPlan, updatePlan, deletePlan } from './db.js';
import { analyze, report } from './analyze.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '16mb' })); // poze base64 pot fi mari

// --- validare minimă a unui plan primit de la client ---
function validatePlan(b, partial = false) {
  const err = [];
  if (!partial || b.name !== undefined)
    if (typeof b.name !== 'string' || !b.name.trim()) err.push('name');
  if (!partial || b.grid !== undefined)
    if (typeof b.grid !== 'string' || !/^[0-4]+$/.test(b.grid)) err.push('grid');
  for (const k of ['cols', 'rows']) if (b[k] !== undefined && !Number.isInteger(b[k])) err.push(k);
  for (const k of ['north', 'height', 'scale']) if (b[k] !== undefined && typeof b[k] !== 'number') err.push(k);
  if (!partial) {
    if (b.cols !== undefined && b.rows !== undefined && b.grid !== undefined &&
        b.grid.length !== b.cols * b.rows) err.push('grid-length');
  }
  return err;
}

// --- healthcheck (folosit de Docker/Dokploy) ---
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// --- API ---
app.get('/api/plans', (req, res) => {
  res.json(listPlans());
});

app.get('/api/plans/:id', (req, res) => {
  const p = getPlan(Number(req.params.id));
  if (!p) return res.status(404).json({ error: 'not found' });
  res.json(p);
});

// debug: index cu toate planurile (etanș? + breșe), ca să nu fie nevoie de id
app.get('/debug', (req, res) => {
  const rows = listPlans().map(pl => {
    const full = getPlan(pl.id);
    const a = analyze(full);
    return `#${pl.id}  ${pl.name}  —  etanș: ${a.sealed ? 'DA' : 'NU'}${a.gaps.length ? '  breșe: ' + JSON.stringify(a.gaps) : ''}  ·  detalii: /api/plans/${pl.id}/debug`;
  });
  res.type('text/plain; charset=utf-8').send('Planuri (' + rows.length + ')\n\n' + rows.join('\n'));
});

// debug: analiza etanșeității + hartă ASCII (text). ?format=json pentru date brute.
app.get('/api/plans/:id/debug', (req, res) => {
  const p = getPlan(Number(req.params.id));
  if (!p) return res.status(404).json({ error: 'not found' });
  const a = analyze(p);
  if (req.query.format === 'json') return res.json({ plan: { id: p.id, name: p.name, cols: p.cols, rows: p.rows, north: p.north, scale: p.scale, height: p.height, grid: p.grid }, analysis: a });
  res.type('text/plain; charset=utf-8').send(report(p, a));
});

app.post('/api/plans', (req, res) => {
  const errs = validatePlan(req.body, false);
  if (errs.length) return res.status(400).json({ error: 'invalid', fields: errs });
  res.status(201).json(createPlan(req.body));
});

// --- export / import portabil (fără poză): ca să muți un plan între instanțe
//     (ex. din producție într-o instanță locală, pentru depanare) ---
function exportPlan(p) {
  return { name: p.name, cols: p.cols, rows: p.rows, grid: p.grid,
           north: p.north, height: p.height, scale: p.scale };
}
function importFromObject(src) {
  // acceptă atât formatul de export, cât și răspunsul de la /debug?format=json ({plan:{...}})
  const b = (src && src.plan) ? src.plan : (src || {});
  const errs = validatePlan(b, false);
  if (errs.length) return { errs };
  const p = createPlan({ name: b.name, cols: b.cols, rows: b.rows, grid: b.grid,
                         north: b.north, height: b.height, scale: b.scale });
  return { plan: p };
}
app.get('/api/plans/:id/export', (req, res) => {
  const p = getPlan(Number(req.params.id));
  if (!p) return res.status(404).json({ error: 'not found' });
  res.json(exportPlan(p));
});
app.post('/api/plans/import', (req, res) => {
  const r = importFromObject(req.body);
  if (r.errs) return res.status(400).json({ error: 'invalid', fields: r.errs });
  res.status(201).json({ imported: true, id: r.plan.id, name: r.plan.name });
});
// importă direct de la o altă instanță (ex. URL-ul de export de pe producție)
app.post('/api/plans/import-url', async (req, res) => {
  const url = String((req.body || {}).url || '');
  if (!/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'url invalid (http/https)' });
  try {
    const rr = await fetch(url, { headers: { accept: 'application/json' } });
    if (!rr.ok) throw new Error('HTTP ' + rr.status);
    const r = importFromObject(await rr.json());
    if (r.errs) return res.status(400).json({ error: 'invalid', fields: r.errs });
    res.status(201).json({ imported: true, id: r.plan.id, name: r.plan.name, from: url });
  } catch (e) {
    res.status(502).json({ error: 'fetch failed', detail: e.message });
  }
});

app.put('/api/plans/:id', (req, res) => {
  const errs = validatePlan(req.body, true);
  if (errs.length) return res.status(400).json({ error: 'invalid', fields: errs });
  const p = updatePlan(Number(req.params.id), req.body);
  if (!p) return res.status(404).json({ error: 'not found' });
  res.json(p);
});

app.delete('/api/plans/:id', (req, res) => {
  res.json({ deleted: deletePlan(Number(req.params.id)) });
});

// --- OpenAPI (standard) + consolă DEBUG/API self-contained (fără dependințe externe) ---
const OPENAPI = {
  openapi: '3.0.3',
  info: { title: 'Simulare răcire apartament — API', version: '1.1.0',
    description: 'Planurile de apartament (SQLite) + unelte de depanare. Motorul de simulare rulează în browser; API-ul servește planurile și le poate exporta/importa între instanțe (ex. producție → local).' },
  paths: {
    '/health': { get: { summary: 'Healthcheck', responses: { 200: { description: '{status:"ok"}' } } } },
    '/api/plans': {
      get: { summary: 'Listă planuri (fără grid/poză)', responses: { 200: { description: 'array' } } },
      post: { summary: 'Creează un plan', requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Plan' } } } }, responses: { 201: { description: 'planul creat' } } },
    },
    '/api/plans/{id}': {
      get: { summary: 'Un plan complet (cu grid + poză)', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'plan' }, 404: { description: 'not found' } } },
      put: { summary: 'Actualizează un plan', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'plan' } } },
      delete: { summary: 'Șterge un plan', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: '{deleted:bool}' } } },
    },
    '/api/plans/{id}/export': { get: { summary: 'Export portabil (fără poză) — copiază-l și importă-l pe altă instanță', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'PlanExport' } } } },
    '/api/plans/import': { post: { summary: 'Import dintr-un JSON de export (sau din răspunsul /debug?format=json)', requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/PlanExport' } } } }, responses: { 201: { description: '{imported,id,name}' } } } },
    '/api/plans/import-url': { post: { summary: 'Import direct de la un URL de export de pe altă instanță', requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] } } } }, responses: { 201: { description: '{imported,id,name,from}' }, 502: { description: 'fetch failed' } } } },
    '/api/plans/{id}/debug': { get: { summary: 'Analiză etanșeitate + hartă ASCII (text); ?format=json pentru date brute', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }, { name: 'format', in: 'query', schema: { type: 'string', enum: ['json'] } }], responses: { 200: { description: 'text sau json' } } } },
    '/debug': { get: { summary: 'Index text: toate planurile, etanș DA/NU + breșe', responses: { 200: { description: 'text' } } } },
    '/api/openapi.json': { get: { summary: 'Această specificație OpenAPI', responses: { 200: { description: 'openapi' } } } },
    '/api/docs': { get: { summary: 'Consola DEBUG/API (pagină)', responses: { 200: { description: 'html' } } } },
  },
  components: { schemas: {
    PlanExport: { type: 'object', required: ['name', 'cols', 'rows', 'grid'], properties: {
      name: { type: 'string' }, cols: { type: 'integer', example: 48 }, rows: { type: 'integer', example: 32 },
      grid: { type: 'string', description: 'cols*rows cifre 0..4: 0 gol,1 perete,2 ușă,3 fereastră,4 AC' },
      north: { type: 'number', example: 0 }, height: { type: 'number', example: 2.6 }, scale: { type: 'number', example: 0.33 } } },
    Plan: { allOf: [{ $ref: '#/components/schemas/PlanExport' }, { type: 'object', properties: { photo: { type: 'string', nullable: true, description: 'data-URL opțional' } } }] },
  } },
};
app.get('/api/openapi.json', (req, res) => res.json(OPENAPI));

const DOCS_HTML = `<!DOCTYPE html><html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>DEBUG / API — Simulare răcire</title>
<style>
 body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f8fafc;color:#0f172a;margin:0;padding:16px 20px;font-size:14px}
 h1{font-size:18px;margin:0 0 4px} h2{font-size:14px;margin:18px 0 8px;text-transform:uppercase;letter-spacing:.04em;color:#475569}
 .sub{color:#64748b;font-size:12px;margin:0 0 12px}
 .card{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;margin-bottom:12px}
 table{border-collapse:collapse;width:100%} th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #e2e8f0;vertical-align:top} th{font-size:12px;color:#64748b}
 code,pre{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px} pre{background:#0f172a;color:#e2e8f0;padding:10px;border-radius:8px;overflow:auto;max-height:340px}
 .m{display:inline-block;min-width:52px;text-align:center;padding:2px 6px;border-radius:6px;font-weight:700;font-size:11px;color:#fff}
 .get{background:#0284c7}.post{background:#16a34a}.put{background:#d97706}.delete{background:#dc2626}
 a{color:#0284c7} button{padding:6px 12px;border:1px solid #cbd5e1;border-radius:8px;background:#f1f5f9;cursor:pointer} button.p{background:#0ea5e9;color:#001018;border-color:#0ea5e9}
 textarea,input[type=text]{width:100%;box-sizing:border-box;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-family:ui-monospace,monospace;font-size:12px}
 .ok{color:#16a34a}.err{color:#dc2626} .hint{color:#64748b;font-size:12px}
 .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
</style></head><body>
<h1>🔧 DEBUG / API</h1>
<p class="sub">Motorul de simulare rulează în browser. Aici vezi planurile, le exporți/importi între instanțe (ex. <b>producție → local</b> pentru depanare) și ai specificația <a href="/api/openapi.json" target="_blank">OpenAPI</a>.</p>

<div class="card"><h2>Planuri</h2><div id="plans">Se încarcă…</div>
<p class="hint">„Export JSON” = planul fără poză, mic, ușor de copiat. „Hartă ASCII” = etanșeitate + breșe. „Deschide în simulator” = încarcă planul direct în aplicație.</p></div>

<div class="card"><h2>Import plan</h2>
<p class="hint">Lipește un JSON de export (de pe altă instanță) sau dă URL-ul lui de export (ex. <code>https://…/api/plans/2/export</code>).</p>
<textarea id="impJson" rows="6" placeholder='{"name":"…","cols":48,"rows":32,"grid":"0000…","north":0,"height":2.6,"scale":0.33}'></textarea>
<div class="row" style="margin-top:8px"><button class="p" id="impBtn">Importă din JSON</button>
<input type="text" id="impUrl" placeholder="sau URL de export de pe altă instanță" style="flex:1;min-width:240px"><button id="impUrlBtn">Importă din URL</button></div>
<div id="impMsg" style="margin-top:8px"></div></div>

<div class="card"><h2>Endpoint-uri (OpenAPI)</h2><div id="eps">Se încarcă…</div></div>

<script>
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
async function j(u,o){const r=await fetch(u,o);let b=null;try{b=await r.json();}catch(_){}if(!r.ok)throw new Error((b&&(b.error||b.detail))||('HTTP '+r.status));return b;}
async function loadPlans(){
  try{const ps=await j('/api/plans');
    if(!ps.length){document.getElementById('plans').innerHTML='<p class="hint">Niciun plan salvat.</p>';return;}
    let h='<table><tr><th>#</th><th>Nume</th><th>Grilă</th><th>Nord / h / scară</th><th>Acțiuni</th></tr>';
    for(const p of ps){h+='<tr><td>'+p.id+'</td><td>'+esc(p.name)+'</td><td>'+p.cols+'×'+p.rows+'</td><td>'+p.north+'° / '+p.height+' m / '+p.scale+' m/celulă</td>'
      +'<td><a href="/api/plans/'+p.id+'/export" target="_blank">Export JSON</a> · <a href="/api/plans/'+p.id+'/debug" target="_blank">Hartă ASCII</a> · <a href="/api/plans/'+p.id+'/debug?format=json" target="_blank">debug JSON</a> · <a href="/?plan='+p.id+'" target="_blank">Deschide în simulator</a> · <button data-copy="'+p.id+'">Copiază export</button></td></tr>';}
    document.getElementById('plans').innerHTML=h+'</table>';
    document.querySelectorAll('button[data-copy]').forEach(b=>b.onclick=async()=>{const e=await j('/api/plans/'+b.dataset.copy+'/export');await navigator.clipboard.writeText(JSON.stringify(e));b.textContent='Copiat ✓';setTimeout(()=>b.textContent='Copiază export',1500);});
  }catch(e){document.getElementById('plans').innerHTML='<p class="err">Eroare: '+esc(e.message)+'</p>';}
}
async function loadEps(){
  try{const s=await j('/api/openapi.json');let h='<table><tr><th>Metodă</th><th>Rută</th><th>Descriere</th></tr>';
    for(const [path,ops] of Object.entries(s.paths))for(const [m,op] of Object.entries(ops)){
      const link=(m==='get'&&!path.includes('{'))?'<a href="'+path+'" target="_blank">'+esc(path)+'</a>':'<code>'+esc(path)+'</code>';
      h+='<tr><td><span class="m '+m+'">'+m.toUpperCase()+'</span></td><td>'+link+'</td><td>'+esc(op.summary||'')+'</td></tr>';}
    document.getElementById('eps').innerHTML=h+'</table>';
  }catch(e){document.getElementById('eps').innerHTML='<p class="err">'+esc(e.message)+'</p>';}
}
const msg=(t,ok)=>{const m=document.getElementById('impMsg');m.className=ok?'ok':'err';m.textContent=t;};
document.getElementById('impBtn').onclick=async()=>{try{const body=JSON.parse(document.getElementById('impJson').value);const r=await j('/api/plans/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});msg('Importat: #'+r.id+' „'+r.name+'”',true);loadPlans();}catch(e){msg('Eroare: '+e.message,false);}};
document.getElementById('impUrlBtn').onclick=async()=>{try{const url=document.getElementById('impUrl').value.trim();const r=await j('/api/plans/import-url',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url})});msg('Importat: #'+r.id+' „'+r.name+'” din '+r.from,true);loadPlans();}catch(e){msg('Eroare: '+e.message,false);}};
loadPlans();loadEps();
</script></body></html>`;
app.get('/api/docs', (req, res) => res.type('text/html; charset=utf-8').send(DOCS_HTML));

// --- frontend: servim doar index.html, nu tot directorul (nu expunem server.js) ---
app.get('/', (req, res) => res.sendFile(join(__dirname, 'index.html')));

app.listen(PORT, () => console.log(`Simulare aer cond -> http://localhost:${PORT}`));
