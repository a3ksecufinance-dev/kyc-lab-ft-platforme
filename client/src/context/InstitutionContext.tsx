import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import { trpc } from "../lib/trpc";
import { CLASSIC_BANK_FLAGS } from "../../../shared/institution.types";
import type { InstitutionFeatureFlags } from "../../../shared/institution.types";

const InstitutionContext = createContext<InstitutionFeatureFlags | null>(null);

export function InstitutionProvider({ children }: { children: ReactNode }) {
  const { data } = trpc.institution.getConfig.useQuery(undefined, {
    staleTime: Infinity,   // constante de déploiement — jamais revalidée
    retry: false,
  });

  const flags: InstitutionFeatureFlags = data
    ? {
        institutionType:        data.institutionType,
        institutionName:        data.institutionName,
        wallets:                data.features.wallets,
        agentAccounts:          data.features.agentAccounts,
        mobileTransactionTypes: data.features.mobileTransactionTypes,
        walletKyc:              data.features.walletKyc,
        enhancedOnboarding:     data.features.enhancedOnboarding,
        walletAml:              data.features.walletAml,
        bamReports:             data.features.bamReports,
        mobileConnectors:       data.features.mobileConnectors,
        agentNetwork:           data.features.agentNetwork,
        correspondentBanking:   data.features.correspondentBanking,
      }
    : CLASSIC_BANK_FLAGS;

  return (
    <InstitutionContext.Provider value={flags}>
      {children}
    </InstitutionContext.Provider>
  );
}

export function useInstitution(): InstitutionFeatureFlags {
  const ctx = useContext(InstitutionContext);
  if (!ctx) throw new Error("useInstitution must be used within InstitutionProvider");
  return ctx;
}
