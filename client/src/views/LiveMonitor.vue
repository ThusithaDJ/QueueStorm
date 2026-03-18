<template>
  <main class="page">
    <!-- ── No active job guard ───────────────────────────────────────────── -->
    <div v-if="!jobId" class="no-job">
      <p>No active job found.</p>
      <RouterLink to="/" class="btn btn-primary" style="margin-top:12px;">← Back to Config</RouterLink>
    </div>

    <template v-else>
      <!-- ── Top bar ──────────────────────────────────────────────────────── -->
      <div class="lm-header">
        <div class="lm-title-row">
          <h1 class="lm-title">Live Monitor</h1>
          <span :class="['badge', statusBadgeClass]">
            <span v-if="isRunning" class="pulse-dot">●</span>
            <span v-else>■</span>
            {{ statusLabel }}
          </span>
          <!-- Progress bar -->
          <div v-if="jobData?.progress != null" class="progress-wrap">
            <div class="progress-bar" :style="{ width: jobData.progress + '%' }"></div>
            <span class="progress-label">{{ jobData.progress }}%</span>
          </div>
        </div>
        <div class="lm-header-right">
          <span v-if="jobData" class="meta-info">
            {{ jobData.brokerType?.toUpperCase() }} ·
            {{ jobData.config?.destination }} ·
            {{ jobData.config?.messagesPerSec }} msg/s ·
            elapsed {{ jobData.elapsed }}s
          </span>
          <button class="btn btn-danger" @click="stopTest" :disabled="stopping">
            {{ stopping ? 'Stopping…' : '■ Stop' }}
          </button>
        </div>
      </div>

      <!-- ── Error state ───────────────────────────────────────────────────── -->
      <div v-if="pollError" class="error-banner">
        ⚠ {{ pollError }}
      </div>

      <!-- ── Stats row ─────────────────────────────────────────────────────── -->
      <div class="stats-row">
        <div class="stat-card">
          <span class="stat-label">Sent</span>
          <span class="stat-value">{{ (jobData?.stats?.sent ?? 0).toLocaleString() }}</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">ACK'd</span>
          <span class="stat-value">{{ (jobData?.stats?.acked ?? 0).toLocaleString() }}</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">Dropped</span>
          <span class="stat-value red">{{ (jobData?.stats?.dropped ?? 0).toLocaleString() }}</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">Avg Latency</span>
          <span class="stat-value cyan">
            {{ jobData?.stats?.avgLatency ?? 0 }}<span class="stat-unit">ms</span>
          </span>
        </div>
      </div>

      <!-- ── Throughput chart ───────────────────────────────────────────────── -->
      <div class="card chart-card">
        <div class="chart-header">
          <span class="chart-title">Throughput</span>
          <span class="chart-subtitle">msg/s — last {{ MAX_CHART_PTS }} samples</span>
        </div>
        <div class="chart-container">
          <svg
            class="chart-svg"
            :viewBox="`0 0 ${SVG_W} ${SVG_H}`"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stop-color="var(--accent)" stop-opacity="0.25" />
                <stop offset="100%" stop-color="var(--accent)" stop-opacity="0" />
              </linearGradient>
            </defs>

            <!-- Grid lines -->
            <line v-for="y in [0,25,50,75,100]" :key="y"
              x1="0" :y1="yPos(y)" :x2="SVG_W" :y2="yPos(y)"
              stroke="var(--border)" stroke-width="1"
            />
            <text v-for="y in [0,25,50,75,100]" :key="`l${y}`"
              :x="4" :y="yPos(y) - 4"
              fill="var(--muted)" font-size="9" font-family="var(--font-mono)"
            >{{ y }}</text>

            <!-- Fill + line -->
            <polygon v-if="chartPoints.length >= 2"
              :points="fillPoints"
              fill="url(#chartGradient)"
            />
            <polyline v-if="chartPoints.length >= 2"
              :points="linePoints"
              fill="none" stroke="var(--accent)" stroke-width="2"
              stroke-linejoin="round" stroke-linecap="round"
            />
            <!-- Dots -->
            <circle v-for="(pt, i) in chartPoints" :key="i"
              :cx="pt.x" :cy="pt.y" r="3"
              fill="var(--accent)" opacity="0.7"
            />
          </svg>
        </div>
      </div>

      <!-- ── Message log ────────────────────────────────────────────────────── -->
      <div class="card log-card">
        <div class="log-header">
          <span class="chart-title">Message Log</span>
          <span class="chart-subtitle">{{ logRows.length }} entries</span>
        </div>
        <div class="table-scroll">
          <table class="log-table">
            <thead>
              <tr>
                <th>TIME</th>
                <th>MSG ID</th>
                <th>LATENCY</th>
                <th>STATUS</th>
                <th>NOTES</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in logRows" :key="row.msgId">
                <td>{{ row.time }}</td>
                <td>{{ row.msgId }}</td>
                <td>{{ row.latency }}ms</td>
                <td><span :class="['badge', `badge-${row.status}`]">{{ row.status }}</span></td>
                <td class="notes-cell">{{ row.notes }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </main>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import * as api from '../api/client.js'

const route  = useRoute()
const router = useRouter()

const POLL_MS       = 800
const SVG_W         = 600
const SVG_H         = 120
const MAX_CHART_PTS = 20

// ── Job identity ─────────────────────────────────────────────────────────────
const jobId   = computed(() => route.query.jobId || null)
const jobData = ref(null)

// ── UI state ─────────────────────────────────────────────────────────────────
const pollError = ref(null)
const stopping  = ref(false)

// ── Derived status ───────────────────────────────────────────────────────────
const isRunning = computed(() =>
  jobData.value?.status === 'running' || jobData.value?.status === 'pending'
)

const statusLabel = computed(() => {
  const s = jobData.value?.status
  if (!s) return 'CONNECTING'
  return s.toUpperCase()
})

const statusBadgeClass = computed(() => {
  switch (jobData.value?.status) {
    case 'running':   return 'badge badge-ok'
    case 'pending':   return 'badge badge-warn'
    case 'completed': return 'badge badge-ok'
    case 'stopped':   return 'badge badge-warn'
    case 'error':     return 'badge badge-err'
    default:          return 'badge badge-warn'
  }
})

// ── Chart ────────────────────────────────────────────────────────────────────
const chartHistory = ref(Array(MAX_CHART_PTS).fill(0))

const chartPoints = computed(() => {
  return chartHistory.value.map((v, i) => ({
    x: (i / (MAX_CHART_PTS - 1)) * SVG_W,
    y: yPos(Math.min(v, 100)),
  }))
})

const linePoints = computed(() =>
  chartPoints.value.map(p => `${p.x},${p.y}`).join(' ')
)

const fillPoints = computed(() => {
  if (chartPoints.value.length < 2) return ''
  const pts  = chartPoints.value.map(p => `${p.x},${p.y}`).join(' ')
  const last  = chartPoints.value[chartPoints.value.length - 1]
  const first = chartPoints.value[0]
  return `${pts} ${last.x},${SVG_H} ${first.x},${SVG_H}`
})

function yPos(value) {
  return SVG_H - (value / 100) * SVG_H
}

// ── Log rows (from server) ───────────────────────────────────────────────────
const logRows = computed(() => jobData.value?.logEntries ?? [])

// ── Polling ──────────────────────────────────────────────────────────────────
let pollIntervalId = null

async function poll() {
  if (!jobId.value) return
  try {
    const data = await api.getJob(jobId.value)
    jobData.value = data
    pollError.value = null

    // Sync chart from server throughput history
    if (data.throughputHistory && data.throughputHistory.length > 0) {
      const padded = [...data.throughputHistory]
      while (padded.length < MAX_CHART_PTS) padded.unshift(0)
      chartHistory.value = padded.slice(-MAX_CHART_PTS)
    }

    // Stop polling once the job reaches a terminal state
    if (['completed', 'stopped', 'error'].includes(data.status)) {
      clearPoll()
    }
  } catch (err) {
    pollError.value = err.message
    // If 404 (job gone), stop polling
    if (err.message.includes('not found') || err.message.includes('404')) {
      clearPoll()
    }
  }
}

function clearPoll() {
  if (pollIntervalId !== null) {
    clearInterval(pollIntervalId)
    pollIntervalId = null
  }
}

onMounted(() => {
  if (!jobId.value) return
  poll()
  pollIntervalId = setInterval(poll, POLL_MS)
})

onUnmounted(clearPoll)

// ── Stop ─────────────────────────────────────────────────────────────────────
async function stopTest() {
  stopping.value = true
  clearPoll()
  try {
    if (jobId.value) await api.stopJob(jobId.value)
  } catch (err) {
    console.warn('[LiveMonitor] stopJob error:', err.message)
  } finally {
    stopping.value = false
    router.push('/')
  }
}
</script>

<style scoped>
/* ── No-job guard ───────────────────────────────────────────────────────── */
.no-job {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 40vh;
  color: var(--muted);
  font-size: 15px;
}

/* ── Header ─────────────────────────────────────────────────────────────── */
.lm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  gap: 16px;
  flex-wrap: wrap;
}

.lm-title-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.lm-title {
  font-family: var(--font-display);
  font-size: 24px;
  font-weight: 600;
  color: var(--text);
}

.lm-header-right {
  display: flex;
  align-items: center;
  gap: 14px;
}

.meta-info {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--muted);
}

/* ── Progress bar ───────────────────────────────────────────────────────── */
.progress-wrap {
  position: relative;
  width: 120px;
  height: 6px;
  background: var(--border);
  border-radius: 3px;
  overflow: hidden;
}

.progress-bar {
  position: absolute;
  left: 0; top: 0; bottom: 0;
  background: var(--accent);
  border-radius: 3px;
  transition: width 0.4s ease;
}

.progress-label {
  position: absolute;
  right: -32px;
  top: -5px;
  font-size: 11px;
  font-family: var(--font-mono);
  color: var(--muted);
  white-space: nowrap;
}

/* ── Error banner ───────────────────────────────────────────────────────── */
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

/* ── Stats row ──────────────────────────────────────────────────────────── */
.stats-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
  margin-bottom: 18px;
}

.stat-unit {
  font-size: 14px;
  color: var(--muted);
  margin-left: 3px;
}

/* ── Chart ──────────────────────────────────────────────────────────────── */
.chart-card {
  margin-bottom: 18px;
}

.chart-header {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 12px;
}

.chart-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
}

.chart-subtitle {
  font-size: 12px;
  color: var(--muted);
  font-family: var(--font-mono);
}

.chart-container {
  width: 100%;
  overflow: hidden;
  border-radius: 6px;
  background: var(--surface);
  border: 1px solid var(--border);
}

.chart-svg {
  width: 100%;
  height: 130px;
  display: block;
}

/* ── Log table ──────────────────────────────────────────────────────────── */
.log-card {
  padding: 0;
  overflow: hidden;
}

.log-header {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 14px 18px 10px;
  border-bottom: 1px solid var(--border);
}

.table-scroll {
  overflow-y: auto;
  max-height: 340px;
}

.notes-cell {
  color: var(--muted);
}
</style>
