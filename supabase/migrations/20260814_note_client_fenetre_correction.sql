-- Instant de la note client, pour ouvrir une fenetre de correction.
--
-- La premiere note faisait foi sans exception, ce qui punissait la faute de
-- frappe : un client visant 5 et touchant 4 restait avec 4, definitivement.
-- Une heure de battement suffit a rattraper un doigt qui glisse, sans rouvrir
-- la porte qu'on vient de fermer — les boutons de notation restent cliquables
-- indefiniment dans l'historique Telegram, et sans borne on pouvait reecrire
-- une note des mois apres.
--
-- La colonne est ajoutee NULLABLE et sans valeur par defaut, a dessein. Les
-- commandes deja notees avant cette migration n'ont pas d'instant connu : leur
-- `note_heure` reste nulle, et la condition de fenetre est alors fausse. Elles
-- demeurent donc definitives, ce qui est le comportement prudent — leur
-- inventer un horodatage rouvrirait une fenetre de correction sur des notes
-- vieilles de plusieurs semaines.
alter table public.commandes
  add column if not exists note_heure timestamptz;

comment on column public.commandes.note_heure is
  'Instant de la premiere note client. Sert de borne a la fenetre de correction ; nul pour les notes anterieures a la migration, qui sont definitives.';
