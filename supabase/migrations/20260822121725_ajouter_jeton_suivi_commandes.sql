-- Un jeton imprevisible par commande, pour que les liens de suivi et de
-- confirmation cessent d'etre devinables.
--
-- POURQUOI. `/api/suivi` et `/api/confirmation` n'exigent aucune preuve autre
-- que la reference. Or les references de production ne sont pas
-- imprevisibles : la base porte des compteurs sequentiels (ATT-1000000006) et
-- des formes derivables comme APP-<telephone>-<horodatage unix en secondes>.
-- Connaitre le numero d'un client ramenait une journee a 86 400 essais, pour
-- obtenir son nom et son adresse de domicile — et, par le POST de
-- confirmation, ANNULER sa commande.
--
-- LE DEFAUT FAIT LE TRAVAIL, ET C'EST DELIBERE. Les commandes naissent par
-- plusieurs chemins : la vitrine, l'assistante, n8n. Une valeur par defaut en
-- base donne un jeton a TOUTE insertion, presente ou future, sans qu'aucun
-- chemin de creation ait a le savoir. Un jeton pose par du code aurait manque
-- le jour ou un nouveau chemin apparait.
--
-- `gen_random_uuid()` est natif depuis Postgres 13 : aucune extension requise.
-- Il est VOLATILE, donc l'ajout de colonne evalue le defaut ligne par ligne et
-- remplit les lignes existantes avec des valeurs distinctes. Verifie apres
-- application : 57 lignes, 57 jetons, 57 distincts, 32 caracteres chacun.
--
-- PHASE 1 SUR QUATRE. Cette migration n'exige rien et ne change le
-- comportement d'aucune route : elle se contente de rendre le jeton
-- disponible. Les liens le porteront en phase 2, les routes le toleront en
-- phase 3, et ne l'exigeront qu'en phase 4 — quand le journal aura montre
-- qu'aucun acces legitime n'arrive plus sans lui. Des clients ont en ce moment
-- des liens sans jeton dans WhatsApp, pour des commandes en cours.
alter table public.commandes
  add column if not exists jeton_suivi text
  default replace(gen_random_uuid()::text, '-', '');

-- Ceinture et bretelles : si une ligne echappait au defaut, elle serait
-- servie sans protection.
update public.commandes
   set jeton_suivi = replace(gen_random_uuid()::text, '-', '')
 where jeton_suivi is null;

alter table public.commandes
  alter column jeton_suivi set not null;

-- Unique : deux commandes qui partageraient un jeton se liraient l'une pour
-- l'autre. L'index sert aussi la recherche par jeton, qui sera le chemin
-- normal des routes publiques en phase 4.
create unique index if not exists commandes_jeton_suivi_key
  on public.commandes (jeton_suivi);

comment on column public.commandes.jeton_suivi is
  'Jeton imprevisible porte par les liens de suivi et de confirmation. Ne doit JAMAIS etre renvoye par /api/suivi.';
