# Ruční test – Dětská část (D2–D7, verze 1.1)

Spuštění: aktuální `main` přes `Spustit Kinoteku.bat` (nebo `npm.cmd run dev`).
Složka s pohádkami: `C:\Mirek_data\09_Videa\Kids`.

## D2 – Knihovna a zařazení do titulů

1. Do kořene složky `Kids` vlož video stažené z YouTube (i s `.jpg` a `.info.json`).
2. V aplikaci otevři **Děti**.
3. Ověř, že je video přesunuté do podsložky titulu (např. `Kids\Prasátko Peppa`) i se svými soubory.
4. Video bez údajů (třeba vlastní `.mp4`) zůstane v kořeni a v seznamu bude pod titulem „Ostatní“.

## D3 – Dětský vzhled

1. Postranní menu → **Děti**.
2. Ověř kulaté tituly, řady „Nové pohádky“ a „Oblíbené“ a detail titulu po kliknutí.
3. Pro rodiče → Nastavení: přepni všech 5 motivů. Obloha, Louka, Moře, Vesmír a Jednorožci se mají hned projevit.

## D4 – Dětský přehrávač

1. Pusť pohádku, v půlce zavři přehrávač a pusť ji znovu. Má pokračovat, kde skončila (řada „Dívat se dál“).
2. Nech pohádku doběhnout. Když je zapnuté „Další pohádka automaticky“, začne další z titulu.
3. Srdíčko v přehrávači nebo u titulu → položka se objeví v „Oblíbené“.

## D5 – Rodičovská brána a nastavení

1. **Pro rodiče** se zeptá příkladem. Pak nastav PIN, od té doby se ptá PINem.
2. 5× špatný PIN → brána se na 30 s zamkne.
3. Tlačítko **Odejít** vedle Pro rodiče vrátí Kinotéku do dospělé části bez PINu. Po zapnutí „Odchod z dětského režimu jen za branou“ tlačítko zmizí a odejít jde jen přes Pro rodiče.
4. Zavři aplikaci v dětském režimu a znovu ji spusť. Zůstane v dětském režimu.
5. Nastav limit 1 min a pusť pohádku. Po minutě se zastaví a ukáže se měsíček „Pohádky pro dnešek skončily“. Pak zkus „Vynulovat dnešní čas“.
6. Zapni „Spouštět Kinotéku rovnou v dětském režimu“ a restartuj aplikaci.

## D6 – Stahování z YouTube (Pro rodiče → Stáhnout z YouTube)

1. Vlož odkaz na video a dej **Načíst**. Ověř obrázek, název, kanál, délku a navržený titul.
2. **Stáhnout**. Ve frontě se ukáže průběh (%, MB/s, zbývá). Po dokončení je video v titulu.
3. Odkaz na video z playlistu → **Celý playlist** na krátkém playlistu. Videa se stáhnou postupně a už stažená se přeskočí.
4. Zařazení změň na jiný titul nebo na „Nový titul…“ s vlastním názvem.
5. Během stahování klikni na **×**. Stahování se zastaví a nedokončené soubory zmizí.
6. Neplatný odkaz → srozumitelná hláška. Odpoj síť a zkus **Načíst** → chyba místo zamrznutí.

## D7 – Správa titulů (Pro rodiče → Tituly)

1. **Přejmenuj** titul. V Průzkumníku se přejmenuje i složka a rozkoukaná pozice zůstane.
2. Vyber jiný **obrázek titulu** a ověř ho na obrazovce Domů.
3. Přidej **klíčové slovo** (třeba „peppa“). Nové video s tímto slovem v názvu nebo kanálu se zařadí do titulu.
4. **Přesunout do…** u videa. Soubor se přesune do složky jiného titulu i s obrázkem.
5. Smaž video (ikona koše, potvrzení druhým kliknutím) a ověř ho v **Koši** Windows.
6. Založ **Nový titul** (vznikne prázdná složka), pak ho **Smaž**. Složka bude v Koši.
7. Zkus smazat video, které se právě přehrává. Má se ukázat hláška „Soubor je otevřený…“.
