import { useQuery } from '@tanstack/react-query';
import api from '@/utils/api';

export function useProgramAvailability() {
  const { data } = useQuery({
    queryKey: ['program-availability'],
    queryFn: async () => {
      const { data } = await api.get('/programs', { params: { limit: 1 } });
      const programs = Array.isArray(data.data) ? data.data : data.data?.programs || data.programs || [];
      return programs.length > 0;
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  return data === true;
}
