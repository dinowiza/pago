import { json } from '../../_shared.js'

export async function onRequestPost({ request, env }) {
  try {
    const { token } = await request.json()
    const trimmed = typeof token === 'string' ? token.trim() : token
    if (!trimmed) return json({ ok: false, error: 'missing_token' }, 400)
    if (!env.TOKEN) return json({ ok: false, error: 'token_not_configured' }, 500)
    if (trimmed !== env.TOKEN.trim()) return json({ ok: false, error: 'invalid_token' }, 401)
    return json({ ok: true })
  } catch {
    return json({ ok: false, error: 'bad_request' }, 400)
  }
}
