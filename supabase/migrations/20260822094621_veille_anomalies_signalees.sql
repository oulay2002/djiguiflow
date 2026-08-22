-- SURVEILLER LES RESULTATS, PAS LES ERREURS.
--
-- Aucun des defauts de la semaine du 18 au 21 aout n'a leve d'erreur : la fuite
-- entre marchands, la commande fantome, les coordonnees inventees, les six
-- miroirs qui tuaient la chaine. Tous ont ete trouves parce qu'un humain
-- regardait une capture d'ecran.
--
-- Avec deux marchands, l'exploitant EST la surveillance. A vingt, il ne l'est
-- plus — et personne ne verra que le client du marchand n°14 n'a jamais recu
-- sa confirmation. C'est le seul risque qui grandit avec le nombre.
--
-- CETTE TABLE NE DETECTE RIEN. Elle se souvient de ce qui a DEJA ete signale,
-- et c'est ce qui rend la veille supportable : sans elle, la meme commande
-- cassee serait annoncee toutes les quinze minutes jusqu'a ce que l'exploitant
-- cesse de lire ses alertes. Une veille qui crie en boucle ne surveille plus
-- rien.
create table if not exists public.anomalies_signalees (
  reference   text        not null,
  type        text        not null,
  boutique    text,
  signale_le  timestamptz not null default now(),
  primary key (reference, type)
);

comment on table public.anomalies_signalees is
  'Memoire de la veille : une anomalie donnee sur une commande donnee n est annoncee QU UNE FOIS. La cle primaire (reference, type) est le verrou — pas un controle applicatif.';

create index if not exists anomalies_signalees_recentes_idx
  on public.anomalies_signalees (signale_le desc);

-- Personne ne lit cette table depuis le navigateur : c'est de l'exploitation.
alter table public.anomalies_signalees enable row level security;
