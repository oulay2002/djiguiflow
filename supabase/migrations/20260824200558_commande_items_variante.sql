-- LE CHOIX DU CLIENT, SUR LA LIGNE DE COMMANDE.
--
-- La caracteristique d'un article — pointure, taille, contenance — etait
-- MONTREE au client depuis peu, mais il n'avait aucun moyen de dire laquelle
-- il voulait. Il commandait « chaussure luminous », le marchand devait
-- rappeler pour demander la pointure, et une commande sur deux se transformait
-- en conversation.
--
-- POURQUOI UNE COLONNE, ET NON UN AJOUT AU NOM.
--
-- Il aurait ete plus court d'ecrire « chaussure luminous (Pointure 39) » dans
-- `nom_produit`. Ce serait casse le decompte de stock : il rattache les lignes
-- de l'assistante A LEUR PRODUIT PAR LE NOM, normalise. Un nom augmente ne
-- correspondrait plus a rien, la ligne deviendrait « introuvable », et le stock
-- du marchand deriverait en silence — exactement le defaut ferme le 20 aout.
--
-- `nom_produit` reste donc l'identite de l'article. Le choix vit a cote.
--
-- NULL VEUT DIRE « CET ARTICLE NE PROPOSAIT PAS DE CHOIX », jamais « le client
-- n'a pas choisi » : la vitrine n'accepte pas de ligne sans valeur quand
-- l'article en propose. Les deux se ressembleraient en base et ne se
-- distingueraient que chez le marchand, au pire moment.

alter table commande_items
  add column if not exists variante text;

comment on column commande_items.variante is
  'Le choix du client sur cette ligne : « Pointure 39 », « Taille M ». NULL = l article n en proposait pas.';
