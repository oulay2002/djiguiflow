-- « abandonnee » n'est pas « annulee », et les confondre couterait la mesure.
--
-- Annulee = quelqu'un a decide d'arreter — le client, ou le marchand.
-- Abandonnee = personne n'a rien decide : la confirmation n'est jamais revenue.
--
-- Le premier est un incident commercial, le second une vente perdue au dernier
-- metre. Les compter ensemble gonflerait les annulations du marchand et
-- effacerait justement ce qu'on cherche a lui montrer.
--
-- La contrainte CHECK refusait la valeur, et l'UPDATE echouait EN SILENCE :
-- la route ne journalisait l'erreur que dans la console et rendait
-- « fermees: 0 » comme si tout allait bien. Constate le 19 aout 2026 au
-- premier essai — d'ou la contrainte corrigee ici ET l'erreur desormais
-- remontee dans la reponse.
alter table public.commandes drop constraint if exists commandes_statut_check;

alter table public.commandes add constraint commandes_statut_check
  check (statut = any (array[
    'panier',
    'en_attente',
    'en_preparation',
    'en_livraison',
    'livree',
    'annulee',
    'abandonnee'
  ]));
