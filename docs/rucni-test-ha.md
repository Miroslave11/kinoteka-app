# Ruční test – ovládání Home Assistant (1.6.0)

Kinotéka 1.6.0, Home Assistant v domácí síti (`http://homeassistant.local:8123`), entita
`switch.vypinac_linka` („Linka“). Žárovka = ikona vpravo nahoře a v ovládací liště přehrávače.

## Připojení

1. V Home Assistant: profil → Zabezpečení → Dlouhodobé přístupové tokeny → Vytvořit token
   („Kinotéka“), zkopírovat.
2. Kinotéka: Nastavení → Home Assistant → adresa nechat, vložit token → **Ověřit spojení**
   ukáže „Připojeno – Domov, Home Assistant …“. **Uložit a připojit** → Stav: připojeno.
3. Špatný token → Ověřit spojení napíše „Home Assistant token nepřijal…“, nic se neuloží.
4. Ovládaná entita: vyhledat „linka“, vybrat `vypinac_linka`; zobrazovaný název „Linka“.

## Ruční ovládání

5. Žárovka v horní liště: žlutá = svítí, šedá = zhasnuto. Klik přepne linku.
6. Klávesa **L** (mimo textové pole) přepne linku. V poli Hledat se píše „l“ normálně.
7. Linku přepnout vypínačem na zdi / v aplikaci HA → žárovka se do pár sekund změní sama.
8. V přehrávači (film, seriál, YT video): žárovka vpravo dole, **L** přepne linku (změní se
   jen barva žárovky, žádná hláška); video se neposune (+10 s je jen šipka →).
9. Klávesové zkratky v přehrávači (?) uvádějí L = žárovka.
10. V Dětech žárovka není a L nic nedělá.

## Automatika (výchozí pravidla)

11. Linka svítí → pustit film: linka zhasne **2 s po rozehrání** videa (ne během načítání).
    Zavřít film do 2 s od spuštění → linka se vůbec nepřepne.
12. Pauza a počkat > 2 s → rozsvítí se; pokračovat → zhasne. Pauza a hned pokračovat → nic.
13. Zavřít přehrávač (Zpět, Esc, ■ Zastavit, křížek) → linka se rozsvítí (svítila před filmem).
14. Linka zhasnutá → pustit film a zavřít → zůstane zhasnutá.
15. Během filmu linku přepnout ručně (L nebo vypínač) → po zavření ji Kinotéka nechá být.
16. Seriál: konec dílu a přechod na další díl (odpočet / Další díl) → nic. Konec posledního
    dílu → linka se vrátí.
17. YT video funguje jako film. Odškrtnout „YT videa“ v Nastavení → YT video linku nepřepíná.
18. Pravidla změnit (např. pauza = nic) → projeví se hned u dalšího přehrávání.
19. Vypnout „Přepínat … podle přehrávání“ → film linku nepřepíná, ruční žárovka funguje dál.

## Výpadky a chyby

20. Vypnout Wi-Fi / síťový kabel (nebo HA restartovat) → žárovka čárkovaná, bublina
    „Home Assistant nedostupný“. Film se pustí normálně, v přehrávači jednou hláška.
21. Síť zpět → do minuty se žárovka sama vrátí do normálu (bez restartu Kinotéky).
22. Uspat počítač s běžící Kinotékou, probudit → žárovka do pár sekund funguje (klik, L).
23. V HA token smazat → Kinotéka ukáže „token nepřijal“ a další pokusy nedělá. Vložit nový
    token → Uložit a připojit → zase připojeno.
24. Entitu v HA přejmenovat (nebo vybrat neexistující) → Nastavení: „Entita … v Home
    Assistant není – vyber ji znovu“, žárovka čárkovaná; vybrat znovu → funguje.

## Druhý počítač

25. Na druhém PC je potřeba zadat token zvlášť (přes Google Disk se nesdílí). Když tam
    `homeassistant.local` nefunguje, zadat IP adresu (192.168.0.127:8123).
