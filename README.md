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

* seznam studentů
* karta studenta:

  * jméno
  * Meet odkaz
  * seznam hodin
* evidence hodin:

  * datum
  * počet hodin
  * billable / non-billable
  * vyfakturováno / nevyfakturováno
* hromadné vyfakturování + undo
* mazání hodin
* export / import dat (JSON backup)

### Technické řešení

* **čistý HTML / CSS / JavaScript**
* žádný framework
* **IndexedDB** jako perzistence dat
* GitHub Pages jako hosting

---

##  Architektura (zjednodušeně)

* `repo.js` – práce s databází (IndexedDB)
* `domain.js` – business logika (hodiny, studenti, stavy)
* `ui.js` – vykreslování UI a obsluha interakcí

Důležité pravidlo:

> UI ≠ business logika ≠ data

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
* globální nastavení (sazba, měna)

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


