# Rozsah a plán – Dětská část Kinotéky (návrh)

Stav: **schváleno 2026-10-24** (verze 1.1) · Mockupy: [docs/mockupy/deti.html](docs/mockupy/deti.html)

Cíl: část aplikace, kterou si spustí dítě, když se chce dívat na pohádky. Videa (hlavně stažená z YouTube) leží ve vlastní složce a řadí se do titulů – např. všechna videa o Prasátku Peppě pod jeden titul „Prasátko Peppa“, podobně jako seriály v dospělé části.

## Rozhodnutí (návrh)

| Téma                   | Návrh                                                                                                                                                                                                                                                                                                                                        |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Složka                 | Výchozí `C:\Mirek_data\09_Videa\Kids` (aplikace ji vytvoří), v nastavení jde změnit. Oddělená od knihovny dospělých – dětská videa se nemíchají do Filmů a Seriálů a naopak.                                                                                                                                                                 |
| Titul = podsložka      | Každý titul je podsložka (`Kids\Prasátko Peppa\…`). Zařazení je tak vidět i v Průzkumníku a přežije i ztrátu databáze. Videa vložená přímo do `Kids` se zařadí automaticky (viz níže).                                                                                                                                                       |
| Automatické zařazení   | Podle údajů z YouTube uložených vedle videa (`.info.json`): 1) shoda se jménem nebo klíčovým slovem existujícího titulu v názvu videa, kanálu či playlistu („Peppa Pig – Official Channel“ → Prasátko Peppa), 2) jinak název série/playlistu/kanálu očištěný o „Official Channel“, „Full Episodes“ apod. Rodič může zařazení kdykoli změnit. |
| Stahování              | **yt-dlp** (otevřený nástroj, nejrozšířenější). Kvůli licenci (GPL) a častým změnám YouTube se nebalí do instalátoru – aplikace ho stáhne při prvním použití z oficiálních vydání na GitHubu (s kontrolou SHA-256) a sama ho aktualizuje. Spojení obrazu a zvuku přes už přibalený ffmpeg.                                                   |
| JavaScript pro YouTube | yt-dlp od 11/2025 potřebuje pro plnou podporu YouTube JavaScriptový runtime. Zkusíme Node, který je už součástí Electronu (nic navíc); záloha je stažení Deno při prvním použití. Ověří se v přírůstku D1.                                                                                                                                   |
| Formát                 | MP4 do 1080p (volitelně 720p kvůli místu), náhled videa jako obrázek vedle.                                                                                                                                                                                                                                                                  |
| Ochrana                | Dětský režim se opouští jen přes **rodičovskou bránu**: PIN (4 číslice, nastaví se v Nastavení), bez PINu jednoduchý příklad pro dospělé. Za bránou jsou stahování, správa, mazání a nastavení. Dítě nemůže nic smazat ani se dostat do dospělé části.                                                                                       |
| Vzhled                 | Světlé barevné motivy s jemnými vzory (Obloha – mraky, Louka – květiny, Moře – bubliny, Vesmír – hvězdy, klidný na večer, Jednorožci – duha, třpytky a kreslený jednorožec), zaoblené písmo **Fredoka** (nadpisy) + **Nunito** (text), přibalené v aplikaci (licence OFL). Velké karty a tlačítka, obrázky místo textu.                                                                        |
| Historie               | Pokračování a „viděno“ zvlášť pro dětskou část; do deníku dospělých se nic nezapisuje.                                                                                                                                                                                                                                                       |

### Co jsem zjistil o podobných aplikacích

- **Netflix Kids** dává na začátek řadu oblíbených postaviček – malé děti, které ještě nečtou, poznají pořad podle obrázku ([TechCrunch 2021](https://techcrunch.com/2021/04/13/netflix-gives-its-kids-profiles-a-visual-upgrade/amp/), [Cord Cutters News](https://cordcuttersnews.com/netflix-kids-profiles-get-a-character-focused-redesign/)); dětský profil je zjednodušený a bez přístupu k nastavení, rodič ho může zamknout PINem ([Common Sense Media](https://www.commonsensemedia.org/blog/how-to-set-parental-controls-on-netflix)).
- **PBS KIDS Video** vybírá pořady přes svislý seznam ikon postaviček, oblíbené nahoře; věci pro rodiče jsou v odděleném rohu ([Common Sense Media](https://www.commonsensemedia.org/app-reviews/pbs-kids-video), [SLJ](https://blogs.slj.com/neverendingsearch/2016/06/17/pbs-kids-video-app)).
- **YouTube Kids** používá barevné kulaté avatary a pro mladší děti víc obrázků a méně textu ([Tubefilter](https://www.tubefilter.com/2017/11/02/youtube-kids-new-controls/), [YouTube blog](https://blog.youtube/news-and-events/introducing-kid-profiles-new-parental)).
- Obecná doporučení: velké cíle pro kliknutí, jednoduché ovládání bez vnořených nabídek, jasné barvy, ale ne přeplácané, aby děti nepřebuzovaly ([UXPA](https://oldmagazine.uxpa.org/?p=11776), [Ungrammary](https://www.ungrammary.com/post/designing-for-kids-ux-design-tips-for-children-apps), [NN/g – Designing for Children](https://www.nngroup.com/videos/designing-children/)); zaoblená bezpatková písma, žádná ozdobná ani psací ([UXmatters](https://www.uxmatters.com/mt/archives/2011/06/effective-use-of-typography-in-applications-for-children-3.php), [Made Good Designs](https://madegooddesigns.com/nunito-alternatives/)).

## Dětská část musí umět

1. **Knihovna Děti** – vlastní složka, sken jako u dospělé knihovny (mp4/webm/mkv…), tituly podle podsložek a automatického zařazení, obrázky titulů a dílů (náhled z YouTube, jinak snímek z videa).
2. **Dětský vzhled** – vstup „Děti“ v postranním menu (a volba „spouštět Kinotéku rovnou v dětském režimu“), Domů s kulatými tituly, „Pokračovat“, „Oblíbené“ a „Nové“, detail titulu s velkými kartami dílů, 5 motivů pozadí.
3. **Dětský přehrávač** – jen velká tlačítka (zpět, předchozí, přehrát/pauza, další), pokračování, volitelně automaticky další díl, srdíčko „oblíbené“.
4. **Rodičovská brána** – PIN nebo příklad; odchod z dětského režimu, přístup ke stahování, správě a nastavení.
5. **Stahování z YouTube** – vložit odkaz (video i playlist), náhled (obrázek, název, kanál, délka), návrh titulu k zařazení s možností změny, kvalita, fronta s průběhem, srozumitelné chyby („video není dostupné“, „bez připojení“), aktualizace yt-dlp.
6. **Správa titulů** – přejmenovat titul, vybrat obrázek, přesunout video do jiného titulu, smazat video (do Koše).
7. **Nastavení dětské části** – složka, PIN, motiv, automatické přehrání dalšího dílu, časový limit („po 30 min / 1 h pohádky skončí“), spouštění v dětském režimu.

## Mimo rozsah

Vyhledávání pro děti (malé děti nečtou) · více dětských profilů · stahování z jiných webů než YouTube (yt-dlp by uměl, ale netestujeme) · titulky a výběr zvukových stop v dětském přehrávači · automatické odběry kanálů (stahování nových videí samo).

## Upozornění – YouTube

Podmínky YouTube stahování videí mimo jejich vlastní funkce (YouTube Premium) nepovolují. Jde o smluvní podmínky služby, ne o trestný čin, a YouTube proti jednotlivcům stahujícím pro vlastní potřebu běžně nezasahuje – riziko je ale na uživateli a YouTube může stahování kdykoli technicky ztížit (proto automatické aktualizace yt-dlp). Funkce je určená jen pro soukromé přehrávání doma, videa se nikam nesdílí.

## Plán přírůstků

Stejný postup jako u V1: každý přírůstek samostatně ověřitelný, další začíná po potvrzení ručního testu.

| #   | Přírůstek                              | Co dělá                                                                                                                                                                                                  | Automatické testy                                                     | Ruční ověření                                                                                           |
| --- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| D1  | **Technický test stahování**           | Stažení a ověření yt-dlp, JavaScript přes Node z Electronu (záloha Deno), stažení jednoho videa do složky Kids s průběhem a náhledem. **Rozhodovací bod:** když to nepůjde spolehlivě, upravíme přístup. | Sestavení příkazu, čtení průběhu a `.info.json` (uložené výstupy)     | Dočasné tlačítko: vlož odkaz na krátké video → za chvíli je v `Kids` jako mp4 s obrázkem a jde přehrát. |
| D2  | **Knihovna Děti a zařazení do titulů** | Složka Kids v databázi (oddělená od dospělé knihovny), sken, tituly podle podsložek a automatického zařazení, obrázky titulů a dílů.                                                                     | Zařazení podle názvu, kanálu, playlistu a klíčových slov (sada názvů) | 10–15 videí od 3 pořadů → 3 správné tituly; video vložené do kořene složky se zařadí.                   |
| D3  | **Dětský vzhled**                      | Režim Děti z postranního menu, Domů, detail titulu, motivy pozadí, písma, animace karet – podle mockupů.                                                                                                 | Testy komponent                                                       | Proklikej a porovnej s mockupy; vyzkoušej všech 5 motivů.                                             |
| D4  | **Dětský přehrávač**                   | Zjednodušené ovládání, pokračování, další díl, oblíbené, vlastní historie.                                                                                                                               | Logika pokračování a dalšího dílu v titulu                            | Pusť díl, odejdi, vrať se → pokračuje; doběhne → začne další (když je zapnuto).                         |
| D5  | **Rodičovská brána a nastavení**       | PIN / příklad, odchod z režimu, nastavení dětské části včetně časového limitu a spouštění v dětském režimu.                                                                                              | Ověření PINu, časový limit                                            | Nastav PIN, zkus odejít bez něj; zapni limit 1 min → přehrávání skončí s hláškou.                       |
| D6  | **Stahování z YouTube v aplikaci**     | Dialog stahování (video i playlist), náhled, návrh titulu, kvalita, fronta s průběhem, chyby, aktualizace yt-dlp.                                                                                        | Fronta, chyby, návrh titulu (bez sítě, na uložených odpovědích)       | Stáhni video a krátký playlist, jedno zařazení změň; zkus neplatný odkaz a odpojenou síť.               |
| D7  | **Správa titulů**                      | Přejmenování, obrázek titulu, přesun videa (přesune i soubor do podsložky), mazání do Koše.                                                                                                              | Přesun a mazání na dočasných souborech                                | Přesuň video jinam, přejmenuj titul, smaž video → je v Koši.                                            |

Instalátor se nemění (yt-dlp a případně Deno se stahují až při prvním použití).

## Rozhodnuto (2026-10-24)

1. **Kdy:** nejdřív vydání 1.0.0, Dětská část jako verze 1.1.
2. **Složka:** `C:\Mirek_data\09_Videa\Kids` – vedle složek Filmy, Vlastní a YouTube.
3. **Brána:** PIN, a když PIN není nastavený, příklad pro dospělé.
4. Upozornění k podmínkám YouTube uživatel bere na vědomí.
