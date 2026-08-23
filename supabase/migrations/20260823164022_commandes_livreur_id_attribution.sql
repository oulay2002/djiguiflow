-- QUI A LIVRE ? PERSONNE NE POUVAIT LE DIRE.
--
-- `commandes` ne portait qu'un `nom_livreur` TEXTE, et ce texte est le nom
-- d'affichage Telegram — emojis compris : « Jean Paul🐾🌱SEED ». Aucune clef ne
-- reliait une livraison a une fiche de l'annuaire.
--
-- CE QUE CA PRODUISAIT, MESURE LE 23 AOUT 2026 : la page « Livreurs » du
-- tableau de bord affiche `total_livraisons` et `gain_total`. Ces deux colonnes
-- ne sont ecrites par RIEN — ni route, ni declencheur, ni workflow n8n. Le seul
-- livreur enregistre de la plateforme y lisait « 0 Livraisons — 0F » alors que
-- sa boutique comptait QUINZE livraisons, dont la plupart les siennes.
--
-- Ce n'est pas une fonctionnalite manquante : c'est un CHIFFRE FAUX affiche
-- avec assurance. Un zero par defaut qui masque une donnee absente — le motif
-- exact des defauts silencieux traques depuis le 20 aout.
--
-- ON DELETE SET NULL, ET SURTOUT PAS CASCADE. Un marchand qui retire un livreur
-- de son annuaire ne doit pas effacer l'historique de ses livraisons. La
-- commande garde `nom_livreur`, son instantane texte, et perd seulement le lien.
alter table public.commandes
  add column if not exists livreur_id uuid
    references public.livreurs(id) on delete set null;

comment on column public.commandes.livreur_id is
  'Fiche de l''annuaire du livreur qui a pris cette course, resolue depuis son identifiant Telegram a l''acceptation. NULL = on ne sait pas qui a livre : livreur absent de l''annuaire, ou course anterieure a l''attribution. NULL ne veut jamais dire « personne ».';

-- Partiel : la grande majorite des commandes n'a pas de livreur attribue, et
-- l'index ne sert qu'a compter les courses d'un livreur donne.
create index if not exists commandes_livreur_idx
  on public.commandes (livreur_id)
  where livreur_id is not null;

-- LES DEUX COMPTEURS MORTS S'EN VONT.
--
-- Les laisser en place, c'est garantir que quelqu'un les relira un jour et
-- reaffichera un zero faux. Ils ne contenaient aucune donnee — verifie avant
-- suppression : une seule ligne dans la table, a 0 et 0. Le compte et les gains
-- se calculent desormais depuis `commandes`, la source de verite, qui ne peut
-- pas deriver de sa propre somme.
alter table public.livreurs
  drop column if exists total_livraisons,
  drop column if exists gain_total;
