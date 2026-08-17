-- Le point de livraison exact, envoye par le client.
--
-- A Abidjan l'adresse est un repere, pas une rue : « akouedo », « akouedo,
-- terrain de basket », « pharmacie livie ». Un lien Google Maps bati sur ce
-- texte ouvre le quartier, jamais la porte. Le geocodage automatique n'est pas
-- une reponse non plus : sur ce type d'adressage il rend souvent un point faux,
-- et un point faux est PIRE que pas de point — le livreur lui fait confiance et
-- se perd avec assurance.
--
-- Seul le client sait ou il habite. WhatsApp et Telegram savent tous deux
-- envoyer une position en piece jointe : c'est cette position que l'on range
-- ici, telle quelle.

alter table public.commandes
  add column if not exists latitude          double precision,
  add column if not exists longitude         double precision,
  add column if not exists position_recue_le timestamptz;

comment on column public.commandes.latitude is
  'Point de livraison envoye par le client. Jamais deduit d''une adresse texte : un point calcule serait cru par le livreur.';

-- Retrouver les commandes qui attendent encore leur position, pour relancer
-- ou pour mesurer le taux d'adoption.
create index if not exists commandes_sans_position
  on public.commandes (boutique_id, created_at desc)
  where latitude is null;
