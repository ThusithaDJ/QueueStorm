<template>
  <main class="page">
    <div class="tc-header">
      <div>
        <h1 class="tc-title">Test Configuration</h1>
        <p class="tc-subtitle">Configure your message broker load test</p>
      </div>
      <div class="tc-actions">
        <button class="btn btn-secondary" @click="saveProfile">Save Profile</button>
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

    <!-- ── Section: Broker selection ──────────────────────────────────────── -->
    <section class="tc-section">
      <h2 class="section-title">Broker</h2>
      <div class="tc-grid-2">
        <!-- Message Broker -->
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
          <!-- Not-yet-implemented badge -->
          <span v-if="!activeBrokerDef.implemented" class="coming-soon-note">
            ⚠ Server-side implementation coming soon — connection fields shown for preview only
          </span>
        </div>

        <!-- Protocol -->
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
      <h2 class="section-title">Connection</h2>
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

    <!-- ── Section: Load Profile ────────────────────────────────────────── -->
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
          <label class="btn btn-secondary ds-btn">
            📁 Upload CSV
            <input type="file" accept=".csv" style="display:none" @change="handleFileUpload" />
          </label>
          <button
            class="btn btn-secondary ds-btn"
            :class="{ active: showCustom }"
            @click="showCustom = !showCustom"
          >
            ✏️ Custom Messages
          </button>
        </div>
        <div v-if="loadedFile" class="status-line" style="margin-top:10px;">
          ✔ Loaded: {{ loadedFile }}
        </div>
        <div v-if="showCustom" class="custom-msg-area">
          <textarea
            class="form-input"
            rows="4"
            v-model="customTemplate"
            placeholder='{"orderId":"{{uuid}}","amount":{{random(1,500)}}}'
            style="resize:vertical; font-family:var(--font-mono); font-size:12px; margin-top:10px;"
          ></textarea>
          <span class="field-hint">Custom template support — coming soon</span>
        </div>
      </div>
    </section>
  </main>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import BrokerConnectionFields from '../components/BrokerConnectionFields.vue'
import { BROKER_DEFS, BROKER_MAP, defaultConnectionFor } from '../config/brokers.js'
import * as api from '../api/client.js'

const router = useRouter()

// ── Broker / Protocol ────────────────────────────────────────────────────────
const broker   = ref('rabbitmq')
const protocol = ref('AMQP')

const activeBrokerDef = computed(() => BROKER_MAP[broker.value] ?? BROKER_DEFS[0])

function onBrokerChange() {
  // Reset connection to defaults for the newly selected broker
  connection.value = defaultConnectionFor(broker.value)
  // Reset protocol to the broker's default
  protocol.value = activeBrokerDef.value.defaultProtocol || activeBrokerDef.value.protocols[0]
  testResult.value = null
}

// ── Connection config ────────────────────────────────────────────────────────
const connection = ref(defaultConnectionFor('rabbitmq'))

// ── Connection test ──────────────────────────────────────────────────────────
const testResult = ref(null)   // { success, message, latencyMs } | null
const testing    = ref(false)

async function testConnectionHandler() {
  testing.value = true
  testResult.value = null
  try {
    const result = await api.testConnection(broker.value, connection.value)
    testResult.value = result
  } catch (err) {
    testResult.value = { success: false, message: err.message, latencyMs: 0 }
  } finally {
    testing.value = false
  }
}

// ── Destination ──────────────────────────────────────────────────────────────
const destination = ref('queue/orders')

// ── Load profile ─────────────────────────────────────────────────────────────
const messagesPerSec = ref(50)
const totalMessages  = ref(1000)
const rampUp         = ref(10)
const orderModes     = ['Sequential', 'Random', 'Burst']
const orderMode      = ref('Sequential')

// ── Data source ──────────────────────────────────────────────────────────────
const loadedFile     = ref('')
const showCustom     = ref(false)
const customTemplate = ref('')

function handleFileUpload(e) {
  const file = e.target.files[0]
  if (file) loadedFile.value = file.name
}

// ── Save profile (stub) ──────────────────────────────────────────────────────
function saveProfile() {
  const profile = {
    broker:         broker.value,
    connection:     { ...connection.value, password: '***' },
    destination:    destination.value,
    protocol:       protocol.value,
    messagesPerSec: messagesPerSec.value,
    totalMessages:  totalMessages.value,
    rampUp:         rampUp.value,
    orderMode:      orderMode.value,
  }
  console.log('[QueueStorm] Profile:', profile)
  alert('Profile saved to console (persistence coming soon)')
}

// ── Run test ─────────────────────────────────────────────────────────────────
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
    })
    router.push({ path: '/monitor', query: { jobId } })
  } catch (err) {
    runError.value = err.message
    running.value  = false
  }
}
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
  line-height: 1.2;
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

/* ── Error banner ───────────────────────────────────────────────────────── */
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

/* ── Sections ───────────────────────────────────────────────────────────── */
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
}

/* ── Grids ──────────────────────────────────────────────────────────────── */
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

/* ── Broker select ──────────────────────────────────────────────────────── */
.select-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.select-wrapper .broker-dot {
  position: absolute;
  left: 12px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  box-shadow: 0 0 6px currentColor;
  z-index: 1;
  pointer-events: none;
}

.broker-select {
  padding-left: 28px;
}

.coming-soon-note {
  font-size: 11px;
  color: #ffb900;
  font-family: var(--font-mono);
  margin-top: 2px;
}

/* ── Misc ───────────────────────────────────────────────────────────────── */
.field-hint {
  font-size: 11px;
  color: var(--muted);
  font-family: var(--font-mono);
  margin-top: 3px;
}

.data-source-card {
  padding: 16px 20px;
}

.data-source-btns {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.ds-btn {
  cursor: pointer;
}

.ds-btn.active {
  border-color: var(--accent2);
  color: var(--accent2);
}

/* ── Run spinner ────────────────────────────────────────────────────────── */
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

/* ── Transition ─────────────────────────────────────────────────────────── */
.slide-enter-active, .slide-leave-active { transition: all 0.2s ease; }
.slide-enter-from, .slide-leave-to       { opacity: 0; transform: translateY(-6px); }
</style>
