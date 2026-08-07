# Simulare răcire apartament

Simulator CFD (fizică reală, „stable fluids”) pentru răcirea unui apartament cu
aer condiționat, plus un **editor de plan** care salvează apartamentele într-o
bază de date SQLite.

## Ce face

- **Simulator** — desenezi planul (pereți, uși, ferestre, unitate AC) și rulezi
  o simulare fizică în timp real: câmp de viteze rezolvat (advecție + proiecție
  de presiune), jet de aer rece cu buget de energie și termostat, conducție prin
  anvelopă, aport solar prin ferestre. Vezi harta de temperatură, curenții de
  aer, axa timpului cu acoperirea de confort, pauză + citire de temperaturi pe
  dale, și găsirea automată a poziției optime pentru AC.
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

Un plan = `{ name, cols, rows, grid, north, height, scale, photo }`, unde `grid`
e un șir de cifre `0..4` (o celulă / caracter: 0 gol, 1 perete, 2 ușă, 3
fereastră, 4 AC) și `photo` e un data-URL opțional (stocat ca BLOB).

## Structură

- `index.html` — tot frontend-ul (simulator + editor), într-un singur fișier
- `server.js` — server Express: servește frontend-ul + API-ul REST
- `db.js` — accesul la SQLite (`node:sqlite`)
- `data/` — baza de date (creată la rulare, ignorată de git)

> Notă: partea de **editor / salvare planuri** are nevoie de server. Deschis ca
> fișier static, simulatorul funcționează pe desen liber, dar editorul afișează
> că serverul nu răspunde.
