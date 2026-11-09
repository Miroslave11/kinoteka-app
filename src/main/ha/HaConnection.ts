/**
 * Spojení s Home Assistant přes jeho WebSocket API (/api/websocket): přihlášení tokenem,
 * dotazy s odpovědí (get_config, get_states, call_service) a odběr změn entit.
 */

export type HaErrorCode = 'auth' | 'network' | 'timeout' | 'ha'

export class HaError extends Error {
  readonly code: HaErrorCode
  constructor(code: HaErrorCode, message: string) {
    super(message)
    this.code = code
  }
}

/** Stav entity tak, jak ho drží odběr (zkrácený tvar z subscribe_entities). */
export interface HaEntitySnapshot {
  state: string
  attributes: Record<string, unknown>
}

/** Minimální rozhraní WebSocketu (globální WebSocket v Node / Electronu). */
export interface HaSocket {
  readyState: number
  send(data: string): void
  close(): void
  addEventListener(type: 'open' | 'close' | 'error', listener: () => void): void
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void
}

export type HaSocketFactory = (url: string) => HaSocket

const OPEN = 1
const DEFAULT_TIMEOUT_MS = 5000

/** http://dum:8123 → ws://dum:8123/api/websocket (https → wss). */
export function websocketUrl(baseUrl: string): string {
  const url = new URL(baseUrl)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.pathname = '/api/websocket'
  url.search = ''
  url.hash = ''
  return url.toString()
}

interface Pending {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

type EntitiesListener = (entities: Map<string, HaEntitySnapshot>) => void

export class HaConnection {
  readonly version: string
  private nextId = 1
  private readonly pending = new Map<number, Pending>()
  private readonly subscriptions = new Map<number, EntitiesListener>()
  private readonly entities = new Map<string, HaEntitySnapshot>()
  private readonly closeListeners: (() => void)[] = []
  private closed = false

  private constructor(
    private readonly socket: HaSocket,
    version: string,
    private readonly timeoutMs: number
  ) {
    this.version = version
  }

  /**
   * Otevře spojení a přihlásí se tokenem. Chyby jsou HaError se srozumitelnou zprávou
   * (špatná adresa, neplatný token, Home Assistant neodpovídá).
   */
  static open(
    baseUrl: string,
    token: string,
    {
      timeoutMs = DEFAULT_TIMEOUT_MS,
      socketFactory = (url: string) => new WebSocket(url) as unknown as HaSocket
    }: { timeoutMs?: number; socketFactory?: HaSocketFactory } = {}
  ): Promise<HaConnection> {
    return new Promise((resolve, reject) => {
      let socket: HaSocket
      try {
        socket = socketFactory(websocketUrl(baseUrl))
      } catch {
        reject(new HaError('network', 'Neplatná adresa Home Assistant.'))
        return
      }
      let settled = false
      let connection: HaConnection | null = null
      const fail = (error: HaError): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        try {
          socket.close()
        } catch {
          // už zavřené
        }
        reject(error)
      }
      const timer = setTimeout(
        () => fail(new HaError('timeout', 'Home Assistant neodpověděl včas.')),
        timeoutMs
      )
      socket.addEventListener('error', () =>
        fail(new HaError('network', 'Home Assistant na této adrese neodpovídá.'))
      )
      socket.addEventListener('close', () => {
        if (!settled) fail(new HaError('network', 'Home Assistant spojení ukončil.'))
        else connection?.handleClose()
      })
      socket.addEventListener('message', (event) => {
        let message: Record<string, unknown>
        try {
          message = JSON.parse(String(event.data)) as Record<string, unknown>
        } catch {
          return
        }
        if (connection) return connection.handleMessage(message)
        switch (message['type']) {
          case 'auth_required':
            socket.send(JSON.stringify({ type: 'auth', access_token: token }))
            return
          case 'auth_invalid':
            return fail(
              new HaError(
                'auth',
                'Home Assistant token nepřijal – vytvoř nový (Profil → Zabezpečení → Dlouhodobé přístupové tokeny).'
              )
            )
          case 'auth_ok':
            if (settled) return
            settled = true
            clearTimeout(timer)
            connection = new HaConnection(socket, String(message['ha_version'] ?? ''), timeoutMs)
            resolve(connection)
            return
        }
      })
    })
  }

  get isOpen(): boolean {
    return !this.closed && this.socket.readyState === OPEN
  }

  /** Pošle příkaz a počká na odpověď (result); chyba Home Assistant = HaError 'ha'. */
  request<T>(message: Record<string, unknown>): Promise<T> {
    if (!this.isOpen) return Promise.reject(new HaError('network', 'Spojení je přerušené.'))
    const id = this.nextId++
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new HaError('timeout', 'Home Assistant neodpověděl včas.'))
      }, this.timeoutMs)
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer })
      this.socket.send(JSON.stringify({ ...message, id }))
    })
  }

  getConfig(): Promise<{ location_name?: string; version?: string }> {
    return this.request({ type: 'get_config' })
  }

  getStates(): Promise<
    { entity_id: string; state: string; attributes?: Record<string, unknown> }[]
  > {
    return this.request({ type: 'get_states' })
  }

  callService(domain: string, service: string, entityId: string): Promise<unknown> {
    return this.request({ type: 'call_service', domain, service, target: { entity_id: entityId } })
  }

  /** Odebírá živý stav entit; posluchač dostane po každé změně celou mapu. */
  async subscribeEntities(entityIds: string[], listener: EntitiesListener): Promise<void> {
    const id = this.nextId
    this.subscriptions.set(id, listener)
    try {
      await this.request({ type: 'subscribe_entities', entity_ids: entityIds })
    } catch (error) {
      this.subscriptions.delete(id)
      throw error
    }
  }

  onClose(listener: () => void): void {
    if (this.closed) listener()
    else this.closeListeners.push(listener)
  }

  close(): void {
    if (this.closed) return
    try {
      this.socket.close()
    } catch {
      // už zavřené
    }
    this.handleClose()
  }

  private handleClose(): void {
    if (this.closed) return
    this.closed = true
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timer)
      pending.reject(new HaError('network', 'Spojení s Home Assistant se přerušilo.'))
    }
    this.pending.clear()
    for (const listener of this.closeListeners.splice(0)) listener()
  }

  private handleMessage(message: Record<string, unknown>): void {
    const id = message['id'] as number
    if (message['type'] === 'result') {
      const pending = this.pending.get(id)
      if (!pending) return
      this.pending.delete(id)
      clearTimeout(pending.timer)
      if (message['success']) pending.resolve(message['result'])
      else {
        const error = message['error'] as { message?: string } | undefined
        pending.reject(new HaError('ha', error?.message ?? 'Home Assistant příkaz odmítl.'))
      }
      return
    }
    if (message['type'] === 'event') {
      const listener = this.subscriptions.get(id)
      if (!listener) return
      this.applyEntityEvent(message['event'] as EntityEvent)
      listener(new Map(this.entities))
    }
  }

  /** Zkrácený tvar subscribe_entities: a = přidané, c = změny (+ / −), r = odebrané. */
  private applyEntityEvent(event: EntityEvent): void {
    for (const [entityId, added] of Object.entries(event.a ?? {})) {
      this.entities.set(entityId, { state: String(added.s), attributes: { ...(added.a ?? {}) } })
    }
    for (const [entityId, change] of Object.entries(event.c ?? {})) {
      const current = this.entities.get(entityId)
      if (!current) continue
      const plus = change['+']
      if (plus?.s !== undefined) current.state = String(plus.s)
      if (plus?.a) Object.assign(current.attributes, plus.a)
      for (const key of change['-']?.a ?? []) delete current.attributes[key]
    }
    for (const entityId of event.r ?? []) this.entities.delete(entityId)
  }
}

interface CompressedState {
  s?: unknown
  a?: Record<string, unknown>
}

interface EntityEvent {
  a?: Record<string, CompressedState>
  c?: Record<string, { '+'?: CompressedState; '-'?: { a?: string[] } }>
  r?: string[]
}
