/**
 * Montants de repli du flux passerelle historique (SasPay gelé).
 *
 * Source de vérité : la table `subscription_plans` (ligne `standard`,
 * seed 5000/50000 XOF) lue côté serveur par `gatewayPrices()` et par le flux
 * manuel. Ces constantes ne servent que de repli quand la ligne seed est
 * absente, et d'affichage statique dans l'ancien composant d'abonnement.
 * Les montants sont des chaînes décimales conformément à la spec SasPay.
 */
export const subscriptionPlans = {
  monthly: {
    amount: "5000.00",   // 5 000 XOF
    currency: "XOF",
  },
  annual: {
    amount: "50000.00",  // 50 000 XOF
    currency: "XOF",
  },
};

// Export for convenience
export type SubscriptionPlan = "monthly" | "annual";