const slugPattern = /^[a-z0-9-]{3,32}$/

function generateSlug() {
  try {
    if (window.PagoNanoid) return window.PagoNanoid()
    if (crypto.randomUUID) return crypto.randomUUID().replace(/-/g, '').slice(0, 8)
    return crypto.getRandomValues(new Uint32Array(1))[0].toString(36).padStart(8, '0').slice(0, 8)
  } catch {
    return Math.random().toString(36).slice(2, 10)
  }
}

function normalizeSlug(value) {
  return value.toLowerCase().trim().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32)
}

function slugFromHtml(html) {
  return normalizeSlug(titleFromHtml(html))
}

function titleFromHtml(html) {
  const match = String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return match ? match[1].replace(/<[^>]+>/g, '').replace(/&[^;]+;/g, ' ').trim() : ''
}

function escapeHtml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function updateTitleInHtml(html, title) {
  if (!String(html).trim() || !String(title).trim()) return html
  const titleTag = '<title>' + escapeHtml(title.trim()) + '</title>'
  if (/<title[^>]*>[\s\S]*?<\/title>/i.test(html)) return html.replace(/<title[^>]*>[\s\S]*?<\/title>/i, titleTag)
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head([^>]*)>/i, '<head$1>' + titleTag)
  return titleTag + '\n' + html
}

function isHtmlFile(file) {
  return /\.html?$/i.test(file.name)
}

function isZipFile(file) {
  return /\.zip$/i.test(file.name)
}

function slugReady(slug) {
  return !slug || slugPattern.test(slug)
}

function hasUnsafePath(name) {
  return name.startsWith('/') || name.split('/').some((part) => part === '..' || part === '')
}

document.addEventListener('alpine:init', () => {
  Alpine.store('theme', {
    value: 'dark',
    init() {
      const stored = localStorage.getItem('theme')
      if (stored === 'dark' || stored === 'light') {
        this.value = stored
        return
      }
      this.value = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
    },
    toggle() {
      this.value = this.value === 'dark' ? 'light' : 'dark'
      localStorage.setItem('theme', this.value)
    }
  })

  Alpine.store('toasts', {
    items: [],
    add(message, type = 'info') {
      const id = generateSlug()
      this.items.push({ id, message, type, dismissAt: Date.now() + 3000 })
      setTimeout(() => this.remove(id), 3000)
    },
    remove(id) {
      this.items = this.items.filter((toast) => toast.id !== id)
    }
  })

  Alpine.store('modal', {
    isOpen: false,
    type: 'notice',
    title: '',
    message: '',
    confirmLabel: 'OK',
    cancelLabel: 'Cancel',
    confirmAction: null,
    openNotice(title, message) {
      this.type = 'notice'
      this.title = title
      this.message = message
      this.confirmLabel = 'OK'
      this.cancelLabel = 'Cancel'
      this.confirmAction = null
      this.isOpen = true
    },
    openConfirm(title, message, confirmAction, confirmLabel = 'Confirm', cancelLabel = 'Cancel') {
      this.type = 'confirm'
      this.title = title
      this.message = message
      this.confirmLabel = confirmLabel
      this.cancelLabel = cancelLabel
      this.confirmAction = confirmAction
      this.isOpen = true
    },
    close() {
      this.isOpen = false
      this.confirmAction = null
    },
    async confirm() {
      const action = this.confirmAction
      this.close()
      if (action) await action()
    }
  })

  Alpine.data('app', () => ({
    pages: [],
    dragging: false,
    async init() {
      Alpine.store('theme').init()
      await this.reloadPages()
    },
    async reloadPages() {
      try {
        const res = await fetch('/api/pages')
        if (res.status === 404) {
          this.pages = []
          return
        }
        if (!res.ok) throw new Error('manifest_read_failed')
        this.pages = await res.json()
      } catch (err) {
        Alpine.store('toasts').add('Could not load pages: ' + err.message, 'error')
      }
    },
    openDialog(files = null) {
      const dialog = document.getElementById('addDialog')
      dialog.showModal()
      if (files) {
        queueMicrotask(() => window.dispatchEvent(new CustomEvent('dialog:files', { detail: { files } })))
      }
    },
    handleDragEnter(event) {
      if (Array.from(event.dataTransfer.types).includes('Files')) {
        this.dragging = true
      }
    },
    handleDragLeave(event) {
      const leftViewport = event.clientX <= 0 || event.clientY <= 0 || event.clientX >= window.innerWidth || event.clientY >= window.innerHeight
      if (leftViewport) this.clearDragging()
    },
    clearDragging() {
      this.dragging = false
    },
    handleMainDrop(event) {
      this.clearDragging()
      const files = event.dataTransfer.files
      if (files.length > 0) this.openDialog(files)
    },
    absoluteUrl(page) {
      return new URL(page.url, window.location.origin).toString()
    },
    previewUrl(page) {
      const url = new URL(page.url, window.location.origin)
      url.searchParams.set('v', page.updatedAt || page.createdAt || page.slug)
      return url.pathname + url.search
    },
    openPage(page) {
      window.open(page.url, '_blank', 'noopener')
    },
    async copyUrl(page) {
      const url = this.absoluteUrl(page)
      await navigator.clipboard.writeText(url)
      Alpine.store('toasts').add('Copied ' + url, 'success')
    },
    async deletePage(page) {
      Alpine.store('modal').openConfirm('Delete page', 'Delete ' + page.slug + '?', async () => {
        try {
          const res = await fetch('/api/page/' + encodeURIComponent(page.slug), { method: 'DELETE' })
          const data = await res.json()
          if (!data.ok) throw new Error(data.error)
          this.pages = this.pages.filter((item) => item.slug !== page.slug)
          Alpine.store('toasts').add('Deleted ' + page.slug, 'success')
        } catch (err) {
          Alpine.store('modal').openNotice('Delete failed', err.message)
        }
      }, 'Delete')
    },
    async editPage(page) {
      try {
        const dialog = document.getElementById('addDialog')
        dialog.showModal()
        window.dispatchEvent(new CustomEvent('dialog:edit-loading', { detail: { slug: page.slug, name: page.name || page.slug } }))
        await new Promise((resolve) => requestAnimationFrame(resolve))
        const res = await fetch('/api/page/' + encodeURIComponent(page.slug))
        const data = await res.json()
        if (!data.ok) throw new Error(data.error)
        queueMicrotask(() => window.dispatchEvent(new CustomEvent('dialog:edit', { detail: data })))
      } catch (err) {
        window.dispatchEvent(new CustomEvent('dialog:edit-failed'))
        Alpine.store('modal').openNotice('Edit failed', err.message)
        Alpine.store('toasts').add('Edit failed: ' + err.message, 'error')
      }
    }
  }))

  Alpine.data('addDialog', () => ({
    mode: 'editor',
    htmlContent: '',
    files: [],
    pageName: '',
    slug: generateSlug(),
    editSlug: '',
    isLoadingEdit: false,
    slugTouched: false,
    canDeploy: false,
    deploying: false,
    extracting: false,
    renameTarget: null,
    fileChoiceState: null,
    init() {
      window.addEventListener('dialog:edit-loading', (event) => {
        this.reset()
        this.mode = 'editor'
        this.isLoadingEdit = true
        this.editSlug = event.detail.slug
        this.pageName = event.detail.name
        this.canDeploy = false
      })
      window.addEventListener('dialog:files', (event) => {
        this.setMode('files')
        this.validateFiles(event.detail.files)
      })
      window.addEventListener('dialog:edit', (event) => {
        const page = event.detail
        this.isLoadingEdit = false
        this.mode = 'editor'
        this.editSlug = page.slug
        this.slug = page.slug
        this.pageName = page.name || page.slug
        this.htmlContent = page.html || ''
        this.slugTouched = true
        this.canDeploy = this.htmlContent.trim().length > 0
      })
      window.addEventListener('dialog:edit-failed', () => {
        this.isLoadingEdit = false
      })
    },
    setMode(mode) {
      this.mode = mode
      this.renameTarget = null
      this.canDeploy = mode === 'editor' && this.htmlContent.trim().length > 0 && slugReady(this.slug)
    },
    chooseFiles() {
      this.fileChoiceState = {
        mode: this.mode,
        files: this.files,
        canDeploy: this.canDeploy,
        renameTarget: this.renameTarget
      }
      this.setMode('files')
      this.$refs.fileInput.click()
    },
    restoreFileChoiceState() {
      if (!this.fileChoiceState) return
      this.mode = this.fileChoiceState.mode
      this.files = this.fileChoiceState.files
      this.canDeploy = this.fileChoiceState.canDeploy
      this.renameTarget = this.fileChoiceState.renameTarget
      this.fileChoiceState = null
    },
    syncEditorState() {
      this.mode = 'editor'
      const title = titleFromHtml(this.htmlContent)
      if (title && !this.pageName) this.pageName = title
      this.slug = this.derivedSlug()
      this.canDeploy = this.htmlContent.trim().length > 0 && slugReady(this.slug)
    },
    syncPageName() {
      if (this.mode === 'editor') this.htmlContent = updateTitleInHtml(this.htmlContent, this.pageName)
      this.slug = this.derivedSlug()
      this.canDeploy = this.mode === 'editor' ? this.htmlContent.trim().length > 0 && slugReady(this.slug) : this.files.length > 0 && !this.renameTarget && slugReady(this.slug)
    },
    async validateFiles(fileList) {
      this.fileChoiceState = null
      const incoming = Array.from(fileList)
      this.mode = 'files'
      this.files = []
      this.renameTarget = null
      this.canDeploy = false

      if (incoming.length === 0) {
        this.abort('No files selected.')
        return
      }

      if (incoming.length === 1 && isZipFile(incoming[0])) {
        await this.extractZip(incoming[0])
        return
      }

      if (incoming.some((file) => hasUnsafePath(file.name))) {
        this.abort('File paths cannot contain empty segments or parent directories.')
        return
      }

      const htmlFiles = incoming.filter(isHtmlFile)
      if (htmlFiles.length === 0) {
        this.abort(incoming.length === 1 ? 'No HTML file found. Upload must contain at least one .html file.' : 'Upload must contain at least one HTML file.')
        return
      }

      const indexFile = incoming.find((file) => file.name.toLowerCase() === 'index.html')
      this.files = incoming
      await this.syncSlugFromFile(htmlFiles[0])
      if (indexFile) {
        this.canDeploy = slugReady(this.slug)
        return
      }

      this.renameTarget = htmlFiles[0]
    },
    async extractZip(zipFile) {
      if (!window.JSZip) {
        this.abort('ZIP support failed to load.')
        return
      }
      this.extracting = true
      try {
        const zip = await window.JSZip.loadAsync(zipFile)
        const extracted = []
        for (const [relativePath, entry] of Object.entries(zip.files)) {
          if (entry.dir) continue
          if (relativePath.startsWith('__MACOSX/')) continue
          const parts = relativePath.split('/').filter(Boolean)
          if (parts.some((part) => part.startsWith('.') || part === '..')) continue
          const filename = parts.join('/')
          const blob = await entry.async('blob')
          extracted.push(new File([blob], filename, { type: this.mimeFor(filename) }))
        }
        if (extracted.length === 0) {
          this.abort('ZIP is empty or contains only skipped files.')
          return
        }
        await this.validateFiles(extracted)
      } catch (err) {
        this.abort('Failed to extract ZIP: ' + err.message)
      } finally {
        this.extracting = false
      }
    },
    confirmRename() {
      if (!this.renameTarget) return
      const renamed = new File([this.renameTarget], 'index.html', { type: this.renameTarget.type || 'text/html' })
      this.files = this.files.map((file) => file === this.renameTarget ? renamed : file)
      this.renameTarget = null
      this.canDeploy = slugReady(this.slug)
    },
    async syncSlugFromFile(file) {
      try {
        const html = await file.text()
        const title = titleFromHtml(html)
        if (title && !this.pageName) this.pageName = title
        this.slug = this.derivedSlug(file.name.replace(/\.html?$/i, ''))
      } catch {
        this.slug = this.derivedSlug()
      }
    },
    derivedSlug(fallbackName = '') {
      return slugFromHtml(this.htmlContent) || normalizeSlug(this.pageName) || normalizeSlug(fallbackName) || generateSlug()
    },
    cancelRename() {
      this.abort('Upload cancelled.')
    },
    abort(message) {
      this.files = []
      this.renameTarget = null
      this.canDeploy = false
      Alpine.store('toasts').add(message, 'error')
    },
    close() {
      this.$root.close()
      this.reset()
    },
    reset() {
      this.mode = 'editor'
      this.htmlContent = ''
      this.files = []
      this.pageName = ''
      this.slug = generateSlug()
      this.editSlug = ''
      this.isLoadingEdit = false
      this.slugTouched = false
      this.canDeploy = false
      this.deploying = false
      this.extracting = false
      this.renameTarget = null
      this.fileChoiceState = null
      this.$refs.fileInput.value = ''
    },
    async deploy() {
      if (this.mode === 'editor') this.htmlContent = updateTitleInHtml(this.htmlContent, this.pageName)
      this.slug = this.derivedSlug()
      this.canDeploy = this.mode === 'editor' ? this.htmlContent.trim().length > 0 && slugPattern.test(this.slug) : this.files.length > 0 && !this.renameTarget && slugPattern.test(this.slug)
      if (!this.canDeploy) return
      this.deploying = true
      const fd = new FormData()
      fd.append('slug', this.slug)
      fd.append('name', this.pageName.trim() || this.slug)
      if (this.mode === 'editor') {
        fd.append('mode', 'editor')
        fd.append('htmlContent', this.htmlContent)
      } else {
        fd.append('mode', 'files')
        const files = await this.filesWithUpdatedTitle()
        files.forEach((file, index) => fd.append('file_' + index, file, file.name))
      }
      try {
        const res = await fetch(this.editSlug ? '/api/page/' + encodeURIComponent(this.editSlug) : '/upload', { method: this.editSlug ? 'PUT' : 'POST', body: fd })
        const data = await res.json()
        if (!data.ok) throw new Error(data.error)
        Alpine.store('toasts').add((this.editSlug ? 'Updated ' : 'Page deployed at ') + data.url, 'success')
        window.dispatchEvent(new CustomEvent('page:deployed'))
        this.close()
      } catch (err) {
        Alpine.store('toasts').add('Deploy failed: ' + err.message, 'error')
      } finally {
        this.deploying = false
      }
    },
    async filesWithUpdatedTitle() {
      if (!this.pageName.trim()) return this.files
      const indexFile = this.files.find((file) => file.name.toLowerCase() === 'index.html')
      if (!indexFile) return this.files
      const html = updateTitleInHtml(await indexFile.text(), this.pageName)
      const renamed = new File([html], indexFile.name, { type: indexFile.type || 'text/html' })
      return this.files.map((file) => file === indexFile ? renamed : file)
    },
    mimeFor(filename) {
      const ext = filename.split('.').pop().toLowerCase()
      return {
        html: 'text/html',
        htm: 'text/html',
        css: 'text/css',
        js: 'text/javascript',
        json: 'application/json',
        svg: 'image/svg+xml',
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        webp: 'image/webp',
        gif: 'image/gif',
        woff2: 'font/woff2',
        woff: 'font/woff'
      }[ext] || 'application/octet-stream'
    }
  }))
})
