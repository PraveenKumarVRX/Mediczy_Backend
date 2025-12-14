import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/utils/api";

type TelePayload = { specialty: string; count?: number };
type BenefitType = 'pharmacyINR' | 'homeCareINR' | 'ambulanceINR';
type BenefitPayload = { type: BenefitType; amount: number };

export const useIncrementTeleconsult = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: TelePayload) => {
      const { data } = await api.post('/membership/usage/teleconsult', payload);
      return data;
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['myPlan','usage'] }),
        qc.invalidateQueries({ queryKey: ['myPlan','current'] }),
      ]);
    }
  });
};

export const useIncrementBenefit = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: BenefitPayload) => {
      const { data } = await api.post('/membership/usage/benefit', payload);
      return data;
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['myPlan','usage'] }),
        qc.invalidateQueries({ queryKey: ['myPlan','current'] }),
      ]);
    }
  });
};

export type { BenefitType };
