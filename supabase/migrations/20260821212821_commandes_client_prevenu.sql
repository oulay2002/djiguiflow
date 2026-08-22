-- La preuve que le client a bien ete prevenu.
--
-- POURQUOI CETTE COLONNE. Le 19 aout, 38 % des commandes — celles du canal
-- `app` — n'ont jamais donne lieu a une notification client : le livreur etait
-- prevenu, le gerant aussi, le client jamais. Rien n'a leve d'alerte, parce que
-- rien n'echouait. C'est un silence, pas une erreur.
--
-- On ne peut pas le detecter avec les donnees existantes : toutes les commandes
-- acceptees portent au moins un telephone, donc « injoignable » ne distingue
-- rien. Il faut enregistrer le fait lui-meme.
--
-- CE QU'ELLE VEUT DIRE, EXACTEMENT. Elle porte l'heure a laquelle la chaine a
-- confirme avoir prevenu le client de l'acceptation de sa commande. Pas « le
-- message est arrive », que personne ne peut affirmer — « l'envoi a rendu un
-- verdict positif ».
--
-- NULL VEUT DIRE « ON NE SAIT PAS », JAMAIS « PAS PREVENU ». Toutes les
-- commandes anterieures a cette migration sont NULL sans que cela dise quoi que
-- ce soit sur elles. Le detecteur qui la lit doit donc ignorer tout ce qui
-- precede sa mise en service, sinon il annonce vingt-quatre pannes le premier
-- jour et cesse d'etre lu.
--
-- ELLE N'EST PAS POSEE PAR LE CHEMIN D'ENVOI. Un reessai autour d'un envoi le
-- duplique — un client a deja recu trois fois le meme message. On n'ajoute rien
-- a `envoyerMessage` : le marquage est un appel separe, apres coup, qui ne peut
-- pas provoquer un second envoi s'il echoue.
--
-- ---------------------------------------------------------------------------
-- PROVENANCE. L'instruction ci-dessous est le texte EXACT applique en base
-- (version 20260821212821). Le commentaire d'intention ci-dessus vient d'un
-- fichier `20260821213000_…` qui portait le meme DDL mais n'a JAMAIS ete
-- applique : un quasi-doublon qu'un `supabase db push` aurait tente de rejouer.
-- Il a ete supprime le 22 aout 2026, apres verification que son DDL etait
-- fonctionnellement identique — seule son intention meritait d'etre gardee, et
-- elle est ici.
-- ---------------------------------------------------------------------------

alter table public.commandes
  add column if not exists client_prevenu_le timestamptz;

comment on column public.commandes.client_prevenu_le is
  'Heure ou la chaine a confirme avoir prevenu le client de l''acceptation. NULL = on ne sait pas, jamais « pas prevenu » : les commandes anterieures a la mise en service de ce marquage sont NULL sans que cela les accuse.';
