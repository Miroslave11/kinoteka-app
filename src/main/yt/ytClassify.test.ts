import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CATEGORIES,
  defaultsFor,
  fallbackRole,
  matchCategory,
  metaFromInfo,
  type YtMeta
} from './ytClassify'

const meta = (patch: Partial<YtMeta>): YtMeta => ({
  title: '',
  description: null,
  tags: [],
  channel: null,
  categories: [],
  ...patch
})

const classify = (patch: Partial<YtMeta>): string | null =>
  matchCategory(meta(patch), DEFAULT_CATEGORIES)

describe('matchCategory', () => {
  it('hudba z měst podle názvu nebo štítků', () => {
    expect(classify({ title: 'Tokyo Night Walk – lo-fi beats', categories: ['Music'] })).toBe(
      'Města'
    )
    expect(classify({ title: 'Summer Vibes', tags: ['paris', 'music video', 'chill'] })).toBe(
      'Města'
    )
    expect(classify({ title: 'Praha v noci | Prague by night' })).toBe('Města')
  })

  it('příroda – i s diakritikou a velkými písmeny', () => {
    expect(classify({ title: 'Norway in 4K – FJORDS with relaxing music' })).toBe('Příroda')
    expect(classify({ title: 'Krásná PŘÍRODA Šumavy' })).toBe('Příroda')
    expect(classify({ title: 'Ocean Drive', tags: ['drone', 'aerial', 'ocean'] })).toBe('Příroda')
  })

  it('koncerty podle názvu', () => {
    expect(classify({ title: 'Song Name (Live at Wembley)' })).toBe('Koncerty a živě')
    expect(classify({ title: 'Band – Full Concert 2025' })).toBe('Koncerty a živě')
  })

  it('víc shod vyhrává: štítky přírody přebijí jedno město v popisu', () => {
    expect(
      classify({
        title: 'Into the Wild (Official Video)',
        tags: ['forest', 'mountains', 'nature'],
        description: 'Filmed near London.'
      })
    ).toBe('Příroda')
  })

  it('jedno slovo jen v popisu nebo v kanálu nestačí', () => {
    expect(classify({ title: 'Song Name', description: 'Live your best life!' })).toBeNull()
    expect(classify({ title: 'Song Name', channel: 'Paris Records' })).toBeNull()
  })

  it('slovo musí být celé („walking“ není „walk“, „seaside“ není „sea“)', () => {
    expect(classify({ title: 'Seaside Walking Song' })).toBeNull()
  })

  it('štítky se nespojují přes hranici („new“ + „york“ není New York)', () => {
    expect(classify({ title: 'X', tags: ['brand new', 'york'] })).toBeNull()
    expect(classify({ title: 'X', tags: ['new york'] })).toBe('Města')
  })

  it('záložní kategorie se podle slov nevybírají', () => {
    expect(classify({ title: 'Hudební klipy a Ostatní' })).toBeNull()
  })

  it('vlastní kategorie: název je klíčové slovo', () => {
    const categories = [...DEFAULT_CATEGORIES, { name: 'Pláže', keywords: [], role: null }]
    expect(matchCategory(meta({ title: 'Song Name' }), categories)).toBeNull()
    expect(matchCategory(meta({ title: 'Pláže Chorvatska' }), categories)).toBe('Pláže')
  })
})

describe('fallbackRole', () => {
  it('hudba podle kategorie YouTube, jinak ostatní', () => {
    expect(fallbackRole(meta({ categories: ['Music'] }))).toBe('music')
    expect(fallbackRole(meta({ categories: ['People & Blogs'] }))).toBe('other')
  })
})

describe('metaFromInfo', () => {
  it('čte štítky, popis a kategorie; bez údajů jen název', () => {
    expect(
      metaFromInfo(
        {
          title: ' Paris ',
          tags: ['a', 3, 'b'],
          uploader: 'Artist',
          categories: ['Music'],
          description: 'x'
        },
        'soubor'
      )
    ).toEqual({
      title: 'Paris',
      description: 'x',
      tags: ['a', 'b'],
      channel: 'Artist',
      categories: ['Music']
    })
    expect(metaFromInfo(null, 'soubor').title).toBe('soubor')
  })
})

describe('defaultsFor', () => {
  it('výchozí slova i pro ručně založenou složku stejného jména', () => {
    expect(defaultsFor('priroda')?.keywords).toContain('forest')
    expect(defaultsFor('Ostatní')?.role).toBe('other')
    expect(defaultsFor('Pláže')).toBeNull()
  })
})
