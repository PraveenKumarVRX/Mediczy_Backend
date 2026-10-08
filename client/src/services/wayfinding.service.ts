import api from '@/lib/api';

export interface WayfindingDepartment {
  id: string;
  name: string;
  aliases: string[];
  directions: string[];
  landmark?: string;
  x?: number;
  y?: number;
  capacity?: number;
  zone?: string;
}

export interface WayfindingFloor {
  floor_number: number;
  floor_name: string | null;
  departments: WayfindingDepartment[];
  updated_at?: string;
}

/**
 * One department per line:
 *   `Name | alias, alias | step; step | landmark | x,y | capacity | zone`
 * Only the name is required. x,y place it on the floor-map display (0-100 by 0-80); zone is one of
 * er, opd, icu, ot, ward, pharmacy, lab, radiology, other (ER, OPD and OT show live occupancy).
 */
export function parseDepartments(text: string): WayfindingDepartment[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name = '', aliases = '', directions = '', landmark = '', xy = '', capacity = '', zone = ''] = line.split('|').map((p) => p.trim());
      const dept: WayfindingDepartment = {
        id: name,
        name,
        aliases: aliases.split(',').map((a) => a.trim()).filter(Boolean),
        directions: directions.split(';').map((d) => d.trim()).filter(Boolean),
        landmark: landmark || undefined,
      };
      if (xy) {
        const [x, y] = xy.split(',').map((v) => Number(v.trim()));
        dept.x = x;
        dept.y = y;
      }
      if (capacity) dept.capacity = Number(capacity);
      if (zone) dept.zone = zone.toLowerCase();
      return dept;
    });
}

export function formatDepartments(departments: WayfindingDepartment[]): string {
  return departments
    .map((d) => [
      d.name,
      d.aliases.join(', '),
      d.directions.join('; '),
      d.landmark || '',
      d.x !== undefined && d.y !== undefined ? `${d.x},${d.y}` : '',
      d.capacity !== undefined ? String(d.capacity) : '',
      d.zone || '',
    ].join(' | ').replace(/(\s\|\s?)+$/, ''))
    .join('\n');
}

export async function listWayfindingFloors(): Promise<WayfindingFloor[]> {
  const res = await api.get('/display/wayfinding/floors');
  return res.data?.floors || [];
}

export async function saveWayfindingFloor(floorNumber: number, body: { floorName: string; departments: WayfindingDepartment[] }) {
  const res = await api.put(`/display/wayfinding/floors/${floorNumber}`, body);
  return res.data;
}

export async function deleteWayfindingFloor(floorNumber: number) {
  const res = await api.delete(`/display/wayfinding/floors/${floorNumber}`);
  return res.data;
}
