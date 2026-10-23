import { describe, expect, it } from 'vitest'
import { parseSearchResponse, rankSubtitles, type OnlineSubtitle } from './onlineSubtitles'

describe('parseSearchResponse', () => {
  it('převede odpověď API na nabídku titulků', () => {
    expect(
      parseSearchResponse({
        total_count: 3,
        data: [
          {
            id: '1',
            type: 'subtitle',
            attributes: {
              language: 'cs',
              release: 'Hideout.2026.1080p.WEB-DL',
              download_count: 1532,
              moviehash_match: true,
              from_trusted: true,
              hearing_impaired: false,
              ai_translated: false,
              machine_translated: false,
              files: [{ file_id: 9001, file_name: 'Hideout.cs.srt' }]
            }
          },
          {
            attributes: {
              language: 'en',
              release: ' ',
              download_count: 10,
              ai_translated: true,
              files: [{ file_id: 9002, file_name: 'hideout.en.srt' }]
            }
          },
          { attributes: { language: 'de', files: [] } }
        ]
      })
    ).toEqual([
      {
        fileId: 9001,
        language: 'cs',
        release: 'Hideout.2026.1080p.WEB-DL',
        downloads: 1532,
        hashMatch: true,
        trusted: true,
        hearingImpaired: false,
        machineTranslated: false
      },
      {
        fileId: 9002,
        language: 'en',
        release: 'hideout.en.srt',
        downloads: 10,
        hashMatch: false,
        trusted: false,
        hearingImpaired: false,
        machineTranslated: true
      }
    ])
  })

  it('nesmysl = prázdná nabídka', () => {
    expect(parseSearchResponse(null)).toEqual([])
    expect(parseSearchResponse({ data: 'x' })).toEqual([])
  })
})

describe('rankSubtitles', () => {
  const sub = (fileId: number, extra: Partial<OnlineSubtitle>): OnlineSubtitle => ({
    fileId,
    language: 'cs',
    release: '',
    downloads: 0,
    hashMatch: false,
    trusted: false,
    hearingImpaired: false,
    machineTranslated: false,
    ...extra
  })

  it('přesná shoda, pak jazyk, lidský překlad, ověřený autor a stažení', () => {
    const ranked = rankSubtitles(
      [
        sub(1, { language: 'en', downloads: 9999 }),
        sub(2, { downloads: 50 }),
        sub(3, { downloads: 500, machineTranslated: true }),
        sub(4, { downloads: 10, trusted: true }),
        sub(5, { language: 'en', hashMatch: true }),
        sub(6, { language: 'de', downloads: 99999 })
      ],
      ['cs', 'en']
    )
    expect(ranked.map((s) => s.fileId)).toEqual([5, 4, 2, 3, 1, 6])
  })
})
