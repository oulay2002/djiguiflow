-- UN ARTICLE, PLUSIEURS COLORIS.
--
-- Rose Monde vend des vetements : le meme ensemble existe en blanc, en noir,
-- en rouge. Aujourd'hui chaque coloris est un produit separe, donc quatre
-- cartes identiques sur la vitrine — le client croit voir quatre articles.
--
-- POURQUOI PAS UNE TABLE `variantes`. Chaque coloris a son PROPRE stock, sa
-- propre photo et parfois son propre prix. En faire des lignes de `produits`
-- reliees entre elles laisse fonctionner, SANS UNE LIGNE DE CODE EN PLUS, tout
-- ce qui existe deja : le refus quand c'est epuise, le decompte a la commande,
-- la ligne de commande, et le catalogue que lit l'assistante. Une table separee
-- aurait exige de dupliquer chacune de ces regles.
--
-- Seul l'AFFICHAGE regroupe. C'est un probleme de vitrine, pas de donnees.
alter table public.produits
  add column if not exists groupe  text,
  add column if not exists couleur text;

comment on column public.produits.groupe is
  'Articles partageant ce libelle DANS UNE MEME BOUTIQUE = un seul article en plusieurs coloris. NULL = article simple, affiche seul comme avant.';

comment on column public.produits.couleur is
  'Le coloris de cette declinaison, tel que le client le lira : « blanc », « noir ». Sans groupe, il ne sert a rien.';

-- La vitrine regroupe par (boutique, groupe) a chaque affichage.
create index if not exists produits_groupe_idx
  on public.produits (boutique_id, groupe)
  where groupe is not null;
