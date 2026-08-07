// Server pentru simulatorul de răcire: servește frontend-ul (index.html) și
// oferă un API REST pentru planurile de apartament, stocate în SQLite.
import express from 'express';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listPlans, getPlan, createPlan, updatePlan, deletePlan } from './db.js';

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

app.post('/api/plans', (req, res) => {
  const errs = validatePlan(req.body, false);
  if (errs.length) return res.status(400).json({ error: 'invalid', fields: errs });
  res.status(201).json(createPlan(req.body));
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

// --- frontend: servim doar index.html, nu tot directorul (nu expunem server.js) ---
app.get('/', (req, res) => res.sendFile(join(__dirname, 'index.html')));

app.listen(PORT, () => console.log(`Simulare aer cond -> http://localhost:${PORT}`));
