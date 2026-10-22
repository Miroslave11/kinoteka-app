import { describe, expect, it } from 'vitest'
import { parseFfprobe } from './ffprobe'

/** Zkrácený skutečný výstup ffprobe pro „Den odhalení (2026) CZ DABING.mkv“. */
const USER_MKV = {
  streams: [
    {
      index: 0,
      codec_name: 'h264',
      profile: 'Main',
      codec_type: 'video',
      width: 1920,
      height: 800,
      pix_fmt: 'yuv420p',
      color_transfer: 'bt709',
      r_frame_rate: '24000/1001',
      avg_frame_rate: '24000/1001',
      disposition: { default: 1, forced: 0, attached_pic: 0 },
      tags: { BPS: '3396183' }
    },
    {
      index: 1,
      codec_name: 'aac',
      profile: 'LC',
      codec_type: 'audio',
      channels: 2,
      disposition: { default: 1, forced: 0 },
      tags: { language: 'cze', BPS: '96000' }
    },
    {
      index: 2,
      codec_name: 'subrip',
      codec_type: 'subtitle',
      disposition: { default: 0, forced: 0 },
      tags: { language: 'cze' }
    }
  ],
  format: { format_name: 'matroska,webm', duration: '8871.125000', bit_rate: '3486390' }
}

/** 4K UHD remux: HEVC HDR10, TrueHD Atmos + DTS-HD MA + E-AC3 dabing, PGS titulky, obal. */
const UHD_REMUX = {
  streams: [
    {
      codec_name: 'hevc',
      codec_type: 'video',
      width: 3840,
      height: 2160,
      pix_fmt: 'yuv420p10le',
      color_transfer: 'smpte2084',
      avg_frame_rate: '24000/1001',
      disposition: { default: 1 },
      tags: { BPS: '58000000' }
    },
    {
      codec_name: 'truehd',
      codec_type: 'audio',
      profile: 'Dolby TrueHD + Dolby Atmos',
      channels: 8,
      disposition: { default: 1 },
      tags: { language: 'eng', title: 'TrueHD Atmos 7.1' }
    },
    {
      codec_name: 'dts',
      codec_type: 'audio',
      profile: 'DTS-HD MA',
      channels: 6,
      disposition: { default: 0 },
      tags: { language: 'eng' }
    },
    {
      codec_name: 'eac3',
      codec_type: 'audio',
      channels: 6,
      bit_rate: '640000',
      disposition: { default: 0 },
      tags: { language: 'ces', title: 'Český dabing' }
    },
    {
      codec_name: 'hdmv_pgs_subtitle',
      codec_type: 'subtitle',
      disposition: { default: 0, forced: 1 },
      tags: { language: 'cze', title: 'Forced' }
    },
    {
      codec_name: 'mjpeg',
      codec_type: 'video',
      width: 600,
      height: 900,
      disposition: { attached_pic: 1 }
    }
  ],
  format: { format_name: 'matroska,webm', duration: '9000', bit_rate: '64000000' }
}

const DOLBY_VISION_MP4 = {
  streams: [
    {
      codec_name: 'hevc',
      codec_type: 'video',
      width: 3840,
      height: 1600,
      pix_fmt: 'yuv420p10le',
      color_transfer: 'smpte2084',
      avg_frame_rate: '24/1',
      side_data_list: [{ side_data_type: 'DOVI configuration record', dv_profile: 8 }]
    },
    {
      codec_name: 'eac3',
      codec_type: 'audio',
      profile: 'Dolby Digital Plus + Dolby Atmos',
      channels: 6,
      tags: { language: 'und' }
    }
  ],
  format: { format_name: 'mov,mp4,m4a,3gp,3g2,mj2', duration: '100' }
}

describe('parseFfprobe', () => {
  it('soubor uživatele: H.264 1080p, AAC stereo česky, české SRT', () => {
    expect(parseFfprobe(USER_MKV)).toEqual({
      container: 'MKV',
      durationSec: 8871.125,
      bitrate: 3486390,
      video: {
        codec: 'H.264',
        width: 1920,
        height: 800,
        fps: 23.976,
        bitDepth: 8,
        hdr: null,
        bitrate: 3396183
      },
      audio: [
        {
          number: 1,
          codec: 'AAC',
          channels: 2,
          layout: '2.0',
          atmos: false,
          language: 'cs',
          title: null,
          default: true,
          bitrate: 96000
        }
      ],
      subtitles: [
        {
          number: 1,
          codec: 'SRT',
          language: 'cs',
          title: null,
          default: false,
          forced: false,
          image: false
        }
      ]
    })
  })

  it('4K HDR10 remux: Atmos, DTS-HD MA, dabing, obrázkové titulky, obal ignoruje', () => {
    const info = parseFfprobe(UHD_REMUX)
    expect(info.video).toMatchObject({
      codec: 'HEVC',
      width: 3840,
      height: 2160,
      hdr: 'HDR10',
      bitDepth: 10
    })
    expect(info.audio.map((a) => [a.number, a.codec, a.layout, a.atmos, a.language])).toEqual([
      [1, 'TrueHD', '7.1', true, 'en'],
      [2, 'DTS-HD MA', '5.1', false, 'en'],
      [3, 'E-AC3', '5.1', false, 'cs']
    ])
    expect(info.audio[2]).toMatchObject({ title: 'Český dabing', bitrate: 640000 })
    expect(info.subtitles).toEqual([
      {
        number: 1,
        codec: 'PGS',
        language: 'cs',
        title: 'Forced',
        default: false,
        forced: true,
        image: true
      }
    ])
  })

  it('Dolby Vision v MP4, E-AC3 Atmos, neznámý jazyk', () => {
    const info = parseFfprobe(DOLBY_VISION_MP4)
    expect(info.container).toBe('MP4')
    expect(info.video).toMatchObject({ hdr: 'Dolby Vision', fps: 24 })
    expect(info.audio[0]).toMatchObject({ codec: 'E-AC3', atmos: true, language: null })
    expect(info.bitrate).toBeNull()
  })

  it('poškozený výstup nespadne', () => {
    expect(parseFfprobe(null)).toEqual({
      container: '',
      durationSec: 0,
      bitrate: null,
      video: null,
      audio: [],
      subtitles: []
    })
  })
})
