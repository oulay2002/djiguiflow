-- UNE SEULE ORTHOGRAPHE POUR « LIVREE ».
--
-- `commandes.statut_livraison` n'est tenue par aucune contrainte : n8n y ecrit
-- la valeur que le workflow a produite. La production du 25 aout 2026 en
-- portait donc TROIS pour un seul et meme etat :
--
--     livre    21 commandes   (ecrit depuis le 17 aout)
--     livree    4 commandes   (14 au 17 aout)
--     livrée    2 commandes   (avec accent, le 6 aout)
--
-- Trois lectures comparaient `= 'livre'` a l'egalite stricte. Les six autres
-- lignes leur etaient INVISIBLES — dont pour la veille qui repere les
-- livraisons dont les frais n'ont jamais ete annonces au client, et pour le
-- compteur de courses par livreur, qui avait deja affiche des chiffres faux.
--
-- CETTE MIGRATION NE CHANGE AUCUN FAIT. Les six lignes portaient deja
-- `statut = 'livree'` : la commande etait close, seule son orthographe
-- divergeait. On ne referme rien, on ne rouvre rien — on ecrit la meme chose
-- d'une seule facon.
--
-- ELLE NE SUFFIT PAS, ET C'EST L'ESSENTIEL. Nettoyer l'historique sans fermer
-- la porte laisserait le defaut revenir au prochain chemin qui ecrira
-- autrement. Deux protections l'accompagnent, cote code :
--
--   1. `canoniserStatutLivraison` a l'ECRITURE, dans /api/internal/commandes/
--      livraison — la porte unique par laquelle une livraison se met a jour.
--   2. `VALEURS_LIVREE` a la LECTURE, pour les requetes qui filtrent en base
--      et ne peuvent pas appliquer une expression reguliere.
--
-- La seconde survit a un contournement de la premiere : un import, un script,
-- une correction a la main ici meme.
--
-- LA CONDITION EST DELIBEREMENT ETROITE. `~* '^livr'` ne touche que la famille
-- « livree ». Les autres valeurs — « accepte », « en route », « parti » — sont
-- relues par des workflows que ce depot ne controle pas : les reecrire
-- casserait peut-etre une comparaison invisible d'ici. On ferme la divergence
-- prouvee, sans toucher a ce qu'on ne peut pas verifier.

update commandes
   set statut_livraison = 'livre'
 where statut_livraison is not null
   and statut_livraison <> 'livre'
   and statut_livraison ~* '^livr';
