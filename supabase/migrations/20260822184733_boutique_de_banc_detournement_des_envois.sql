-- La boutique de banc : eprouver la chaine entiere sans reveiller personne.
--
-- LE TROU QU'ELLE COMBLE. `essai = true` coupe la chaine AVANT n8n : le
-- declencheur Postgres se tait, et `commander/route.ts` saute les deux appels
-- webhook. C'est ce qui rend le banc multi-marchand supportable — aucun livreur
-- n'est appele. Mais la consequence est que la MOITIE du parcours, celle qui
-- atteint reellement le client et le livreur, n'est exercee par rien : sa
-- derniere execution datait du 19 aout 2026, a la main, sur une boutique
-- factice mal configuree.
--
-- Un test dangereux ne se fait pas. Un test qu'on ne fait pas ne protege rien.
--
-- CE QUE FAIT CETTE COLONNE. Quand `banc_telegram_id` est renseigne, TOUT
-- message sortant de cette boutique est detourne vers ce salon Telegram, quel
-- que soit le canal demande, prefixe du canal et du destinataire reels. La
-- chaine s'execute donc en entier — declencheur, webhooks n8n, dispatch,
-- confirmation client — et le seul changement est le dernier metre : au lieu
-- d'un vrai livreur et d'un vrai client, tout arrive dans le salon de veille,
-- ou on le LIT.
--
-- POURQUOI DANS `envoyerMessage` ET NULLE PART AILLEURS. C'est la sortie
-- unique : verifie le 22 aout 2026 en relisant les connexions de « Envoyer
-- reponse client », dont les noeuds Telegram et wasender directs n'ont AUCUNE
-- connexion entrante — ce sont des branches mortes d'avant /api/canaux/envoyer.
-- Un detournement pose la couvre le marchand, le livreur et le client d'un seul
-- geste. Pose ailleurs, il en oublierait un.
--
-- POURQUOI UN IDENTIFIANT ET PAS UN BOOLEEN. Un booleen `banc` pose par erreur
-- sur une vraie boutique detournerait ses messages sans qu'on sache ou. Ici la
-- destination est ECRITE : on lit la ligne et on sait exactement qui recoit. Et
-- une vraie boutique n'a aucune raison de porter un identifiant de salon.
alter table public.boutiques
  add column if not exists banc_telegram_id text;

comment on column public.boutiques.banc_telegram_id is
  'Salon Telegram vers lequel TOUT message de cette boutique est detourne, canal et destinataire reels en prefixe. Renseigne uniquement sur les boutiques de banc : NULL sur toute boutique reelle. Voir envoyerMessage dans src/lib/canaux.ts.';
