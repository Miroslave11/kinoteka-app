export interface FakeGoogle {
  url: string
  files: Map<string, { id: string; name: string; content: string; modifiedTime: string }>
  revokeAll(): void
  close(): Promise<void>
}

export function startFakeGoogle(port?: number, options?: { email?: string }): Promise<FakeGoogle>
