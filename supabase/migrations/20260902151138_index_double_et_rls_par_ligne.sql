-- ─────────────────────────────────────────────────────────────────────────────
-- CE QUE LES AVIS DE SUPABASE ONT TROUVE, LE 2 SEPTEMBRE 2026.
--
-- Aucun de ces trois points ne leve, n'echoue ni ne ralentit visiblement
-- aujourd'hui. Ils se paient a l'echelle, et l'echelle arrive : trois marchands
-- se branchent cette semaine.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. DEUX INDEX UNIQUES IDENTIQUES SUR `livreurs` ─────────────────────────
--
-- `livreurs_telegram_unique`  : UNIQUE (boutique_id, telegram_id) WHERE NOT NULL
-- `livreurs_boutique_telegram_unique` : LA MEME CHOSE, mot pour mot.
--
-- HISTOIRE. Le 17 aout, `20260817102429` cree le premier — correctement porte
-- sur le COUPLE, comme son commentaire le dit : « un compte Telegram ne peut
-- etre qu'un seul livreur chez un meme marchand ». Le 20 aout,
-- `20260820132001` recree exactement la meme contrainte sous un nom plus
-- explicite, sans s'apercevoir qu'elle existait deja.
--
-- POURQUOI LE GARDE N'A RIEN VU : `create unique index if not exists` protege
-- LE NOM, pas la contrainte. Deux noms differents, deux index identiques, et
-- aucune erreur. Chaque insertion et chaque mise a jour de `livreurs` en paie
-- deux depuis, et la table en porte deux copies.
--
-- ON GARDE LE MIEUX NOMME. `livreurs_telegram_unique` annonce une unicite
-- GLOBALE du Telegram alors qu'il est borne a la boutique : un futur lecteur —
-- ou une future migration — le croirait sur parole. Or la semantique voulue est
-- bien celle du couple : un livreur peut travailler pour deux marchands, et
-- c'est frequent a Abidjan.
--
-- LA CONTRAINTE N'EST PAS AFFAIBLIE : l'index conserve est identique au mot
-- pres. On retire une copie, pas une garantie.
drop index if exists public.livreurs_telegram_unique;


-- ── 2. `auth.uid()` REEVALUE A CHAQUE LIGNE ─────────────────────────────────
--
-- Trois politiques de lecture appellent `auth.uid()` directement. Postgres le
-- reevalue alors POUR CHAQUE LIGNE examinee, au lieu de le calculer une fois.
-- Enveloppe dans un `select`, il devient un InitPlan : une evaluation, puis une
-- constante.
--
-- C'est invisible sur des tables de quelques centaines de lignes, et cela
-- devient le cout dominant quand `paniers` grossit — or `paniers` grossit avec
-- les VISITES, pas avec les ventes.
--
-- `alter policy` ET NON `drop` PUIS `create` : une politique supprimee un
-- instant laisse la table sans regle de lecture, donc elle refuse TOUT au
-- marchand pendant ce temps. On la modifie en place.
alter policy paniers_lecture_marchand on public.paniers
  using (
    exists (
      select 1 from public.boutiques b
      where b.id = paniers.boutique_id
        and b.user_id = (select auth.uid())
    )
  );

alter policy relances_envoyees_lecture_marchand on public.relances_envoyees
  using (
    exists (
      select 1 from public.boutiques b
      where b.slug = relances_envoyees.boutique
        and b.user_id = (select auth.uid())
    )
  );

alter policy relances_stop_lecture_marchand on public.relances_stop
  using (
    exists (
      select 1 from public.boutiques b
      where b.slug = relances_stop.boutique
        and b.user_id = (select auth.uid())
    )
  );


-- ── 3. UNE CLE ETRANGERE SANS INDEX ─────────────────────────────────────────
--
-- `paniers.commande_id` pointe vers `commandes` sans index de couverture. Deux
-- consequences, et la seconde est la plus couteuse : toute lecture des paniers
-- d'une commande balaie la table, et surtout CHAQUE SUPPRESSION ou mise a jour
-- d'une ligne de `commandes` doit verifier qu'aucun panier ne la reference —
-- donc balayer `paniers` en entier.
--
-- La purge nocturne de conservation supprime des commandes : elle paie ce
-- balayage a chaque ligne.
--
-- PARTIEL, ET LA RAISON N'EST PAS LA REPARTITION DES DONNEES.
--
-- Mesure du 2 septembre 2026 : les trois paniers existants portent TOUS un
-- `commande_id`. L'index partiel ne gagne donc rien aujourd'hui — la clause
-- couvre toute la table.
--
-- Elle est la pour une raison de forme, vraie quelle que soit la repartition :
-- une cle etrangere NULLE ne reference rien, et aucune verification d'integrite
-- ne cherchera jamais ces lignes-la. Les exclure est gratuit et le restera si
-- la colonne se remplit de NULL demain — ce qu'elle peut faire, puisqu'elle est
-- nullable.
create index if not exists paniers_commande_id_idx
  on public.paniers (commande_id)
  where commande_id is not null;


-- ── CE QU'ON NE FAIT PAS, ET POURQUOI ───────────────────────────────────────
--
-- NEUF INDEX SONT SIGNALES « JAMAIS UTILISES ». On n'en supprime AUCUN.
--
-- « Jamais utilise » veut dire « aucune requete ne s'en est encore servie », et
-- non « aucune requete ne s'en servira ». Plusieurs couvrent des chemins qui
-- n'ont pas encore tourne une seule fois en production :
--
--   commandes_sans_position        -- la capture du point client
--   commandes_retrait_a_venir_idx  -- le retrait en boutique
--   demandes_droits_telephone_idx  -- l'ecran des droits
--   livreurs_par_telegram          -- l'acceptation de course par Telegram
--
-- Les supprimer parce qu'ils n'ont pas servi, c'est confondre un compteur a
-- zero avec une absence de besoin — et le defaut se paierait au premier vrai
-- usage, c'est-a-dire cette semaine. On les reevaluera quand la plateforme
-- aura tourne avec de vrais marchands.
--
-- L'extension `pg_net` dans le schema `public` est signalee elle aussi. On n'y
-- touche pas : le declencheur `on_new_commande` appelle `net.http_post` en
-- production, et deplacer une extension sous un declencheur vivant se fait a
-- froid, jamais la semaine d'un lancement.
