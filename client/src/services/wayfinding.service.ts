import api from '@/lib/api';

export interface WayfindingDepartment {
  id: string;
  name: string;
  aliases: string[];
  directions: string[];
  landmark?: string;
}

export interface WayfindingFloor {
  floor_number: number;
  floor_name: string | null;
  departments: WayfindingDepartment[];
  updated_at?: string;
}

/** One department per line: `Name | alias, alias | step; step | landmark` (aliases, steps and landmark optional). */
export function parseDepartments(text: string): WayfindingDepartment[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name = '', aliases = '', directions = '', landmark = ''] = line.split('|').map((p) => p.trim());
      return {
        id: name,
        name,
        aliases: aliases.split(',').map((a) => a.trim()).filter(Boolean),
        directions: directions.split(';').map((d) => d.trim()).filter(Boolean),
        landmark: landmark || undefined,
      };
    });
}

export function formatDepartments(departments: WayfindingDepartment[]): string {
  return departments
    .map((d) => [d.name, d.aliases.join(', '), d.directions.join('; '), d.landmark || ''].join(' | ').replace(/(\s\|\s)+$/, ''))
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
