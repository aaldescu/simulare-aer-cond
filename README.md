# Simulare răcire apartament

Simulator CFD (fizică reală, „stable fluids”) pentru răcirea unui apartament cu
aer condiționat, plus un **editor de plan** care salvează apartamentele într-o
bază de date SQLite.

## Ce face

- **Simulator (2D)** — desenezi planul (pereți, uși, ferestre, unitate AC) și
  rulezi o simulare fizică în timp real (vedere de sus): câmp de viteze rezolvat
  (advecție + proiecție de presiune), jet de aer rece cu buget de energie și
  termostat, conducție prin anvelopă, aport solar prin ferestre. Vezi harta de
  temperatură, curenții de aer, axa timpului cu acoperirea de confort, pauză +
  citire de temperaturi pe dale, și găsirea automată a poziției optime pentru AC.
- **Model fizic 3D (opțional)** — în „Simulator", opțiunea **Model fizic → 3D —
  flotabilitate** rulează aceeași fizică, dar **volumetrică**: planul e extrudat
  pe înălțime (6–14 straturi, după înălțimea tavanului) și se adaugă
  **flotabilitatea** (Boussinesq) — aerul rece coboară, cel cald urcă, se
  stratifică pe înălțime și curge prin ușile deschise în camera vecină (ușa e o
  deschidere pe toată înălțimea, ca în 2D). Se afișează cu aceeași animație 2D de
  sus: harta e o felie orizontală la înălțimea aleasă din slider (podea → tavan),
  ca să vezi stratificarea.
- **Editor plan** — încarci poza unui apartament ca fundal (cu slider de
  opacitate), desenezi planul peste ea, setezi proprietățile apartamentului
  (nord ca azimut 0–360°, înălțime tavan, scară) și salvezi. Planurile salvate
  apar într-un dropdown în simulator.

## Rulare

Necesită **Node.js 22+** (folosește modulul built-in `node:sqlite`).

```bash
npm install      # instalează express
npm start        # pornește serverul pe http://localhost:3000
```

Apoi deschide http://localhost:3000 în browser.

Variabile de mediu opționale:
- `PORT` — portul serverului (implicit `3000`)
- `DATA_DIR` — unde se ține baza de date (implicit `./data`, `plans.db`)

## API (REST)

Planurile sunt stocate în SQLite (`data/plans.db`). Endpoints:

| Metodă | Rută | Descriere |
|--------|------|-----------|
| `GET` | `/api/plans` | listă (fără grid/poză) |
| `GET` | `/api/plans/:id` | un plan complet (cu grid + poză) |
| `POST` | `/api/plans` | creează un plan |
| `PUT` | `/api/plans/:id` | actualizează un plan |
| `DELETE` | `/api/plans/:id` | șterge un plan |
| `GET` | `/debug` | index text: toate planurile cu etanș DA/NU + coordonatele breșelor |
| `GET` | `/api/plans/:id/debug` | analiză text a unui plan: hartă ASCII + breșe (`?format=json` pentru date brute) |

Debug: `/debug` arată rapid ce plan nu e închis ermetic și unde e gaura;
`/api/plans/:id/debug` desenează planul ca hartă ASCII (`#` perete, `=` geam,
`/` ușă, `A` AC, `·` aer, `o` aer exterior pătruns, `X` breșă).

Un plan = `{ name, cols, rows, grid, north, height, scale, photo }`, unde `grid`
e un șir de cifre `0..4` (o celulă / caracter: 0 gol, 1 perete, 2 ușă, 3
fereastră, 4 AC) și `photo` e un data-URL opțional (stocat ca BLOB).

## Deployment (Dokploy / Docker)

Repo-ul conține `Dockerfile` și `docker-compose.yml` gata de Dokploy (tip
**Compose**):

1. În Dokploy: proiect nou → **Create Service** → **Compose**.
2. Sursă: acest repo Git (branch-ul dorit).
3. Setează `DOMAIN` cu domeniul tău (copiază `.env.example` în `.env`, sau
   pune-l în secțiunea **Environment** a serviciului în Dokploy). Alternativ
   folosești UI-ul **Domains** din Dokploy și lași Traefik să injecteze
   router-ul — atunci ai nevoie doar de `traefik.enable=true`, rețeaua
   `dokploy-network` și portul din `loadbalancer.server.port`.
4. Deploy — Traefik emite automat certificatul Let's Encrypt.

Containerul are un **healthcheck** pe `/health` (interval 30s), pe care Dokploy
îl folosește ca să știe când serviciul e „healthy”.

Detalii importante:
- Nu se publică porturi pe host; routing-ul HTTPS trece prin Traefik pe rețeaua
  externă `dokploy-network`.
- Baza SQLite persistă în volumul `simulare-data` (montat la `/app/data`), deci
  planurile supraviețuiesc redeploy-urilor.

Rulare locală cu Docker:

```bash
docker build -t simulare-aer-cond .
docker run -p 3000:3000 -v simulare-data:/app/data simulare-aer-cond
```

## Structură

- `index.html` — tot frontend-ul (simulator + editor), într-un singur fișier
- `server.js` — server Express: servește frontend-ul + API-ul REST
- `db.js` — accesul la SQLite (`node:sqlite`)
- `data/` — baza de date (creată la rulare, ignorată de git)

> Notă: partea de **editor / salvare planuri** are nevoie de server. Deschis ca
> fișier static, simulatorul funcționează pe desen liber, dar editorul afișează
> că serverul nu răspunde.
