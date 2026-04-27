/**
 * Broker definitions — single source of truth for the client UI.
 *
 * Adding a new broker:
 *   1. Add an entry here with its connectionFields and protocols.
 *   2. Set implemented: true once the server-side broker class is ready.
 *   3. Register the class in server/brokers/registry.js.
 */

export const BROKER_DEFS = [
  {
    value: 'rabbitmq',
    label: 'RabbitMQ',
    color: '#ff6600',
    implemented: true,
    sslSupported: true,
    protocols: ['AMQP'],
    defaultProtocol: 'AMQP',
    connectionFields: [
      { key: 'host',     label: 'Host',         type: 'text',     defaultVal: 'localhost', placeholder: 'localhost',  span: 2 },
      { key: 'port',     label: 'Port',         type: 'number',   defaultVal: 5672,        placeholder: '5672',       span: 1 },
      { key: 'username', label: 'Username',     type: 'text',     defaultVal: 'guest',     placeholder: 'guest',      span: 1 },
      { key: 'password', label: 'Password',     type: 'password', defaultVal: '',          placeholder: '••••••••',   span: 1 },
      { key: 'vhost',    label: 'Virtual Host', type: 'text',     defaultVal: '/',         placeholder: '/',          span: 1 },
    ],
  },
  {
    value: 'amq-artemis',
    label: 'Red Hat AMQ (Artemis)',
    color: '#cc0000',
    implemented: true,
    sslSupported: true,
    protocols: ['AMQP 1.0'],
    defaultProtocol: 'AMQP 1.0',
    connectionFields: [
      { key: 'host',     label: 'Host',     type: 'text',     defaultVal: 'localhost', placeholder: 'amq-broker.internal', span: 2 },
      { key: 'port',     label: 'Port',     type: 'number',   defaultVal: 5672,        placeholder: '5672 / 5671 (SSL)',   span: 1 },
      { key: 'username', label: 'Username', type: 'text',     defaultVal: '',          placeholder: 'admin',               span: 1 },
      { key: 'password', label: 'Password', type: 'password', defaultVal: '',          placeholder: '••••••••',            span: 2 },
    ],
  },
  {
    value: 'activemq',
    label: 'Apache ActiveMQ',
    color: '#e8a838',
    implemented: false,
    sslSupported: true,
    protocols: ['STOMP', 'OpenWire', 'AMQP'],
    defaultProtocol: 'STOMP',
    connectionFields: [
      { key: 'host',     label: 'Host',     type: 'text',     defaultVal: 'localhost', placeholder: 'amq-qa.internal', span: 2 },
      { key: 'port',     label: 'Port',     type: 'number',   defaultVal: 61616,       placeholder: '61616',           span: 1 },
      { key: 'username', label: 'Username', type: 'text',     defaultVal: 'admin',     placeholder: 'admin',           span: 1 },
      { key: 'password', label: 'Password', type: 'password', defaultVal: '',          placeholder: '••••••••',        span: 2 },
    ],
  },
  {
    value: 'kafka',
    label: 'Apache Kafka',
    color: '#00e5ff',
    implemented: false,
    protocols: ['Kafka Native'],
    defaultProtocol: 'Kafka Native',
    connectionFields: [
      { key: 'bootstrapServers', label: 'Bootstrap Servers', type: 'text', defaultVal: 'localhost:9092', placeholder: 'broker1:9092,broker2:9092', span: 3 },
      { key: 'groupId',         label: 'Group ID',          type: 'text', defaultVal: 'queuestorm',     placeholder: 'queuestorm',                span: 1 },
    ],
  },
  {
    value: 'ibmmq',
    label: 'IBM MQ',
    color: '#7b2fff',
    implemented: false,
    protocols: ['MQ Wire', 'AMQP', 'MQTT'],
    defaultProtocol: 'MQ Wire',
    connectionFields: [
      { key: 'host',        label: 'Host',          type: 'text',   defaultVal: 'localhost', placeholder: 'localhost',  span: 2 },
      { key: 'port',        label: 'Port',          type: 'number', defaultVal: 1414,        placeholder: '1414',       span: 1 },
      { key: 'queueManager',label: 'Queue Manager', type: 'text',   defaultVal: 'QM1',       placeholder: 'QM1',        span: 1 },
      { key: 'channel',     label: 'Channel',       type: 'text',   defaultVal: 'DEV.APP.SVRCONN', placeholder: 'DEV.APP.SVRCONN', span: 2 },
    ],
  },
  {
    value: 'azuresb',
    label: 'Azure Service Bus',
    color: '#0078d4',
    implemented: false,
    protocols: ['AMQP'],
    defaultProtocol: 'AMQP',
    connectionFields: [
      { key: 'connectionString', label: 'Connection String', type: 'text', defaultVal: '', placeholder: 'Endpoint=sb://…', span: 4 },
    ],
  },
]

/** Keyed lookup for O(1) access */
export const BROKER_MAP = Object.fromEntries(BROKER_DEFS.map(b => [b.value, b]))

/** Build a fresh connection config object with all defaults for a given broker type */
export function defaultConnectionFor(brokerValue) {
  const def = BROKER_MAP[brokerValue]
  if (!def) return {}
  return Object.fromEntries(def.connectionFields.map(f => [f.key, f.defaultVal]))
}
