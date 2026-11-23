-- Une boutique peut etre EN LIGNE sans etre PROPOSEE AUX MOTEURS.
--
-- `actif = false` faisait deja les deux a la fois : la boutique sortait de
-- l'annuaire ET de l'indexation. Il manquait le cas du milieu, et il existe :
-- `zahara` est une boutique de demonstration. Elle doit rester ouverte, prendre
-- des commandes d'essai, apparaitre dans l'annuaire — et ne PAS etre presentee
-- par Google, Bing ou un assistant comme un vrai restaurant d'Abidjan. Depuis
-- que chaque vitrine declare son menu, ses prix et son telephone aux moteurs
-- (23 novembre 2026), une boutique factice indexee serait un faux commerce,
-- avec une fiche complete.
--
-- VRAI PAR DEFAUT : toute boutique existante et toute boutique a venir reste
-- indexable. Le drapeau ne se pose que par l'exploitant — la colonne n'est pas
-- dans les droits d'ecriture accordes aux marchands (migration
-- 20261122200000), ce qui est voulu : un marchand ne se retire pas des moteurs
-- par accident, et ne s'y remet pas tout seul non plus.

alter table public.boutiques
  add column if not exists indexable boolean not null default true;

comment on column public.boutiques.indexable is
  'false = la vitrine reste en ligne mais se declare noindex et sort du sitemap et de llms.txt. Reserve a l''exploitant.';

update public.boutiques set indexable = false where slug = 'zahara';
