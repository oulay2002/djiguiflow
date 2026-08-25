-- CE QUE LE CLIENT DEVAIT DEMANDER AU MARCHAND.
--
-- Un client qui decouvre une boutique se pose quatre questions avant de
-- commander : combien de temps, chez moi est-ce livre, comment je paie, y a-t-il
-- un minimum. Aucune ne trouvait de reponse sur la page. Il fallait ecrire au
-- marchand — et beaucoup n'ecrivent pas, ils partent.
--
-- POURQUOI CES REPONSES NE VIENNENT PAS DE L'HISTORIQUE.
--
-- La tentation etait forte : calculer le delai a partir des livraisons passees,
-- comme la vedette se calcule a partir des commandes. Mesure faite sur les 42
-- commandes reelles du 25 aout 2026 : mediane de QUATRE MINUTES entre la
-- commande et le « livre », maximum 502. Ce ne sont pas des livraisons, ce sont
-- des essais ou quelqu'un a clique aussitot. Annoncer « livre en 4 minutes »
-- aurait ete le mensonge de la note calculee, en pire — il porte cette fois sur
-- une promesse que le marchand devra tenir.
--
-- Le delai vient donc du marchand, qui seul le connait. Le jour ou l'historique
-- sera assez fourni et assez propre, il pourra le CONTREDIRE ; il ne peut pas
-- le remplacer aujourd'hui.
--
-- NULL VEUT DIRE « NON RENSEIGNE », ET LA VITRINE SE TAIT.
--
-- Jamais « aucun moyen de paiement », jamais « pas de minimum » par defaut.
-- C'est le motif que cette plateforme a paye plusieurs fois : une valeur par
-- defaut qui masque une donnee manquante. Un minimum a zero se lirait comme un
-- minimum reel, et un tableau de paiements vide comme un refus de payer.
--
-- La contrainte sur le minimum dit la meme chose : NULL ou un montant reel,
-- jamais zero — qui ne serait ni l'un ni l'autre.

alter table boutiques
  add column if not exists delai_livraison text,
  add column if not exists zones_livrees text,
  add column if not exists paiements_acceptes text[],
  add column if not exists commande_minimum integer;

comment on column boutiques.delai_livraison is
  'Delai habituel annonce par le marchand : « 30 a 45 min ». NULL = non renseigne, la vitrine se tait.';
comment on column boutiques.zones_livrees is
  'Les quartiers livres, tels que le marchand les nomme. NULL = non renseigne.';
comment on column boutiques.paiements_acceptes is
  'Moyens de paiement acceptes a la livraison. NULL ou vide = non renseigne, jamais « aucun ».';
comment on column boutiques.commande_minimum is
  'Montant minimum en FCFA. NULL = pas de minimum, ce qui n est PAS zero.';

alter table boutiques
  add constraint boutiques_commande_minimum_positif
  check (commande_minimum is null or commande_minimum > 0);
