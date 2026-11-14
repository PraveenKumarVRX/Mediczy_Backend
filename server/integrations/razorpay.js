import Razorpay from 'razorpay';
import axios from 'axios';
import { IntegrationError } from './core/integration.js';
import { manageAxios } from './transport.js';

// Resources retain the same API object, so intercept its private HTTP instance once.
export default class ManagedRazorpay extends Razorpay {
  constructor(options) {
    super(options);
    manageAxios(this.api.rq, axios, 'razorpay');
    this.api.rq.interceptors.response.use(undefined, error => {
      // Razorpay's normalizeError requires this shape even for a local refusal.
      if (error instanceof IntegrationError) error.response = { status: error.status, data: {
        error: { code: error.code, description: error.message },
      } };
      return Promise.reject(error);
    });
  }
}
