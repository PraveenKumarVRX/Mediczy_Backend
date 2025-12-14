/**
 * Custom Domain Management Routes
 * Tenant can request and manage custom domains
 */

import express from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import dns from 'dns';
import Tenant from '../models/postgres/tenant.model.postgres.js';
import { requireTenant } from '../middleware/tenant.middleware.js';
import { authUser } from '../middleware/auth.middleware.js';

const execAsync = promisify(exec);
const resolveCname = promisify(dns.resolveCname);
const resolve4 = promisify(dns.resolve4);

const router = express.Router();

/**
 * POST /api/tenant-domains/request
 * Request custom domain setup
 */
router.post('/request', requireTenant, authUser, async (req, res) => {
  try {
    const { custom_domain } = req.body;
    
    if (!custom_domain) {
      return res.status(400).json({
        success: false,
        message: 'custom_domain is required'
      });
    }
    
    // Validate domain format
    const domainRegex = /^[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,}$/i;
    if (!domainRegex.test(custom_domain)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid domain format'
      });
    }
    
    // Check if domain already in use
    const existing = await Tenant.findOne({
      where: { custom_domain }
    });
    
    if (existing && existing.id !== req.tenant.id) {
      return res.status(409).json({
        success: false,
        message: 'Domain already in use by another tenant'
      });
    }
    
    // Check DNS configuration
    const dnsStatus = await checkDNS(custom_domain);
    
    // Update tenant with requested domain
    await req.tenant.update({
      custom_domain,
      metadata: {
        ...req.tenant.metadata,
        custom_domain_requested_at: new Date(),
        custom_domain_dns_status: dnsStatus
      }
    });
    
    res.json({
      success: true,
      message: 'Custom domain requested',
      domain: custom_domain,
      dns_status: dnsStatus,
      instructions: getDNSInstructions(custom_domain)
    });
  } catch (error) {
    console.error('Custom domain request error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to request custom domain',
      error: error.message
    });
  }
});

/**
 * GET /api/tenant-domains/verify
 * Verify DNS configuration for custom domain
 */
router.get('/verify', requireTenant, authUser, async (req, res) => {
  try {
    if (!req.tenant.custom_domain) {
      return res.status(400).json({
        success: false,
        message: 'No custom domain configured'
      });
    }
    
    const dnsStatus = await checkDNS(req.tenant.custom_domain);
    
    // Update metadata with verification result
    await req.tenant.update({
      metadata: {
        ...req.tenant.metadata,
        custom_domain_dns_verified_at: dnsStatus.configured ? new Date() : null,
        custom_domain_dns_status: dnsStatus
      }
    });
    
    res.json({
      success: true,
      domain: req.tenant.custom_domain,
      dns_status: dnsStatus,
      ready_for_ssl: dnsStatus.configured,
      instructions: getDNSInstructions(req.tenant.custom_domain)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'DNS verification failed',
      error: error.message
    });
  }
});

/**
 * POST /api/tenant-domains/setup-ssl
 * Setup SSL certificate for custom domain (requires DNS configured)
 */
router.post('/setup-ssl', requireTenant, authUser, async (req, res) => {
  try {
    if (!req.tenant.custom_domain) {
      return res.status(400).json({
        success: false,
        message: 'No custom domain configured'
      });
    }
    
    // Verify DNS first
    const dnsStatus = await checkDNS(req.tenant.custom_domain);
    if (!dnsStatus.configured) {
      return res.status(400).json({
        success: false,
        message: 'DNS not configured correctly',
        dns_status: dnsStatus,
        instructions: getDNSInstructions(req.tenant.custom_domain)
      });
    }
    
    // Trigger SSL setup script (this should be run by admin)
    // In production, this would create a job/ticket for admin to approve
    
    res.json({
      success: true,
      message: 'SSL setup requested. Admin will configure within 24 hours.',
      domain: req.tenant.custom_domain,
      estimated_completion: new Date(Date.now() + 24 * 60 * 60 * 1000)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'SSL setup failed',
      error: error.message
    });
  }
});

/**
 * DELETE /api/tenant-domains/remove
 * Remove custom domain (revert to subdomain)
 */
router.delete('/remove', requireTenant, authUser, async (req, res) => {
  try {
    const oldDomain = req.tenant.custom_domain;
    
    await req.tenant.update({
      custom_domain: null,
      metadata: {
        ...req.tenant.metadata,
        custom_domain_removed_at: new Date(),
        previous_custom_domain: oldDomain
      }
    });
    
    res.json({
      success: true,
      message: 'Custom domain removed',
      fallback_url: `https://${req.tenant.subdomain}.mayden.in`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to remove custom domain',
      error: error.message
    });
  }
});

/**
 * Check DNS configuration
 */
async function checkDNS(domain) {
  try {
    // Get server IP
    const { stdout } = await execAsync('curl -s ifconfig.me');
    const serverIP = stdout.trim();
    
    let configured = false;
    let type = null;
    let value = null;
    
    try {
      // Check CNAME record
      const cname = await resolveCname(domain);
      if (cname.includes('mayden.in')) {
        configured = true;
        type = 'CNAME';
        value = cname[0];
      }
    } catch (cnameError) {
      // CNAME not found, check A record
      try {
        const aRecords = await resolve4(domain);
        if (aRecords.includes(serverIP)) {
          configured = true;
          type = 'A';
          value = aRecords[0];
        }
      } catch (aError) {
        // No records found
      }
    }
    
    return {
      configured,
      type,
      value,
      server_ip: serverIP,
      checked_at: new Date()
    };
  } catch (error) {
    return {
      configured: false,
      error: error.message,
      checked_at: new Date()
    };
  }
}

/**
 * Get DNS configuration instructions
 */
function getDNSInstructions(domain) {
  return {
    step_1: {
      title: 'Access your domain registrar',
      description: `Log in to where you purchased ${domain} (GoDaddy, Namecheap, Cloudflare, etc.)`
    },
    step_2: {
      title: 'Add DNS record (choose one option)',
      options: [
        {
          type: 'CNAME',
          recommended: true,
          host: domain.split('.')[0],
          value: 'mayden.in',
          ttl: '3600',
          description: 'Point your domain to mayden.in'
        },
        {
          type: 'A',
          recommended: false,
          host: '@',
          value: '(will be provided after verification)',
          ttl: '3600',
          description: 'Point directly to server IP'
        }
      ]
    },
    step_3: {
      title: 'Wait for DNS propagation',
      description: 'DNS changes can take 1-48 hours to propagate globally. Usually takes 1-2 hours.'
    },
    step_4: {
      title: 'Verify configuration',
      description: 'Use the verification endpoint to check if DNS is configured correctly',
      endpoint: 'GET /api/tenant-domains/verify'
    },
    step_5: {
      title: 'Request SSL setup',
      description: 'Once DNS is verified, request SSL certificate setup',
      endpoint: 'POST /api/tenant-domains/setup-ssl'
    }
  };
}

export default router;
