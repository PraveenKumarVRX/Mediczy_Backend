import test from 'node:test';
import assert from 'node:assert/strict';
import { generateUniqueId, getPrefixForRole, ENTITY_KIND_PREFIXES } from '../utils/uniqueIdGenerator.js';

test('corporate_cmo is a doctor (D) and corporate_ohc is a clinic (K), as decided 2026-10-07', () => {
  assert.equal(getPrefixForRole('corporate_cmo'), 'D');
  assert.equal(getPrefixForRole('corporate_ohc'), 'K');
  assert.match(generateUniqueId('corporate_cmo'), /^D[A-Z0-9]{5}$/);
  assert.match(generateUniqueId('corporate_ohc'), /^K[A-Z0-9]{5}$/);
});

test('corporate_admin stays C, and the phlebotomist kind is F', () => {
  assert.equal(getPrefixForRole('corporate_admin'), 'C');
  assert.equal(getPrefixForRole('phlebotomist'), 'F');
  assert.equal(ENTITY_KIND_PREFIXES.phlebotomist, 'F');
});

test('OHC staff (hospital/clinic side) are D and N, care units are J', () => {
  assert.equal(getPrefixForRole('ohc_doctor'), 'D');
  assert.equal(getPrefixForRole('ohc_staff'), 'N');
  assert.equal(ENTITY_KIND_PREFIXES.care_unit, 'J');
  assert.match(generateUniqueId('ohc_doctor'), /^D[A-Z0-9]{5}$/);
});
