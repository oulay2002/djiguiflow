-- Horaires d'ouverture d'une boutique.
--
-- POURQUOI. Rien n'empechait un client de commander a 3 h du matin. Personne ne
-- repond, il n'a aucune explication, et c'est le RESTAURANT qu'il juge — pas
-- l'heure. Une commande passee hors service ne coute pas seulement une vente :
-- elle coute un client, et sa mauvaise humeur atterrit sur la note de la
-- boutique.
--
-- FORME. Un objet par jour de semaine, en minuscules et sur trois lettres :
--   {"lun": {"ouvre": "11:00", "ferme": "22:00"}, "dim": null, ...}
-- `null` ou jour absent = ferme ce jour-la.
--
-- Une fermeture APRES MINUIT s'ecrit naturellement — {"ouvre":"18:00",
-- "ferme":"02:00"} — et se lit comme telle : c'est le cas courant du maquis,
-- pas une exception.
--
-- NULL SIGNIFIE « TOUJOURS OUVERT », et ce choix est deliberé : les boutiques
-- deja en service n'ont pas d'horaires, et une migration qui les fermerait du
-- jour au lendemain ferait plus de degats que le probleme qu'elle corrige. Le
-- marchand ouvre ses horaires quand il le decide.
--
-- L'heure de reference est celle d'Abidjan (UTC+0, sans heure d'ete), ce qui
-- evite toute conversion.

alter table public.boutiques
  add column if not exists horaires jsonb;

comment on column public.boutiques.horaires is
  'Horaires par jour : {"lun":{"ouvre":"11:00","ferme":"22:00"},"dim":null}. NULL = toujours ouvert. Heure d''Abidjan.';
