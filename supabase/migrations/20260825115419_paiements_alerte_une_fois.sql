-- ON ALERTE UNE FOIS, PUIS ON SE TAIT.
--
-- Le rattrapage leve des qu'un paiement depasse deux heures, pour reveiller
-- l'exploitant. Un blocage qui ne se resout jamais leve donc a CHAQUE passage :
-- le 25 aout 2026, un seul paiement en attente a produit quarante-deux
-- executions en erreur dans la journee, toutes les quinze minutes.
--
-- Le cout n'est pas le bruit, c'est l'AVEUGLEMENT. Une liste d'executions rouge
-- en permanence ne se lit plus, et la vraie panne du lendemain s'y perd. C'est
-- le meme motif que l'alerte quotidienne « tout va bien », deja ecartee sur la
-- sauvegarde des donnees.
--
-- LE SEUIL OUVRAIT L'ALERTE, RIEN NE LA REFERMAIT. Cette colonne la referme.
--
-- NULL veut dire « jamais signale », et c'est le seul etat qui declenche.
-- L'horodatage n'est pas la pour etre lu par un humain : il est la pour que la
-- ligne CESSE de correspondre au filtre. Il reste consultable, ce qui permet de
-- savoir quand un dossier a ete ouvert sans avoir a fouiller les executions.
--
-- POURQUOI EN BASE ET NON DANS n8n. La memoire statique d'un workflow est
-- perdue si l'execution echoue — et celle-ci echoue precisement quand il y a
-- quelque chose a retenir. Un garde-fou anti-repetition pose dans un noeud qui
-- leve ne filtre jamais rien.
--
-- L'index ne porte que sur les lignes non signalees : ce sont les seules que le
-- balayage interroge, et elles resteront toujours rares.

alter table paiements
  add column if not exists alerte_envoyee_le timestamptz;

comment on column paiements.alerte_envoyee_le is
  'Quand ce paiement bloque a ete signale. NULL = jamais signale. Empeche la repetition : on alerte une fois, puis on se tait.';

create index if not exists paiements_alerte_envoyee_le_idx
  on paiements (alerte_envoyee_le)
  where alerte_envoyee_le is null;
