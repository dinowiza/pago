import { json, readManifest } from '../_shared.js'

export async function onRequestGet({ env }) {
  try {
    return json(await readManifest(env.BUCKET))
  } catch {
    return json({ ok: false, error: 'manifest_read_failed' }, 500)
  }
}
