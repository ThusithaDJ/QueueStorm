<template>
  <main class="page">
    <div class="mb-header">
      <div>
        <h1 class="mb-title">Message Builder</h1>
        <p class="mb-subtitle">Create reusable message templates with dynamic tokens</p>
      </div>
      <button class="btn btn-primary" @click="openCreate">+ New Template</button>
    </div>

    <!-- ── Token reference ────────────────────────────────────────────────── -->
    <div class="card token-card">
      <p class="token-card-title">Available Tokens</p>
      <div class="token-grid">
        <span class="token-chip" v-for="t in TOKENS" :key="t.token" :title="t.desc">
          <code>{{ t.token }}</code>
          <span class="token-desc">{{ t.desc }}</span>
        </span>
      </div>
    </div>

    <!-- ── Template list ──────────────────────────────────────────────────── -->
    <div v-if="loading" class="loading-msg">Loading templates…</div>
    <div v-else-if="templates.length === 0" class="empty-state">
      <p>No templates yet. Create one to get started.</p>
    </div>
    <div v-else class="template-grid">
      <div v-for="t in templates" :key="t.id" class="card template-card">
        <div class="template-top">
          <div>
            <span class="template-name">{{ t.name }}</span>
            <span class="badge badge-secondary ml-8">{{ t.format.toUpperCase() }}</span>
          </div>
          <div class="template-actions">
            <button class="icon-btn" title="Edit" @click="openEdit(t)">✏</button>
            <button class="icon-btn icon-btn-danger" title="Delete" @click="doDelete(t)">✕</button>
          </div>
        </div>
        <pre class="template-preview">{{ t.template }}</pre>
        <button class="btn btn-secondary btn-sm" @click="previewTemplate(t)">▶ Preview</button>

        <!-- Preview output -->
        <div v-if="previewing === t.id" class="preview-output">
          <p class="preview-label">Rendered samples:</p>
          <pre v-for="(s, i) in previewSamples" :key="i" class="preview-sample">{{ s }}</pre>
        </div>
      </div>
    </div>

    <!-- ── Create / Edit Modal ────────────────────────────────────────────── -->
    <Teleport to="body">
      <div v-if="showModal" class="modal-overlay" @click.self="closeModal">
        <div class="modal modal-wide">
          <div class="modal-header">
            <h2>{{ editingId ? 'Edit Template' : 'New Template' }}</h2>
            <button class="modal-close" @click="closeModal">×</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label">Name</label>
              <input class="form-input" v-model="form.name" placeholder="Order event" />
            </div>
            <div class="form-group">
              <label class="form-label">Format</label>
              <select class="form-select" v-model="form.format">
                <option value="json">JSON</option>
                <option value="xml">XML</option>
                <option value="text">Plain Text</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Template</label>
              <textarea
                class="form-input template-textarea"
                v-model="form.template"
                rows="8"
                :placeholder="placeholders[form.format]"
              ></textarea>
            </div>

            <!-- Live preview -->
            <div v-if="livePreview" class="preview-output">
              <p class="preview-label">Live preview:</p>
              <pre class="preview-sample">{{ livePreview }}</pre>
            </div>
            <div v-if="modalError" class="error-banner" style="margin-top:8px">{{ modalError }}</div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" @click="renderLive" :disabled="!form.template">Preview</button>
            <button class="btn btn-secondary" @click="closeModal">Cancel</button>
            <button class="btn btn-primary" :disabled="saving" @click="saveTemplate">
              {{ saving ? 'Saving…' : 'Save' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </main>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import * as api from '../api/client.js'

const TOKENS = [
  { token: '{{uuid}}',                   desc: 'Random UUID v4' },
  { token: '{{timestamp}}',              desc: 'ISO-8601 timestamp' },
  { token: '{{sequence}}',               desc: 'Auto-incrementing integer' },
  { token: '{{random(1,100)}}',          desc: 'Random integer in range' },
  { token: '{{randomFloat(0,1,2)}}',     desc: 'Random float with decimals' },
  { token: '{{randomItem(a,b,c)}}',      desc: 'Pick a random item from list' },
]

const placeholders = {
  json: '{\n  "id": "{{uuid}}",\n  "amount": {{random(1,500)}},\n  "ts": "{{timestamp}}"\n}',
  xml:  '<order id="{{uuid}}" amount="{{random(1,500)}}" ts="{{timestamp}}"/>',
  text: 'MSG-{{sequence}} amount={{random(1,500)}} ts={{timestamp}}',
}

const templates = ref([])
const loading   = ref(true)

const showModal  = ref(false)
const editingId  = ref(null)
const form       = ref({ name: '', format: 'json', template: '' })
const saving     = ref(false)
const modalError = ref(null)
const livePreview = ref(null)

const previewing    = ref(null)
const previewSamples = ref([])

async function fetchTemplates() {
  loading.value = true
  try {
    templates.value = await api.listMessageTemplates()
  } catch (e) {
    console.warn(e)
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editingId.value  = null
  form.value       = { name: '', format: 'json', template: '' }
  livePreview.value = null
  modalError.value  = null
  showModal.value   = true
}

function openEdit(t) {
  editingId.value   = t.id
  form.value        = { name: t.name, format: t.format, template: t.template }
  livePreview.value = null
  modalError.value  = null
  showModal.value   = true
}

function closeModal() { showModal.value = false }

async function renderLive() {
  try {
    const { samples } = await api.previewMessageTemplate(form.value.template)
    livePreview.value = samples[0] ?? ''
  } catch (e) {
    livePreview.value = `Error: ${e.message}`
  }
}

async function saveTemplate() {
  modalError.value = null
  if (!form.value.name.trim())     { modalError.value = 'Name is required'; return }
  if (!form.value.template.trim()) { modalError.value = 'Template is required'; return }
  saving.value = true
  try {
    if (editingId.value) {
      await api.updateMessageTemplate(editingId.value, form.value)
    } else {
      await api.createMessageTemplate(form.value)
    }
    closeModal()
    await fetchTemplates()
  } catch (e) {
    modalError.value = e.message
  } finally {
    saving.value = false
  }
}

async function doDelete(t) {
  if (!confirm(`Delete template "${t.name}"?`)) return
  try {
    await api.deleteMessageTemplate(t.id)
    await fetchTemplates()
  } catch (e) {
    alert(e.message)
  }
}

async function previewTemplate(t) {
  if (previewing.value === t.id) { previewing.value = null; return }
  try {
    const { samples } = await api.previewMessageTemplate(t.template, 3)
    previewSamples.value = samples
    previewing.value = t.id
  } catch (e) {
    alert(e.message)
  }
}

onMounted(fetchTemplates)
</script>

<style scoped>
.mb-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 24px;
  gap: 16px;
}

.mb-title {
  font-family: var(--font-display);
  font-size: 24px;
  font-weight: 600;
  color: var(--text);
}

.mb-subtitle {
  color: var(--muted);
  font-size: 13px;
  margin-top: 4px;
}

/* Token card */
.token-card {
  margin-bottom: 22px;
  padding: 14px 18px;
}

.token-card-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 10px;
}

.token-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.token-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 12px;
}

.token-chip code {
  font-family: var(--font-mono);
  color: var(--accent);
}

.token-desc {
  color: var(--muted);
  font-size: 11px;
}

/* Template grid */
.template-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}

.template-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px 18px;
}

.template-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.template-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
}

.ml-8 { margin-left: 8px; }

.badge-secondary {
  background: rgba(255,255,255,0.07);
  color: var(--muted);
  border: 1px solid var(--border);
}

.template-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.icon-btn {
  background: none;
  border: 1px solid var(--border);
  border-radius: 5px;
  color: var(--muted);
  cursor: pointer;
  padding: 3px 7px;
  font-size: 12px;
  line-height: 1;
}
.icon-btn:hover { color: var(--text); background: var(--surface); }
.icon-btn-danger:hover { color: var(--accent3); }

.template-preview {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 8px 10px;
  overflow: auto;
  max-height: 100px;
  white-space: pre-wrap;
  word-break: break-all;
  margin: 0;
}

.preview-output {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 10px 12px;
}

.preview-label {
  font-size: 11px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 6px;
}

.preview-sample {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--accent);
  white-space: pre-wrap;
  word-break: break-all;
  margin: 4px 0 0;
}

.loading-msg, .empty-state {
  color: var(--muted);
  font-size: 14px;
  padding: 40px 0;
  text-align: center;
}

/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  padding: 20px;
}

.modal {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 12px;
  width: 100%;
  max-width: 440px;
  display: flex;
  flex-direction: column;
}

.modal-wide { max-width: 600px; }

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px 12px;
  border-bottom: 1px solid var(--border);
}

.modal-header h2 {
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
}

.modal-close {
  background: none;
  border: none;
  color: var(--muted);
  font-size: 22px;
  cursor: pointer;
  line-height: 1;
  padding: 0 4px;
}

.modal-body {
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  max-height: 70vh;
}

.modal-footer {
  padding: 12px 20px;
  border-top: 1px solid var(--border);
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.template-textarea {
  font-family: var(--font-mono);
  font-size: 12px;
  resize: vertical;
}

.error-banner {
  background: rgba(255, 77, 109, 0.1);
  border: 1px solid rgba(255, 77, 109, 0.3);
  border-radius: 7px;
  padding: 10px 14px;
  color: var(--accent3);
  font-size: 12px;
  font-family: var(--font-mono);
}

.btn-sm { padding: 5px 12px; font-size: 12px; }
</style>
