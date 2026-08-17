-- Le registre Marchands porte une config par marchand (cf. dossier v10.3) :
-- un seul webhook generique, c'est la config qui change par boutique.
alter table public.boutiques
  add column if not exists sheet_commandes text,
  add column if not exists sheet_menu text,
  add column if not exists groupe_livreurs text;

comment on column public.boutiques.sheet_commandes is
  'Onglet Google Sheets des commandes de ce marchand (ex. Commandes_Zahara). NULL = repli sur les onglets par defaut.';
comment on column public.boutiques.sheet_menu is
  'Onglet Google Sheets du menu de ce marchand (ex. Menu_RoseMonde). NULL = repli sur les onglets par defaut.';
comment on column public.boutiques.groupe_livreurs is
  'Identifiant du groupe livreurs (JID WhatsApp / chat Telegram) alerte pour ce marchand.';

-- Zahara garde exactement sa configuration actuelle : on fige le comportement
-- en vigueur au lieu de le deduire, pour ne rien casser.
update public.boutiques
   set sheet_commandes = coalesce(sheet_commandes, 'Commandes_Zahara'),
       sheet_menu      = coalesce(sheet_menu, 'Menu')
 where slug = 'zahara';
