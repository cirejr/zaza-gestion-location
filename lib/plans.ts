/**
 * Plans d'abonnement Naya — montants fixes côté serveur.
 * Utilisés par le client SasPay et les routes d'abonnement.
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