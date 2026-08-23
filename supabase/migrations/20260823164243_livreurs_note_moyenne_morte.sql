-- UNE ETOILE A ZERO N'EST PAS UNE ABSENCE DE NOTE : C'EST UNE MAUVAISE NOTE.
--
-- `livreurs.note_moyenne` etait lue a TROIS endroits du tableau de bord — la
-- fiche du livreur et deux fois l'ecran d'assignation — et ecrite par RIEN.
-- Valeur mesuree le 23 aout 2026 sur le seul livreur de la plateforme : 0.
-- L'ecran affichait donc « ★ 0.0 » a un livreur qui n'a jamais demerite.
--
-- C'est plus grave que les deux compteurs supprimes avec elle : un zero de
-- livraisons se lit « il debute », un zero d'etoiles se lit « il est mauvais ».
-- Le marchand pouvait ecarter quelqu'un sur un chiffre que personne n'a calcule.
--
-- POURQUOI ON NE LA REMPLACE PAS PAR UN CALCUL. `commandes.note_client` est
-- l'avis du client sur SA COMMANDE — le plat, l'attente, la livraison
-- confondus. L'attribuer au livreur le ferait payer pour un repas froid. Tant
-- qu'il n'existe pas de note portant sur la LIVRAISON, il n'y a rien a afficher,
-- et ne rien afficher est la seule reponse honnete.
alter table public.livreurs
  drop column if exists note_moyenne;
