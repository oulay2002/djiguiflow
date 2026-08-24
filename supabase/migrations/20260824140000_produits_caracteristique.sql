-- LA CARACTERISTIQUE D'UN ARTICLE : pointure, taille, contenance.
--
-- Un client qui regarde une paire de chaussures veut savoir si elle existe a
-- sa pointure. Il devait ecrire pour le demander, et le marchand repondre a la
-- main — a chaque client, pour chaque article.
--
-- POURQUOI UNE PAIRE GENERIQUE ET NON UNE COLONNE `taille`.
--
-- L'exemple qui a motive ce travail contient deja deux mots pour la meme idee :
-- on dit POINTURE pour une chaussure et TAILLE pour un vetement. Une colonne
-- `taille` obligerait le vendeur de chaussures a ranger sa pointure sous un mot
-- qui n'est pas le sien, et la pharmacie sa contenance sous « taille ».
--
-- Cette plateforme sert des secteurs qu'on ne connait pas d'avance. Le marchand
-- nomme donc lui-meme la caracteristique, et en donne les valeurs.
--
-- POURQUOI PAS UN STOCK PAR VALEUR.
--
-- Ce serait le croisement des coloris et des tailles : un article en 3 coloris
-- et 5 pointures deviendrait quinze lignes a tenir a jour. Rose Monde a vendu
-- trois ensembles en affichant toujours « 12 sur 12 » — le stock d'UNE ligne
-- n'est deja pas tenu. En demander quinze rendrait la donnee moins vraie, pas
-- plus fine.
--
-- Les valeurs sont donc ce qu'elles disent etre : CE QUI EXISTE CHEZ LE
-- MARCHAND, montre au client et repete par l'assistante. Le stock reste au
-- niveau de la ligne, c'est-a-dire du coloris. Un stock par pointure sera un
-- autre chantier, le jour ou un marchand tiendra vraiment cet inventaire.

alter table produits
  add column if not exists attribut_nom text,
  add column if not exists attribut_valeurs text[];

-- NULL VEUT DIRE « CET ARTICLE N'A PAS DE CARACTERISTIQUE », JAMAIS
-- « TAILLE UNIQUE ». Un plat n'a pas de pointure, et lui en inventer une
-- serait le defaut que cette plateforme a deja paye plusieurs fois : une
-- valeur par defaut qui masque une valeur absente.
comment on column produits.attribut_nom is
  'Le nom que le marchand donne a la caracteristique : Pointure, Taille, Contenance. NULL = cet article n en a pas.';
comment on column produits.attribut_valeurs is
  'Les valeurs disponibles, dans l ordre voulu par le marchand. NULL ou vide = aucune a annoncer.';

-- LES DEUX VONT ENSEMBLE OU PAS DU TOUT. Un nom sans valeurs afficherait
-- « Pointure : » suivi de rien ; des valeurs sans nom afficheraient « 38, 39 »
-- sans dire de quoi il s'agit. Les deux moities d'une donnee a moitie saisie se
-- ressemblent a l'ecriture et se voient seulement chez le client.
alter table produits
  drop constraint if exists produits_attribut_complet;

alter table produits
  add constraint produits_attribut_complet check (
    (attribut_nom is null and (attribut_valeurs is null or cardinality(attribut_valeurs) = 0))
    or
    (nullif(btrim(attribut_nom), '') is not null and attribut_valeurs is not null and cardinality(attribut_valeurs) > 0)
  );
