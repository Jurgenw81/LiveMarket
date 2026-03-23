export default async function handler(req, res) {
  const apiKey = process.env.TWELVE_DATA_KEY
  if (!apiKey) {
    return res.status(503).json({ status: 'error', message: 'TWELVE_DATA_KEY not set in Vercel env' })
  }

  // req.url = '/api/td/price?symbol=XAU/USD,...'
  const upstreamPath = (req.url || '').replace(/^\/api\/td/, '')
  const sep = upstreamPath.includes('?') ? '&' : '?'
  const upstream = `https://api.twelvedata.com${upstreamPath}${sep}apikey=${apiKey}`

  try {
    const r = await fetch(upstream)
    const body = await r.text()
    res
      .status(r.status)
      .setHeader('Content-Type', r.headers.get('content-type') || 'application/json')
      .setHeader('Access-Control-Allow-Origin', '*')
      .send(body)
  } catch (e) {
    res.status(500).json({ status: 'error', message: String(e) })
  }
}
