// Analiză server-side a unui plan: etanșeitate, coordonatele breșelor, hartă ASCII.
// Oglindește logica din frontend (floodOut / findGaps), ca să pot depana un plan
// fără să deschid interfața.
export const EMPTY = 0, WALL = 1, DOOR = 2, WIN = 3, AC = 4;
const CH = { 0: '·', 1: '#', 2: '/', 3: '=', 4: 'A' }; // aer, perete, ușă, geam, AC

export function strToGrid(s, n) {
  const g = new Uint8Array(n);
  for (let i = 0; i < n && i < s.length; i++) g[i] = (+s[i]) || 0;
  return g;
}

export function floodOut(grid, cols, rows) {
  const N = cols * rows, out = new Uint8Array(N), st = [];
  const idx = (x, y) => y * cols + x;
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= cols || y >= rows) return;
    const j = idx(x, y);
    if (!out[j] && grid[j] !== WALL && grid[j] !== WIN) { out[j] = 1; st.push(j); }
  };
  for (let x = 0; x < cols; x++) { push(x, 0); push(x, rows - 1); }
  for (let y = 0; y < rows; y++) { push(0, y); push(cols - 1, y); }
  while (st.length) { const i = st.pop(), x = i % cols, y = (i / cols | 0); push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1); }
  return out;
}

function interiorCount(grid, out) {
  let n = 0;
  for (let i = 0; i < out.length; i++) {
    const g = grid[i];
    if (g !== WALL && g !== WIN && g !== DOOR && !out[i]) n++;
  }
  return n;
}

export function findGaps(grid, cols, rows) {
  const base = floodOut(grid, cols, rows), base0 = interiorCount(grid, base);
  const idx = (x, y) => y * cols + x;
  const env = (x, y) => { if (x < 0 || y < 0 || x >= cols || y >= rows) return false; const g = grid[idx(x, y)]; return g === WALL || g === WIN; };
  const gaps = [];
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const i = idx(x, y), g = grid[i];
    if (g === WALL || g === WIN || !base[i]) continue;
    let en = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (env(x + dx, y + dy)) en++;
    if (en < 2) continue;
    const saved = grid[i]; grid[i] = WALL;
    const gained = interiorCount(grid, floodOut(grid, cols, rows)) - base0;
    grid[i] = saved;
    if (gained >= 8) gaps.push([x, y]);
  }
  return gaps;
}

// bounding box al desenului
function bbox(grid, cols, rows) {
  let minX = cols, minY = rows, maxX = -1, maxY = -1;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (grid[y * cols + x] !== EMPTY) {
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

export function analyze(plan) {
  const cols = plan.cols, rows = plan.rows;
  const grid = strToGrid(plan.grid, cols * rows);
  const out = floodOut(grid, cols, rows);
  const gaps = findGaps(grid, cols, rows);
  const gapSet = new Set(gaps.map(([x, y]) => y * cols + x));
  const bb = bbox(grid, cols, rows);
  const acPos = [];
  let interior = 0, leaked = 0;
  for (let i = 0; i < grid.length; i++) {
    const g = grid[i];
    if (g === AC) acPos.push([i % cols, i / cols | 0]);
    if (g !== WALL && g !== WIN && g !== DOOR && !out[i]) interior++;
  }
  // harta ASCII, doar in interiorul bbox (extins cu 1), cu breșele marcate 'X'
  // si aerul exterior patruns in interiorul bbox marcat 'o' (scurgerea)
  const lines = [];
  if (bb.maxX >= 0) {
    const x0 = Math.max(0, bb.minX - 1), x1 = Math.min(cols - 1, bb.maxX + 1);
    const y0 = Math.max(0, bb.minY - 1), y1 = Math.min(rows - 1, bb.maxY + 1);
    for (let y = y0; y <= y1; y++) {
      let line = '';
      for (let x = x0; x <= x1; x++) {
        const i = y * cols + x, g = grid[i];
        if (gapSet.has(i)) { line += 'X'; continue; }
        if (g === EMPTY || g === AC || g === DOOR) {
          // aer/usa/ac: daca e in interiorul bbox si comunica cu exteriorul -> scurgere
          const inBox = x >= bb.minX && x <= bb.maxX && y >= bb.minY && y <= bb.maxY;
          if (g !== AC && g !== DOOR && inBox && out[i]) { line += 'o'; continue; }
        }
        line += CH[g];
      }
      lines.push(line);
    }
  }
  return {
    cols, rows, sealed: interior >= 4 && gaps.length === 0,
    interiorCells: interior, gaps, acPos,
    ascii: lines.join('\n'),
  };
}

export function report(plan, a) {
  const L = [];
  L.push(`Plan #${plan.id}: ${plan.name}`);
  L.push(`Grid ${a.cols}×${a.rows}  ·  nord ${plan.north}°  ·  scară ${plan.scale} m/celulă  ·  h ${plan.height} m`);
  L.push(`Etanș: ${a.sealed ? 'DA' : 'NU'}  ·  celule interior: ${a.interiorCells}  ·  unități AC: ${a.acPos.length}${a.acPos.length ? ' la ' + JSON.stringify(a.acPos) : ''}`);
  L.push(a.gaps.length ? `BREȘE (x,y): ${JSON.stringify(a.gaps)}` : 'Fără breșe detectate.');
  L.push('');
  L.push('Legendă:  # perete   = geam   / ușă   A aer-condiționat   · aer   o aer exterior pătruns (scurgere)   X breșă');
  L.push('');
  L.push(a.ascii);
  return L.join('\n');
}
