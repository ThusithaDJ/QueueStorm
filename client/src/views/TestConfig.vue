<template>
  <main class="page">
    <div class="tc-header">
      <div>
        <h1 class="tc-title">Test Configuration</h1>
        <p class="tc-subtitle">Configure your message broker load test</p>
      </div>
      <div class="tc-actions">
        <button class="btn btn-secondary" @click="openSaveProfileModal">Save Profile</button>
        <button
          class="btn btn-primary"
          :disabled="running"
          @click="runTest"
        >
          <span v-if="running" class="run-spinner"></span>
          {{ running ? 'Starting…' : '▶ Run Test' }}
        </button>
      </div>
    </div>

    <!-- Run-error banner -->
    <Transition name="slide">
      <div v-if="runError" class="error-banner">
        <span>✖ {{ runError }}</span>
        <button class="error-dismiss" @click="runError = null">×</button>
      </div>
    </Transition>

    <!-- ── Section: Load Profile ─────────────────────────────────────────── -->
    <section class="tc-section" v-if="profiles.length > 0">
      <h2 class="section-title">Load Profile</h2>
      <div class="profile-load-row">
        <select class="form-select" v-model="selectedProfileId" style="max-width:300px">
          <option value="">— Select a saved profile —</option>
          <option v-for="p in profiles" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
        <button class="btn btn-secondary" :disabled="!selectedProfileId" @click="loadProfile">Load</button>
        <button class="btn btn-danger btn-sm" :disabled="!selectedProfileId" @click="deleteProfile">Delete</button>
      </div>
    </section>

    <!-- ── Section: Broker ───────────────────────────────────────────────── -->
    <section class="tc-section">
      <h2 class="section-title">Broker</h2>
      <div class="tc-grid-2">
        <div class="form-group">
          <label class="form-label">Message Broker</label>
          <div class="select-wrapper">
            <span class="broker-dot" :style="{ background: activeBrokerDef.color }"></span>
            <select class="form-select broker-select" v-model="broker" @change="onBrokerChange">
              <option v-for="b in BROKER_DEFS" :key="b.value" :value="b.value">
                {{ b.label }}{{ b.implemented ? '' : ' (coming soon)' }}
              </option>
            </select>
          </div>
          <span v-if="!activeBrokerDef.implemented" class="coming-soon-note">
            ⚠ Server-side implementation coming soon — fields shown for preview only
          </span>
        </div>
        <div class="form-group">
          <label class="form-label">Protocol</label>
          <select class="form-select" v-model="protocol">
            <option v-for="p in activeBrokerDef.protocols" :key="p" :value="p">{{ p }}</option>
          </select>
        </div>
      </div>
    </section>

    <!-- ── Section: Connection ───────────────────────────────────────────── -->
    <section class="tc-section">
      <h2 class="section-title">
        Connection
        <span v-if="environments.length" class="section-action">
          <select class="form-select inline-select" v-model="selectedEnvId" @change="loadEnv">
            <option value="">— Load saved environment —</option>
            <option v-for="e in environments.filter(e => e.brokerType === broker)" :key="e.id" :value="e.id">
              {{ e.name }}
            </option>
          </select>
        </span>
      </h2>
      <BrokerConnectionFields
        :brokerType="broker"
        v-model="connection"
        :testResult="testResult"
        :testing="testing"
        @test="testConnectionHandler"
      />
    </section>

    <!-- ── Section: Destination ─────────────────────────────────────────── -->
    <section class="tc-section">
      <h2 class="section-title">Destination</h2>
      <div class="tc-grid-2">
        <div class="form-group">
          <label class="form-label">Destination</label>
          <input
            class="form-input"
            type="text"
            v-model="destination"
            placeholder="queue/orders"
          />
        </div>
      </div>
    </section>

    <!-- ── Section: Load Profile ─────────────────────────────────────────── -->
    <section class="tc-section">
      <h2 class="section-title">Load Profile</h2>
      <div class="tc-row-4">
        <div class="form-group">
          <label class="form-label">Messages / sec</label>
          <input class="form-input" type="number" v-model.number="messagesPerSec" min="1" max="10000" />
        </div>
        <div class="form-group">
          <label class="form-label">Total Messages</label>
          <input class="form-input" type="number" v-model.number="totalMessages" min="1" />
          <span class="field-hint">0 = unlimited</span>
        </div>
        <div class="form-group">
          <label class="form-label">Ramp-up (sec)</label>
          <input class="form-input" type="number" v-model.number="rampUp" min="0" />
        </div>
        <div class="form-group">
          <label class="form-label">Order Mode</label>
          <select class="form-select" v-model="orderMode">
            <option v-for="o in orderModes" :key="o" :value="o">{{ o }}</option>
          </select>
        </div>
      </div>
    </section>

    <!-- ── Section: Data Source ─────────────────────────────────────────── -->
    <section class="tc-section">
      <h2 class="section-title">Data Source</h2>
      <div class="card data-source-card">
        <div class="data-source-btns">
          <label class="btn btn-secondary ds-btn" :class="{ uploading: csvUploading }">
            {{ csvUploading ? 'Uploading…' : '📁 Upload CSV' }}
            <input type="file" accept=".csv" style="display:none" @change="handleFileUpload" :disabled="csvUploading" />
          </label>
          <button
            class="btn btn-secondary ds-btn"
            :class="{ active: showCustom }"
            @click="showCustom = !showCustom"
          >
            ✏️ Custom Messages
          </button>
        </div>

        <!-- CSV upload error -->
        <div v-if="csvUploadError" class="status-line err-line" style="margin-top:10px;">
          ✖ {{ csvUploadError }}
        </div>

        <!-- CSV upload success + column mapping -->
        <div v-if="csvUpload" style="margin-top:14px;">
          <div class="status-line ok-line">
            ✔ {{ csvUpload.filename }} — {{ csvUpload.totalRows.toLocaleString() }} rows
          </div>
          <div class="csv-mapping" style="margin-top:12px;">
            <p class="csv-mapping-title">Column Mapping <span class="field-hint">(optional — leave blank to use CSV column names)</span></p>
            <div class="csv-mapping-grid">
              <template v-for="col in csvUpload.headers" :key="col">
                <span class="csv-col-name">{{ col }}</span>
                <span class="csv-arrow">→</span>
                <input
                  class="form-input csv-map-input"
                  type="text"
                  :placeholder="col"
                  v-model="columnMapping[col]"
                />
              </template>
            </div>
            <div style="margin-top:10px;">
              <p class="csv-mapping-title">Preview (first 3 rows)</p>
              <div class="csv-preview-table">
                <table>
                  <thead>
                    <tr>
                      <th v-for="h in csvUpload.headers" :key="h">{{ h }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(row, i) in csvUpload.preview.slice(0,3)" :key="i">
                      <td v-for="h in csvUpload.headers" :key="h">{{ row[h] }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <div v-if="showCustom" class="custom-msg-area">
          <textarea
            class="form-input"
            rows="4"
            v-model="customTemplate"
            placeholder='{"orderId":"{{uuid}}","amount":{{random(1,500)}}}'
            style="resize:vertical; font-family:var(--font-mono); font-size:12px; margin-top:10px;"
          ></textarea>
          <span class="field-hint">Custom template support — see Message Builder tab</span>
        </div>
      </div>
    </section>

    <!-- ── Save Profile Modal ────────────────────────────────────────────── -->
    <Teleport to="body">
      <div v-if="showSaveModal" class="modal-overlay" @click.self="showSaveModal = false">
        <div class="modal">
          <div class="modal-header">
            <h2>Save Profile</h2>
            <button class="modal-close" @click="showSaveModal = false">×</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label">Profile Name</label>
              <input class="form-input" v-model="saveProfileName" placeholder="e.g. Smoke Test — RabbitMQ QA" />
            </div>
            <div v-if="saveProfileError" class="error-banner" style="margin-top:8px">{{ saveProfileError }}</div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" @click="showSaveModal = false">Cancel</button>
            <button class="btn btn-primary" :disabled="savingProfile" @click="doSaveProfile">
              {{ savingProfile ? 'Saving…' : 'Save' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </main>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import BrokerConnectionFields from '../components/BrokerConnectionFields.vue'
import { BROKER_DEFS, BROKER_MAP, defaultConnectionFor } from '../config/brokers.js'
import * as api from '../api/client.js'

const router = useRouter()
const route  = useRoute()

// ── Broker / Protocol ─────────────────────────────────────────────────────────
const broker   = ref('rabbitmq')
const protocol = ref('AMQP')

const activeBrokerDef = computed(() => BROKER_MAP[broker.value] ?? BROKER_DEFS[0])

function onBrokerChange() {
  connection.value = defaultConnectionFor(broker.value)
  protocol.value   = activeBrokerDef.value.defaultProtocol || activeBrokerDef.value.protocols[0]
  testResult.value = null
  selectedEnvId.value = ''
}

// ── Connection config ─────────────────────────────────────────────────────────
const connection = ref(defaultConnectionFor('rabbitmq'))

// ── Connection test ───────────────────────────────────────────────────────────
const testResult = ref(null)
const testing    = ref(false)

async function testConnectionHandler() {
  testing.value    = true
  testResult.value = null
  try {
    testResult.value = await api.testConnection(broker.value, connection.value)
  } catch (err) {
    testResult.value = { success: false, message: err.message, latencyMs: 0 }
  } finally {
    testing.value = false
  }
}

// ── Environments ──────────────────────────────────────────────────────────────
const environments  = ref([])
const selectedEnvId = ref('')

async function fetchEnvironments() {
  try { environments.value = await api.listEnvironments() } catch {}
}

async function loadEnv() {
  if (!selectedEnvId.value) return
  try {
    const full = await api.getEnvironmentDecrypted(selectedEnvId.value)
    broker.value     = full.brokerType
    protocol.value   = full.protocol
    connection.value = full.connection
    testResult.value = null
  } catch (err) {
    alert('Could not load environment: ' + err.message)
  }
}

// If navigated here with ?envId=, auto-load
watch(() => route.query.envId, async (envId) => {
  if (envId) {
    selectedEnvId.value = envId
    await loadEnv()
  }
}, { immediate: true })

// ── Destination ───────────────────────────────────────────────────────────────
const destination = ref('queue/orders')

// ── Load profile parameters ───────────────────────────────────────────────────
const messagesPerSec = ref(50)
const totalMessages  = ref(1000)
const rampUp         = ref(10)
const orderModes     = ['Sequential', 'Random', 'Burst']
const orderMode      = ref('Sequential')

// ── Data source ───────────────────────────────────────────────────────────────
const showCustom      = ref(false)
const customTemplate  = ref('')
const csvUploading    = ref(false)
const csvUploadError  = ref(null)
const csvUpload       = ref(null)   // { uploadId, headers, preview, totalRows, filename }
const columnMapping   = ref({})

async function handleFileUpload(e) {
  const file = e.target.files[0]
  if (!file) return
  csvUploading.value   = true
  csvUploadError.value = null
  csvUpload.value      = null
  columnMapping.value  = {}
  try {
    const result = await api.uploadCsv(file)
    csvUpload.value = { ...result, filename: file.name }
    // Initialise column mapping with identity (same name)
    result.headers.forEach(h => { columnMapping.value[h] = '' })
  } catch (err) {
    csvUploadError.value = err.message
  } finally {
    csvUploading.value = false
    e.target.value = ''
  }
}

// ── Test profiles ─────────────────────────────────────────────────────────────
const profiles          = ref([])
const selectedProfileId = ref('')

async function fetchProfiles() {
  try { profiles.value = await api.listProfiles() } catch {}
}

async function loadProfile() {
  if (!selectedProfileId.value) return
  const p = profiles.value.find(p => p.id === selectedProfileId.value)
  if (!p) return
  const c = p.config
  if (c.broker)         broker.value         = c.broker
  if (c.protocol)       protocol.value       = c.protocol
  if (c.destination)    destination.value    = c.destination
  if (c.messagesPerSec) messagesPerSec.value = c.messagesPerSec
  if (c.totalMessages !== undefined) totalMessages.value = c.totalMessages
  if (c.rampUp !== undefined)        rampUp.value        = c.rampUp
  if (c.orderMode)      orderMode.value      = c.orderMode

  // Load linked environment if set
  if (p.environmentId) {
    selectedEnvId.value = p.environmentId
    await loadEnv()
  }
}

async function deleteProfile() {
  if (!selectedProfileId.value) return
  const p = profiles.value.find(p => p.id === selectedProfileId.value)
  if (!confirm(`Delete profile "${p?.name}"?`)) return
  try {
    await api.deleteProfile(selectedProfileId.value)
    selectedProfileId.value = ''
    await fetchProfiles()
  } catch (err) {
    alert(err.message)
  }
}

// ── Save Profile ──────────────────────────────────────────────────────────────
const showSaveModal    = ref(false)
const saveProfileName  = ref('')
const savingProfile    = ref(false)
const saveProfileError = ref(null)

function openSaveProfileModal() {
  saveProfileName.value  = ''
  saveProfileError.value = null
  showSaveModal.value    = true
}

async function doSaveProfile() {
  saveProfileError.value = null
  if (!saveProfileName.value.trim()) {
    saveProfileError.value = 'Profile name is required'
    return
  }
  savingProfile.value = true
  try {
    await api.createProfile({
      name:          saveProfileName.value.trim(),
      environmentId: selectedEnvId.value || null,
      config: {
        broker:         broker.value,
        protocol:       protocol.value,
        destination:    destination.value,
        messagesPerSec: messagesPerSec.value,
        totalMessages:  totalMessages.value,
        rampUp:         rampUp.value,
        orderMode:      orderMode.value,
      },
    })
    showSaveModal.value = false
    await fetchProfiles()
  } catch (err) {
    saveProfileError.value = err.message
  } finally {
    savingProfile.value = false
  }
}

// ── Run test ──────────────────────────────────────────────────────────────────
const running  = ref(false)
const runError = ref(null)

async function runTest() {
  runError.value = null
  running.value  = true
  try {
    const { jobId } = await api.startJob({
      broker:         broker.value,
      connection:     connection.value,
      destination:    destination.value,
      protocol:       protocol.value,
      messagesPerSec: messagesPerSec.value,
      totalMessages:  totalMessages.value,
      rampUp:         rampUp.value,
      orderMode:      orderMode.value,
      uploadId:       csvUpload.value?.uploadId || null,
      columnMapping:  csvUpload.value ? columnMapping.value : null,
    })
    router.push({ path: '/monitor', query: { jobId } })
  } catch (err) {
    runError.value = err.message
    running.value  = false
  }
}

// ── Boot ──────────────────────────────────────────────────────────────────────
onMounted(() => {
  fetchEnvironments()
  fetchProfiles()
})
</script>

<style scoped>
/* ── Header ─────────────────────────────────────────────────────────────── */
.tc-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 24px;
  gap: 16px;
}

.tc-title {
  font-family: var(--font-display);
  font-size: 24px;
  font-weight: 600;
  color: var(--text);
}

.tc-subtitle {
  color: var(--muted);
  font-size: 13px;
  margin-top: 4px;
}

.tc-actions {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-shrink: 0;
}

/* ── Error banner ────────────────────────────────────────────────────────── */
.error-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(255, 77, 109, 0.1);
  border: 1px solid rgba(255, 77, 109, 0.3);
  border-radius: 7px;
  padding: 10px 14px;
  margin-bottom: 16px;
  color: var(--accent3);
  font-size: 13px;
  font-family: var(--font-mono);
}

.error-dismiss {
  background: none;
  border: none;
  color: var(--accent3);
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
  padding: 0 4px;
}

/* ── Sections ────────────────────────────────────────────────────────────── */
.tc-section {
  margin-bottom: 20px;
}

.section-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 10px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: 12px;
}

.section-action {
  font-weight: 400;
  text-transform: none;
  letter-spacing: 0;
  font-size: 12px;
  margin-left: auto;
}

.inline-select {
  font-size: 12px;
  padding: 5px 28px 5px 10px;
  height: 30px;
}

/* ── Profile load row ────────────────────────────────────────────────────── */
.profile-load-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

/* ── Grids ───────────────────────────────────────────────────────────────── */
.tc-grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px 20px;
}

.tc-row-4 {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px 20px;
}

/* ── Broker select ───────────────────────────────────────────────────────── */
.select-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.select-wrapper .broker-dot {
  position: absolute;
  left: 10px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  z-index: 1;
  pointer-events: none;
}

.broker-select { padding-left: 28px; }

.coming-soon-note {
  font-size: 11px;
  color: #ffb900;
  font-family: var(--font-mono);
  margin-top: 2px;
}

/* ── Misc ────────────────────────────────────────────────────────────────── */
.field-hint {
  font-size: 11px;
  color: var(--muted);
  font-family: var(--font-mono);
  margin-top: 3px;
}

.data-source-card { padding: 16px 20px; }

.data-source-btns {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.ds-btn { cursor: pointer; }

.ds-btn.active {
  border-color: var(--accent2);
  color: var(--accent2);
}

/* ── Run spinner ─────────────────────────────────────────────────────────── */
.run-spinner {
  display: inline-block;
  width: 11px;
  height: 11px;
  border: 2px solid rgba(0,0,0,0.3);
  border-top-color: #09090f;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

/* ── Transition ──────────────────────────────────────────────────────────── */
.slide-enter-active, .slide-leave-active { transition: all 0.2s ease; }
.slide-enter-from,   .slide-leave-to     { opacity: 0; transform: translateY(-6px); }

/* ── btn-sm ──────────────────────────────────────────────────────────────── */
.btn-sm { padding: 5px 12px; font-size: 12px; }

/* ── CSV mapping ─────────────────────────────────────────────────────────── */
.status-line { font-size: 12px; font-family: var(--font-mono); }
.ok-line  { color: var(--green); }
.err-line { color: var(--accent3); }

.csv-mapping-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 8px;
}

.csv-mapping-grid {
  display: grid;
  grid-template-columns: auto 20px 1fr;
  gap: 6px 8px;
  align-items: center;
  max-width: 480px;
}

.csv-col-name {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 3px 8px;
  white-space: nowrap;
}

.csv-arrow { color: var(--muted); text-align: center; }

.csv-map-input { padding: 4px 8px; font-size: 12px; }

.csv-preview-table {
  overflow-x: auto;
  border-radius: 6px;
  border: 1px solid var(--border);
}

.csv-preview-table table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
  font-family: var(--font-mono);
}

.csv-preview-table th {
  background: var(--surface);
  color: var(--muted);
  padding: 5px 10px;
  text-align: left;
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
}

.csv-preview-table td {
  padding: 4px 10px;
  color: var(--text);
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.csv-preview-table tr:last-child td { border-bottom: none; }

/* ── Modal ───────────────────────────────────────────────────────────────── */
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
}

.modal-footer {
  padding: 12px 20px;
  border-top: 1px solid var(--border);
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>
