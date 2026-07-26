import { json } from '../../_shared.js'

export async function onRequestPost({ request, env }) {
  try {
    const { token } = await request.json()
    if (!token) return json({ ok: false, error: 'missing_token' }, 400)
    if (token !== env.TOKEN) return json({ ok: false, error: 'invalid_token' }, 401)
    return json({ ok: true })
  } catch {
    return json({ ok: false, error: 'bad_request' }, 400)
  }
}
