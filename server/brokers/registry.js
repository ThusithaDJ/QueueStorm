/**
 * Broker registry — maps broker type keys (as sent by the client)
 * to their concrete implementation classes.
 *
 * To register a new broker, import its class here and add it to the map.
 */

const RabbitMQBroker     = require('./rabbitmq/RabbitMQBroker')
const AMQArtemisBroker   = require('./amqArtemis/AMQArtemisBroker')

/** @type {Record<string, typeof import('./BaseBroker')>} */
const registry = {
  rabbitmq:    RabbitMQBroker,
  'amq-artemis': AMQArtemisBroker,
  // activemq: ActiveMQBroker,   // future
  // kafka:    KafkaBroker,       // future
  // ibmmq:    IBMMQBroker,       // future
  // azuresb:  AzureSBBroker,     // future
}

/**
 * Resolve a broker type string to its class.
 * @param {string} type
 * @returns {typeof import('./BaseBroker')}
 * @throws {Error} if the type is not registered
 */
function getBrokerClass(type) {
  const BrokerClass = registry[type]
  if (!BrokerClass) {
    throw new Error(`Unsupported broker type: "${type}". Registered: ${Object.keys(registry).join(', ')}`)
  }
  return BrokerClass
}

module.exports = { getBrokerClass, registry }
