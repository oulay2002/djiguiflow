-- CE QU'UN CLIENT CHERCHE DANS UNE BOUTIQUE DE VETEMENTS.
--
-- Il ne cherche pas « un article ». Il cherche UNE MARQUE, UNE COULEUR, UNE
-- POINTURE OU UNE TAILLE, et il sait pour qui : un bebe, un enfant, un adulte.
-- Quatre renseignements. La plateforme en tenait deux — la couleur, par les
-- declinaisons, et la taille, par la caracteristique. Les deux autres
-- manquaient, et le client devait ecrire au marchand pour les obtenir.
--
-- LA MARQUE PASSE AVANT LE NOM. C'est la convention de toutes les vitrines de
-- mode, et ce n'est pas une mode : « Nike » dit plus au client que « chaussure
-- luminous ». Sur ces enseignes, la marque se lit AU-DESSUS du nom, en
-- capitales, et c'est par elle qu'on filtre en premier.
--
-- POURQUOI DEUX COLONNES ET NON UNE CATEGORIE.
--
-- `categorie` existe deja et sert au classement du marchand — « chaussures »,
-- « Mode ». Elle repond a « ou est-ce range ». La marque repond a « qui l'a
-- fait », le public a « pour qui c'est ». Trois questions differentes : les
-- fondre dans un champ obligerait le marchand a ecrire « chaussures enfant
-- Nike » et personne ne pourrait plus filtrer sur l'une des trois.
--
-- `public_vise` EST DU TEXTE LIBRE, ET C'EST DELIBERE. L'ecran proposera
-- Bebe, Enfant, Femme, Homme, Mixte — mais rien en base ne s'y adosse. Une
-- liste fermee posee sur une donnee ouverte est un piege que ce depot connait :
-- la categorie de boutique l'a deja montre, ou une valeur absente de la liste
-- proposee vivait tres bien en base. Un marchand qui vend « Fille 2-6 ans »
-- doit pouvoir l'ecrire.
--
-- NULL VEUT DIRE « NON RENSEIGNE », ET LA VITRINE SE TAIT. Jamais « sans
-- marque », jamais « pour tous ». Un restaurant n'a ni marque ni public, et sa
-- carte ne doit pas se couvrir de mentions vides.
--
-- L'index ne porte que sur les articles QUI ONT une marque, et il est cloisonne
-- par boutique : c'est toujours dans un seul catalogue qu'on filtre.

alter table produits
  add column if not exists marque text,
  add column if not exists public_vise text;

comment on column produits.marque is
  'La marque de l article, telle que le client la cherche. NULL = le marchand ne la donne pas, la vitrine se tait.';
comment on column produits.public_vise is
  'Pour qui : Bebe, Enfant, Femme, Homme, Mixte. Texte libre — le marchand nomme son rayon. NULL = non renseigne.';

create index if not exists produits_marque_idx
  on produits (boutique_id, marque)
  where marque is not null;
