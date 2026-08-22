-- LE PANIER ABANDONNE SUR WHATSAPP EXISTE DEJA EN BASE.
--
-- L'assistante ECRIT la commande avant de demander confirmation. Un panier
-- abandonne n'est donc pas un fantome : c'est une ligne dont la reponse du
-- client n'est jamais revenue. Rien a instrumenter, seulement a distinguer.
--
-- `confirmation_statut` valait NULL dans deux cas opposes : « on a demande, il
-- n'a pas repondu » et « cette commande ne passe pas par la confirmation ».
-- Le marqueur positif 'demandee' separe les deux — sans lui, tout le reste
-- devinerait. Aucune contrainte n'est posee sur la colonne : c'est du texte
-- libre depuis toujours, et la verrouiller maintenant casserait les valeurs
-- existantes qu'on ne connait pas toutes.

-- Quand la relance est partie. NULL = jamais relancee.
--
-- La trace vit sur LA COMMANDE et non dans `relances_envoyees` : celle-ci
-- compte par client, alors qu'ici il faut garantir qu'une commande donnee n'est
-- jamais relancee deux fois. Un client qui abandonne deux paniers doit pouvoir
-- etre rappele pour chacun.
alter table public.commandes
  add column if not exists relance_le timestamptz;

comment on column public.commandes.relance_le is
  'Instant de la relance du panier abandonne. NULL = jamais relancee. Empeche la double relance d une meme commande.';

-- La tache passe toutes les 15 minutes et ne doit lire que le peu qui la
-- concerne : les commandes en attente d une confirmation demandee.
create index if not exists commandes_confirmation_attente_idx
  on public.commandes (confirmation_statut, created_at)
  where confirmation_statut = 'demandee';
