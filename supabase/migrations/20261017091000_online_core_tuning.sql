-- 線上核心資料表的調整（任務 11L-1，依 Supabase advisor）：
-- 1. claim_mail 改為 security invoker：玩家本來就能透過 RLS 更新自己的信，不需要提高權限
-- 2. 同一角色、同一動作的多條政策合併成一條（每列只評估一次）
-- 3. 外鍵補索引

-- 1. claim_mail
create or replace function public.claim_mail(p_mail_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_attachments jsonb;
begin
  if (select auth.uid()) is null then
    raise exception '未登入';
  end if;
  if private.is_banned() then
    raise exception '帳號停權中';
  end if;
  perform set_config('mistwood.claiming_mail', 'on', true);
  update public.mail
     set claimed_at = now(),
         read_at = coalesce(read_at, now())
   where id = p_mail_id
     and user_id = (select auth.uid())
     and claimed_at is null
     and (expires_at is null or expires_at > now())
  returning attachments into v_attachments;
  perform set_config('mistwood.claiming_mail', 'off', true);
  if v_attachments is null then
    raise exception '信件不存在、已領取或已過期';
  end if;
  return v_attachments;
end;
$$;

-- 2. 合併政策
drop policy "announcements: 所有人可讀已發佈" on public.announcements;
drop policy "announcements: 管理員可讀全部" on public.announcements;
create policy "announcements: 已發佈所有人可讀，管理員可讀全部" on public.announcements
  for select to anon, authenticated
  using (
    (published and starts_at <= now() and (ends_at is null or ends_at > now()))
    or (select private.is_staff())
  );

drop policy "characters: 本人可存檔（停權中不行）" on public.characters;
drop policy "characters: admin 可修改" on public.characters;
create policy "characters: 本人可存檔（停權中不行），admin 可修改" on public.characters
  for update to authenticated
  using (
    (user_id = (select auth.uid()) and not (select private.is_banned()))
    or (select private.is_admin())
  )
  with check (user_id = (select auth.uid()) or (select private.is_admin()));

drop policy "mail: 本人可標記已讀" on public.mail;
drop policy "mail: 管理員可修改" on public.mail;
create policy "mail: 本人可標記已讀（欄位由觸發器限制），管理員可修改" on public.mail
  for update to authenticated
  using (user_id = (select auth.uid()) or (select private.is_staff()))
  with check (user_id = (select auth.uid()) or (select private.is_staff()));

drop policy "profiles: 本人可改（欄位由觸發器限制）" on public.profiles;
drop policy "profiles: 管理員可改" on public.profiles;
create policy "profiles: 本人可改（欄位由觸發器限制），管理員可改" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) or (select private.is_staff()))
  with check (id = (select auth.uid()) or (select private.is_staff()));

-- 3. 外鍵索引
create index announcements_created_by_idx on public.announcements (created_by);
create index chat_reports_handled_by_idx on public.chat_reports (handled_by);
create index chat_reports_reporter_idx on public.chat_reports (reporter_id);
create index game_config_updated_by_idx on public.game_config (updated_by);
create index mail_created_by_idx on public.mail (created_by);
create index moderation_actions_created_by_idx on public.moderation_actions (created_by);
create index moderation_actions_report_idx on public.moderation_actions (report_id);
