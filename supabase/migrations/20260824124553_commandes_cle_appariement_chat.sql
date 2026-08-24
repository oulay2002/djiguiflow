-- LE MEME CLIENT PORTAIT TROIS chat_id, ET SA NOTE SE PERDAIT.
--
-- Mesure du 24 aout 2026 chez Zahara, pour un seul et meme client :
--   2250102918886  11 commandes
--   22502918886    10 commandes
--   0102918886      6 commandes
--
-- Les routes appariaient par egalite stricte. La note envoyee apres livraison
-- ne retrouvait aucune commande, partait a l'assistante, et revenait au client
-- sous la forme d'un nouveau menu. Aucun signal, aucune trace.
--
-- Verifie sur l'execution n8n 3395 : le chiffre AVAIT ete reconnu
-- (note_detectee = 4), c'est la lecture des commandes qui rendait {}.
--
-- ON NE REECRIT PAS chat_id. C'est une ADRESSE D'ENVOI : sur Telegram, c'est
-- par lui qu'on ecrit au client — `canaux.ts` le dit, « pas de normalisation
-- telephonique ici, c'est un chat_id, pas un numero ». L'uniformiser
-- casserait les envois. On tolere donc a la LECTURE, ce qui est de toute
-- facon obligatoire : WhatsApp continuera d'annoncer le numero sous la forme
-- ou il a ete enregistre, et rien ici ne peut l'en empecher.
--
-- HUIT CHIFFRES : avant 2021 un numero ivoirien en comptait huit, la reforme
-- a prefixe un couple d'operateur (01, 05, 07). C'est la part stable de part
-- et d'autre, et les trois formes ci-dessus s'y rejoignent sur 02918886.
--
-- ⚠ LE PRIX, ASSUME : deux numeros qui ne different que par le prefixe
-- d'operateur — 0102918886 et 0702918886 — partagent cette cle. Dans une meme
-- boutique, ils seraient confondus. Le filtre par boutique le borne, et le
-- desordre vient d'une source qu'on ne controle pas.
--
-- LA CLE EST NULLE pour ce qui n'a pas la forme d'un telephone ivoirien : un
-- identifiant Telegram est un entier arbitraire et parfaitement stable, il
-- reste apparie a l'identique et ne peut donc pas etre elargi par erreur.
-- Verifie apres application : 8 commandes Telegram sur 8 ont une cle NULLE.
alter table public.commandes
  add column if not exists chat_cle text
  generated always as (
    case
      when regexp_replace(coalesce(chat_id, ''), '[^0-9]', '', 'g') ~ '^(0|225)'
       and length(regexp_replace(coalesce(chat_id, ''), '[^0-9]', '', 'g')) >= 8
      then right(regexp_replace(coalesce(chat_id, ''), '[^0-9]', '', 'g'), 8)
      else null
    end
  ) stored;

comment on column public.commandes.chat_cle is
  'Les 8 derniers chiffres du chat_id quand il a la forme d''un telephone ivoirien, sinon NULL. Sert a APPARIER un client dont le chat_id a ete enregistre sous plusieurs formes. Jamais a lui ecrire : pour cela, seul chat_id fait foi.';

-- L'appariement est toujours borne a une boutique. L'index suit cet usage.
create index if not exists commandes_boutique_chat_cle_idx
  on public.commandes (boutique_id, chat_cle)
  where chat_cle is not null;
