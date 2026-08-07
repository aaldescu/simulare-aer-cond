# Listă de funcționalități (roadmap)

Listă de tools de dezvoltat pentru simulatorul de răcire apartament.

---

## 1. Editor de plan de apartament (sub buton „Meniu”)

**Scop:** să pot crea planuri de apartament ușor, pornind de la o poză reală, și să le refolosesc în simulator.

Toată aplicația trece sub un buton **Meniu**, iar editorul de plan e una dintre secțiuni.

### Ce trebuie să facă editorul
- **Încărcare poză** a unui apartament (releveu / schiță / captură) ca fundal.
- **Slider de opacitate** pentru poza de fundal, ca să pot desena peste ea clar.
- **Desenare peste poză** cu uneltele existente: perete, ușă, fereastră, unitate AC.
  - **Faza 1:** poza e doar **suport de desenat manual** (ghid vizual). Fără detectare automată.
  - **Faza 2 (opțional, mai târziu):** detectare automată a pereților din poză. Mai complex — de evaluat ulterior.
- Transcriere **1:1** a planului din poză în formatul de grid al simulatorului.
- **Salvare în stocare intermediară** (ex. `localStorage`), cu posibilitatea de a reveni la un plan salvat.
- În simulator, un **dropdown** pentru a selecta pe ce apartament rulez simularea.

### Proprietăți per apartament (setate în editor, folosite în simulator)
- **Nordul** ca unghi din 360° (direcția exactă în care se află nordul) — ca să pot calcula pe ce linie cad razele de soare, la orice oră.
  - **Înlocuiește complet** selectorul actual pe 4 direcții (sus / dreapta / jos / stânga). Rămâne doar unghiul fin 0–360°.
- **Înălțimea** apartamentului (înălțimea tavanului).
- **Scara** (metri / celulă).

> Aceste proprietăți devin proprietăți ale apartamentului salvat și vin automat în simulator când selectez planul, nu le mai setez de fiecare dată.

---

## 2. Comparator de scenarii

**Scop:** să compar vizual mai multe amplasări/configurări de AC pe același apartament.

- Un **scenariu** = o simulare cu AC-ul (sau setările) într-o anumită configurație.
- Pot crea mai multe scenarii pe același plan (ex. AC într-un colț vs. AC pe alt perete).
- **Comparație vizuală side-by-side** a simulărilor (hărțile de temperatură + curenții de aer + acoperirea).
- Suport pentru **2–7 scenarii** comparate simultan.

---

## 3. Analiză comparativă automată

**Scop:** pe baza celor 2–7 scenarii, o analiză care alege automat scenariul cel mai bun.

- Analiză comparativă între simulările existente.
- Recomandă **scenariul optim** (după acoperire de confort, uniformitate, cel mai cald colț etc.).

> Notă: nu e clar încă exact cum se modelează „cel mai bun” — de discutat criteriile de scor. (Idee de explorat, prioritate mai mică.)
