-- LE RETRAIT, LA RESERVATION, ET LA LIVRAISON OFFERTE.
--
-- Trois demandes du marchand, une seule migration : elles partagent les memes
-- gardes et se contrediraient si on les posait separement.
--
-- ── POURQUOI LE RETRAIT OUVRE LA PLATEFORME ────────────────────────────────
--
-- `boutiquePrete` exige un groupe de livreurs pour qu'une boutique puisse
-- vendre. Un maquis qui fait uniquement de l'a-emporter n'etait donc pas mal
-- servi : il etait EXCLU. `mode_recuperation` rend cette exigence conditionnelle.
--
-- Le retrait supprime aussi le maillon le plus fragile de la chaine — le
-- dispatch, l'acceptation, la position, les frais. Rien de tout cela n'a de
-- sens quand le client se deplace.
--
-- ── LA RESERVATION EST UNE HEURE, PAS UN OBJET ─────────────────────────────
--
-- « Reserver » ici veut dire commander pour une heure precise, pas reserver une
-- table. C'est le meme panier, le meme stock, le meme quota : on ajoute
-- seulement QUAND le client vient. D'ou un simple `heure_retrait` sur la
-- commande, et non une nouvelle table.
--
-- NULL veut dire « des que pret », jamais « on ne sait pas ».
--
-- ── LES TROIS ETATS DE LA GRATUITE, DANS UN SEUL CHAMP ─────────────────────
--
-- `livraison_offerte_des` :
--
--     NULL   frais annonces par le livreur, qui les encaisse  (comportement actuel)
--     0      livraison toujours offerte
--     N > 0  offerte a partir de N FCFA
--
-- UN SEUL CHAMP, PARCE QUE DEUX SE CONTREDIRAIENT. Un booleen « offerte » plus
-- un seuil permettrait d'ecrire « pas offerte, a partir de 10 000 F » — un etat
-- qui ne veut rien dire et qu'il faudrait arbitrer a chaque lecture.
--
-- Le zero est ici un vrai montant et non un trou : « offerte a partir de 0 F »
-- se lit exactement comme « toujours offerte ». C'est la seule place ou zero et
-- NULL peuvent cohabiter sans ambiguite, parce que zero designe un SEUIL.
--
-- ── CE QUE LA COMMANDE RETIENT ─────────────────────────────────────────────
--
-- `commandes.mode_recuperation` fige le choix du client AU MOMENT DE LA
-- COMMANDE. Sans lui, un marchand qui passerait plus tard de « les deux » a
-- « livraison » ferait basculer tout son historique, et les gardes se
-- mettraient a crier sur des commandes closes depuis des semaines.
--
-- Pour la meme raison, une livraison offerte s'enregistre en
-- `frais_livraison = 0` EXPLICITEMENT, jamais en NULL : zero veut dire
-- « offerte », NULL veut dire « le livreur ne l'a pas encore annonce ». Les
-- confondre est precisement le defaut que ce depot poursuit.
--
-- ── LES DEFAUTS PRESERVENT L'EXISTANT ──────────────────────────────────────
--
-- `mode_recuperation` vaut 'livraison' partout, `livraison_offerte_des` reste
-- NULL : les boutiques deja en service ne changent de comportement en rien.

-- ── Cote BOUTIQUE : ce que le marchand propose ────────────────────────────

alter table boutiques
  add column if not exists mode_recuperation text not null default 'livraison',
  add column if not exists delai_preparation_min integer,
  add column if not exists livraison_offerte_des integer;

alter table boutiques
  drop constraint if exists boutiques_mode_recuperation_connu;
alter table boutiques
  add constraint boutiques_mode_recuperation_connu
  check (mode_recuperation in ('livraison', 'retrait', 'les_deux'));

alter table boutiques
  drop constraint if exists boutiques_delai_preparation_positif;
alter table boutiques
  add constraint boutiques_delai_preparation_positif
  check (delai_preparation_min is null or delai_preparation_min > 0);

alter table boutiques
  drop constraint if exists boutiques_livraison_offerte_positive;
alter table boutiques
  add constraint boutiques_livraison_offerte_positive
  check (livraison_offerte_des is null or livraison_offerte_des >= 0);

comment on column boutiques.mode_recuperation is
  'livraison | retrait | les_deux. Decide si un groupe de livreurs est exige.';
comment on column boutiques.delai_preparation_min is
  'Minutes pour preparer une commande, pour annoncer une heure de retrait. NULL = non renseigne, on n annonce rien.';
comment on column boutiques.livraison_offerte_des is
  'NULL = frais annonces par le livreur. 0 = toujours offerte. N > 0 = offerte a partir de N FCFA.';

-- ── Cote COMMANDE : ce que le client a choisi ──────────────────────────────

alter table commandes
  add column if not exists mode_recuperation text not null default 'livraison',
  add column if not exists heure_retrait timestamptz;

alter table commandes
  drop constraint if exists commandes_mode_recuperation_connu;
alter table commandes
  add constraint commandes_mode_recuperation_connu
  check (mode_recuperation in ('livraison', 'retrait'));

comment on column commandes.mode_recuperation is
  'Ce que le client a choisi POUR CETTE COMMANDE. Un retrait n attend aucun livreur et aucun frais.';
comment on column commandes.heure_retrait is
  'L heure demandee par le client. NULL = des que pret. Ne vaut que pour un retrait.';

-- Les retraits a venir, pour l'ecran du marchand : seules ces lignes sont
-- interrogees, et elles restent rares.
create index if not exists commandes_retrait_a_venir_idx
  on commandes (heure_retrait)
  where mode_recuperation = 'retrait' and heure_retrait is not null;
