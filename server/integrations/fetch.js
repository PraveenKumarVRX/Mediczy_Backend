import fetch from 'node-fetch';
import { createManagedFetch } from './transport.js';
export default createManagedFetch(fetch);
