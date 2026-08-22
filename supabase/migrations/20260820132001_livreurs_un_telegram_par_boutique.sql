-- UN COMPTE TELEGRAM = UNE FICHE LIVREUR, PAR BOUTIQUE.
--
-- La recherche du livreur qui vient d'accepter une course se fait par
-- `(boutique_id, telegram_id)` avec `.maybeSingle()`. Rien ne garantissait
-- l'unicite de ce couple : deux fiches pour un meme compte — un doublon de
-- saisie suffit — et la lecture rend `null` EN SILENCE. Le client recevrait
-- alors le nom du livreur sans son numero, sans qu'aucune erreur ne le signale.
--
-- Meme famille que le `.maybeSingle()` sur `user_id` qui, le 19 aout, a fait
-- ecrire les reglages d'une boutique chez sa voisine : une lecture qui suppose
-- l'unicite doit etre garantie par la base, pas par l'habitude.
--
-- Les NULL restent multiples : c'est voulu. Un livreur saisi par le marchand
-- mais qui n'a pas encore ouvert son lien d'invitation n'a pas de
-- `telegram_id`, et il peut y en avoir plusieurs dans cet etat.
create unique index if not exists livreurs_boutique_telegram_unique
  on public.livreurs (boutique_id, telegram_id)
  where telegram_id is not null;
