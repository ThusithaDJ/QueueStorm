<template>
  <main class="page">
    <div class="la-header">
      <div>
        <h1 class="la-title">Log File Analyser</h1>
        <p class="la-subtitle">Detect dropped messages and ordering violations in broker log files</p>
      </div>
    </div>

    <!-- ── Upload zone ────────────────────────────────────────────────────── -->
    <div
      class="card upload-zone"
      :class="{ dragging, 'has-result': !!result }"
      @dragover.prevent="dragging = true"
      @dragleave="dragging = false"
      @drop.prevent="onDrop"
    >
      <template v-if="!analysing && !result">
        <div class="upload-icon">📄</div>
        <p class="upload-hint">Drop a <code>.log</code> or <code>.txt</code> file here</p>
        <p class="upload-hint-sub">or</p>
        <label class="btn btn-primary upload-btn">
          Browse File
          <input type="file" accept=".log,.txt" style="display:none" @change="onFile" />
        </label>
        <p class="upload-hint-sub" style="margin-top:8px;">Max 500 MB</p>
      </template>

      <template v-else-if="analysing">
        <div class="upload-icon spinner-icon">⏳</div>
        <p class="upload-hint">Analysing {{ filename }}…</p>
      </template>

      <template v-else-if="result">
        <div class="result-header">
          <div>
            <span class="result-filename">{{ result.filename }}</span>
            <span class="result-size">({{ formatBytes(result.sizeBytes) }})</span>
          </div>
          <button class="btn btn-secondary btn-sm" @click="reset">✕ Clear</button>
        </div>
      </template>
    </div>

    <!-- ── Error ──────────────────────────────────────────────────────────── -->
    <div v-if="uploadError" class="error-banner">⚠ {{ uploadError }}</div>

    <!-- ── Summary cards ──────────────────────────────────────────────────── -->
    <div v-if="result" class="summary-row">
      <div class="stat-card">
        <span class="stat-label">Total Lines</span>
        <span class="stat-value">{{ result.totalLines.toLocaleString() }}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">Timestamped</span>
        <span class="stat-value">{{ result.timestampedLines.toLocaleString() }}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">Errors / Drops</span>
        <span class="stat-value red">{{ result.errorLines.toLocaleString() }}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">Order Violations</span>
        <span class="stat-value red">{{ result.orderingViolations.toLocaleString() }}</span>
      </div>
    </div>

    <!-- ── Results tabs ───────────────────────────────────────────────────── -->
    <div v-if="result" class="card results-card">
      <div class="tab-bar">
        <button
          v-for="tab in tabs" :key="tab.id"
          :class="['tab-btn', { active: activeTab === tab.id }]"
          @click="activeTab = tab.id"
        >
          {{ tab.label }}
          <span class="tab-count">{{ tab.count }}</span>
        </button>
      </div>

      <!-- Dropped messages tab -->
      <div v-if="activeTab === 'dropped'" class="table-scroll">
        <div v-if="sortedDropped.length === 0" class="tab-empty">No dropped/error messages detected.</div>
        <table v-else class="la-table">
          <thead>
            <tr>
              <th @click="sortBy('dropped','lineNo')">
                LINE <SortIcon field="lineNo" :active="dropSort" />
              </th>
              <th @click="sortBy('dropped','ts')">
                TIMESTAMP <SortIcon field="ts" :active="dropSort" />
              </th>
              <th>CONTENT</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in pagedDropped" :key="row.lineNo">
              <td class="mono">{{ row.lineNo }}</td>
              <td class="mono ts-cell">{{ row.ts || '—' }}</td>
              <td class="log-line">{{ row.line }}</td>
            </tr>
          </tbody>
        </table>
        <Pagination v-if="totalDroppedPages > 1" :page="dropPage" :total="totalDroppedPages" @change="dropPage = $event" />
      </div>

      <!-- Ordering violations tab -->
      <div v-if="activeTab === 'ordering'" class="table-scroll">
        <div v-if="sortedOrdering.length === 0" class="tab-empty">No ordering violations detected.</div>
        <table v-else class="la-table">
          <thead>
            <tr>
              <th @click="sortBy('ordering','lineNo')">
                LINE <SortIcon field="lineNo" :active="orderSort" />
              </th>
              <th @click="sortBy('ordering','ts')">
                TIMESTAMP <SortIcon field="ts" :active="orderSort" />
              </th>
              <th @click="sortBy('ordering','seq')">
                SEQ <SortIcon field="seq" :active="orderSort" />
              </th>
              <th>PREV SEQ</th>
              <th>CONTENT</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in pagedOrdering" :key="row.lineNo">
              <td class="mono">{{ row.lineNo }}</td>
              <td class="mono ts-cell">{{ row.ts || '—' }}</td>
              <td class="mono red">{{ row.seq }}</td>
              <td class="mono">{{ row.prevSeq }}</td>
              <td class="log-line">{{ row.line }}</td>
            </tr>
          </tbody>
        </table>
        <Pagination v-if="totalOrderingPages > 1" :page="orderPage" :total="totalOrderingPages" @change="orderPage = $event" />
      </div>
    </div>
  </main>
</template>

<script setup>
import { ref, computed } from 'vue'
import * as api from '../api/client.js'

// ── Sub-components ────────────────────────────────────────────────────────────

const SortIcon = {
  props: ['field', 'active'],
  template: `<span v-if="active.field === field" style="color:var(--accent)">{{ active.dir === 'asc' ? '▲' : '▼' }}</span>`,
}

const Pagination = {
  props: ['page', 'total'],
  emits: ['change'],
  template: `
    <div class="pagination">
      <button :disabled="page <= 1" @click="$emit('change', page-1)">‹</button>
      <span>{{ page }} / {{ total }}</span>
      <button :disabled="page >= total" @click="$emit('change', page+1)">›</button>
    </div>
  `,
}

const PAGE_SIZE = 50

// ── State ─────────────────────────────────────────────────────────────────────
const dragging    = ref(false)
const analysing   = ref(false)
const uploadError = ref(null)
const filename    = ref('')
const result      = ref(null)
const activeTab   = ref('dropped')

const dropSort   = ref({ field: 'lineNo', dir: 'asc' })
const orderSort  = ref({ field: 'lineNo', dir: 'asc' })
const dropPage   = ref(1)
const orderPage  = ref(1)

const tabs = computed(() => [
  { id: 'dropped',  label: 'Dropped / Errors',      count: result.value?.errorLines ?? 0 },
  { id: 'ordering', label: 'Ordering Violations',   count: result.value?.orderingViolations ?? 0 },
])

// ── Sorting & paging ──────────────────────────────────────────────────────────
function sortBy(which, field) {
  const s = which === 'dropped' ? dropSort : orderSort
  if (s.value.field === field) {
    s.value = { field, dir: s.value.dir === 'asc' ? 'desc' : 'asc' }
  } else {
    s.value = { field, dir: 'asc' }
  }
  if (which === 'dropped') dropPage.value = 1
  else orderPage.value = 1
}

function sortedRows(rows, sort) {
  if (!rows) return []
  return [...rows].sort((a, b) => {
    const av = a[sort.field] ?? ''
    const bv = b[sort.field] ?? ''
    const cmp = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv))
    return sort.dir === 'asc' ? cmp : -cmp
  })
}

const sortedDropped  = computed(() => sortedRows(result.value?.droppedMessages, dropSort.value))
const sortedOrdering = computed(() => sortedRows(result.value?.orderingErrors, orderSort.value))

const totalDroppedPages  = computed(() => Math.max(1, Math.ceil(sortedDropped.value.length / PAGE_SIZE)))
const totalOrderingPages = computed(() => Math.max(1, Math.ceil(sortedOrdering.value.length / PAGE_SIZE)))

const pagedDropped  = computed(() => sortedDropped.value.slice((dropPage.value - 1) * PAGE_SIZE, dropPage.value * PAGE_SIZE))
const pagedOrdering = computed(() => sortedOrdering.value.slice((orderPage.value - 1) * PAGE_SIZE, orderPage.value * PAGE_SIZE))

// ── Upload handlers ───────────────────────────────────────────────────────────
async function analyseFile(file) {
  uploadError.value = null
  analysing.value   = true
  filename.value    = file.name
  result.value      = null

  try {
    result.value = await api.analyseLogFile(file)
    activeTab.value = result.value.errorLines > 0 ? 'dropped' : 'ordering'
  } catch (err) {
    uploadError.value = err.message
  } finally {
    analysing.value = false
    dragging.value  = false
  }
}

function onFile(e) {
  const file = e.target.files[0]
  if (file) analyseFile(file)
  e.target.value = ''
}

function onDrop(e) {
  dragging.value = false
  const file = e.dataTransfer.files[0]
  if (file) analyseFile(file)
}

function reset() {
  result.value      = null
  uploadError.value = null
  filename.value    = ''
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
</script>

<style scoped>
.la-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 24px;
}

.la-title {
  font-family: var(--font-display);
  font-size: 24px;
  font-weight: 600;
  color: var(--text);
}

.la-subtitle {
  color: var(--muted);
  font-size: 13px;
  margin-top: 4px;
}

/* Upload zone */
.upload-zone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 24px;
  border: 2px dashed var(--border);
  margin-bottom: 20px;
  transition: border-color 0.2s, background 0.2s;
  text-align: center;
  min-height: 160px;
  cursor: default;
}

.upload-zone.dragging {
  border-color: var(--accent);
  background: rgba(0, 229, 255, 0.04);
}

.upload-zone.has-result {
  border-style: solid;
  align-items: flex-start;
  padding: 16px 20px;
  min-height: auto;
}

.upload-icon {
  font-size: 32px;
  margin-bottom: 12px;
}

.upload-hint {
  font-size: 14px;
  color: var(--text);
  margin-bottom: 6px;
}

.upload-hint-sub {
  font-size: 12px;
  color: var(--muted);
  margin-bottom: 8px;
}

.upload-btn { cursor: pointer; }

.result-header {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.result-filename {
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--text);
  font-weight: 600;
}

.result-size {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--muted);
  margin-left: 8px;
}

/* Summary row */
.summary-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
  margin-bottom: 18px;
}

/* Results card */
.results-card { padding: 0; overflow: hidden; }

.tab-bar {
  display: flex;
  border-bottom: 1px solid var(--border);
  padding: 0 18px;
}

.tab-btn {
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--muted);
  cursor: pointer;
  font-size: 13px;
  padding: 12px 16px 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: color 0.15s;
}

.tab-btn.active {
  color: var(--text);
  border-bottom-color: var(--accent);
}

.tab-count {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  font-size: 11px;
  padding: 1px 7px;
  font-family: var(--font-mono);
}

.table-scroll {
  overflow-x: auto;
  max-height: 480px;
  overflow-y: auto;
}

.la-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.la-table th {
  position: sticky;
  top: 0;
  background: var(--card);
  color: var(--muted);
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 8px 14px;
  text-align: left;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}

.la-table td {
  padding: 6px 14px;
  border-bottom: 1px solid var(--border);
  color: var(--text);
  vertical-align: top;
}

.la-table tr:last-child td { border-bottom: none; }

.mono { font-family: var(--font-mono); font-size: 11px; white-space: nowrap; }
.ts-cell { color: var(--muted); }
.red { color: var(--accent3); }
.log-line { font-family: var(--font-mono); font-size: 11px; word-break: break-all; max-width: 600px; }

.tab-empty {
  padding: 32px;
  text-align: center;
  color: var(--muted);
  font-size: 13px;
}

/* Pagination */
:deep(.pagination) {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 12px;
  font-size: 13px;
  color: var(--muted);
  border-top: 1px solid var(--border);
}

:deep(.pagination button) {
  background: none;
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: 5px;
  padding: 3px 10px;
  cursor: pointer;
  font-size: 14px;
}

:deep(.pagination button:disabled) { opacity: 0.3; cursor: not-allowed; }

/* Error banner */
.error-banner {
  background: rgba(255, 77, 109, 0.1);
  border: 1px solid rgba(255, 77, 109, 0.3);
  border-radius: 7px;
  padding: 10px 14px;
  margin-bottom: 16px;
  color: var(--accent3);
  font-size: 12px;
  font-family: var(--font-mono);
}

.btn-sm { padding: 5px 12px; font-size: 12px; }
</style>
