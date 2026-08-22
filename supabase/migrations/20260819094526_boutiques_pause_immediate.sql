-- Fermeture immediate, decidee dans l'instant et qui se leve toute seule.
--
-- POURQUOI EN PLUS DES HORAIRES. Les horaires disent le regime normal. Le four
-- tombe en panne, le riz est fini, c'est le coup de feu et la cuisine ne suit
-- plus : le marchand a besoin d'arreter MAINTENANT, sans toucher a ses horaires
-- ni les avoir a reconstituer ensuite.
--
-- POURQUOI UNE DATE ET NON UN OUI/NON. Un simple drapeau reste leve : le
-- marchand ferme un mardi soir, oublie, et decouvre le vendredi qu'il n'a rien
-- vendu de la semaine. La panne serait alors CAUSEE par le remede. Une echeance
-- se leve d'elle-meme — au pire il rouvre trop tot, ce qui se corrige en un
-- clic, jamais trop tard.
--
-- NULL, ou une date passee, signifie « pas en pause ». Aucune boutique
-- existante n'est donc affectee.

alter table public.boutiques
  add column if not exists pause_jusqua timestamptz;

comment on column public.boutiques.pause_jusqua is
  'Fermeture exceptionnelle jusqu''a cet instant. NULL ou date passee = ouverte. Se leve seule : un drapeau oublie fermerait la boutique des jours.';
