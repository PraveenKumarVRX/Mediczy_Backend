import Ticket from './models/ticket.model.js';

console.log('✓ Ticket model loaded successfully');
console.log('Model type:', typeof Ticket);
console.log('Find method exists:', typeof Ticket.find === 'function');

try {
  const tickets = await Ticket.find({});
  console.log(`✓ Query successful - found ${tickets.length} tickets`);
} catch (error) {
  console.error('✗ Query error:', error.message);
  console.error(error.stack);
}

process.exit(0);
