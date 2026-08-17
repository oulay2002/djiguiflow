-- Les notifications de livraison reviennent a l'application.
--
-- `on_new_livraison` et `on_update_livraison` postaient vers deux webhooks n8n
-- (`nouvelle-livraison`, `statut-livraison`) qui ne repondent plus que 404 :
-- le livreur n'apprenait pas qu'une course lui revenait, le client n'apprenait
-- pas que sa commande partait ni qu'elle arrivait. L'echec etait mute, la
-- fonction avalant l'exception par un simple `raise warning`.
--
-- Ces deux notifications sont desormais faites par l'application, la ou l'ecran
-- qui declenche l'action peut en rendre compte :
--   /api/dashboard/livreurs/assigner  -> previent le livreur et le client
--   /api/dashboard/livreurs/statut    -> previent le client
--
-- `on_new_commande` est conserve : il n'a pas de doublon applicatif, et c'est
-- le seul point qui attrape une commande quelle que soit sa provenance —
-- vitrine, agent WhatsApp ou Telegram.

drop trigger if exists on_new_livraison on public.livraisons;
drop trigger if exists on_update_livraison on public.livraisons;

drop function if exists public.notify_n8n_new_livraison();
drop function if exists public.notify_n8n_statut_livraison();

-- Rendre visible ce qui restait invisible : c'est en ne voyant pas ce cablage
-- dans le code que le workflow « Assignation Livreur » a ete archive a tort.
comment on function public.notify_n8n_new_commande() is
  'Previent le marchand a chaque nouvelle commande, via le webhook n8n « nouvelle-commande » (workflow « Nouvelle Commande -> WhatsApp », kf1a5WcKWTF7kPC8). Cablage invisible au code applicatif : verifier pg_trigger avant de conclure que ce workflow est orphelin. Secret lu au coffre (vault, n8n_webhook_secret).';

comment on trigger on_new_commande on public.commandes is
  'Seule notification du marchand. Couvre toutes les provenances de commande (vitrine, WhatsApp, Telegram), contrairement au code applicatif qui ne voit que la vitrine.';
