import { useQuery } from '@tanstack/react-query';
import api from '@/utils/api';
import { getUserType } from '@/hooks/auth';

export function useProgramAvailability() {
  const userType = getUserType();
  const isPatientSession = userType === 'user';
  const { data } = useQuery({
    queryKey: ['program-availability', userType],
    queryFn: async () => {
      const { data } = await api.get('/programs', { params: { limit: 1 } });
      const programs = Array.isArray(data.data) ? data.data : data.data?.programs || data.programs || [];
      return programs.length > 0;
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
    enabled: isPatientSession,
  });
  return data === true;
}
