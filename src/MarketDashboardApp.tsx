
import React, { useEffect, useMemo, useRef, useState } from 'react'
import ChartPanel, { type Candle } from './ChartPanel'

type AssetType = 'index' | 'metal' | 'crypto' | 'stock' | 'forex'

type MarketAsset = {
  id: string
  name: string
  symbol: string
  tvSymbol: string
  type: AssetType
  currency: string
  paprikaId?: string  // crypto → CryptoCompare
  tdSymbol?: string   // metals/indices → Twelve Data
}

type ChangeFrame = '5m' | '1h' | '4h' | '1d' | '1w'

type QuoteData = {
  price?: number
  changes?: Record<ChangeFrame, number>
  loading: boolean
  error?: string
}

const MAX_ASSETS = 10

const DEFAULT_ASSETS: MarketAsset[] = [
  // Metals + indices via Twelve Data (requires VITE_TWELVE_DATA_KEY env var)
  { id: 'gold',     name: 'Gold',     symbol: 'XAU/USD', tvSymbol: 'XAU/USD',        type: 'metal',  currency: 'USD', tdSymbol: 'XAU/USD' },
  { id: 'silver',   name: 'Silver',   symbol: 'XAG/USD', tvSymbol: 'XAG/USD',        type: 'metal',  currency: 'USD', tdSymbol: 'XAG/USD' },
  { id: 'platinum', name: 'Platinum', symbol: 'XPT/USD', tvSymbol: 'XPT/USD',        type: 'metal',  currency: 'USD', tdSymbol: 'XPT/USD' },
  { id: 'nasdaq',   name: 'Nasdaq 100', symbol: 'NDX',   tvSymbol: 'OANDA:NAS100USD', type: 'index',  currency: 'USD', tdSymbol: 'NDX'     },
  { id: 'sp500',    name: 'S&P 500',  symbol: 'SPX',     tvSymbol: 'OANDA:SPX500USD', type: 'index',  currency: 'USD', tdSymbol: 'SPX'     },
  // Crypto via CryptoCompare
  { id: 'bitcoin',   name: 'Bitcoin',   symbol: 'BTC-USD',  tvSymbol: 'BTC',  type: 'crypto', currency: 'USD', paprikaId: 'btc-bitcoin'   },
  { id: 'ethereum',  name: 'Ethereum',  symbol: 'ETH-USD',  tvSymbol: 'ETH',  type: 'crypto', currency: 'USD', paprikaId: 'eth-ethereum'  },
  { id: 'solana',    name: 'Solana',    symbol: 'SOL-USD',  tvSymbol: 'SOL',  type: 'crypto', currency: 'USD', paprikaId: 'sol-solana'    },
  { id: 'chainlink', name: 'Chainlink', symbol: 'LINK-USD', tvSymbol: 'LINK', type: 'crypto', currency: 'USD', paprikaId: 'link-chainlink' },
  { id: 'bittensor', name: 'Bittensor', symbol: 'TAO-USD',  tvSymbol: 'TAO',  type: 'crypto', currency: 'USD', paprikaId: 'tao-bittensor' },
]

// bumped to v10: all non-crypto switched to Twelve Data
const STORAGE_KEY = 'market-dashboard-assets-v10'

const FRAME_LABELS: Record<ChangeFrame, string> = {
  '5m': '5m',
  '1h': '1h',
  '4h': '4h',
  '1d': '1D',
  '1w': '1W',
}

const FRAME_INTERVALS: Record<ChangeFrame, string> = {
  '5m': '5m',
  '1h': '1h',
  '4h': '4h',
  '1d': '1d',
  '1w': '1w',
}

export default function MarketDashboardApp() {
  const [assets, setAssets] = useState<MarketAsset[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) return parsed
      }
    } catch {}
    return DEFAULT_ASSETS
  })
  const [quotes, setQuotes] = useState<Record<string, QuoteData>>({})

  const [newName, setNewName] = useState('')
  const [newTvSymbol, setNewTvSymbol] = useState('')
  const [newType, setNewType] = useState<AssetType>('crypto')
  const [newCurrency, setNewCurrency] = useState('USD')
  const [newPaprikaId, setNewPaprikaId] = useState('')
  const [newTdSymbol, setNewTdSymbol] = useState('')
  const [coinList, setCoinList] = useState<{ symbol: string; name: string }[]>([])
  const [tdSearchResults, setTdSearchResults] = useState<{ symbol: string; name: string; currency: string; exchange: string; instrumentType: string }[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const searchTimer = useRef<number | null>(null)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(assets))
    } catch {}
  }, [assets])

  const fetchCC = async (path: string, params: Record<string, string>) => {
    const u = new URL(`http://localhost${path}`)
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v)
    const rel = u.pathname + (u.search ? u.search : '')
    const res = await fetch(rel)
    if (!res.ok) throw new Error(`CC ${res.status}`)
    return res.json()
  }

  const fetchTD = async (path: string, params: Record<string, string>) => {
    // apikey is added server-side by api/td/[...path].js — never exposed in client
    const qs = Object.entries(params).map(([k, v]) => `${k}=${v}`).join('&')
    const res = await fetch(`/api/td${path}${qs ? '?' + qs : ''}`)
    if (!res.ok) throw new Error(`TD ${res.status}`)
    const json = await res.json()
    if (json?.status === 'error') throw new Error(json.message || 'TD error')
    return json
  }

  const [candlesById, setCandlesById] = useState<Record<string, Candle[]>>({})

  // ── Crypto refresh: CryptoCompare, every 60 s ────────────────────────────
  useEffect(() => {
    const ccAssets = assets.filter(a => a.paprikaId)
    if (!ccAssets.length) return
    let stop = false

    const run = async () => {
      const priceUpdates = await Promise.all(ccAssets.map(async (a) => {
        try {
          const sym = a.symbol.split('-')[0].toUpperCase()
          const json = await fetchCC('/api/cc/data/pricemultifull', { fsyms: sym, tsyms: 'USD' })
          const raw = json?.RAW?.[sym]?.USD
          const price = Number(raw?.PRICE)
          if (!Number.isFinite(price)) throw new Error('bad price')
          return { id: a.id, q: { loading: false, price, changes: { '5m': NaN, '1h': Number(raw?.CHANGEPCTHOUR), '4h': NaN, '1d': Number(raw?.CHANGEPCT24HOUR), '1w': NaN } } as QuoteData }
        } catch (e: any) {
          return { id: a.id, q: { loading: false, error: e?.message ?? 'error' } as QuoteData }
        }
      }))

      const candleUpdates = await Promise.all(ccAssets.map(async (a, i) => {
        try {
          const sym = a.symbol.split('-')[0].toUpperCase()
          const json = await fetchCC('/api/cc/data/v2/histohour', { fsym: sym, tsym: 'USD', limit: '200' })
          const rows = json?.Data?.Data || []
          const candles = (rows as any[])
            .filter(r => r && r.time)
            .map(r => ({ time: Number(r.time) as any, open: Number(r.open), high: Number(r.high), low: Number(r.low), close: Number(r.close) }))
          // Patch last candle's close to match the live price so chart always agrees with the price display
          const livePrice = priceUpdates[i]?.q?.price
          if (livePrice && candles.length > 0) {
            const last = candles[candles.length - 1]
            candles[candles.length - 1] = { ...last, close: livePrice, high: Math.max(last.high, livePrice), low: Math.min(last.low, livePrice) }
          }
          return { id: a.id, c: candles }
        } catch { return { id: a.id, c: [] } }
      }))

      if (stop) return
      setQuotes(prev => { const n = { ...prev }; for (const u of priceUpdates) n[u.id] = u.q; return n })
      setCandlesById(prev => { const n = { ...prev }; for (const u of candleUpdates) n[u.id] = u.c; return n })
    }

    run()
    const t = window.setInterval(run, 60_000)
    return () => { stop = true; window.clearInterval(t) }
  }, [assets])

  // ── Non-crypto refresh: Twelve Data, every 3 min ─────────────────────────
  useEffect(() => {
    const tdAssets = assets.filter(a => a.tdSymbol)
    if (!tdAssets.length) return
    let stop = false

    const runPrices = async () => {
      const symbols = tdAssets.map(a => a.tdSymbol!).join(',')
      try {
        const json = await fetchTD('/price', { symbol: symbols })
        if (stop) return
        setQuotes(prev => {
          const n = { ...prev }
          for (const a of tdAssets) {
            const raw = tdAssets.length === 1 ? json : json[a.tdSymbol!]
            if (raw?.status === 'error') {
              n[a.id] = { loading: false, error: raw.message || 'TD error' }
              continue
            }
            const price = Number(raw?.price)
            n[a.id] = Number.isFinite(price) && price > 0
              ? { loading: false, price, changes: { '5m': NaN, '1h': NaN, '4h': NaN, '1d': NaN, '1w': NaN } }
              : { loading: false, error: 'bad price' }
          }
          return n
        })
      } catch (e: any) {
        if (stop) return
        const err = { loading: false, error: e?.message ?? 'TD error' } as QuoteData
        setQuotes(prev => { const n = { ...prev }; for (const a of tdAssets) n[a.id] = err; return n })
      }
    }

    const runCandles = async () => {
      const candleUpdates = await Promise.all(tdAssets.map(async (a) => {
        try {
          const json = await fetchTD('/time_series', { symbol: a.tdSymbol!, interval: '1day', outputsize: '365' })
          const rows: any[] = (json.values || []).slice().reverse()
          const candles = rows
            .filter(r => r.datetime && Number(r.close) > 0)
            .map(r => ({
              time: (new Date(r.datetime).getTime() / 1000) as any,
              open: Number(r.open), high: Number(r.high), low: Number(r.low), close: Number(r.close),
            }))
          return { id: a.id, c: candles }
        } catch { return { id: a.id, c: [] } }
      }))
      if (stop) return
      setCandlesById(prev => { const n = { ...prev }; for (const u of candleUpdates) n[u.id] = u.c; return n })
    }

    runPrices()
    runCandles() // load charts once on mount
    const t = window.setInterval(runPrices, 3 * 60_000)
    return () => { stop = true; window.clearInterval(t) }
  }, [assets])

// TradingView widget removed (was falling back to AAPL / paywalled symbols).

  useEffect(() => {
    fetchCC('/api/cc/data/top/mktcapfull', { limit: '100', tsym: 'USD' })
      .then((json) => {
        const coins = (json?.Data ?? [])
          .map((item: any) => ({
            symbol: (item?.CoinInfo?.Name ?? '') as string,
            name: (item?.CoinInfo?.FullName ?? '') as string,
          }))
          .filter((c) => c.symbol && c.name)
        setCoinList(coins)
      })
      .catch(() => {})
  }, [])

  // Debounced TD symbol search for stocks/ETFs/indices
  useEffect(() => {
    if (newName.length < 1) { setTdSearchResults([]); return }
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/td/symbol_search?symbol=${encodeURIComponent(newName)}&outputsize=8`)
        if (!res.ok) return
        const json = await res.json()
        if (json.status !== 'ok') return
        setTdSearchResults((json.data || []).map((d: any) => ({
          symbol: d.symbol,
          name: d.instrument_name,
          currency: d.currency || 'USD',
          exchange: d.exchange || '',
          instrumentType: d.instrument_type || '',
        })))
      } catch {}
    }, 400)
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current) }
  }, [newName])

  const cryptoSuggestions = newName.length >= 1
    ? coinList
        .filter(c => c.name.toLowerCase().includes(newName.toLowerCase()) || c.symbol.toLowerCase().startsWith(newName.toLowerCase()))
        .slice(0, 4)
        .map(c => ({ ...c, source: 'cc' as const, exchange: '', instrumentType: 'Crypto', currency: 'USD' }))
    : []

  const stockSuggestions = tdSearchResults
    .slice(0, 6)
    .map(s => ({ ...s, source: 'td' as const }))

  const suggestions = [...cryptoSuggestions, ...stockSuggestions]

  const selectCoin = (coin: { symbol: string; name: string }) => {
    setNewName(coin.name)
    setNewTvSymbol(`${coin.symbol}-USD`)
    setNewType('crypto')
    setNewPaprikaId(coin.symbol.toLowerCase())
    setNewTdSymbol('')
    setShowSuggestions(false)
  }

  const selectStock = (stock: { symbol: string; name: string; currency: string; instrumentType: string }) => {
    setNewName(stock.name)
    setNewTvSymbol(stock.symbol)
    setNewType('stock')
    setNewCurrency(stock.currency)
    setNewPaprikaId('')
    setNewTdSymbol(stock.symbol)
    setShowSuggestions(false)
  }

  const subtitle = useMemo(() => {
    return 'Charts + quotes from free public data (no TradingView widgets)'
  }, [])

  return (
    <div className="dash-root" style={{ background: "#020617", minHeight: "100vh", color: "white" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
          <h1 className="dash-title">Dashboard</h1>
          <a
            href="https://app.hyperliquid.xyz/join/M8UHZWP"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 12px',
              borderRadius: 8,
              background: 'rgba(99,102,241,0.15)',
              border: '1px solid rgba(99,102,241,0.4)',
              color: 'rgba(165,180,252,0.95)',
              fontSize: 13,
              fontWeight: 600,
              textDecoration: 'none',
              letterSpacing: '0.01em',
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(99,102,241,0.28)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(99,102,241,0.15)')}
          >
            Trade on Hyperliquid ↗
          </a>
        </div>
        <div style={{ fontSize: 12, opacity: 0.7 }}>Symbols: {assets.length}</div>
      </div>

      <div style={{
        border: '1px solid rgba(148,163,184,0.18)',
        background: 'rgba(2,6,23,0.55)',
        borderRadius: 12,
        padding: 14,
        marginTop: 18,
      }}>
        <div className="dash-form-row">
          <div style={{ fontWeight: 700, marginRight: 8 }}>Assets</div>
          <div className="dash-search-wrap">
            <input
              value={newName}
              onChange={(e) => { setNewName(e.target.value); setShowSuggestions(true) }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              placeholder="Search coin (e.g. Bitcoin)"
              style={{ background: 'rgba(15,23,42,0.9)', color: 'white', border: '1px solid rgba(148,163,184,0.22)', borderRadius: 10, padding: '8px 10px' }}
            />
            {showSuggestions && suggestions.length > 0 && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                zIndex: 100,
                background: 'rgba(15,23,42,0.97)',
                border: '1px solid rgba(148,163,184,0.3)',
                borderRadius: 8,
                marginTop: 4,
                minWidth: 240,
                boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              }}>
                {suggestions.map((item) => (
                  <div
                    key={`${item.source}-${item.symbol}`}
                    onMouseDown={() => item.source === 'cc' ? selectCoin(item) : selectStock(item)}
                    style={{ padding: '8px 12px', cursor: 'pointer', display: 'flex', gap: 8, alignItems: 'center' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(59,130,246,0.15)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span style={{ fontWeight: 700, fontSize: 13 }}>{item.symbol}</span>
                    <span style={{ opacity: 0.7, fontSize: 12, flex: 1 }}>{item.name}</span>
                    <span style={{ fontSize: 11, opacity: 0.5, whiteSpace: 'nowrap' }}>
                      {item.source === 'td' ? item.exchange || item.instrumentType : 'Crypto'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <input
            className="dash-input-wide"
            value={newTvSymbol}
            onChange={(e) => setNewTvSymbol(e.target.value)}
            placeholder="Symbol (e.g. BTC-USD)"
            style={{ background: 'rgba(15,23,42,0.9)', color: 'white', border: '1px solid rgba(148,163,184,0.22)', borderRadius: 10, padding: '8px 10px' }}
          />
          <select
            value={newType}
            onChange={(e) => setNewType(e.target.value as AssetType)}
            style={{ background: 'rgba(15,23,42,0.9)', color: 'white', border: '1px solid rgba(148,163,184,0.22)', borderRadius: 10, padding: '8px 10px' }}
          >
            <option value="crypto">crypto</option>
            <option value="index">index</option>
            <option value="metal">metal</option>
            <option value="stock">stock</option>
            <option value="forex">forex</option>
          </select>
          <input
            className="dash-input-sm"
            value={newCurrency}
            onChange={(e) => setNewCurrency(e.target.value)}
            placeholder="Currency"
            style={{ background: 'rgba(15,23,42,0.9)', color: 'white', border: '1px solid rgba(148,163,184,0.22)', borderRadius: 10, padding: '8px 10px' }}
          />
          <input
            className="dash-input-medium"
            value={newPaprikaId}
            onChange={(e) => setNewPaprikaId(e.target.value.toLowerCase())}
            placeholder="CC symbol (optional, e.g. sol)"
            style={{ background: 'rgba(15,23,42,0.9)', color: 'white', border: '1px solid rgba(148,163,184,0.22)', borderRadius: 10, padding: '8px 10px' }}
          />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            disabled={assets.length >= MAX_ASSETS}
            onClick={() => {
              const name = newName.trim()
              const tv = newTvSymbol.trim()
              if (!name || !tv || assets.length >= MAX_ASSETS) return
              const id = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`
              setAssets((prev) => [
                ...prev,
                {
                  id,
                  name,
                  symbol: tv,
                  tvSymbol: tv,
                  type: newType,
                  currency: (newCurrency.trim() || 'USD').toUpperCase(),
                  paprikaId: newPaprikaId.trim() ? newPaprikaId.trim().toLowerCase() : undefined,
                  tdSymbol: newTdSymbol.trim() || undefined,
                },
              ])
              setNewName('')
              setNewTvSymbol('')
              setNewPaprikaId('')
              setNewTdSymbol('')
            }}
            style={{
              background: assets.length >= MAX_ASSETS ? 'rgba(59,130,246,0.3)' : 'rgba(59,130,246,0.9)',
              color: 'white',
              border: '1px solid rgba(59,130,246,0.5)',
              borderRadius: 10,
              padding: '8px 12px',
              cursor: assets.length >= MAX_ASSETS ? 'not-allowed' : 'pointer',
              fontWeight: 700,
            }}
          >
            Add
          </button>
          {assets.length >= MAX_ASSETS && (
            <span style={{ fontSize: 12, color: 'rgba(251,191,36,0.9)' }}>Max {MAX_ASSETS} assets — remove one first</span>
          )}

          <button
            onClick={() => {
              setAssets(DEFAULT_ASSETS)
              setQuotes({})
            }}
            style={{ background: 'transparent', color: 'rgba(148,163,184,0.95)', border: '1px solid rgba(148,163,184,0.25)', borderRadius: 10, padding: '8px 12px', cursor: 'pointer', fontWeight: 700 }}
            title="Reset your saved asset list back to defaults"
          >
            Reset defaults
          </button>
          </div>
        </div>
      </div>

      <div className="dash-grid">
        {assets.map((a) => {
          const q = quotes[a.id]
          const priceText = q?.price ? q.price.toLocaleString(undefined, { maximumFractionDigits: 6 }) : q?.loading ? '…' : '—'

          return (
            <div
              key={a.id}
              style={{
                border: "1px solid rgba(148,163,184,0.18)",
                background: "rgba(2,6,23,0.6)",
                padding: 14,
                borderRadius: 12,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
                    <div style={{ fontWeight: 700 }}>{a.name}</div>
                    <button
                      onClick={() => setAssets((prev) => prev.filter((x) => x.id !== a.id))}
                      style={{
                        background: 'transparent',
                        color: 'rgba(248,113,113,0.95)',
                        border: '1px solid rgba(248,113,113,0.35)',
                        borderRadius: 8,
                        padding: '4px 8px',
                        cursor: 'pointer',
                      }}
                      title="Remove"
                    >
                      Remove
                    </button>
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.75 }}>{a.tvSymbol}</div>
                  <div style={{ marginTop: 6, fontSize: 20, fontWeight: 800 }}>
                    {priceText} <span style={{ fontSize: 12, opacity: 0.7 }}>{a.currency}</span>
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                    {(Object.keys(FRAME_LABELS) as ChangeFrame[]).map((f) => {
                      const v = q?.changes?.[f]
                      const isNum = typeof v === 'number' && Number.isFinite(v)
                      const color = !isNum ? 'rgba(148,163,184,0.75)' : v >= 0 ? 'rgba(34,197,94,0.95)' : 'rgba(248,113,113,0.95)'
                      const bg = !isNum ? 'rgba(148,163,184,0.12)' : v >= 0 ? 'rgba(34,197,94,0.12)' : 'rgba(248,113,113,0.12)'
                      const txt = !isNum ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
                      return (
                        <span key={f} style={{ fontSize: 12, color, background: bg, border: `1px solid ${bg}`, padding: '3px 7px', borderRadius: 999 }}>
                          {FRAME_LABELS[f]} {txt}
                        </span>
                      )
                    })}
                    {q?.error ? (
                      <span style={{ fontSize: 12, color: 'rgba(251,191,36,0.95)', background: 'rgba(251,191,36,0.10)', border: '1px solid rgba(251,191,36,0.18)', padding: '3px 7px', borderRadius: 999 }}>
                        {q.error}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div style={{ fontSize: 12, opacity: 0.7, whiteSpace: 'nowrap' }}>{a.type.toUpperCase()} · {a.currency}</div>
              </div>

              <div className="dash-chart">
                <ChartPanel candles={candlesById[a.id] || []} />
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ marginTop: 20, fontSize: 12, opacity: 0.65 }}>
        Note: This version shows TradingView charts only (quotes/news panels not wired yet).
      </div>
    </div>
  )
}
