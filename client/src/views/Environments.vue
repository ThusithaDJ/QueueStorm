<template>
  <main class="page">
    <div class="page-header">
      <div>
        <h1 class="page-title">Environments</h1>
        <p class="page-subtitle">Saved broker connection profiles</p>
      </div>
      <button class="btn btn-primary" @click="openCreate">+ New Environment</button>
    </div>

    <!-- List -->
    <div v-if="loading" class="empty-state">Loading…</div>
    <div v-else-if="environments.length === 0" class="empty-state">
      <p>No environments saved yet.</p>
      <button class="btn btn-primary" style="margin-top:12px" @click="openCreate">Create one</button>
    </div>
    <div v-else class="env-grid">
      <div v-for="env in environments" :key="env.id" class="env-card card">
        <div class="env-card-header">
          <span class="broker-dot" :style="{ background: brokerColor(env.brokerType) }"></span>
          <span class="env-name">{{ env.name }}</span>
          <span class="env-broker-badge">{{ env.brokerType }}</span>
        </div>
        <div class="env-meta">
          <span>{{ env.host }}{{ env.port ? `:${env.port}` : '' }}</span>
          <span>{{ env.protocol }}</span>
        </div>
        <div class="env-actions">
          <button class="btn btn-secondary btn-sm" @click="openEdit(env)">Edit</button>
          <button class="btn btn-secondary btn-sm" @click="loadToConfig(env)">Use in Test</button>
          <button class="btn btn-danger btn-sm" @click="confirmDelete(env)">Delete</button>
        </div>
        <div class="env-ts">Created {{ formatDate(env.createdAt) }}</div>
      </div>
    </div>

    <!-- Create / Edit modal -->
    <Teleport to="body">
      <div v-if="showModal" class="modal-overlay" @click.self="closeModal">
        <div class="modal">
          <div class="modal-header">
            <h2>{{ editingId ? 'Edit Environment' : 'New Environment' }}</h2>
            <button class="modal-close" @click="closeModal">×</button>
          </div>

          <div class="modal-body">
            <div class="form-group">
              <label class="form-label">Profile Name</label>
              <input class="form-input" v-model="form.name" placeholder="e.g. Prod RabbitMQ" />
            </div>

            <div class="form-row-2">
              <div class="form-group">
                <label class="form-label">Message Broker</label>
                <div class="select-wrapper">
                  <span class="broker-dot" :style="{ background: brokerColor(form.brokerType) }"></span>
                  <select class="form-select broker-select" v-model="form.brokerType" @change="onBrokerChange">
                    <option v-for="b in BROKER_DEFS" :key="b.value" :value="b.value">{{ b.label }}</option>
                  </select>
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">Protocol</label>
                <select class="form-select" v-model="form.protocol">
                  <option v-for="p in activeBrokerDef.protocols" :key="p" :value="p">{{ p }}</option>
                </select>
              </div>
            </div>

            <!-- Dynamic connection fields -->
            <div class="conn-fields-grid">
              <div
                v-for="field in activeBrokerDef.connectionFields"
                :key="field.key"
                class="form-group"
                :style="{ gridColumn: `span ${field.span || 1}` }"
              >
                <label class="form-label">{{ field.label }}</label>
                <input
                  :type="field.type === 'password' ? (showPasswords[field.key] ? 'text' : 'password') : field.type"
                  class="form-input"
                  v-model="form.connection[field.key]"
                  :placeholder="editingId && field.type === 'password' ? '(unchanged)' : field.placeholder"
                />
                <button
                  v-if="field.type === 'password'"
                  type="button"
                  class="show-pass-btn"
                  @click="showPasswords[field.key] = !showPasswords[field.key]"
                >{{ showPasswords[field.key] ? 'Hide' : 'Show' }}</button>
              </div>
            </div>

            <!-- Test connection inline -->
            <div class="test-conn-row">
              <button class="btn btn-secondary" :disabled="testing" @click="testConn">
                {{ testing ? 'Testing…' : '⚡ Test Connection' }}
              </button>
              <span v-if="testResult" :class="['test-result', testResult.success ? 'ok' : 'fail']">
                {{ testResult.success ? '✔' : '✖' }} {{ testResult.message }}
                <span v-if="testResult.latencyMs">· {{ testResult.latencyMs }}ms</span>
              </span>
            </div>

            <div v-if="formError" class="error-banner" style="margin-top:10px">{{ formError }}</div>
          </div>

          <div class="modal-footer">
            <button class="btn btn-secondary" @click="closeModal">Cancel</button>
            <button class="btn btn-primary" :disabled="saving" @click="save">
              {{ saving ? 'Saving…' : (editingId ? 'Update' : 'Create') }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Delete confirm -->
    <Teleport to="body">
      <div v-if="deleteTarget" class="modal-overlay" @click.self="deleteTarget = null">
        <div class="modal modal-sm">
          <div class="modal-header">
            <h2>Delete Environment</h2>
            <button class="modal-close" @click="deleteTarget = null">×</button>
          </div>
          <div class="modal-body">
            <p>Delete <strong>{{ deleteTarget.name }}</strong>? This cannot be undone.</p>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" @click="deleteTarget = null">Cancel</button>
            <button class="btn btn-danger" :disabled="deleting" @click="doDelete">
              {{ deleting ? 'Deleting…' : 'Delete' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </main>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { BROKER_DEFS, BROKER_MAP, defaultConnectionFor } from '../config/brokers.js'
import * as api from '../api/client.js'

const router = useRouter()

// ── State ─────────────────────────────────────────────────────────────────────
const environments = ref([])
const loading      = ref(true)

// Modal
const showModal  = ref(false)
const editingId  = ref(null)
const saving     = ref(false)
const formError  = ref(null)
const form       = ref(blankForm())
const showPasswords = ref({})

// Connection test
const testing    = ref(false)
const testResult = ref(null)

// Delete
const deleteTarget = ref(null)
const deleting     = ref(false)

// ── Computed ──────────────────────────────────────────────────────────────────
const activeBrokerDef = computed(() => BROKER_MAP[form.value.brokerType] ?? BROKER_DEFS[0])

// ── Helpers ───────────────────────────────────────────────────────────────────
function blankForm() {
  return {
    name:       '',
    brokerType: 'rabbitmq',
    protocol:   'AMQP',
    connection: defaultConnectionFor('rabbitmq'),
  }
}

function brokerColor(type) {
  return BROKER_MAP[type]?.color ?? '#6b6b8a'
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

function onBrokerChange() {
  form.value.connection = defaultConnectionFor(form.value.brokerType)
  form.value.protocol   = activeBrokerDef.value.defaultProtocol || activeBrokerDef.value.protocols[0]
  testResult.value = null
}

// ── Load ──────────────────────────────────────────────────────────────────────
async function load() {
  try {
    environments.value = await api.listEnvironments()
  } catch (err) {
    console.error(err)
  } finally {
    loading.value = false
  }
}

onMounted(load)

// ── Create ────────────────────────────────────────────────────────────────────
function openCreate() {
  editingId.value  = null
  form.value       = blankForm()
  showPasswords.value = {}
  testResult.value = null
  formError.value  = null
  showModal.value  = true
}

// ── Edit ──────────────────────────────────────────────────────────────────────
async function openEdit(env) {
  editingId.value  = env.id
  formError.value  = null
  testResult.value = null
  showPasswords.value = {}

  // Load decrypted credentials to pre-fill the form
  try {
    const full = await api.getEnvironmentDecrypted(env.id)
    form.value = {
      name:       env.name,
      brokerType: env.brokerType,
      protocol:   env.protocol,
      connection: { ...full.connection },
    }
  } catch {
    form.value = {
      name:       env.name,
      brokerType: env.brokerType,
      protocol:   env.protocol,
      connection: defaultConnectionFor(env.brokerType),
    }
  }
  showModal.value = true
}

// ── Save ──────────────────────────────────────────────────────────────────────
async function save() {
  formError.value = null
  if (!form.value.name.trim()) { formError.value = 'Profile name is required'; return }

  saving.value = true
  try {
    const payload = {
      name:       form.value.name.trim(),
      brokerType: form.value.brokerType,
      protocol:   form.value.protocol,
      connection: form.value.connection,
    }
    if (editingId.value) {
      await api.updateEnvironment(editingId.value, payload)
    } else {
      await api.createEnvironment(payload)
    }
    closeModal()
    await load()
  } catch (err) {
    formError.value = err.message
  } finally {
    saving.value = false
  }
}

// ── Test connection ───────────────────────────────────────────────────────────
async function testConn() {
  testing.value    = true
  testResult.value = null
  try {
    testResult.value = await api.testConnection(form.value.brokerType, form.value.connection)
  } catch (err) {
    testResult.value = { success: false, message: err.message }
  } finally {
    testing.value = false
  }
}

// ── Delete ────────────────────────────────────────────────────────────────────
function confirmDelete(env) {
  deleteTarget.value = env
}

async function doDelete() {
  deleting.value = true
  try {
    await api.deleteEnvironment(deleteTarget.value.id)
    deleteTarget.value = null
    await load()
  } catch (err) {
    alert(err.message)
  } finally {
    deleting.value = false
  }
}

// ── Navigate to Test Config pre-loaded ───────────────────────────────────────
function loadToConfig(env) {
  router.push({ path: '/', query: { envId: env.id } })
}

function closeModal() {
  showModal.value = false
  editingId.value = null
}
</script>

<style scoped>
.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 28px;
}

.page-title {
  font-family: var(--font-display);
  font-size: 24px;
  font-weight: 600;
  color: var(--text);
}

.page-subtitle {
  color: var(--muted);
  font-size: 13px;
  margin-top: 4px;
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: var(--muted);
}

/* ── Grid ───────────────────────────────────────────────────────────────── */
.env-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}

.env-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.env-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.env-name {
  font-weight: 600;
  font-size: 14px;
  flex: 1;
}

.env-broker-badge {
  font-size: 11px;
  font-family: var(--font-mono);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 2px 6px;
  color: var(--muted);
}

.env-meta {
  display: flex;
  gap: 12px;
  font-size: 12px;
  font-family: var(--font-mono);
  color: var(--muted);
}

.env-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.env-ts {
  font-size: 11px;
  color: var(--muted);
  font-family: var(--font-mono);
  margin-top: 4px;
}

/* ── Buttons sm ─────────────────────────────────────────────────────────── */
.btn-sm {
  padding: 5px 12px;
  font-size: 12px;
}

/* ── Modal ──────────────────────────────────────────────────────────────── */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
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
  max-width: 560px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modal-sm {
  max-width: 380px;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px 14px;
  border-bottom: 1px solid var(--border);
}

.modal-header h2 {
  font-size: 16px;
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

.modal-close:hover { color: var(--text); }

.modal-body {
  padding: 18px 20px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.modal-footer {
  padding: 14px 20px;
  border-top: 1px solid var(--border);
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

/* ── Connection fields grid ─────────────────────────────────────────────── */
.conn-fields-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px 14px;
}

.form-row-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px 14px;
}

/* Broker select with dot */
.select-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.select-wrapper .broker-dot {
  position: absolute;
  left: 10px;
  z-index: 1;
  pointer-events: none;
}

.broker-select { padding-left: 26px; }

/* Show password button */
.show-pass-btn {
  background: none;
  border: none;
  color: var(--accent);
  font-size: 11px;
  cursor: pointer;
  padding: 2px 0;
  text-align: left;
  font-family: var(--font-mono);
}

/* Test connection */
.test-conn-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.test-result {
  font-size: 12px;
  font-family: var(--font-mono);
}
.test-result.ok   { color: var(--green); }
.test-result.fail { color: var(--accent3); }

.error-banner {
  background: rgba(255, 77, 109, 0.1);
  border: 1px solid rgba(255, 77, 109, 0.3);
  border-radius: 7px;
  padding: 8px 12px;
  color: var(--accent3);
  font-size: 12px;
  font-family: var(--font-mono);
}
</style>
