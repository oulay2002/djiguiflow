-- Le premier segment du chemin doit etre soit le user_id de l'appelant
-- (amorcage : logo televerse avant la creation de la boutique), soit l'id
-- d'une boutique qu'il possede. Empeche un marchand d'ecraser les fichiers
-- d'un autre.
drop policy if exists "Upload images par utilisateur connecte" on storage.objects;
create policy "Upload images dans son dossier"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'images'
    and (storage.foldername(name))[1] is not null
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or (storage.foldername(name))[1] in (
        select b.id::text from public.boutiques b where b.user_id = auth.uid()
      )
    )
  );

drop policy if exists "Maj images par utilisateur connecte" on storage.objects;
create policy "Maj images dans son dossier"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'images'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or (storage.foldername(name))[1] in (
        select b.id::text from public.boutiques b where b.user_id = auth.uid()
      )
    )
  )
  with check (
    bucket_id = 'images'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or (storage.foldername(name))[1] in (
        select b.id::text from public.boutiques b where b.user_id = auth.uid()
      )
    )
  );

drop policy if exists "Suppression images par utilisateur connecte" on storage.objects;
create policy "Suppression images dans son dossier"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'images'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or (storage.foldername(name))[1] in (
        select b.id::text from public.boutiques b where b.user_id = auth.uid()
      )
    )
  );
