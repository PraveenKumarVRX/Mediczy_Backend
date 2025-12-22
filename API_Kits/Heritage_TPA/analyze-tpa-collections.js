#!/usr/bin/env node
/**
 * TPA Postman Collection Analyzer
 * Extracts and analyzes all TPA integration specifications
 */

const fs = require('fs');
const path = require('path');

const extractedDir = path.join(__dirname, 'extracted');
const outputDir = path.join(__dirname, 'analysis');

// Create output directory
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// TPA provider mapping
const tpaProviders = {
  'Care': ['Health Care W2W PROD', 'Health Care W2W UAT'],
  'FGI': ['Health FGI MDBT OLD', 'Health FGI MDBT PROD', 'Health FGI MDBT UAT'],
  'FHPL': ['Health FHPL MDBT', 'Health FHPL W2W'],
  'GoDigit': ['Health Godigit MDBT PROD', 'Health Godigit MDBT UAT'],
  'HealthIndia': ['Health HealthIndia ANIB', 'Health HealthIndia MDBT', 'Health HealthIndia Sriyah', 'Health HealthIndia W2W'],
  'Heritage': ['Health Heritage 2', 'Health Heritage w2w'],
  'ICICI': ['Health ICICI MDBT PROD', 'Health ICICI MDBT UAT'],
  'MDIndia': ['Health MDIndia ANIB', 'Health MDIndia Sriyah', 'Health MDIndia w2w', 'Health MDIndia Zeal'],
  'MediAssist': ['Health MediAssist MDBT'],
  'MedSave': ['Health MedSave MDBT'],
  'NivaBupa': ['Health NivaBupa W2W'],
  'Paramount': ['Health Paramount Anib', 'Health Paramount Mdbt'],
  'Raksha': ['Health Raksha w2w', 'Health Raksha'],
  'StarHealth': ['Health StarHealth'],
  'Vidal': ['Health Vidal ANIB', 'Health Vidal MDBT'],
  'VoloTPA': ['Health VoloTPA MDBT'],
  'EWAT': ['Heatlh EWAT']
};

console.log('🔍 Analyzing TPA Postman Collections...\n');

// Read all collection files
const collections = fs.readdirSync(extractedDir)
  .filter(file => file.endsWith('.json'))
  .map(file => {
    const filePath = path.join(extractedDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    return {
      filename: file,
      data: JSON.parse(content)
    };
  });

console.log(`📊 Found ${collections.length} TPA collections\n`);

// Analyze each collection
const analysis = {};

collections.forEach(({ filename, data }) => {
  const collectionName = data.info?.name || filename.replace('.postman_collection.json', '');
  const endpoints = [];
  
  // Extract endpoints recursively
  function extractEndpoints(items, prefix = '') {
    if (!items) return;
    
    items.forEach(item => {
      if (item.request) {
        endpoints.push({
          name: item.name,
          method: item.request.method,
          url: typeof item.request.url === 'string' ? item.request.url : item.request.url?.raw || '',
          description: item.request.description || '',
          headers: item.request.header || [],
          body: item.request.body || null
        });
      }
      
      if (item.item) {
        extractEndpoints(item.item, prefix + item.name + ' > ');
      }
    });
  }
  
  extractEndpoints(data.item);
  
  analysis[collectionName] = {
    filename,
    totalEndpoints: endpoints.length,
    endpoints: endpoints.map(e => ({
      name: e.name,
      method: e.method,
      url: e.url.split('?')[0].replace(/{{.*?}}/g, '{param}')
    })),
    baseUrls: [...new Set(endpoints.map(e => {
      const url = typeof e.url === 'string' ? e.url : '';
      const match = url.match(/^(https?:\/\/[^\/]+)/);
      return match ? match[1] : '';
    }).filter(Boolean))],
    authentication: data.auth || null
  };
});

// Write detailed analysis
fs.writeFileSync(
  path.join(outputDir, 'tpa-collections-analysis.json'),
  JSON.stringify(analysis, null, 2)
);

// Generate summary report
const summary = {
  totalProviders: Object.keys(tpaProviders).length,
  totalCollections: collections.length,
  providers: {}
};

Object.entries(tpaProviders).forEach(([provider, collections]) => {
  const providerEndpoints = collections.reduce((sum, collectionName) => {
    const key = Object.keys(analysis).find(k => k.includes(collectionName));
    return sum + (analysis[key]?.totalEndpoints || 0);
  }, 0);
  
  summary.providers[provider] = {
    collections: collections.length,
    totalEndpoints: providerEndpoints,
    implemented: ['Heritage', 'MDIndia', 'HealthIndia'].includes(provider)
  };
});

fs.writeFileSync(
  path.join(outputDir, 'tpa-summary.json'),
  JSON.stringify(summary, null, 2)
);

// Generate implementation status
const implementationStatus = {
  implemented: ['Heritage', 'MDIndia', 'HealthIndia'],
  pending: Object.keys(tpaProviders).filter(p => !['Heritage', 'MDIndia', 'HealthIndia'].includes(p))
};

fs.writeFileSync(
  path.join(outputDir, 'implementation-status.json'),
  JSON.stringify(implementationStatus, null, 2)
);

// Generate markdown report
let markdown = `# TPA Integration Analysis Report\n\n`;
markdown += `**Generated**: ${new Date().toISOString()}\n\n`;
markdown += `## Summary\n\n`;
markdown += `- Total TPA Providers: **${Object.keys(tpaProviders).length}**\n`;
markdown += `- Total Collections: **${collections.length}**\n`;
markdown += `- Implemented: **${implementationStatus.implemented.length}**\n`;
markdown += `- Pending: **${implementationStatus.pending.length}**\n\n`;

markdown += `## Implementation Status\n\n`;
markdown += `### ✅ Implemented (${implementationStatus.implemented.length})\n\n`;
implementationStatus.implemented.forEach(provider => {
  const info = summary.providers[provider];
  markdown += `- **${provider}** - ${info.collections} collection(s), ${info.totalEndpoints} endpoint(s)\n`;
});

markdown += `\n### ⏳ Pending Implementation (${implementationStatus.pending.length})\n\n`;
implementationStatus.pending.forEach(provider => {
  const info = summary.providers[provider];
  markdown += `- **${provider}** - ${info.collections} collection(s), ${info.totalEndpoints} endpoint(s)\n`;
});

markdown += `\n## TPA Providers Detail\n\n`;
Object.entries(tpaProviders).forEach(([provider, colls]) => {
  const info = summary.providers[provider];
  const status = info.implemented ? '✅' : '⏳';
  markdown += `### ${status} ${provider}\n\n`;
  markdown += `- Collections: ${info.collections}\n`;
  markdown += `- Total Endpoints: ${info.totalEndpoints}\n`;
  markdown += `- Status: ${info.implemented ? 'Implemented' : 'Pending'}\n\n`;
  
  colls.forEach(collName => {
    const key = Object.keys(analysis).find(k => k.includes(collName));
    if (key && analysis[key]) {
      markdown += `#### ${collName}\n`;
      markdown += `- Endpoints: ${analysis[key].totalEndpoints}\n`;
      if (analysis[key].baseUrls.length > 0) {
        markdown += `- Base URL: ${analysis[key].baseUrls[0]}\n`;
      }
      markdown += `\n`;
    }
  });
});

fs.writeFileSync(
  path.join(outputDir, 'TPA_ANALYSIS_REPORT.md'),
  markdown
);

console.log('✅ Analysis Complete!\n');
console.log('📁 Output files:');
console.log('   - analysis/tpa-collections-analysis.json');
console.log('   - analysis/tpa-summary.json');
console.log('   - analysis/implementation-status.json');
console.log('   - analysis/TPA_ANALYSIS_REPORT.md');
console.log('');
console.log(`📊 Summary:`);
console.log(`   - ${implementationStatus.implemented.length} TPAs implemented`);
console.log(`   - ${implementationStatus.pending.length} TPAs pending`);
console.log(`   - ${collections.length} total collections`);
