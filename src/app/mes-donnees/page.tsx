'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ShieldCheck, Trash2, TriangleAlert } from 'lucide-react';
import { Bouton, LienRetour } from '@/components/ui/Bouton';

/**
 * L'écran des droits : ce qu'on détient sur vous, et comment le faire partir.
 *
 * ── LA DÉCISION QUI TIENT TOUT L'ÉCRAN ─────────────────────────────────────
 *
 * On ne demande PAS « entrez votre numéro ». Ce serait la forme évidente, et
 * ce serait une fuite : un numéro de téléphone n'est pas un secret, n'importe
 * qui pourrait taper celui d'un voisin et lire son adresse de domicile. On
 * demande donc la preuve qu'on demande déjà pour suivre une commande — le lien
 * reçu, ou une référence plus quatre chiffres. Le numéro, lui, est LU sur la
 * commande prouvée.
 *
 * La page l'explique au client, en une phrase : sans cela, la question « pourquoi
 * me demandez-vous une référence, je veux juste voir mes données ? » n'aurait
 * pas de réponse visible, et l'écran passerait pour tatillon au lieu de
 * prudent.
 *
 * ── CE QU'ON AFFICHE AVANT LE BOUTON ROUGE ─────────────────────────────────
 *
 * Les limites. Ce que l'effacement n'atteint pas — les messages déjà reçus sur
 * son téléphone, la copie chez le marchand — se lit AVANT de décider, pas
 * après. Une personne qui clique en croyant que tout disparaît et qui découvre
 * ensuite le contraire aurait raison de se sentir trompée.
 */

type Traitement = {
  cle: string;
  nom: string;
  donnees: string[];
  finalite: string;
  conservation: string;
  destinataires: string[];
  effacement: 'anonymise' | 'supprime' | 'garde';
  pourquoi?: string;
};

type Commande = {
  reference: string;
  date: string | null;
  boutique: string;
  total: number | null;
  statut: string | null;
  close: boolean;
  detenu: string[];
};

type Dossier = {
  /**
   * Vrai quand la commande qui a servi de preuve est DÉJÀ anonymisée.
   *
   * C'est le geste le plus probable après un effacement : la personne rouvre
   * le lien qu'elle garde dans son message. Lui répondre « réessayez dans un
   * instant » serait lui mentir sur l'état du service, et l'inviter à
   * recommencer sans fin.
   */
  efface?: boolean;
  numero: string | null;
  commandes: Commande[];
  paniers: number;
  relances: number;
  avisLivraison: number;
  refusDemarchage: string[];
  demandesAnterieures: { type: string; date: string | null; statut: string }[];
  traitements: Traitement[];
  horsDePortee: { quoi: string; pourquoi: string }[];
};

type Bilan = {
  commandesAnonymisees: number;
  paniersSupprimes: number;
  relancesSupprimees: number;
  avisRetires: number;
  commandesEnCours: number;
  refusEnregistres: number;
};

const CADRE = 'border border-nuit-900/12 bg-white/70 p-5';

function dateLisible(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

function Ecran() {
  const params = useSearchParams();
  const refUrl = (params.get('ref') || '').trim();
  const jetonUrl = (params.get('t') || '').trim();

  const [ref, setRef] = useState(refUrl);
  const [tel4, setTel4] = useState('');
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);

  const [demandeEffacement, setDemandeEffacement] = useState(false);
  const [efface, setEfface] = useState<{ complet: boolean; bilan: Bilan } | null>(null);
  const [effacementEnCours, setEffacementEnCours] = useState(false);

  const charger = useCallback(async (r: string, jeton: string, chiffres: string) => {
    setChargement(true);
    setErreur('');
    try {
      const res = await fetch('/api/mes-donnees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: r.trim(), t: jeton || undefined, tel4: chiffres || undefined }),
      });
      const corps = (await res.json().catch(() => null)) as (Dossier & { error?: string }) | null;
      if (res.ok && corps) {
        setDossier(corps);
      } else {
        setDossier(null);
        setErreur(
          String(corps?.error ?? '')
          || 'Nous n’avons pas pu vérifier qu’il s’agit bien de vous.',
        );
      }
    } catch {
      setErreur('La connexion a échoué. Réessayez dans un instant.');
    } finally {
      setChargement(false);
    }
  }, []);

  // Le lien reçu dans le message porte déjà la référence et le jeton : on ouvre
  // le dossier sans rien demander. Celui qui arrive les mains vides voit le
  // formulaire.
  useEffect(() => {
    if (refUrl && jetonUrl) void charger(refUrl, jetonUrl, '');
  }, [refUrl, jetonUrl, charger]);

  const effacer = useCallback(async () => {
    setEffacementEnCours(true);
    setErreur('');
    try {
      const res = await fetch('/api/mes-donnees/effacement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ref: ref.trim() || refUrl,
          t: jetonUrl || undefined,
          tel4: tel4 || undefined,
          confirme: true,
        }),
      });
      const corps = (await res.json().catch(() => null)) as
        | { ok?: boolean; complet?: boolean; bilan?: Bilan; error?: string }
        | null;
      if (res.ok && corps?.bilan) {
        setEfface({ complet: corps.complet === true, bilan: corps.bilan });
        setDossier(null);
        setDemandeEffacement(false);
      } else {
        setErreur(String(corps?.error ?? '') || 'L’effacement n’a pas abouti.');
      }
    } catch {
      setErreur('La connexion a échoué. Vos données n’ont pas été touchées.');
    } finally {
      setEffacementEnCours(false);
    }
  }, [ref, refUrl, jetonUrl, tel4]);

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <LienRetour href="/">Retour à l’accueil</LienRetour>

      <h1 className="mt-6 font-display text-3xl text-nuit-900">Vos données</h1>
      <p className="mt-2 text-chaux-600" style={{ fontSize: 'var(--text-chapeau)' }}>
        Voyez ce que DjiguiFlow détient à votre sujet, pourquoi, et pendant combien de
        temps. Vous pouvez en demander l’effacement.
      </p>

      {efface && <ApresEffacement etat={efface} />}

      {!dossier && !efface && (
        <section className={`mt-8 ${CADRE}`}>
          <h2 className="font-display text-xl text-nuit-900">Prouvez que c’est bien vous</h2>
          {/*
            POURQUOI CETTE EXPLICATION EST OBLIGATOIRE À L'ÉCRAN. Sans elle, le
            client se demande pourquoi on lui réclame une référence alors qu'il
            veut « juste voir ses données », et l'écran passe pour tatillon. La
            vraie raison le rassure : c'est SA protection qu'on applique.
          */}
          <p className="mt-2 text-sm text-chaux-600">
            Nous ne demandons pas seulement votre numéro : n’importe qui pourrait taper
            celui d’un voisin et lire son adresse. Utilisez le lien reçu dans votre message
            de commande — ou, si vous l’avez perdu, la référence d’une de vos commandes et
            les quatre derniers chiffres de votre numéro.
          </p>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-nuit-900">Référence de commande</span>
              <input
                value={ref}
                onChange={(e) => setRef(e.target.value)}
                placeholder="ZH-1042"
                className="mt-1 w-full border border-nuit-900/20 bg-white px-3 py-2 font-mono text-sm text-nuit-900"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-nuit-900">
                4 derniers chiffres de votre numéro
              </span>
              <input
                value={tel4}
                onChange={(e) => setTel4(e.target.value.replace(/\D/g, '').slice(0, 4))}
                inputMode="numeric"
                placeholder="0405"
                className="mt-1 w-full border border-nuit-900/20 bg-white px-3 py-2 font-mono text-sm text-nuit-900"
              />
            </label>
          </div>

          <div className="mt-5">
            <Bouton
              variante="action"
              onClick={() => void charger(ref, jetonUrl, tel4)}
              disabled={chargement || !ref.trim()}
              chargement={chargement}
            >
              Voir mes données
            </Bouton>
          </div>

          {erreur && (
            <p className="mt-4 flex items-start gap-2 text-sm text-bissap-600">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>{erreur}</span>
            </p>
          )}
        </section>
      )}

      {dossier?.efface && (
        <section className="mt-8 border border-accent-200 bg-accent-50 p-5">
          <h2 className="flex items-center gap-2 font-display text-xl text-nuit-900">
            <ShieldCheck className="size-5 text-accent-600" aria-hidden />
            Ces données ont déjà été effacées
          </h2>
          <p className="mt-2 text-sm text-nuit-900">
            Cette commande ne porte plus ni nom, ni téléphone, ni adresse. Seuls le montant
            et la date subsistent, sans lien avec vous, pour la comptabilité du marchand.
          </p>
        </section>
      )}

      {dossier && !dossier.efface && (
        <>
          <section className={`mt-8 ${CADRE}`}>
            <p className="flex items-center gap-2 text-sm text-chaux-600">
              <ShieldCheck className="size-4 text-accent-600" aria-hidden />
              Dossier de la personne joignable au <strong className="font-mono">{dossier.numero}</strong>
            </p>

            <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Compteur libelle="Commandes" valeur={dossier.commandes.length} />
              <Compteur libelle="Paniers non validés" valeur={dossier.paniers} />
              <Compteur libelle="Relances reçues" valeur={dossier.relances} />
              <Compteur libelle="Avis de livraison" valeur={dossier.avisLivraison} />
            </dl>

            {dossier.refusDemarchage.length > 0 && (
              <p className="mt-4 text-sm text-chaux-600">
                Vous avez demandé à ne plus être démarché chez{' '}
                {dossier.refusDemarchage.join(', ')}. Ce refus est conservé, et il le
                restera : c’est lui qui nous empêche de vous écrire à nouveau.
              </p>
            )}
          </section>

          {dossier.commandes.length > 0 && (
            <section className={`mt-6 ${CADRE}`}>
              <h2 className="font-display text-xl text-nuit-900">Vos commandes</h2>
              <ul className="mt-4 divide-y divide-nuit-900/10">
                {dossier.commandes.map((c) => (
                  <li key={c.reference} className="py-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-mono text-sm text-nuit-900">{c.reference}</span>
                      <span className="text-sm text-chaux-600">
                        {c.boutique} · {dateLisible(c.date)}
                        {!c.close && ' · en cours'}
                      </span>
                    </div>
                    {c.detenu.length > 0 && (
                      <p className="mt-1 text-sm text-chaux-600">
                        Nous y conservons {c.detenu.join(', ')}.
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className={`mt-6 ${CADRE}`}>
            <h2 className="font-display text-xl text-nuit-900">
              Ce que nous gardons, et pendant combien de temps
            </h2>
            <ul className="mt-4 space-y-5">
              {dossier.traitements.map((t) => (
                <li key={t.cle}>
                  <h3 className="font-medium text-nuit-900">{t.nom}</h3>
                  <p className="mt-1 text-sm text-chaux-600">{t.finalite}</p>
                  <p className="mt-1 text-sm text-chaux-600">
                    <strong className="font-medium text-nuit-900">Données :</strong>{' '}
                    {t.donnees.join(' · ')}
                  </p>
                  <p className="mt-1 text-sm text-chaux-600">
                    <strong className="font-medium text-nuit-900">Durée :</strong>{' '}
                    {t.conservation}
                  </p>
                  <p className="mt-1 text-sm text-chaux-600">
                    <strong className="font-medium text-nuit-900">Qui y a accès :</strong>{' '}
                    {t.destinataires.join(' · ')}
                  </p>
                  {t.effacement === 'garde' && t.pourquoi && (
                    <p className="mt-1 text-sm text-mangue-700">
                      Conservé même après un effacement — {t.pourquoi}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-6 border border-bissap-200 bg-bissap-50 p-5">
            <h2 className="font-display text-xl text-nuit-900">Demander l’effacement</h2>

            <p className="mt-2 text-sm text-nuit-900">
              Vos commandes terminées perdent votre nom, votre téléphone et votre adresse.
              Le montant et la date restent, sans vous : c’est la comptabilité du marchand,
              qu’il doit conserver.
            </p>

            <div className="mt-4 border-t border-bissap-200 pt-4">
              <h3 className="text-sm font-medium text-nuit-900">
                Ce que cet effacement ne peut pas atteindre
              </h3>
              <ul className="mt-2 space-y-2">
                {dossier.horsDePortee.map((h) => (
                  <li key={h.quoi} className="text-sm text-chaux-600">
                    <strong className="font-medium text-nuit-900">{h.quoi}</strong> —{' '}
                    {h.pourquoi}
                  </li>
                ))}
              </ul>
            </div>

            {dossier.commandes.some((c) => !c.close) && (
              <p className="mt-4 text-sm text-mangue-700">
                Une de vos commandes est encore en cours : elle n’est pas touchée, sans quoi
                le livreur n’aurait plus ni nom ni adresse. Elle sera effacée d’elle-même dès
                qu’elle sera terminée — vous n’aurez rien à redemander.
              </p>
            )}

            {!demandeEffacement ? (
              <div className="mt-5">
                <Bouton variante="calme" onClick={() => setDemandeEffacement(true)}>
                  Je veux effacer mes données
                </Bouton>
              </div>
            ) : (
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <Bouton
                  variante="action"
                  onClick={() => void effacer()}
                  chargement={effacementEnCours}
                  disabled={effacementEnCours}
                >
                  <Trash2 className="size-4" aria-hidden />
                  Oui, effacer définitivement
                </Bouton>
                <Bouton variante="fantome" onClick={() => setDemandeEffacement(false)}>
                  Annuler
                </Bouton>
              </div>
            )}

            {erreur && (
              <p className="mt-4 flex items-start gap-2 text-sm text-bissap-600">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>{erreur}</span>
              </p>
            )}
          </section>
        </>
      )}
    </main>
  );
}

function Compteur({ libelle, valeur }: { libelle: string; valeur: number }) {
  return (
    <div>
      <dt className="text-sm text-chaux-600">{libelle}</dt>
      <dd className="font-display text-2xl text-nuit-900">{valeur}</dd>
    </div>
  );
}

function ApresEffacement({ etat }: { etat: { complet: boolean; bilan: Bilan } }) {
  const { bilan, complet } = etat;
  return (
    <section className="mt-8 border border-accent-200 bg-accent-50 p-5">
      <h2 className="flex items-center gap-2 font-display text-xl text-nuit-900">
        <ShieldCheck className="size-5 text-accent-600" aria-hidden />
        C’est fait
      </h2>
      <ul className="mt-3 space-y-1 text-sm text-nuit-900">
        <li>{bilan.commandesAnonymisees} commande(s) : votre identité en a été retirée.</li>
        <li>{bilan.paniersSupprimes} panier(s) supprimé(s).</li>
        <li>{bilan.relancesSupprimees} trace(s) de relance supprimée(s).</li>
        {bilan.avisRetires > 0 && <li>{bilan.avisRetires} commentaire(s) de livraison retiré(s).</li>}
      </ul>

      {!complet && (
        <p className="mt-3 text-sm text-mangue-700">
          {bilan.commandesEnCours} commande(s) sont encore en cours et n’ont pas été
          touchées. Elles le seront automatiquement dès qu’elles seront terminées.
        </p>
      )}

      <p className="mt-3 text-sm text-chaux-600">
        Nous gardons uniquement votre numéro sur une liste de refus, pour ne plus jamais
        vous démarcher. C’est le strict nécessaire pour tenir cette promesse.
      </p>
    </section>
  );
}

export default function PageMesDonnees() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-3xl px-5 py-10" />}>
      <Ecran />
    </Suspense>
  );
}
