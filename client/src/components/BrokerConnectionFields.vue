<template>
  <div class="bcf-root">
    <!-- ── Connection fields grid ────────────────────────────────────────── -->
    <div class="bcf-grid">
      <div
        v-for="field in fields"
        :key="field.key"
        class="form-group"
        :style="{ gridColumn: `span ${field.span || 1}` }"
      >
        <label class="form-label">{{ field.label }}</label>
        <input
          :type="field.type === 'password' && showPassword ? 'text' : field.type"
          class="form-input"
          :placeholder="field.placeholder"
          :value="modelValue[field.key] ?? field.defaultVal"
          @input="update(field.key, $event.target.value)"
          autocomplete="off"
        />
      </div>

      <!-- Password show/hide toggle -->
      <div v-if="hasPasswordField" class="form-group bcf-toggle-cell">
        <label class="form-label">&nbsp;</label>
        <button type="button" class="btn btn-secondary bcf-toggle-btn" @click="showPassword = !showPassword">
          {{ showPassword ? '🙈 Hide' : '👁 Show' }}
        </button>
      </div>
    </div>

    <!-- ── SSL / TLS section ─────────────────────────────────────────────── -->
    <div v-if="sslSupported" class="ssl-section">
      <div class="ssl-toggle-row">
        <label class="ssl-toggle-label">
          <input type="checkbox" class="ssl-checkbox" :checked="sslEnabled" @change="toggleSsl" />
          <span class="ssl-toggle-text">🔒 Enable SSL / TLS</span>
        </label>
        <span v-if="certInfo" class="cert-badge">
          ✔ Certs uploaded
          <button class="cert-remove" @click="removeCerts" title="Remove certificates">✕</button>
        </span>
      </div>

      <Transition name="slide-down">
        <div v-if="sslEnabled" class="ssl-body">
          <!-- Verify server toggle -->
          <div class="ssl-verify-row">
            <label class="ssl-toggle-label">
              <input type="checkbox" class="ssl-checkbox"
                :checked="modelValue.sslVerifyServer !== false"
                @change="update('sslVerifyServer', $event.target.checked)"
              />
              <span class="ssl-toggle-text">Verify server certificate</span>
            </label>
            <span class="field-hint" style="margin-left:8px;">(disable for self-signed certs)</span>
          </div>

          <!-- Cert file pickers -->
          <div class="ssl-files-grid">
            <div v-for="f in SSL_FILES" :key="f.key" class="ssl-file-row">
              <span class="ssl-file-label">
                {{ f.label }}
                <span v-if="f.required" class="ssl-required">*</span>
              </span>
              <label class="ssl-file-pick" :class="{ picked: certFiles[f.key] }">
                <span>{{ certFiles[f.key]?.name || 'Choose file…' }}</span>
                <input type="file" :accept="f.accept" style="display:none"
                  @change="onCertFile(f.key, $event)" />
              </label>
              <span class="field-hint ssl-file-hint">{{ f.hint }}</span>
            </div>

            <!-- Passphrase -->
            <div class="ssl-file-row">
              <span class="ssl-file-label">Passphrase</span>
              <input
                class="form-input ssl-passphrase"
                type="password"
                placeholder="optional — for encrypted key / PFX"
                v-model="certPassphrase"
                autocomplete="off"
              />
              <span class="field-hint ssl-file-hint">Private key / PKCS#12 passphrase</span>
            </div>
          </div>

          <!-- Upload button -->
          <div class="ssl-upload-row">
            <button
              type="button"
              class="btn btn-secondary"
              :disabled="!hasCertFiles || uploadingCerts"
              @click="uploadCerts"
            >
              <span v-if="uploadingCerts" class="bcf-spinner"></span>
              {{ uploadingCerts ? 'Uploading…' : '⬆ Upload Certificates' }}
            </button>
            <span v-if="certUploadError" class="bcf-fail">✖ {{ certUploadError }}</span>
            <span v-if="certInfo" class="bcf-ok">
              ✔ Uploaded: {{ certInfo.uploaded.join(', ') }}
            </span>
          </div>
        </div>
      </Transition>
    </div>

    <!-- ── Test connection row ───────────────────────────────────────────── -->
    <div class="bcf-action-row">
      <button
        type="button"
        class="btn btn-secondary"
        :disabled="testing"
        @click="$emit('test')"
      >
        <span v-if="testing" class="bcf-spinner"></span>
        {{ testing ? 'Testing…' : '⚡ Test Connection' }}
      </button>

      <Transition name="fade">
        <span v-if="testResult" :class="['bcf-result', testResult.success ? 'bcf-ok' : 'bcf-fail']">
          <span v-if="testResult.success">
            ✔ {{ testResult.message }}
            <span class="bcf-latency">{{ testResult.latencyMs }}ms</span>
          </span>
          <span v-else>✖ {{ testResult.message }}</span>
        </span>
      </Transition>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { BROKER_MAP } from '../config/brokers.js'
import * as api from '../api/client.js'

const SSL_FILES = [
  { key: 'ca',   label: 'CA Certificate',   hint: '.pem / .crt — server trust anchor', accept: '.pem,.crt,.cer', required: false },
  { key: 'cert', label: 'Client Certificate', hint: '.pem / .crt — mutual TLS',         accept: '.pem,.crt,.cer', required: false },
  { key: 'key',  label: 'Private Key',       hint: '.pem / .key — client private key',  accept: '.pem,.key',      required: false },
  { key: 'pfx',  label: 'PKCS#12 Bundle',    hint: '.p12 / .pfx — replaces cert + key', accept: '.p12,.pfx',      required: false },
]

const props = defineProps({
  brokerType:  { type: String, required: true },
  modelValue:  { type: Object, required: true },
  testResult:  { type: Object, default: null },
  testing:     { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'test'])

// ── Connection fields ─────────────────────────────────────────────────────────
const showPassword = ref(false)

const fields = computed(() => BROKER_MAP[props.brokerType]?.connectionFields ?? [])
const hasPasswordField = computed(() => fields.value.some(f => f.type === 'password'))
const sslSupported = computed(() => !!BROKER_MAP[props.brokerType]?.sslSupported)
const sslEnabled   = computed(() => !!props.modelValue.ssl)

function update(key, rawValue) {
  const field = fields.value.find(f => f.key === key)
  const value = field?.type === 'number' ? (rawValue === '' ? '' : Number(rawValue)) : rawValue
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}

function toggleSsl(e) {
  const enabled = e.target.checked
  emit('update:modelValue', {
    ...props.modelValue,
    ssl: enabled,
    sslVerifyServer: enabled ? props.modelValue.sslVerifyServer ?? true : undefined,
    sslCertId: enabled ? props.modelValue.sslCertId : undefined,
  })
  if (!enabled) {
    certFiles.value = {}
    certInfo.value  = null
  }
}

// ── SSL cert upload ───────────────────────────────────────────────────────────
const certFiles       = ref({})     // { ca?: File, cert?: File, key?: File, pfx?: File }
const certPassphrase  = ref('')
const certInfo        = ref(null)   // { certId, uploaded, filenames } — after upload
const uploadingCerts  = ref(false)
const certUploadError = ref(null)

const hasCertFiles = computed(() => Object.values(certFiles.value).some(Boolean))

function onCertFile(key, e) {
  const file = e.target.files[0]
  certFiles.value = { ...certFiles.value, [key]: file || undefined }
  certInfo.value  = null  // clear previous upload on file change
  e.target.value  = ''
}

async function uploadCerts() {
  certUploadError.value = null
  uploadingCerts.value  = true
  try {
    const payload = { ...certFiles.value }
    if (certPassphrase.value) payload.passphrase = certPassphrase.value

    const result = await api.uploadSslCerts(payload)
    certInfo.value = result

    // Store certId in the connection model so it travels to the job
    emit('update:modelValue', { ...props.modelValue, sslCertId: result.certId })
  } catch (err) {
    certUploadError.value = err.message
  } finally {
    uploadingCerts.value = false
  }
}

async function removeCerts() {
  if (certInfo.value?.certId) {
    try { await api.deleteSslCert(certInfo.value.certId) } catch {}
  }
  certInfo.value  = null
  certFiles.value = {}
  certUploadError.value = null
  emit('update:modelValue', { ...props.modelValue, sslCertId: undefined })
}
</script>

<style scoped>
.bcf-root {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.bcf-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px 16px;
  align-items: end;
}

.bcf-toggle-cell { grid-column: span 1; }

.bcf-toggle-btn {
  width: 100%;
  font-size: 12px;
  padding: 9px 10px;
}

/* ── SSL section ────────────────────────────────────────────────────────── */
.ssl-section {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}

.ssl-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  gap: 12px;
}

.ssl-toggle-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
}

.ssl-checkbox {
  width: 15px;
  height: 15px;
  accent-color: var(--accent);
  cursor: pointer;
}

.ssl-toggle-text {
  font-size: 13px;
  color: var(--text);
  font-weight: 500;
}

.cert-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--green);
  font-family: var(--font-mono);
}

.cert-remove {
  background: none;
  border: none;
  color: var(--muted);
  cursor: pointer;
  font-size: 13px;
  padding: 0 2px;
  line-height: 1;
}
.cert-remove:hover { color: var(--accent3); }

.ssl-body {
  border-top: 1px solid var(--border);
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ssl-verify-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
}

.ssl-files-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ssl-file-row {
  display: grid;
  grid-template-columns: 160px 1fr auto;
  align-items: center;
  gap: 10px;
}

.ssl-file-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text);
  white-space: nowrap;
}

.ssl-required { color: var(--accent3); margin-left: 2px; }

.ssl-file-pick {
  display: flex;
  align-items: center;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 6px 10px;
  cursor: pointer;
  font-size: 12px;
  font-family: var(--font-mono);
  color: var(--muted);
  transition: border-color 0.15s;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  min-width: 0;
}

.ssl-file-pick.picked {
  border-color: var(--accent);
  color: var(--text);
}

.ssl-file-pick:hover { border-color: var(--accent); }

.ssl-file-hint {
  font-size: 11px;
  color: var(--muted);
  white-space: nowrap;
}

.ssl-passphrase {
  font-size: 12px;
  padding: 7px 10px;
}

.ssl-upload-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

/* ── Action row ─────────────────────────────────────────────────────────── */
.bcf-action-row {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}

.bcf-result {
  font-family: var(--font-mono);
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.bcf-ok   { color: var(--green); }
.bcf-fail { color: var(--accent3); }

.bcf-latency {
  color: var(--muted);
  margin-left: 4px;
}

.field-hint {
  font-size: 11px;
  color: var(--muted);
  font-family: var(--font-mono);
}

/* ── Spinner ─────────────────────────────────────────────────────────────── */
.bcf-spinner {
  display: inline-block;
  width: 10px;
  height: 10px;
  border: 2px solid var(--muted);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

/* ── Transitions ─────────────────────────────────────────────────────────── */
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s; }
.fade-enter-from, .fade-leave-to       { opacity: 0; }

.slide-down-enter-active, .slide-down-leave-active { transition: all 0.2s ease; }
.slide-down-enter-from, .slide-down-leave-to       { opacity: 0; transform: translateY(-8px); }
</style>
