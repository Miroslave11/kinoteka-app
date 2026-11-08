/**
 * Nejnutnější část Google Drive API v3 pro synchronizaci: soubory ve skryté složce aplikace
 * (`appDataFolder`) – výpis, stažení, založení a přepsání. Nic jiného na Disku nevidí.
 */

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>

export interface DriveFile {
  id: string
  name: string
  modifiedTime: string
}

export interface DriveEndpoints {
  api: string
  upload: string
}

export const DRIVE_ENDPOINTS: DriveEndpoints = {
  api: 'https://www.googleapis.com/drive/v3',
  upload: 'https://www.googleapis.com/upload/drive/v3'
}

export const driveEndpointsAt = (base: string): DriveEndpoints => ({
  api: `${base}/drive/v3`,
  upload: `${base}/upload/drive/v3`
})

export class DriveError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
  }
}

export class DriveClient {
  constructor(
    private readonly fetchImpl: FetchLike,
    private readonly endpoints: DriveEndpoints,
    /** Platný přístupový klíč (obnoví ho, když vypršel). */
    private readonly accessToken: () => Promise<string>
  ) {}

  private async request(url: string, init: RequestInit = {}): Promise<Response> {
    const token = await this.accessToken()
    const response = await this.fetchImpl(url, {
      ...init,
      headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${token}` }
    })
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new DriveError(
        response.status === 401 || response.status === 403
          ? 'Google Disk odmítl přístup – přihlas se prosím znovu.'
          : `Google Disk vrátil chybu ${response.status}${text ? `: ${text.slice(0, 200)}` : ''}`,
        response.status
      )
    }
    return response
  }

  async list(): Promise<DriveFile[]> {
    const files: DriveFile[] = []
    let pageToken: string | undefined
    do {
      const params = new URLSearchParams({
        spaces: 'appDataFolder',
        fields: 'nextPageToken,files(id,name,modifiedTime)',
        pageSize: '100',
        ...(pageToken ? { pageToken } : {})
      })
      const json = (await (await this.request(`${this.endpoints.api}/files?${params}`)).json()) as {
        files?: DriveFile[]
        nextPageToken?: string
      }
      files.push(...(json.files ?? []))
      pageToken = json.nextPageToken
    } while (pageToken)
    return files
  }

  async download(id: string): Promise<string> {
    return (await this.request(`${this.endpoints.api}/files/${id}?alt=media`)).text()
  }

  /** Nový soubor ve složce aplikace; vrátí jeho ID. */
  async create(name: string, content: string): Promise<string> {
    const boundary = `kinoteka${Date.now().toString(36)}`
    const body =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      JSON.stringify({ name, parents: ['appDataFolder'] }) +
      `\r\n--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      content +
      `\r\n--${boundary}--`
    const response = await this.request(
      `${this.endpoints.upload}/files?uploadType=multipart&fields=id`,
      {
        method: 'POST',
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body
      }
    )
    return String(((await response.json()) as { id: string }).id)
  }

  async update(id: string, content: string): Promise<void> {
    await this.request(`${this.endpoints.upload}/files/${id}?uploadType=media`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: content
    })
  }
}
