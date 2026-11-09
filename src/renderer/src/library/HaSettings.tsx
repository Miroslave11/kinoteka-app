import { useEffect, useMemo, useState } from 'react'
import { Lightbulb, PlugZap, RefreshCw } from 'lucide-react'
import {
  HA_DEFAULT_URL,
  MAX_HA_LABEL,
  haLabel,
  type HaAutomationSettings,
  type HaPlaybackKind,
  type HaRuleAction,
  type HaStatus,
  type HaEntityOption,
  type HaTestResult
} from '../../../shared/ha'
import { useHaStatus } from '../components/HaBulb'

const CONNECTION_TEXT = {
  off: 'vypnuto',
  connecting: 'připojuji…',
  connected: 'připojeno',
  error: 'nepřipojeno'
} as const

/** Nastavení → Home Assistant: připojení, výběr entity a název žárovky. */
export default function HaSettings(): React.JSX.Element {
  const { ha } = window.kinoteka
  const status = useHaStatus()
  const [url, setUrl] = useState('')
  const [token, setToken] = useState('')
  const [label, setLabel] = useState('')
  const [test, setTest] = useState<HaTestResult | null>(null)
  const [testing, setTesting] = useState(false)
  const [entities, setEntities] = useState<HaEntityOption[] | null>(null)
  const [entityError, setEntityError] = useState<string | null>(null)
  const [loadingEntities, setLoadingEntities] = useState(false)
  const [filter, setFilter] = useState('')
  const loaded = status !== null

  // Pole se naplní uloženými hodnotami jen jednou (pak je drží uživatel).
  useEffect(() => {
    if (!status) return
    setUrl((current) => current || status.settings.url || HA_DEFAULT_URL)
    setLabel((current) => current || status.settings.label)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded])

  const connected = status?.connection === 'connected'
  const loadEntities = async (): Promise<void> => {
    setLoadingEntities(true)
    const result = await ha.entities()
    setLoadingEntities(false)
    setEntities(result.entities)
    setEntityError(result.ok ? null : (result.message ?? 'Seznam entit nejde načíst.'))
  }
  useEffect(() => {
    if (connected && entities === null) void loadEntities()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected])

  const shown = useMemo(() => {
    const words = filter.trim().toLowerCase()
    const all = entities ?? []
    return words
      ? all.filter((e) => `${e.friendlyName} ${e.entityId}`.toLowerCase().includes(words))
      : all
  }, [entities, filter])

  if (!status) return <section className="card" />
  const { settings } = status

  const runTest = async (): Promise<void> => {
    setTesting(true)
    setTest(await ha.test(url, token))
    setTesting(false)
  }

  /** Uloží adresu a token (token jen nově zadaný) a zapne funkci. */
  const saveConnection = async (): Promise<void> => {
    setTesting(true)
    const result = await ha.test(url, token)
    setTest(result)
    if (result.ok) {
      await ha.save({ url, enabled: true, ...(token.trim() ? { token } : {}) })
      setToken('')
      setEntities(null)
    }
    setTesting(false)
  }

  const saveLabel = (): void => {
    if (label.trim() !== settings.label) void ha.save({ label })
  }

  return (
    <>
      <section className="card">
        <h2>Home Assistant</h2>
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={settings.enabled}
            disabled={!status.hasToken}
            onChange={() => void ha.save({ enabled: !settings.enabled })}
          />
          <span>Ovládat Home Assistant z Kinotéky</span>
        </label>
        <p className="muted small">
          Žárovka v horní liště a v přehrávači (i klávesa L) přepíná vybranou entitu, např. světlo
          nebo vypínač. Kinotéka se připojuje k Home Assistant v domácí síti; token je uložený
          zašifrovaně jen v tomto počítači a přes Google Disk se nesdílí.
        </p>
        <dl className="kv">
          <dt>Stav</dt>
          <dd>
            {CONNECTION_TEXT[status.connection]}
            {connected && status.locationName && (
              <span className="muted">
                {' '}
                · {status.locationName}, Home Assistant {status.haVersion}
              </span>
            )}
          </dd>
        </dl>
        {status.error && settings.enabled && <p className="notice is-error">{status.error}</p>}

        <label className="yt-label" htmlFor="ha-url">
          Adresa
        </label>
        <div className="key-row">
          <input
            id="ha-url"
            className="field grow"
            value={url}
            placeholder={HA_DEFAULT_URL}
            spellCheck={false}
            onChange={(e) => setUrl(e.target.value)}
          />
        </div>
        <label className="yt-label" htmlFor="ha-token">
          Dlouhodobý přístupový token
        </label>
        <div className="key-row">
          <input
            id="ha-token"
            className="field grow"
            type="password"
            value={token}
            placeholder={status.hasToken ? 'uložený – vlož nový jen při změně' : 'vlož token'}
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => setToken(e.target.value)}
          />
        </div>
        <p className="muted small">
          V Home Assistant: vlevo dole tvůj profil → Zabezpečení → Dlouhodobé přístupové tokeny →
          Vytvořit token (název např. „Kinotéka“). Token se ukáže jen jednou – zkopíruj ho sem.
        </p>
        <div className="actions">
          <button
            className="btn sm"
            disabled={testing || (!token.trim() && !status.hasToken)}
            onClick={() => void runTest()}
          >
            <PlugZap size={15} /> Ověřit spojení
          </button>
          <button
            className="btn sm primary"
            disabled={testing || (!token.trim() && !status.hasToken)}
            onClick={() => void saveConnection()}
          >
            Uložit a připojit
          </button>
        </div>
        {test && <p className={`notice ${test.ok ? '' : 'is-error'}`}>{test.message}</p>}
      </section>

      {status.hasToken && settings.enabled && (
        <section className="card">
          <h2>Ovládaná entita</h2>
          <p className="muted small">
            Vyber, co má žárovka přepínat (vypínače, světla, pomocníci typu přepínač).
          </p>
          <div className="key-row">
            <input
              className="field grow"
              value={filter}
              placeholder="Hledat entitu…"
              onChange={(e) => setFilter(e.target.value)}
            />
            <button
              className="btn sm"
              disabled={!connected || loadingEntities}
              onClick={() => void loadEntities()}
              title="Načíst znovu"
            >
              <RefreshCw size={15} className={loadingEntities ? 'spin' : ''} />
            </button>
          </div>
          {entityError && <p className="notice is-error">{entityError}</p>}
          {connected && status.entity?.missing && (
            <p className="notice is-error">
              Entita {settings.entityId} v Home Assistant není (smazaná nebo přejmenovaná) – vyber
              ji znovu.
            </p>
          )}
          <div className="ha-entities" role="listbox" aria-label="Entity Home Assistant">
            {shown.map((entity) => (
              <button
                key={entity.entityId}
                role="option"
                aria-selected={entity.entityId === settings.entityId}
                className={`ha-entity ${entity.entityId === settings.entityId ? 'on' : ''}`}
                onClick={() => void ha.save({ entityId: entity.entityId })}
              >
                <Lightbulb
                  size={16}
                  className={entity.state === 'on' ? 'ha-lit' : ''}
                  fill={entity.state === 'on' ? 'currentColor' : 'none'}
                />
                <span className="ha-entity-name">{entity.friendlyName}</span>
                <code>{entity.entityId}</code>
              </button>
            ))}
            {entities !== null && shown.length === 0 && (
              <p className="muted small">Nic nenalezeno.</p>
            )}
          </div>
          {settings.entityId && (
            <>
              <label className="yt-label" htmlFor="ha-label">
                Zobrazovaný název (bublina u žárovky a hlášky)
              </label>
              <div className="key-row">
                <input
                  id="ha-label"
                  className="field grow"
                  value={label}
                  maxLength={MAX_HA_LABEL}
                  placeholder={status.entity?.friendlyName ?? settings.entityId}
                  onChange={(e) => setLabel(e.target.value)}
                  onBlur={saveLabel}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveLabel()
                  }}
                />
              </div>
            </>
          )}
        </section>
      )}

      {status.hasToken && settings.enabled && settings.entityId && (
        <HaAutomationCard status={status} />
      )}
    </>
  )
}

const KIND_LABELS: [HaPlaybackKind, string][] = [
  ['movie', 'Filmy'],
  ['series', 'Seriály'],
  ['yt', 'YT videa']
]

const RULES: [Exclude<keyof HaAutomationSettings, 'enabled' | 'sections'>, string][] = [
  ['start', 'spustím přehrávání'],
  ['pause', 'dám pauzu'],
  ['resume', 'pokračuji po pauze'],
  ['end', 'film skončí / zavřu přehrávač']
]

const ACTION_LABELS: Record<HaRuleAction, string> = {
  none: 'nic',
  on: 'zapnout',
  off: 'vypnout',
  restore: 'vrátit původní'
}

/** Automatika podle přehrávání: pravidla a části Kinotéky, kde platí. */
function HaAutomationCard({ status }: { status: HaStatus }): React.JSX.Element {
  const { ha } = window.kinoteka
  const { automation } = status
  const name = haLabel(status)
  const save = (patch: Partial<HaAutomationSettings>): void =>
    void ha.save({ automation: { ...automation, ...patch } })

  return (
    <section className="card">
      <h2>Automatika podle přehrávání</h2>
      <label className="toggle-row">
        <input
          type="checkbox"
          checked={automation.enabled}
          onChange={() => save({ enabled: !automation.enabled })}
        />
        <span>Přepínat „{name}“ podle přehrávání</span>
      </label>
      <div className="ha-kinds">
        {KIND_LABELS.map(([kind, label]) => (
          <label key={kind} className="toggle-row">
            <input
              type="checkbox"
              disabled={!automation.enabled}
              checked={automation.sections[kind]}
              onChange={() =>
                save({ sections: { ...automation.sections, [kind]: !automation.sections[kind] } })
              }
            />
            <span>{label}</span>
          </label>
        ))}
        <span className="muted small">Děti – nikdy</span>
      </div>
      <table className={`ha-rules ${automation.enabled ? '' : 'is-disabled'}`}>
        <thead>
          <tr>
            <th>Když…</th>
            <th>{name}</th>
          </tr>
        </thead>
        <tbody>
          {RULES.map(([rule, label]) => {
            const actions: HaRuleAction[] =
              rule === 'end' ? ['none', 'on', 'off', 'restore'] : ['none', 'on', 'off']
            return (
              <tr key={rule}>
                <td>{label}</td>
                <td>
                  <div className="seg" role="radiogroup" aria-label={label}>
                    {actions.map((action) => (
                      <button
                        key={action}
                        role="radio"
                        aria-checked={automation[rule] === action}
                        disabled={!automation.enabled}
                        className={automation[rule] === action ? 'on' : ''}
                        onClick={() => save({ [rule]: action })}
                      >
                        {ACTION_LABELS[action]}
                      </button>
                    ))}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="muted small">
        Pauza kratší než 2 s se nepočítá. Mezi díly seriálu se nic nepřepíná. „Vrátit původní“ =
        stav před spuštěním; když „{name}“ mezitím přepneš ručně (vypínač, klávesa L), Kinotéka už
        ji nechá být. Když Home Assistant neodpovídá, film hraje normálně.
      </p>
    </section>
  )
}
