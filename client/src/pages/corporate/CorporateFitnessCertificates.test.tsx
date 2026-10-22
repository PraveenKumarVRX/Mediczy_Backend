import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import api from '@/utils/api';
import CorporateFitnessCertificates from './CorporateFitnessCertificates';
vi.mock('@/utils/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('@/components/corporate/CorporateLayout', () => ({ default: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
const toast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));
const rows = [
  { id: 1, patient_name: 'Synthetic One', employee_id: 'EMP-1', fitness_status: 'fit' },
  { id: 2, patient_name: 'Synthetic Two', employee_id: 'EMP-2', fitness_status: 'fit' },
];
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.get).mockResolvedValue({ data: { data: rows } });
  vi.mocked(api.post).mockResolvedValue({ data: new Blob(['zip']) });
  URL.createObjectURL = vi.fn(() => 'blob:synthetic');
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const show = () => render(<MemoryRouter><CorporateFitnessCertificates /></MemoryRouter>);
it('downloads PDFs for visible search results and prevents duplicate requests while pending', async () => {
  let resolve!: (value: unknown) => void;
  vi.mocked(api.post).mockReturnValue(new Promise(done => { resolve = done; }) as never);
  show(); await screen.findByText('Synthetic One');
  fireEvent.change(screen.getByPlaceholderText(/Search employee/), { target: { value: 'EMP-2' } });
  const button = screen.getByRole('button', { name: 'Download PDFs' });
  fireEvent.click(button);
  expect((button as HTMLButtonElement).disabled).toBe(true);
  expect(api.post).toHaveBeenCalledWith('/v1/occupational-health/fitness-certificates/download-zip', { certificateIds: [2] }, { responseType: 'blob' });
  resolve({ data: new Blob(['zip']) });
  await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
  expect(URL.revokeObjectURL).toHaveBeenCalled();
});
it('reports an unavailable PDF without creating a download', async () => {
  vi.mocked(api.post).mockRejectedValue({ response: { data: { message: 'One or more certificate PDFs are unavailable' } } });
  show(); await screen.findByText('Synthetic One');
  fireEvent.click(screen.getByRole('button', { name: 'Download PDFs' }));
  await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'One or more certificate PDFs are unavailable', variant: 'destructive' })));
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});
