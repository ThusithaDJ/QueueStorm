# ⚡ QueueStorm

A **real-time message broker load-testing tool** built with Vue 3 + Node.js. Configure connection details, fire messages at any rate, and watch live throughput charts, per-message latency, and ACK stats update every 800 ms in your browser.

> **Status:** RabbitMQ is fully implemented end-to-end. Apache ActiveMQ, Apache Kafka, IBM MQ, and Azure Service Bus are scaffolded and ready for implementation.

---

## Screenshots

### Test Configuration — Dark Mode
![Test Config Dark](docs/screenshots/test-config-dark.png)

### Test Configuration — Light Mode
![Test Config Light](docs/screenshots/test-config-light.png)

### Live Monitor — Dark Mode
![Live Monitor Dark](docs/screenshots/live-monitor-dark.png)

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Configuration Guide](#configuration-guide)
- [API Reference](#api-reference)
- [Architecture](#architecture)
- [Adding a New Broker](#adding-a-new-broker)
- [Implemented ✅ vs Planned 🔜](#implemented-vs-planned)

---

## Features

### ✅ Implemented

#### UI & Design System
- **Dark / Light theme toggle** — persisted to `localStorage`, smooth 200 ms CSS transitions, sun/moon icon in the nav bar
- **Design tokens** — 10 CSS custom properties drive every colour in both themes; no hardcoded values in components
- **Typography** — Fraunces (display headings), DM Sans (body), DM Mono (monospace data) via Google Fonts
- **Responsive layout** — sticky nav, max-width page container, CSS Grid form sections

#### Test Configuration (`/`)
- **Broker selector** — colour-coded status dot per broker (orange = RabbitMQ, amber = ActiveMQ, cyan = Kafka, purple = IBM MQ, blue = Azure SB); "coming soon" label on unimplemented brokers
- **Dynamic connection fields** — each broker type renders its own set of fields from a single config file (`client/src/config/brokers.js`); no duplicated templates
- **Password visibility toggle** — show/hide password field inline
- **⚡ Test Connection button** — makes a live round-trip to the server, reports latency and a human-readable success/error message without starting a job
- **Destination, Protocol, Load Profile** — Messages/sec, Total Messages (0 = unlimited), Ramp-up seconds, Order Mode (Sequential / Random / Burst)
- **Data Source** — CSV upload (filename shown on load), Custom Message textarea with template placeholder
- **Save Profile** — serialises current config to console (persistence planned)
- **▶ Run Test** — POSTs to `/api/jobs/start`, navigates to `/monitor?jobId=<id>` on success; shows inline error banner on failure; spinner state while starting

#### Live Monitor (`/monitor`)
- **Job guard** — shows "No active job found" with back-link if navigated to without a `?jobId=` query param
- **Real-time polling** — `setInterval` at 800 ms calls `GET /api/jobs/:id`; stops automatically on terminal job states (`completed`, `stopped`, `error`)
- **Status badge** — RUNNING (pulsing green), PENDING (amber), COMPLETED (green), STOPPED (amber), ERROR (red)
- **Progress bar** — animated fill synced to `jobData.progress` %
- **Meta info strip** — broker type · destination · msg/s · elapsed seconds
- **4 stat cards** — Sent, ACK'd, Dropped (red), Avg Latency (cyan) — values come from the server
- **SVG throughput chart** — live polyline with gradient fill, last 20 data points, Y-axis grid lines at 0 / 25 / 50 / 75 / 100 msg/s
- **Message log table** — TIME, MSG ID, LATENCY, STATUS, NOTES; max 50 rows; colour-coded ok / warn / err badges; scrollable
- **■ Stop button** — calls `POST /api/jobs/:id/stop`, clears interval, navigates back to `/`; disabled with "Stopping…" while in-flight
- **`onUnmounted` cleanup** — all `setInterval` timers are guaranteed to be cleared

#### Backend — Node.js / Express
- **`BaseBroker` abstract class** — defines the 5-method contract every broker must implement: `testConnection`, `connect`, `prepareDestination`, `publish`, `disconnect`
- **Broker registry** — single `registry.js` maps string keys to classes; adding a broker is one line
- **RabbitMQ (`amqplib`)** — full AMQP 0-9-1 implementation:
  - `testConnection` — opens + cleanly closes a connection with a 5 s timeout; returns `{ success, message, latencyMs }`
  - Human-readable error messages for `ECONNREFUSED`, `ENOTFOUND`, `ETIMEDOUT`, `ACCESS_REFUSED`, `AggregateError` (amqplib-specific)
  - `connect` — persistent connection + channel with `prefetch(256)`
  - `prepareDestination` — asserts a durable queue (once per job, cached in a Set)
  - `publish` — `sendToQueue` with `persistent: false`, sub-millisecond `process.hrtime.bigint()` latency measurement
  - `disconnect` — swallows errors, nulls refs, clears the queue set
- **JobManager** — in-memory `Map` of jobs; `createJob` generates a UUID, instantiates the broker, awaits connection, then starts the runner; passwords are redacted (`***`) before any job data is sent to the client
- **TestRunner** — tick-based publisher: honours `rampUp` (linear rate increase over N seconds), `totalMessages` (0 = unlimited), `messagesPerSec`, aggregates `sent / acked / dropped / avgLatency`, maintains a 20-point `throughputHistory` array, and appends up to 50 log entries with `ok / warn / err` status
- **MessageGenerator** — generates JSON message bodies with a UUID `messageId` and ISO timestamp; extensible for CSV and custom templates
- **REST API** — 5 endpoints (see [API Reference](#api-reference))
- **Vite proxy** — `/api` proxied to `:3001` in dev so the frontend has no CORS concerns
- **`concurrently`** — single `npm run dev` from the repo root starts both servers

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend framework | Vue 3 (Composition API, `<script setup>`) |
| Build tool | Vite 5 |
| Routing | Vue Router 4 |
| Styling | Plain CSS — custom properties, CSS Grid, no UI library |
| Fonts | DM Sans · DM Mono · Fraunces (Google Fonts) |
| Backend | Node.js + Express 4 |
| RabbitMQ client | amqplib 0.10 |
| Job IDs | Node.js built-in `crypto.randomUUID()` |
| Dev runner | concurrently |

---

## Project Structure

```
QueueStorm/
│
├── package.json                  # Root — concurrently dev script
│
├── client/                       # Vue 3 frontend
│   ├── index.html                # Google Fonts, #app mount point
│   ├── vite.config.js            # /api proxy → :3001
│   ├── package.json
│   └── src/
│       ├── main.js               # createApp + router + style
│       ├── style.css             # Global design system (CSS vars, dark + light)
│       ├── App.vue               # Nav (logo, links, theme toggle)
│       │
│       ├── composables/
│       │   └── useTheme.js       # Singleton theme ref + localStorage persistence
│       │
│       ├── config/
│       │   └── brokers.js        # BROKER_DEFS — single source of truth for all
│       │                         #   broker UI: label, colour, protocols, fields
│       │
│       ├── api/
│       │   └── client.js         # Typed fetch wrappers for all API endpoints
│       │
│       ├── components/
│       │   └── BrokerConnectionFields.vue  # Dynamic field renderer (driven by brokers.js)
│       │
│       └── views/
│           ├── TestConfig.vue    # Route /
│           └── LiveMonitor.vue   # Route /monitor
│
└── server/                       # Express backend
    ├── index.js                  # App entry — mounts routers, listens :3001
    ├── package.json
    │
    ├── brokers/
    │   ├── BaseBroker.js         # Abstract class — 5-method contract
    │   ├── registry.js           # { brokerKey → BrokerClass } map
    │   └── rabbitmq/
    │       └── RabbitMQBroker.js # Full AMQP 0-9-1 implementation
    │
    ├── jobs/
    │   ├── JobManager.js         # createJob / getJob / stopJob / listJobs
    │   ├── TestRunner.js         # Tick loop, ramp-up, stats, log ring-buffer
    │   └── MessageGenerator.js   # JSON body factory (UUID + timestamp)
    │
    └── routes/
        ├── brokers.js            # POST /api/brokers/:type/test-connection
        └── jobs.js               # POST /start · GET /:id · POST /:id/stop · GET /
```

---

## Getting Started

### Prerequisites

- Node.js ≥ 18
- A running RabbitMQ instance (Docker quickstart below)

### RabbitMQ via Docker

```bash
docker run -d \
  --name rabbitmq \
  -p 5672:5672 \
  -p 15672:15672 \
  rabbitmq:3-management
```

Management UI → http://localhost:15672 (guest / guest)

### Install & Run

```bash
# 1 — Clone
git clone https://github.com/your-org/queuestorm.git
cd queuestorm

# 2 — Install root deps (concurrently)
npm install

# 3 — Install client deps
npm install --prefix client

# 4 — Install server deps
npm install --prefix server

# 5 — Start both servers
npm run dev
```

| Service | URL |
|---|---|
| Frontend (Vite) | http://localhost:5173 |
| Backend (Express) | http://localhost:3001 |
| Health check | http://localhost:3001/api/health |

---

## Configuration Guide

### RabbitMQ Connection Fields

| Field | Default | Notes |
|---|---|---|
| Host | `localhost` | Hostname or IP of the RabbitMQ broker |
| Port | `5672` | Default AMQP port; TLS typically uses 5671 |
| Username | `guest` | RabbitMQ user |
| Password | _(empty)_ | Masked; use Show toggle to reveal |
| Virtual Host | `/` | The vhost to publish into |

### Load Profile

| Field | Default | Notes |
|---|---|---|
| Messages / sec | 50 | Target publish rate; actual rate may be lower if the broker is slow |
| Total Messages | 1000 | Set to `0` for an unlimited / continuous run |
| Ramp-up (sec) | 10 | Linearly increases rate from 0 → target over this many seconds |
| Order Mode | Sequential | Sequential = in-order IDs · Random = shuffled · Burst = future |

### Destination Format

QueueStorm uses the convention `queue/<name>` or `topic/<name>`. The RabbitMQ broker strips the prefix and uses the remainder as the AMQP queue name.

Examples: `queue/orders`, `queue/events`, `topic/notifications`

---

## API Reference

### `GET /api/health`
```json
{ "status": "ok", "ts": "2026-03-19T10:00:00.000Z" }
```

---

### `POST /api/brokers/:type/test-connection`

Test a connection without starting a job.

**URL param:** `type` — e.g. `rabbitmq`

**Body (RabbitMQ):**
```json
{
  "host": "localhost",
  "port": 5672,
  "username": "guest",
  "password": "guest",
  "vhost": "/"
}
```

**Response 200:**
```json
{
  "success": true,
  "message": "Connected to RabbitMQ successfully",
  "latencyMs": 12
}
```

**Response 200 (failed connection — HTTP 200, `success: false`):**
```json
{
  "success": false,
  "message": "Connection refused localhost:5672 — is RabbitMQ running?",
  "latencyMs": 5001
}
```

---

### `POST /api/jobs/start`

Start a background load-test job.

**Body:**
```json
{
  "broker": "rabbitmq",
  "connection": {
    "host": "localhost",
    "port": 5672,
    "username": "guest",
    "password": "guest",
    "vhost": "/"
  },
  "destination": "queue/orders",
  "protocol": "AMQP",
  "messagesPerSec": 50,
  "totalMessages": 1000,
  "rampUp": 10,
  "orderMode": "Sequential"
}
```

**Response 201:**
```json
{ "jobId": "b3f2a1d0-..." }
```

**Response 400** — validation error or unknown broker type
**Response 500** — broker connection failed at job start

---

### `GET /api/jobs/:id`

Poll a running job's status and stats.

**Response 200:**
```json
{
  "id": "b3f2a1d0-...",
  "brokerType": "rabbitmq",
  "createdAt": "2026-03-19T10:00:00.000Z",
  "status": "running",
  "progress": 42,
  "elapsed": 8,
  "config": {
    "destination": "queue/orders",
    "messagesPerSec": 50,
    "totalMessages": 1000,
    "connection": { "host": "localhost", "port": 5672, "username": "guest", "password": "***" }
  },
  "stats": {
    "sent": 420,
    "acked": 418,
    "dropped": 2,
    "avgLatency": 1.4
  },
  "throughputHistory": [0, 5, 12, 23, 35, 48, 50, 50, ...],
  "logEntries": [
    { "time": "10:00:08", "msgId": "MSG-0420", "latency": 1.1, "status": "ok", "notes": "Delivered" },
    ...
  ]
}
```

**Response 404** — job not found (expired or never existed)

---

### `POST /api/jobs/:id/stop`

Signal a running job to stop cleanly (flushes the broker connection).

**Response 200:** `{ "status": "stopped" }`
**Response 404:** job not found

---

### `GET /api/jobs`

List all in-memory jobs (passwords redacted). Useful for debugging.

---

## Architecture

```
Browser (Vue 3)
    │
    │  HTTP / JSON  (Vite proxy → :3001 in dev)
    ▼
Express Server (:3001)
    │
    ├── POST /api/brokers/:type/test-connection
    │       └── BrokerClass.testConnection(config)
    │
    ├── POST /api/jobs/start
    │       └── JobManager.createJob(params)
    │               └── TestRunner.start()
    │                       ├── BrokerClass.connect(config)
    │                       ├── BrokerClass.prepareDestination(dest)
    │                       └── setInterval → BrokerClass.publish() × N/s
    │
    ├── GET  /api/jobs/:id   ← polled every 800 ms by LiveMonitor
    │       └── TestRunner.getStats()  →  { status, progress, stats, throughputHistory, logEntries }
    │
    └── POST /api/jobs/:id/stop
            └── TestRunner.stop() → BrokerClass.disconnect()
```

---

## Adding a New Broker

The codebase is structured so adding a broker requires changes in exactly **3 files**:

### 1. `server/brokers/<name>/<Name>Broker.js`

Extend `BaseBroker` and implement all 5 methods:

```js
const BaseBroker = require('../BaseBroker')

class KafkaBroker extends BaseBroker {
  async testConnection(config) { /* … */ }
  async connect(config)        { /* … */ }
  async prepareDestination(destination) { /* … */ }
  publish(destination, body)   { /* … */ }   // sync or fast async
  async disconnect()           { /* … */ }
}

module.exports = KafkaBroker
```

### 2. `server/brokers/registry.js`

```js
const KafkaBroker = require('./kafka/KafkaBroker')

const registry = {
  rabbitmq: RabbitMQBroker,
  kafka:    KafkaBroker,   // ← add this line
}
```

### 3. `client/src/config/brokers.js`

Set `implemented: true` on the existing Kafka entry (already scaffolded):

```js
{
  value: 'kafka',
  implemented: true,   // ← flip this
  // connectionFields already defined
}
```

That's it — the UI will automatically render the correct connection fields, remove the "coming soon" warning, and route API calls to your new class.

---

## Implemented vs Planned

### ✅ Implemented

| Area | Feature |
|---|---|
| UI | Dark / Light theme with localStorage persistence |
| UI | Dynamic broker connection fields from config |
| UI | Password show/hide toggle |
| UI | Test Connection button with live result + latency |
| UI | Run Test → job start → navigate to Live Monitor |
| UI | Live Monitor polling (800 ms), auto-stop on terminal state |
| UI | SVG throughput chart (20-point window, gradient fill) |
| UI | Message log table (50-row ring buffer, ok/warn/err badges) |
| UI | Progress bar + elapsed time + meta info strip |
| UI | Error banners on connection test failure and job start failure |
| Backend | `BaseBroker` abstract class |
| Backend | Broker registry pattern |
| Backend | RabbitMQ — `testConnection`, `connect`, `prepareDestination`, `publish`, `disconnect` |
| Backend | Friendly error messages for all common AMQP / network failure codes |
| Backend | JobManager (create / get / stop / list) with password redaction |
| Backend | TestRunner — ramp-up, rate control, stats aggregation, log ring-buffer |
| Backend | MessageGenerator — UUID + timestamp JSON bodies |

### 🔜 Planned

| Area | Feature |
|---|---|
| Broker | Apache ActiveMQ — STOMP / OpenWire / AMQP |
| Broker | Apache Kafka — native producer via `kafkajs` |
| Broker | IBM MQ — MQ Wire via `ibmmq` |
| Broker | Azure Service Bus — AMQP via `@azure/service-bus` |
| Broker | TLS / SSL support for all brokers |
| Load | Burst order mode (variable-rate bursts) |
| Load | Custom message templates with `{{uuid}}` / `{{random}}` interpolation |
| Load | CSV upload — use rows as message bodies |
| Data | Profile persistence (save/load named configs to disk or localStorage) |
| Data | Export results to CSV / JSON |
| Monitor | Consumer latency (end-to-end round-trip, not just publish time) |
| Monitor | Multiple concurrent jobs |
| Monitor | Historical job list |
| Backend | Graceful shutdown — stop all running jobs on SIGTERM |
| Backend | Job TTL / auto-cleanup of completed jobs from memory |
| Backend | WebSocket push (replace polling) |
| Auth | Basic API key protection for the backend |

---

## License

MIT
