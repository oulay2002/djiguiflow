-- QUAND UNE TACHE S'EST EXECUTEE POUR DE BON.
--
-- ── CE QUI A MOTIVE CETTE TABLE ────────────────────────────────────────────
--
-- Le 27 aout 2026 au matin, la sauvegarde des donnees N'AVAIT PAS TOURNE. La
-- derniere remontait a la veille 5 h 04. GitHub sacrifie les taches planifiees
-- quand sa plateforme est chargee — la file etait deja restee bloquee trente
-- minutes la veille au soir.
--
-- PERSONNE N'AURAIT ETE PREVENU. Le workflow alerte quand la sauvegarde
-- ECHOUE ; il ne peut rien dire quand elle NE DEMARRE PAS. Une tache qui ne
-- tourne jamais est muette, et ce qu'elle protege ici est la seule copie des
-- commandes, des produits, des comptes et des images.
--
-- On aurait pu perdre plusieurs nuits sans le savoir.
--
-- ── POURQUOI LA SURVEILLANCE NE VIT PAS DANS GITHUB ────────────────────────
--
-- Poser le controle dans une tache planifiee GitHub reviendrait a confier la
-- surveillance a exactement ce qui vient de defaillir. C'est le meme
-- raisonnement que la memoire statique de n8n, perdue quand l'execution echoue
-- — un garde-fou pose dans ce qui casse ne garde rien.
--
-- Le pointage vit donc en base, ecrit par la tache, et relu par une sonde qui
-- tourne AILLEURS : `/api/internal/sante`, appelee toutes les quinze minutes
-- par n8n depuis le VPS.
--
-- ── ECRIT APRES, JAMAIS AVANT ──────────────────────────────────────────────
--
-- `dernier_le` marque la fin d'un passage REUSSI. Un pointage pose au
-- demarrage mentirait exactement quand il ne faut pas : la tache aurait
-- commence, echoue, et la sonde la croirait a jour.
--
-- ── ELLE NE REGARDE PERSONNE ───────────────────────────────────────────────
--
-- Aucune donnee de marchand ni de client : une clef de tache et une date. RLS
-- activee et droits retires a `anon` et `authenticated` par principe — ce qui
-- n'a aucune raison d'etre lu depuis un navigateur ne doit pas pouvoir l'etre.
-- Seul `service_role`, cote serveur, y accede.

create table if not exists pointages (
  cle text primary key,
  dernier_le timestamptz not null default now(),
  detail text
);

comment on table pointages is
  'Quand une tache s est executee POUR DE BON. Sert a detecter une tache qui NE TOURNE PLUS : une tache qui echoue crie toute seule, une tache qui ne demarre jamais est muette.';
comment on column pointages.cle is
  'Identifiant de la tache : sauvegarde_donnees, sauvegarde_schema…';
comment on column pointages.dernier_le is
  'Fin du dernier passage REUSSI. Ecrit apres coup, jamais avant : un pointage pose au demarrage mentirait sur un echec.';

alter table pointages enable row level security;

revoke all on table pointages from anon, authenticated;
