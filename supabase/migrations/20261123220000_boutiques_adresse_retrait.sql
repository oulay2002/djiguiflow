-- ---------------------------------------------------------------------------
-- L'adresse ou le client vient chercher sa commande
-- ---------------------------------------------------------------------------
--
-- CE QUI MANQUAIT. Depuis le 26 aout 2026, une boutique peut proposer le
-- retrait (`mode_recuperation`). La vitrine disait alors au client « Vous
-- venez chercher. » — sans jamais dire OU. La fiche ne portait que `zone`, qui
-- vaut souvent « Abidjan » : un quartier au mieux, jamais un lieu. Releve par
-- la critique de la vitrine du 23 novembre 2026, la veille de l'ouverture d'un
-- restaurant qui fait du retrait.
--
-- POURQUOI UNE COLONNE A PART, ET PAS `zone` OU `description`. `zone` est lue
-- comme un quartier par l'annuaire et par les donnees structurees ; y mettre
-- « derriere la pharmacie, portail vert » fausserait les deux. `description`
-- est une phrase de vente, affichee ailleurs et a un autre moment. L'adresse
-- de retrait repond a une seule question, posee a un seul instant : quand le
-- client choisit « Retrait ».
--
-- NULL = NON RENSEIGNEE, ET LA PAGE SE TAIT. Aucune valeur par defaut : une
-- adresse inventee enverrait le client au mauvais endroit, ce qui est pire que
-- de ne rien dire.
--
-- TEXTE LIBRE. Ici une adresse est un repere — « Riviera 2, face a la
-- station, a cote du maquis bleu » — pas un numero dans une rue.

alter table public.boutiques
  add column if not exists adresse_retrait text;

-- Bornee : c'est un champ affiche tel quel sur une page publique.
alter table public.boutiques
  drop constraint if exists boutiques_adresse_retrait_longueur;
alter table public.boutiques
  add constraint boutiques_adresse_retrait_longueur
  check (adresse_retrait is null or char_length(adresse_retrait) <= 200);

comment on column public.boutiques.adresse_retrait is
  'Ou le client vient chercher sa commande (texte libre, repere). NULL = non renseignee : la vitrine n''affiche rien.';

-- LES DROITS PAR COLONNE, SANS QUOI L'ENREGISTREMENT ECHOUE.
-- Depuis `20261122200000`, `authenticated` n'ecrit dans `boutiques` que les
-- colonnes nommees. Une colonne ajoutee sans son `grant` fait refuser TOUT
-- l'enregistrement de « Ma boutique », et pas seulement ce champ : la requete
-- porte la colonne, la base refuse la requete entiere.
grant insert (adresse_retrait) on public.boutiques to authenticated;
grant update (adresse_retrait) on public.boutiques to authenticated;
