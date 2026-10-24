import { describe, expect, it } from 'vitest'
import {
  cleanShowName,
  cleanVideoName,
  deriveTitleName,
  matchTitle,
  safeFolderName,
  type VideoMeta
} from './classify'

const meta = (fields: Partial<VideoMeta>): VideoMeta => ({
  title: '',
  channel: null,
  playlist: null,
  series: null,
  ...fields
})

const TITLES = [
  { name: 'Prasátko Peppa', keywords: ['peppa', 'peppa pig'] },
  { name: 'Tlapková patrola', keywords: ['paw patrol'] },
  { name: 'Krteček', keywords: ['krtek', 'krtecek'] },
  { name: 'Bluey', keywords: [] }
]

describe('cleanShowName', () => {
  it('odebere „oficiální kanál“ a podobné dovětky', () => {
    expect(cleanShowName('Prasátko Peppa - Oficiální kanál')).toBe('Prasátko Peppa')
    expect(cleanShowName('Peppa Pig - Official Channel')).toBe('Peppa Pig')
    expect(cleanShowName('PAW Patrol Official')).toBe('PAW Patrol')
    expect(cleanShowName('Bluey - Official Channel')).toBe('Bluey')
    expect(cleanShowName('Krtek | Kreslené pohádky CZ')).toBe('Krtek')
    expect(cleanShowName('🚂 Mašinka Tomáš CZ')).toBe('Mašinka Tomáš')
  })

  it('pomlčku uvnitř slova nechá, obecný název zachová', () => {
    expect(cleanShowName('Spider-Man and Friends')).toBe('Spider-Man and Friends')
    expect(cleanShowName('Pohádky pro děti')).toBe('Pohádky pro děti')
  })
})

describe('matchTitle', () => {
  it('podle kanálu (skutečné údaje z YouTube)', () => {
    expect(
      matchTitle(
        meta({
          title:
            '🎁 Santova brzká návštěva a vánoční zábava! | Prasátko Peppa | Karikatury pro děti',
          channel: 'Prasátko Peppa - Oficiální kanál'
        }),
        TITLES
      )
    ).toBe('Prasátko Peppa')
  })

  it('podle klíčového slova i bez diakritiky a velkých písmen', () => {
    expect(matchTitle(meta({ title: 'PEPPA PIG – Muddy Puddles' }), TITLES)).toBe('Prasátko Peppa')
    expect(matchTitle(meta({ title: 'Krtecek a autíčko' }), TITLES)).toBe('Krteček')
  })

  it('kanál má přednost před slovem v názvu videa', () => {
    expect(
      matchTitle(
        meta({ title: 'Pups Save Peppa?', channel: 'PAW Patrol Official & Friends' }),
        TITLES
      )
    ).toBe('Tlapková patrola')
  })

  it('jen celá slova – „Bluey“ nenajde v „Blueyho“, nic nepasuje → null', () => {
    expect(matchTitle(meta({ title: 'Blueyho velké dobrodružství' }), TITLES)).toBeNull()
    expect(matchTitle(meta({ title: 'Mašinka Tomáš', channel: 'Thomas' }), TITLES)).toBeNull()
  })

  it('série a playlist váží víc než kanál', () => {
    expect(
      matchTitle(meta({ playlist: 'Bluey celé díly', channel: 'Peppa a přátelé' }), TITLES)
    ).toBe('Bluey')
  })
})

describe('deriveTitleName', () => {
  it('série, pak playlist, pak kanál', () => {
    expect(deriveTitleName(meta({ series: 'Bing', channel: 'Bing - Official' }))).toBe('Bing')
    expect(deriveTitleName(meta({ playlist: 'Bluey Full Episodes', channel: 'X' }))).toBe('Bluey')
    expect(deriveTitleName(meta({ channel: 'Prasátko Peppa - Oficiální kanál' }))).toBe(
      'Prasátko Peppa'
    )
    expect(deriveTitleName(meta({ title: 'něco' }))).toBeNull()
  })
})

describe('cleanVideoName', () => {
  const peppa = TITLES[0]!

  it('bez názvu pořadu, emoji a obecných dovětků', () => {
    expect(
      cleanVideoName(
        '🎁 Santova brzká návštěva a vánoční zábava! | Prasátko Peppa | Karikatury pro děti',
        peppa
      )
    ).toBe('Santova brzká návštěva a vánoční zábava!')
    expect(cleanVideoName('Peppa Pig ｜ Bláto ｜ Full Episodes #peppa', peppa)).toBe('Bláto')
    expect(cleanVideoName('Peppa Pig - Muddy Puddles', peppa)).toBe('Muddy Puddles')
    expect(cleanVideoName('Krteček a kalhotky | Večerníček', TITLES[2]!)).toBe(
      'Krteček a kalhotky – Večerníček'
    )
    // Pomlčka uvnitř slova název nerozdělí.
    expect(cleanVideoName('Spider-Man a kouzelník', null)).toBe('Spider-Man a kouzelník')
  })

  it('když by nic nezbylo, nechá původní název', () => {
    expect(cleanVideoName('Prasátko Peppa', peppa)).toBe('Prasátko Peppa')
    expect(cleanVideoName('Výlet k moři', null)).toBe('Výlet k moři')
  })
})

describe('safeFolderName', () => {
  it('odstraní znaky, které Windows v názvu složky nedovolí', () => {
    expect(safeFolderName('Bluey: Velká "dobrodružství"?')).toBe('Bluey Velká dobrodružství')
    expect(safeFolderName('Krteček...')).toBe('Krteček')
    expect(safeFolderName('CON')).toBe('Ostatní')
    expect(safeFolderName('???')).toBe('Ostatní')
  })
})
