-- ---------------------------------------------------------------------------
-- La cle d'envoi : refuser une commande en double
-- ---------------------------------------------------------------------------
--
-- LE DEFAUT. Quand la connexion tombe pendant l'envoi, le client ne sait pas
-- si sa commande est arrivee, et il reessaie. Rien ne distinguait ce second
-- envoi d'une nouvelle commande : deux lignes, deux alertes au marchand, deux
-- courses proposees aux livreurs, un stock decompte deux fois.
--
-- LA REGLE. La vitrine envoie une cle tiree au hasard, la meme tant que la
-- commande est la meme (voir `src/lib/cleEnvoi.ts`). La route cherche d'abord
-- une commande portant cette cle ; l'index unique ci-dessous tient la regle
-- quand deux envois arrivent au meme instant, la ou la recherche seule
-- laisserait passer les deux.
--
-- PAR BOUTIQUE. La cle est tiree dans le navigateur : on ne lui demande pas
-- d'etre unique au monde, seulement de ne pas se repeter chez un meme
-- marchand.
--
-- NULL = SANS CLE, ET C'EST PERMIS. Les commandes passees par WhatsApp, par
-- l'assistante ou par un ancien onglet n'en portent pas. L'index est PARTIEL
-- pour cette raison : il ne contraint que les lignes qui en ont une.

alter table public.commandes
  add column if not exists cle_envoi text;

alter table public.commandes
  drop constraint if exists commandes_cle_envoi_forme;
alter table public.commandes
  add constraint commandes_cle_envoi_forme
  check (cle_envoi is null or char_length(cle_envoi) between 32 and 36);

comment on column public.commandes.cle_envoi is
  'Cle tiree par la vitrine pour reconnaitre un second envoi de la meme commande. NULL = commande sans cle (WhatsApp, assistante).';

create unique index if not exists commandes_cle_envoi_unique
  on public.commandes (boutique_id, cle_envoi)
  where cle_envoi is not null;
