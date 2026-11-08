# Tutor Lessons – MVP

Osobní webová aplikace pro evidenci odučených hodin (online doučování).

Tento projekt slouží primárně jako **funkční MVP**, které používám v praxi, a zároveň jako **dlouhodobý základ** pro případné rozšíření do komplexnější aplikace.

---

##  Cíl projektu

* rychlá a pohodlná evidence hodin po výuce
* přehled vyfakturovaných / nevyfakturovaných hodin
* minimální tření v UX (abych aplikaci skutečně používal)
* žádný backend v první fázi

Projekt **není** primárně komerční SaaS – cílem je:

* osobní produktivita
* procvičení návrhu a vývoje reálné aplikace

---

##  Aktuální stav (MVP)

### Funkce

* seznam studentů:

  * aktivní + archiv (archivovaní se schovávají, aplikace se otevře na prvním aktivním)
  * hledání podle jména
* karta studenta:

  * jméno
  * odkaz na výuku (Meet / Zoom / Teams…, nepovinný)
  * vlastní hodinová sazba
  * přehled: nevyfakturováno (h + Kč), zůstatek kreditu, sazba
* evidence hodin:

  * datum, počet hodin
  * neproběhla, ale placená (absence)
  * platba fakturou, nebo kreditem
  * účtovat / zdarma
  * vyfakturováno / nevyfakturováno
  * každá hodina si pamatuje sazbu, se kterou byla zapsána
* kredit (předplacené hodiny):

  * dobití – počet hodin + skutečně zaplacená částka (balíčky se slevou)
  * hodina placená kreditem se automaticky odečte; smazáním hodiny se kredit vrátí
  * vynulování kreditu
  * zůstatek může jít do mínusu (s upozorněním)
* časová osa po měsících:

  * hodiny i pohyby kreditu
  * souhrn: odučeno (h), odměna (Kč), k vyfakturování (h)
  * vyfakturování celého měsíce + undo
* export / import dat (JSON backup, včetně kreditů)

### Technické řešení

* **čistý HTML / CSS / JavaScript**
* žádný framework
* **IndexedDB** jako perzistence dat
* GitHub Pages jako hosting
* jediná externí závislost: písmo Source Sans 3 z Google Fonts (offline se použije systémové)

---

##  Architektura (zjednodušeně)

* `db.js` – otevření IndexedDB a schéma (stores: `students`, `lessons`, `creditTransactions`)
* `repo.js` – práce s databází; operace přes víc stores běží v jedné transakci
* `domain.js` – business logika (studenti, hodiny, kredit, peníze, záloha)
* `ui.js` – vykreslování UI a obsluha interakcí
* `index.html` – kostra stránky a styly

Důležité pravidlo:

> UI ≠ business logika ≠ data

### Dokumentace

* `CONTEXT.md` – slovníček pojmů (co přesně znamená „účtovat“, „kredit“, „odměna“…)
* `docs/adr/` – zaznamenaná architektonická rozhodnutí a jejich důvody

### Pravidla, na která nezapomenout

* **Odměna** v měsíčním souhrnu = přijaté peníze: účtované fakturační hodiny + dobití kreditu. Úpravy kreditu se nepočítají.
* **Cena je uložená u každé hodiny a každého dobití**, ne jen u studenta – změna sazby nepřepíše historii (viz ADR 0001).
* Záznamy bez uložené ceny (staré) se počítají sazbou 500 Kč/h.
* Kredit je v **hodinách**, ne v korunách.

### Záloha

* Export ukládá formát `schemaVersion: 2` (studenti, hodiny, kreditní transakce).
* Import přijme i starší `schemaVersion: 1` – ta ale kredity neobsahuje, takže je po importu vynuluje.
* Import nahrazuje **všechna** data, atomicky (když selže, nic se nezmění).

---

##  Produktové principy

* **MVP first** – nejmenší funkční celek
* **YAGNI** – nepřidávat funkce bez reálné potřeby
* **Používání > perfekce**
* žádný overengineering

---

##  Možný budoucí směr (NE implementováno)

> Poznámky k dlouhodobému směřování – slouží jen jako mentální mapa, ne jako plán.

### 1️ UX & workflow

* filtry podle období
* CSV export pro fakturaci
* ~~sazba~~ – hotovo, sazba je per student
* rodinný/sdílený kredit pro sourozence – záměrně neřešeno, dokud nebude potřeba

### 2️ React (admin část)

* přepis UI do Reactu
* komponentový přístup
* zachování `repo` a `domain` vrstvy

### 3️ Role & workflow

* admin side (učitel)
* user side (student):

  * přehled objednaných hodin
  * žádosti o hodinu

### 4️ Fakturace (vzdálený cíl)

* **NE psát vlastní účetnictví**
* preferovaný směr:

  * integrace s externím systémem (např. mPohoda)
  * přes API / automatizační nástroj (např. n8n)
* aplikace by sloužila jako:

  * zdroj dat
  * procesní orchestrátor
* právní a účetní zodpovědnost zůstává u externího systému

---

##  Co projekt záměrně NEřeší (zatím)

* autentizaci
* multi-device synchronizaci
* backend
* generování oficiálních daňových dokladů

---

##  Stav projektu

* aktivně používané MVP
* otevřené k iterativnímu rozšiřování
* žádný časový tlak

---


