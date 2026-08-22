-- Frais de livraison, annonces par le LIVREUR au moment ou il prend la course.
--
-- POURQUOI PAS UNE GRILLE PAR ZONE. Le gerant l'a dit le 18 aout : « les frais
-- de livraison sont un parametre delicat qui depend des livreurs et des zones ».
-- Une grille suppose que la plateforme connaisse la distance, le trafic et
-- l'accord passe avec chaque livreur. Elle ne connait rien de tout cela.
--
-- Le livreur, lui, sait. Il le sait au moment precis ou il accepte, et c'est le
-- seul instant ou l'information existe. On la lui demande donc la, plutot que
-- de la calculer a sa place — un tarif calcule faux est pire qu'un tarif
-- absent, comme un point GPS faux est pire que pas de point.
--
-- MONTANT SEPARE DU TOTAL, ET IL DOIT LE RESTER. `total` est ce que le client
-- doit au marchand pour sa nourriture. Les frais vont au livreur. Les additionner
-- rendrait le chiffre d'affaires du marchand faux, et le rapport d'activite
-- avec lui.
--
-- NULL signifie « pas encore annonce », pas « gratuit ». Un client a qui l'on
-- affiche « 0 F » alors que le livreur n'a rien dit se croit livre gratuitement
-- et discute a la porte.

alter table public.commandes
  add column if not exists frais_livraison numeric,
  add column if not exists frais_annonces_le timestamptz;

comment on column public.commandes.frais_livraison is
  'Frais annonces par le livreur a l''acceptation, en FCFA. NULL = pas encore annonce, jamais « gratuit ». Distinct de `total`, qui revient au marchand.';
