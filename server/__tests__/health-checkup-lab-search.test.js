/**
 * Lab search on Book Check-up (2026-11-17): the app says "Try an area, city or PIN code", but the search
 * matched only the lab name and city, so a PIN such as 411012 never found anything.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VENUE_SEARCH_TEXT, VENUE_PIN } from '../services/health-checkup-venues.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const route = fs.readFileSync(path.join(root, 'routes/health-checkup.route.js'), 'utf8');
const labs = route.slice(route.indexOf("router.get('/labs'"), route.indexOf("router.get('/slots'"));

describe('what a member can search labs by', () => {
  it('area, street, PIN, state and the full address, for lab objects and hospital address strings', () => {
    for (const key of ['city', 'zipCode', 'pincode', 'street', 'formatted_address', 'locality', 'area', 'state']) {
      expect(VENUE_SEARCH_TEXT).toContain(`l.address->>'${key}'`);
    }
    expect(VENUE_SEARCH_TEXT).toContain("jsonb_typeof(l.address)='string' THEN l.address #>> '{}'");
    expect(VENUE_SEARCH_TEXT).not.toContain('coordinates'); // a PIN must not match digits inside a latitude
    expect(labs).toContain('LOWER(${VENUE_SEARCH_TEXT}) LIKE LOWER(:likeSearch)');
  });

  it('a 6-digit PIN means near that PIN: same postal area, nearest PIN first', () => {
    expect(labs).toMatch(/pin=\/\^\[1-9\]\[0-9\]\{5\}\$\/\.test\(search\)/);
    expect(labs).toContain('${VENUE_PIN} LIKE :pinArea');
    expect(labs).toContain('pinArea:`${pin.slice(0,3)}%`');
    expect(VENUE_PIN).toContain("from '[1-9][0-9]{5}'");
  });

  it('the PIN gap is selected, since SELECT DISTINCT can only order by selected columns', () => {
    expect(labs).toContain('AS pin_gap');
    expect(labs).toContain("pin_gap ASC,");
    expect(labs).toMatch(/SELECT DISTINCT/);
  });
});
