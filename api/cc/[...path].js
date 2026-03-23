export default async function handler(req, res) {
  const segments = Array.isArray(req.query.path) ? req.query.path : [req.query.path]
  const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''
  const upstream = `https://min-api.cryptocompare.com/${segments.join('/')}${qs}`

  const upstreamRes = await fetch(upstream)
  const body = await upstreamRes.text()

  res
    .status(upstreamRes.status)
    .setHeader('Content-Type', upstreamRes.headers.get('content-type') || 'application/json')
    .setHeader('Access-Control-Allow-Origin', '*')
    .send(body)
}
