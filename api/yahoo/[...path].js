// Yahoo Finance requires a crumb + session cookie since May 2024.
// Cache both for the lifetime of this serverless function instance.
let _crumb = null
let _cookie = null

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://finance.yahoo.com/',
  'Origin': 'https://finance.yahoo.com',
}

async function ensureCrumb() {
  if (_crumb) return

  // Try to get crumb directly (works if Yahoo gives us a session cookie inline)
  const r1 = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
    headers: BROWSER_HEADERS,
    redirect: 'follow',
  })

  if (r1.ok) {
    const text = await r1.text()
    if (text && text !== 'Unauthorized') {
      _crumb = text.trim()
      const raw = r1.headers.get('set-cookie') || ''
      _cookie = raw.split(/,(?=[^ ])/).map(c => c.split(';')[0]).join('; ')
      return
    }
  }

  // Fallback: get a consent cookie from fc.yahoo.com, then fetch crumb
  const r0 = await fetch('https://fc.yahoo.com/', {
    headers: BROWSER_HEADERS,
    redirect: 'follow',
  })
  const raw0 = r0.headers.get('set-cookie') || ''
  const cookie0 = raw0.split(/,(?=[^ ])/).map(c => c.split(';')[0]).join('; ')

  const r2 = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
    headers: { ...BROWSER_HEADERS, Cookie: cookie0 },
  })
  _crumb = (await r2.text()).trim()
  _cookie = cookie0
}

export default async function handler(req, res) {
  try {
    await ensureCrumb()
  } catch {
    // If crumb fetch fails, proceed without it and hope for the best
  }

  const segments = Array.isArray(req.query.path) ? req.query.path : [req.query.path]
  const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''
  const sep = qs ? '&' : '?'
  const crumbParam = _crumb ? `${sep}crumb=${encodeURIComponent(_crumb)}` : ''
  const upstream = `https://query2.finance.yahoo.com/${segments.join('/')}${qs}${crumbParam}`

  const headers = { ...BROWSER_HEADERS }
  if (_cookie) headers['Cookie'] = _cookie

  const upstreamRes = await fetch(upstream, { headers })
  const body = await upstreamRes.text()

  // If we got 401 with this crumb, invalidate cache so next request refreshes it
  if (upstreamRes.status === 401) {
    _crumb = null
    _cookie = null
  }

  res
    .status(upstreamRes.status)
    .setHeader('Content-Type', upstreamRes.headers.get('content-type') || 'application/json')
    .setHeader('Access-Control-Allow-Origin', '*')
    .send(body)
}
