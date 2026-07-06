import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const doctorModelSource = readFileSync(join(root, 'models/doctor.model.intelligent.js'), 'utf8');

assert.match(doctorModelSource, /updateMedia:\s*async/, 'doctorModel.updateMedia must be implemented');
assert.match(doctorModelSource, /profileImage = url/, 'profilePicture uploads must persist to profileImage');

console.log('✅ profile-pic-upload smoke: updateMedia implementation present');
