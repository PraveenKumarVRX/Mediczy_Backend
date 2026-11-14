import axios from 'axios';
import { manageAxios } from './transport.js';

function createManagedAxios(config, vendor) {
  const client = manageAxios(axios.create(config), axios, vendor);
  client.create = overrides => createManagedAxios(axios.mergeConfig(client.defaults, overrides), vendor);
  return client;
}
export default createManagedAxios();
export const createVendorAxios = (id, config) => createManagedAxios(config, id);
export * from 'axios';
