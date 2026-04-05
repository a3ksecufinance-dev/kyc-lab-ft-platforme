/**
 * Institution Router — expose les feature flags au frontend
 *
 * Endpoint public (pas d'authentification requise) : les flags doivent être
 * connus avant la page de connexion pour adapter le branding.
 *
 * Côté client, React Query met en cache avec staleTime:Infinity car
 * INSTITUTION_TYPE est une constante de déploiement, jamais modifiée à chaud.
 */

import { router, publicProc } from "../../_core/trpc";
import { getInstitutionFlags } from "../../_core/institution";

export const institutionRouter = router({
  /**
   * Retourne le type d'institution et les feature flags actifs.
   * Appelé une seule fois au démarrage de l'app React.
   */
  getConfig: publicProc.query(() => {
    const flags = getInstitutionFlags();

    return {
      institutionType: flags.institutionType,
      institutionName: flags.institutionName,
      features: {
        wallets:                flags.wallets,
        agentAccounts:          flags.agentAccounts,
        mobileTransactionTypes: flags.mobileTransactionTypes,
        walletKyc:              flags.walletKyc,
        enhancedOnboarding:     flags.enhancedOnboarding,
        walletAml:              flags.walletAml,
        bamReports:             flags.bamReports,
        mobileConnectors:       flags.mobileConnectors,
        agentNetwork:           flags.agentNetwork,
      },
    };
  }),
});
