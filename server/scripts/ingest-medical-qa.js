#!/usr/bin/env node
/**
 * Ingest filtered medical QA into knowledge base via pdfKnowledge service
 * Usage: node scripts/ingest-medical-qa.js [batchSize] [startFrom]
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pdfKnowledgeService from '../services/pdfKnowledge.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BATCH_SIZE = parseInt(process.argv[2]) || 50;
const START_FROM = parseInt(process.argv[3]) || 0;

async function main() {
  const dataPath = path.join(__dirname, '../data/datasets/medical_qa_filtered.json');
  const entries = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  
  console.log(`Total entries: ${entries.length}, starting from: ${START_FROM}, batch size: ${BATCH_SIZE}`);
  
  const toIngest = entries.slice(START_FROM);
  let ingested = START_FROM;
  
  for (let i = 0; i < toIngest.length; i += BATCH_SIZE) {
    const batch = toIngest.slice(i, i + BATCH_SIZE).map((e, idx) => ({
      id: `medical_qa_${START_FROM + i + idx}`,
      text: e.text,
      title: e.question.substring(0, 100),
      topic: 'medical_qa',
      section: 'clinical_knowledge'
    }));
    
    try {
      await pdfKnowledgeService.ingestText(batch, {
        source: 'huggingface_medical_qa',
        category: 'medical_encyclopedia',
        namespace: 'medical_qa'
      });
      ingested += batch.length;
      console.log(`[${ingested}/${entries.length}] Ingested batch of ${batch.length}`);
    } catch (err) {
      console.error(`Error at batch starting ${START_FROM + i}:`, err.message);
      console.log(`Resume with: node scripts/ingest-medical-qa.js ${BATCH_SIZE} ${ingested}`);
      process.exit(1);
    }
  }
  
  console.log(`\nDone! Total ingested: ${ingested}`);
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
