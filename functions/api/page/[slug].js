import { json, listAll, readManifest, validateSlug, writeManifest } from '../../_shared.js'

export async function onRequestDelete({ params, env }) {
  try {
    const slug = params.slug
    const manifest = await readManifest(env.BUCKET)
    if (!manifest.some((page) => page.slug === slug)) return json({ ok: false, error: 'not_found' }, 404)
    const objects = await listAll(env.BUCKET, `pages/${slug}/`)
    await Promise.all(objects.map((object) => env.BUCKET.delete(object.key)))
    await writeManifest(env.BUCKET, manifest.filter((page) => page.slug !== slug))
    return json({ ok: true })
  } catch {
    return json({ ok: false, error: 'r2_delete_failed' }, 500)
  }
}

export async function onRequestPatch({ request, params, env }) {
  try {
    const oldSlug = params.slug
    const body = await request.json()
    const newSlug = body.slug
    if (!newSlug) return json({ ok: false, error: 'missing_slug' }, 400)
    if (!validateSlug(newSlug)) return json({ ok: false, error: 'invalid_slug' }, 400)

    const manifest = await readManifest(env.BUCKET)
    const record = manifest.find((page) => page.slug === oldSlug)
    if (!record) return json({ ok: false, error: 'not_found' }, 404)
    if (manifest.some((page) => page.slug === newSlug)) return json({ ok: false, error: 'slug_exists' }, 409)

    const objects = await listAll(env.BUCKET, `pages/${oldSlug}/`)
    for (const object of objects) {
      const source = await env.BUCKET.get(object.key)
      if (!source) continue
      const relative = object.key.slice(`pages/${oldSlug}/`.length)
      await env.BUCKET.put(`pages/${newSlug}/${relative}`, source.body, {
        httpMetadata: source.httpMetadata
      })
    }
    await Promise.all(objects.map((object) => env.BUCKET.delete(object.key)))

    record.slug = newSlug
    record.url = `/p/${newSlug}`
    await writeManifest(env.BUCKET, manifest)
    return json({ ok: true, slug: newSlug, url: record.url })
  } catch {
    return json({ ok: false, error: 'r2_rename_failed' }, 500)
  }
}
