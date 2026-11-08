# Rozsah a plán – YT videa (návrh)

Stav: **návrh schválen 2026-11-07** · Mockup: [docs/mockupy/yt.html](docs/mockupy/yt.html)

Cíl: vlastní část aplikace pro videa stažená z YouTube – převážně hudební videoklipy. Videa se řadí do kategorií podle obsahu (např. hudba z měst, příroda, koncerty) a nová videa jde stáhnout vložením odkazu.

## Rozhodnutí

| Téma                | Řešení                                                                                                                                                                                                                                                                                         |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Menu                | Nová položka **YT videa** (s počtem videí) za Dětmi. **Deník** se přesouvá úplně dolů jako poslední položka (pod Nastavení).                                                                                                                                                                   |
| Složka              | Vlastní knihovna, nastavuje se v Nastavení → YT videa. Výchozí `C:\Mirek_data\09_Videa\YT` (aplikace ji vytvoří). Oddělená od Filmů, Seriálů i Dětí. Stávající `09_Videa\YouTube` je jiný archiv (podsložka na každé video, přepisy) – jde vybrat, ale jeho podsložky by se staly kategoriemi. |
| Kategorie = složka  | Každá kategorie je podsložka (`YT\Města\…`, `YT\Příroda\…`). Jedno video = jedna kategorie. Zařazení je vidět v Průzkumníku a přežije ztrátu databáze. Videa vložená do kořene složky se zařadí automaticky a přesunou (i s `.info.json` a obrázkem).                                          |
| Řazení podle obsahu | Z `.info.json` (yt-dlp): štítky (tags), název, popis, kanál a kategorie YouTube. Každá kategorie má klíčová slova; vyhraje nejlepší shoda (váha štítky > název > popis > kanál, delší slovo má přednost). Bez shody: hudba (YouTube „Music“) → Hudební klipy, jinak Ostatní.                   |
| Výchozí kategorie   | **Města** (city, walk, downtown, street, night, názvy velkých měst…), **Příroda** (nature, forest, mountains, ocean, lake, drone, relax…), **Koncerty a živě** (live, concert, festival, unplugged…), **Hudební klipy**, **Ostatní**. Vše jde v nastavení upravit, přidat i smazat.            |
| Starší videa        | Bez `.info.json`, ale s ID videa v názvu souboru (`… [RyIkcuetHm4].webm`) → aplikace si údaje dotáhne přes yt-dlp (bez stahování videa). Jinak zařazení jen podle názvu souboru.                                                                                                               |
| Vzhled              | Běžný tmavý vzhled Kinotéky: nahoře **Pokračovat**, filtr kategorií (štítky), pod tím řádky po kategoriích. Karta = náhled z YouTube (jinak snímek z videa), název, kanál, délka, průběh sledování.                                                                                            |
| Přehrávání          | Normální přehrávač (mpv) s plným ovládáním, pokračování od místa, kde jsi skončil, další video v kategorii. Do Deníku se nezapisuje.                                                                                                                                                           |
| Stahování           | Tlačítko **Stáhnout z YouTube** → vložit odkaz (video i playlist), náhled, **návrh kategorie** (jde změnit), kvalita (1080p výchozí, 4K, 720p), fronta s průběhem. Bez rodičovské brány. Stejný yt-dlp a fronta jako u Dětí – nic nového se neinstaluje.                                       |
| Správa              | Přesun videa do jiné kategorie (přesune soubor), přejmenování / smazání kategorie, úprava klíčových slov, smazání videa do Koše.                                                                                                                                                               |

## Mimo rozsah

Více kategorií pro jedno video · automatické odběry kanálů · zařazení pomocí AI (jen klíčová slova) · titulky ke stahovaným videím · jiné weby než YouTube.

## Upozornění – YouTube

Stejné jako u Dětí: podmínky YouTube stahování mimo jejich vlastní funkce nepovolují; funkce je jen pro soukromé přehrávání doma.

## Plán přírůstků

Každý přírůstek samostatně ověřitelný, další začíná po potvrzení ručního testu.

| #   | Přírůstek                             | Co dělá                                                                                                                      | Automatické testy                                                     | Ruční ověření                                                              |
| --- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Y0  | **Deník dolů v menu**                 | Deník jako poslední položka menu.                                                                                            | –                                                                     | Deník je v menu úplně dole a otevírá se.                                   |
| Y1  | **Knihovna YT a řazení do kategorií** | Nastavení složky a kategorií s klíčovými slovy, sken, zařazení podle `.info.json`, dotažení údajů podle ID, přesun z kořene. | Zařazení podle štítků, názvu, popisu a kanálu (sada skutečných údajů) | Nahraj do kořene složky pár videí → skončí ve správných podsložkách.       |
| Y2  | **Stránka YT videa a přehrávání**     | Položka v menu, Pokračovat, filtr, řádky kategorií, přehrávání s pokračováním a dalším videem.                               | Data stránky, pokračování, další video                                | Proklikej podle mockupu, pusť video, odejdi a vrať se → pokračuje.         |
| Y3  | **Stahování z odkazu**                | Okno stahování, náhled, návrh kategorie, kvalita, fronta s průběhem a chybami.                                               | Návrh kategorie, fronta (bez sítě)                                    | Stáhni klip a krátký playlist, jednou změň kategorii; zkus neplatný odkaz. |
| Y4  | **Správa**                            | Přesun mezi kategoriemi, přejmenování a mazání kategorií, smazání videa do Koše.                                             | Přesun a mazání na dočasných souborech                                | Přesuň video, přejmenuj kategorii, smaž video → je v Koši.                 |

## Online videa a fronta stahování (schváleno 2026-11-08)

Cíl: videa zabírají hodně místa – přidat jde i jen **odkaz**. Video se přehrává v Kinotéce stejně jako stažené, jen se stream bere přímo z YouTube.

| Téma         | Řešení                                                                                                                                                                                                     |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Online video | Malý soubor `Název [ID].ytonline` (odkaz) + `.info.json` + `.jpg` ve složce kategorie. Zařazení, přesun, mazání, pokračování i předchozí/další jako u stažených.                                           |
| Přehrávání   | yt-dlp zjistí adresy obrazu a zvuku (kvalita podle nastavení, výchozí 1080p), mpv je přehraje ze sítě (EDL obraz + zvuk, stejné hlavičky). Adresy se drží v mezipaměti, dokud platí. Bez internetu hláška. |
| Označení     | Štítek ☁ Online / 💾 V počítači, filtr Vše / V počítači / Online.                                                                                                                                          |
| Přidání      | V okně Stáhnout z YouTube volba **Online (výchozí)** / Stáhnout do počítače; i playlist.                                                                                                                   |
| Převody      | Ponechat jen online (smaže soubor do Koše, i hromadně za kategorii s ukázáním uvolněného místa), Stáhnout do počítače.                                                                                     |
| Fronta       | Víc odkazů najednou (jeden na řádek), 2 stahování souběžně (nastavitelné 1–3), opakování chybných, fronta přežije restart a navazuje na rozpracované soubory.                                              |

| #   | Přírůstek                                                                                        |
| --- | ------------------------------------------------------------------------------------------------ |
| O1  | Technický test přehrávání online (rozhodovací bod, ruční test uživatele)                         |
| O2  | Online videa v knihovně, volba Online / Stáhnout, štítky a filtr; pojistka třídění při stahování |
| O3  | Převody: Ponechat jen online / Stáhnout do počítače                                              |
| O4  | Víc odkazů najednou, souběžné stahování, fronta s opakováním a pokračováním po restartu          |
