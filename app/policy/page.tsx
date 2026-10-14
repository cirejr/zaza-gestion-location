import Link from "next/link";
import { BILLING_POLICY_VERSION } from "@/lib/billing-policy";

export const dynamic = "force-static";

const sections: Array<{ id: string; title: string; body: string[] }> = [
  {
    id: "formules",
    title: "1. Formules et tarifs",
    body: [
      "Naya est proposé en abonnement par agence : un seul abonnement couvre l’organisation et tous ses membres (propriétaires et gestionnaires). Les locataires n’ont pas besoin d’abonnement.",
      "Les formules et leurs prix en francs CFA (XOF) sont affichés sur la page d’abonnement. Les montants sont fixés côté serveur : aucun prix transmis par votre navigateur n’est pris en compte.",
      "Deux périodes sont proposées : mensuelle (un mois calendaire à compter de l’activation) et annuelle (un an à compter de l’activation).",
    ],
  },
  {
    id: "moyens",
    title: "2. Moyens de paiement externes",
    body: [
      "Les paiements s’effectuent hors application : Wave, Orange Money, autre service mobile money, ou espèces.",
      "Pour le mobile money, la page d’abonnement indique le nom du destinataire, son numéro et les instructions. Pour les espèces, elle indique le point de collecte.",
      "Chaque demande de paiement reçoit une référence unique (ex. NAYA-2026-XXXXXX) : utilisez-la pour que votre versement soit identifiable.",
      "Ne communiquez jamais vos codes PIN, OTP ou mots de passe : Naya ne les demande ni ne les stocke.",
    ],
  },
  {
    id: "verification",
    title: "3. Vérification manuelle",
    body: [
      "Après avoir payé, signalez votre paiement depuis la page d’abonnement (moyen utilisé, référence de transaction, date, note, reçu ou capture en option).",
      "Ce signalement n’est qu’une déclaration : il ne prouve pas le paiement et n’active jamais l’abonnement à lui seul.",
      "Un administrateur vérifie chaque paiement de façon indépendante (relevés des opérateurs), puis confirme ou rejette la demande avec un motif. En cas d’écart entre le montant attendu et le montant reçu, la décision est explicite et tracée.",
      "L’accès est rétabli immédiatement après confirmation du paiement.",
    ],
  },
  {
    id: "renouvellement",
    title: "4. Renouvellement et expiration",
    body: [
      "Renouvelez avant l’échéance depuis la page d’abonnement : la nouvelle période prolonge la date déjà payée. Après échéance, elle démarre à la date de confirmation.",
      "Des rappels sont envoyés 7 jours et 1 jour avant l’expiration. Un renouvellement en cours de vérification n’interrompt jamais une période déjà payée.",
      "Vous pouvez programmer la résiliation en fin de période depuis la page d’abonnement ; l’accès reste actif jusqu’à la fin payée.",
    ],
  },
  {
    id: "grace",
    title: "5. Période de grâce et restrictions d’accès",
    body: [
      "À l’expiration, une période de grâce de 7 jours s’applique : l’accès reste complet et des rappels sont envoyés.",
      "Passé ce délai sans paiement confirmé, l’application est verrouillée : tableau de bord, biens, unités, baux, locataires, prospects, comptabilité, rapports et relances sont bloqués, en lecture comme en écriture. Vous êtes redirigé vers la page d’abonnement.",
      "Restent toujours accessibles : l’abonnement et les formules, les instructions de paiement, le signalement de paiement, le support, l’export de vos données et les demandes de fermeture de compte.",
      "Les loyers versés directement aux propriétaires, hors application, ne sont pas concernés par ces restrictions.",
    ],
  },
  {
    id: "donnees",
    title: "6. Conservation des données, export et fermeture",
    body: [
      "Vos données ne sont jamais supprimées automatiquement en cas d’expiration ou de verrouillage.",
      "Vous pouvez exporter l’intégralité des données de votre agence (organisation, biens, unités, baux, locataires, prospects, membres) au format JSON depuis la page d’abonnement, y compris pendant un verrouillage.",
      "Le propriétaire de l’agence peut demander la fermeture du compte depuis la même page ; un administrateur traite chaque demande.",
    ],
  },
  {
    id: "support",
    title: "7. Support et contact",
    body: [
      "Pour toute question (montant, référence, reçu, accès), utilisez la demande de fermeture/assistance sur la page d’abonnement : un administrateur vous répondra.",
      "En acceptant cette politique lors de l’inscription (case à cocher obligatoire), vous reconnaissez ce fonctionnement. La version acceptée et sa date sont conservées.",
    ],
  },
];

export default function PolicyPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-6">
      <header className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Link href="/" className="hover:underline">
            Naya
          </Link>{" "}
          · Politique de facturation
        </p>
        <h1 className="text-3xl font-bold">Politique d’abonnement et de facturation</h1>
        <p className="text-sm text-muted-foreground">
          Version {BILLING_POLICY_VERSION} — abonnement manuel par agence, sans passerelle de paiement automatique.
        </p>
      </header>
      {sections.map((section) => (
        <section key={section.id} id={section.id} className="flex scroll-mt-6 flex-col gap-2">
          <h2 className="text-xl font-semibold">{section.title}</h2>
          {section.body.map((paragraph, index) => (
            <p key={index} className="text-sm leading-relaxed text-muted-foreground">
              {paragraph}
            </p>
          ))}
        </section>
      ))}
      <footer className="border-t pt-4 text-xs text-muted-foreground">
        <Link className="underline" href="/signup">
          Créer un compte
        </Link>{" "}
        · <Link className="underline" href="/billing/subscription">Page d’abonnement</Link>
      </footer>
    </div>
  );
}
