-- Deux defauts trouves en eprouvant la charge a vingt marchands.
--
-- =========================================================================
-- 1. `produits` N'AVAIT AUCUNE CLE ETRANGERE.
-- =========================================================================
--
-- `produits.boutique_id` etait un uuid nu. Rien ne garantissait qu'un produit
-- appartienne a une boutique existante, et supprimer une boutique laissait ses
-- articles derriere elle, pour toujours. Un produit orphelin a ete trouve en
-- production le 22 aout 2026 — il a survecu a la boutique qui l'avait cree.
--
-- Toutes les autres tables filles CASCADENT deja : `livreurs`, `paniers`,
-- `push_subscriptions`, `notification_settings`, `relances_*`.
-- `commande_items` porte meme deux cles. `produits` — la table qui dit ce que
-- chaque marchand VEND — etait la seule sans lien impose.
--
-- CASCADE et non NO ACTION, contrairement a `commandes` : un article n'est pas
-- une piece comptable. La commande garde son historique par ses `commande_items`,
-- qui recopient le libelle et le prix au moment de la vente.
alter table public.produits
  add constraint produits_boutique_id_fkey
  foreign key (boutique_id) references public.boutiques (id) on delete cascade;

-- =========================================================================
-- 2. LA VEILLE BALAYAIT LA TABLE ENTIERE, QUATRE FOIS TOUTES LES 15 MINUTES.
-- =========================================================================
--
-- Mesure a 23 boutiques et 6 057 commandes : `Seq Scan on commandes`, 6 057
-- lignes lues pour en garder 50. Trois millisecondes aujourd'hui — mais
-- `commandes` ne retrecit JAMAIS, et ce balayage tourne 96 fois par jour.
--
-- L'index existant `commandes_stock_a_decompter_idx` commence par
-- `boutique_id` : il sert l'acces PAR MARCHAND, pas ce balayage transverse
-- ajoute le 22 aout avec « Veille des chaines ». Le planificateur ne pouvait
-- pas s'en servir pour un tri par date toutes boutiques confondues.
--
-- CES INDEX SONT AUSSI PETITS QUE LE PROBLEME QU'ILS SURVEILLENT. Chacun est
-- partiel et ne contient que les lignes en etat ROMPU — une chaine saine en
-- laisse zero. Ils coutent donc presque rien a maintenir, et ils disparaissent
-- d'eux-memes a mesure que les chaines se reparent.
--
-- Mesure apres : `Index Scan`, 9 blocs au lieu de 142, 0,196 ms au lieu de
-- 2,99 — et le cout ne suit plus la taille de la table, il suit le nombre de
-- chaines rompues.
create index if not exists commandes_veille_sans_livreur_idx
  on public.commandes (created_at)
  where statut = 'en_attente' and confirmation_statut = 'confirmee' and nom_livreur is null;

create index if not exists commandes_veille_sans_frais_idx
  on public.commandes (created_at desc)
  where statut_livraison = 'livre' and frais_livraison is null;

create index if not exists commandes_veille_stock_idx
  on public.commandes (created_at desc)
  where statut = 'livree' and stock_decremente_le is null;

create index if not exists commandes_veille_paniers_idx
  on public.commandes (created_at)
  where statut = 'panier';
