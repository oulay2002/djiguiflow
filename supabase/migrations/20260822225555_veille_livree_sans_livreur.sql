-- Une livraison terminee dont on ne sait pas QUI l'a faite.
--
-- POURQUOI CE DETECTEUR EXISTE. Le 22 aout 2026, la voie Telegram
-- n'enregistrait jamais le livreur : le noeud « Refleter dans Supabase » lisait
-- `$json.nom_livreur`, un champ qu'aucun noeud ne produisait, et envoyait donc
-- toujours une chaine vide — que la route traite comme « pas de changement ».
--
-- Sur 25 commandes livrees, 19 portaient un nom : TOUTES venues de
-- l'assignation manuelle au tableau de bord. Aucune acceptation depuis le
-- groupe Telegram n'avait jamais rien enregistre. Le client apprenait qui le
-- livrait, le marchand non.
--
-- Le correctif est pose cote n8n. Ce detecteur existe pour qu'on SACHE s'il
-- tient : sans lui, « nom_livreur se remplira desormais » resterait une
-- affirmation invérifiable, exactement le genre de phrase que cette journee a
-- appris a se méfier.
--
-- Il signalera deux commandes du 21 aout, anterieures au correctif, puis se
-- taira quand elles sortiront de la fenetre de 48 h. Un signalement juste n'est
-- pas du bruit.
--
-- L'index est PARTIEL, comme les quatre autres de la veille : il ne contient
-- que les lignes en etat rompu. Une chaine saine n'y laisse rien, donc il reste
-- minuscule et retrecit quand on repare.
create index if not exists commandes_veille_sans_nom_livreur_idx
  on public.commandes (created_at desc)
  where statut_livraison = 'livre' and nom_livreur is null;
