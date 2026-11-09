// Falešný Home Assistant pro vývoj a ruční zkoušky ovládání žárovky (SCOPE-HA.md).
//
//   node scripts/fake-ha.mjs [port]      (výchozí 8771)
//
// V Kinotéce: Nastavení → Home Assistant → adresa http://127.0.0.1:8771, token fake-ha-token.
// Na příkazové řádce serveru: „on“ / „off“ přepne switch.vypinac_linka jako vypínač na zdi,
// „drop“ odpojí Kinotéku (výpadek), „freeze“ / „unfreeze“ = přestane odpovídat (jako po
// uspání), „rm“ smaže entitu, „revoke“ zneplatní token, „q“ ukončí.
import { createInterface } from 'node:readline'
import { FAKE_HA_TOKEN, startFakeHa } from '../src/main/ha/fakeHa.ts'

const port = Number(process.argv[2] ?? 8771)
const ha = await startFakeHa(port)
const ENTITY = 'switch.vypinac_linka'
console.log(`Falešný Home Assistant: ${ha.url} (token ${FAKE_HA_TOKEN})`)
console.log('Příkazy: on | off | drop | freeze | unfreeze | rm | revoke | q')

let reported = 0
setInterval(() => {
  while (reported < ha.calls.length) console.log(`služba: ${ha.calls[reported++]}`)
}, 200)

createInterface({ input: process.stdin }).on('line', (line) => {
  const command = line.trim()
  if (command === 'on' || command === 'off') ha.setState(ENTITY, command)
  else if (command === 'drop') ha.dropClients()
  else if (command === 'freeze' || command === 'unfreeze') ha.freeze(command === 'freeze')
  else if (command === 'rm') ha.removeEntity(ENTITY)
  else if (command === 'revoke') ha.revokeToken()
  else if (command === 'q') void ha.close().then(() => process.exit(0))
  if (command) console.log(`${ENTITY}: ${ha.state(ENTITY)}`)
})
