/**
 * Kafka N8N Worker (Stub/Mock)
 * 
 * Note: Kafka disabled in production
 */

export const worker = {
  start: async () => {
    console.log('📝 Kafka N8N worker: Disabled (using stub)');
    return true;
  },
  stop: async () => true,
  status: () => 'disabled'
};

export async function startKafkaWorker() {
  return Promise.resolve({ worker });
}

export default { worker, startKafkaWorker };
