-- 線上核心資料表（任務 11L-1，DECISIONS T-179）
-- 線上模式一律登入、資料只存在資料庫；單機模式只用本機存檔（不再同步到雲端）。
-- 權限設計：
--   * 客戶端只用 publishable key + 玩家自己的 JWT，所有權限由 RLS 決定（不在客戶端放 secret key）。
--   * 角色 role：player（一般玩家）、gm（客服 / 管理員，處理檢舉、禁言、公告、信件）、admin（全部權限，含改角色、刪資料、遊戲設定）。
--   * 判斷角色的函式放在 private schema（不經 API 對外公開），只給 RLS 政策呼叫。
--   * 後台的操作由觸發器自動寫進 admin_audit_log，不依賴前端記錄。

-- ─────────────────────────────────────────────
-- 0. 共用
-- ─────────────────────────────────────────────
create schema if not exists private;
grant usage on schema private to anon, authenticated;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ─────────────────────────────────────────────
-- 1. profiles：每個帳號一列（註冊時自動建立）
-- ─────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  -- 線上顯示名稱：第一次進入線上時設定；長度與遊戲伺服器一致（NET.nameMaxLength = 16）
  display_name text,
  role text not null default 'player' check (role in ('player', 'gm', 'admin')),
  status text not null default 'active' check (status in ('active', 'banned')),
  -- 停權到期時間（null = 永久，僅在 status = banned 時有意義）
  banned_until timestamptz,
  ban_reason text check (char_length(ban_reason) <= 500),
  -- 禁言到期時間（null 或過去 = 沒有禁言）
  muted_until timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_format check (
    display_name is null
    or (char_length(display_name) between 2 and 16 and display_name = btrim(display_name))
  )
);
comment on table public.profiles is '玩家檔案（任務 11L）：顯示名稱、角色（player / gm / admin）、停權與禁言狀態';
create unique index profiles_display_name_key on public.profiles (lower(display_name)) where display_name is not null;
create index profiles_role_idx on public.profiles (role) where role <> 'player';

create trigger profiles_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();

-- 角色判斷（security definer：在 RLS 政策裡查 profiles 不會遞迴觸發 profiles 自己的政策）
create or replace function private.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role in ('gm', 'admin')
  );
$$;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

-- 目前登入的玩家是否在停權中（到期的停權視為已解除）
create or replace function private.is_banned()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid())
      and status = 'banned'
      and (banned_until is null or banned_until > now())
  );
$$;

grant execute on function private.is_staff(), private.is_admin(), private.is_banned() to anon, authenticated;

-- 一般玩家只能改自己的 display_name；gm 可以改停權 / 禁言；只有 admin 能改角色
create or replace function private.guard_profile_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- 沒有 JWT（SQL 編輯器、伺服器的 secret key）不檢查
  if (select auth.uid()) is null then
    return new;
  end if;
  if new.id <> old.id or new.created_at <> old.created_at then
    raise exception '不能修改帳號 id 或建立時間';
  end if;
  if new.role is distinct from old.role and not private.is_admin() then
    raise exception '只有 admin 可以修改角色';
  end if;
  if not private.is_staff() and (
    new.status is distinct from old.status
    or new.banned_until is distinct from old.banned_until
    or new.ban_reason is distinct from old.ban_reason
    or new.muted_until is distinct from old.muted_until
  ) then
    raise exception '沒有權限修改停權或禁言狀態';
  end if;
  return new;
end;
$$;

create trigger profiles_guard before update on public.profiles
  for each row execute function private.guard_profile_update();

-- 註冊（auth.users 新增）時自動建立 profile
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- 既有帳號補建 profile
insert into public.profiles (id) select id from auth.users on conflict (id) do nothing;

alter table public.profiles enable row level security;

create policy "profiles: 本人或管理員可讀" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select private.is_staff()));

create policy "profiles: 本人可改（欄位由觸發器限制）" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "profiles: 管理員可改" on public.profiles
  for update to authenticated
  using ((select private.is_staff()))
  with check ((select private.is_staff()));

-- ─────────────────────────────────────────────
-- 2. characters：線上角色（存檔內容與本機存檔格式相同）
-- ─────────────────────────────────────────────
create table public.characters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- 角色欄位：目前只用 1，保留到 3 給之後的多角色
  slot smallint not null default 1 check (slot between 1 and 3),
  -- 存檔 JSON（game-core/save/schema.ts 的 SaveData），由客戶端以 zod 驗證後寫入
  save jsonb not null,
  save_version integer not null check (save_version > 0),
  -- 遊玩時間（秒），後台列表與排序用
  play_time double precision not null default 0 check (play_time >= 0),
  saved_at timestamptz not null,
  -- 每次更新 +1（觸發器），客戶端以「where revision = 讀到的值」更新，避免兩個分頁互相覆蓋
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, slot),
  constraint characters_save_object check (jsonb_typeof(save) = 'object'),
  constraint characters_save_size check (pg_column_size(save) <= 524288)
);
comment on table public.characters is '線上角色（任務 11L）：線上模式的存檔，只存在資料庫；單機存檔不會同步到這裡';

create or replace function private.characters_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.revision := 1;
  else
    if new.user_id <> old.user_id or new.slot <> old.slot then
      raise exception '不能修改角色的擁有者或欄位';
    end if;
    new.revision := old.revision + 1;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create trigger characters_before_write before insert or update on public.characters
  for each row execute function private.characters_before_write();

alter table public.characters enable row level security;

create policy "characters: 本人或管理員可讀" on public.characters
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_staff()));

create policy "characters: 本人可建立（停權中不行）" on public.characters
  for insert to authenticated
  with check (user_id = (select auth.uid()) and not (select private.is_banned()));

create policy "characters: 本人可存檔（停權中不行）" on public.characters
  for update to authenticated
  using (user_id = (select auth.uid()) and not (select private.is_banned()))
  with check (user_id = (select auth.uid()));

create policy "characters: admin 可修改" on public.characters
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy "characters: admin 可刪除" on public.characters
  for delete to authenticated
  using ((select private.is_admin()));

-- 先前（任務 11G）的雲端存檔是本機存檔的鏡像；複製一份成為線上角色，讓已登入過的測試帳號延續進度。
-- saves 表保留不動（之後確認不需要再移除）。
insert into public.characters (user_id, slot, save, save_version, play_time, saved_at)
select
  s.user_id,
  1,
  s.data,
  coalesce((s.data ->> 'version')::integer, 1),
  greatest(coalesce((s.data -> 'world' ->> 'time')::double precision, 0), 0),
  s.saved_at
from public.saves s
where jsonb_typeof(s.data) = 'object'
on conflict (user_id, slot) do nothing;

-- ─────────────────────────────────────────────
-- 3. game_config：全域遊戲設定（單列）
-- ─────────────────────────────────────────────
create table public.game_config (
  id boolean primary key default true check (id),
  -- 維護中：線上入口關閉並顯示訊息（staff 不受限，方便測試）
  maintenance boolean not null default false,
  maintenance_message text check (char_length(maintenance_message) <= 500),
  -- 最低客戶端版本（package.json 的 version），低於此版本要求更新
  min_client_version text,
  -- 標題畫面的一行訊息
  motd text check (char_length(motd) <= 200),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
comment on table public.game_config is '全域遊戲設定（任務 11L）：維護模式、最低客戶端版本、標題訊息';
insert into public.game_config (id) values (true);

create trigger game_config_updated_at before update on public.game_config
  for each row execute function private.set_updated_at();

alter table public.game_config enable row level security;

create policy "game_config: 所有人可讀" on public.game_config
  for select to anon, authenticated
  using (true);

create policy "game_config: admin 可改" on public.game_config
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

-- ─────────────────────────────────────────────
-- 4. announcements：公告（標題畫面與遊戲內顯示）
-- ─────────────────────────────────────────────
create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'news' check (kind in ('news', 'update', 'event', 'maintenance')),
  title text not null check (char_length(title) between 1 and 80),
  body text not null default '' check (char_length(body) <= 4000),
  published boolean not null default false,
  pinned boolean not null default false,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint announcements_period check (ends_at is null or ends_at > starts_at)
);
comment on table public.announcements is '公告（任務 11L）：已發佈且在期間內的公告所有人可讀';
create index announcements_live_idx on public.announcements (starts_at desc) where published;

create trigger announcements_updated_at before update on public.announcements
  for each row execute function private.set_updated_at();

alter table public.announcements enable row level security;

create policy "announcements: 所有人可讀已發佈" on public.announcements
  for select to anon, authenticated
  using (published and starts_at <= now() and (ends_at is null or ends_at > now()));

create policy "announcements: 管理員可讀全部" on public.announcements
  for select to authenticated
  using ((select private.is_staff()));

create policy "announcements: 管理員可新增" on public.announcements
  for insert to authenticated
  with check ((select private.is_staff()));

create policy "announcements: 管理員可修改" on public.announcements
  for update to authenticated
  using ((select private.is_staff()))
  with check ((select private.is_staff()));

create policy "announcements: 管理員可刪除" on public.announcements
  for delete to authenticated
  using ((select private.is_staff()));

-- ─────────────────────────────────────────────
-- 5. mail：玩家信箱（系統信、補償、活動獎勵）
-- ─────────────────────────────────────────────
create table public.mail (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  sender text not null default '迷霧之森營運團隊' check (char_length(sender) between 1 and 40),
  title text not null check (char_length(title) between 1 and 80),
  body text not null default '' check (char_length(body) <= 2000),
  -- 附件：[{ "itemId": "...", "count": 1 }]；物品是否存在由客戶端依遊戲資料判斷
  attachments jsonb not null default '[]' check (jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) <= 10),
  expires_at timestamptz,
  read_at timestamptz,
  claimed_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
comment on table public.mail is '玩家信箱（任務 11L）：管理員寄送，玩家以 claim_mail() 領取附件';
create index mail_user_idx on public.mail (user_id, created_at desc);

-- 玩家只能把自己的信標成已讀（read_at），其他欄位不能改；領取附件走 claim_mail()
create or replace function private.guard_mail_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or private.is_staff() then
    return new;
  end if;
  -- claim_mail() 在同一個交易裡設定這個旗標，允許它寫入 claimed_at
  if current_setting('mistwood.claiming_mail', true) = 'on' then
    return new;
  end if;
  if new.user_id <> old.user_id
    or new.sender <> old.sender
    or new.title <> old.title
    or new.body <> old.body
    or new.attachments <> old.attachments
    or new.expires_at is distinct from old.expires_at
    or new.claimed_at is distinct from old.claimed_at
    or new.created_by is distinct from old.created_by
    or new.created_at <> old.created_at
  then
    raise exception '只能標記已讀';
  end if;
  return new;
end;
$$;

create trigger mail_guard before update on public.mail
  for each row execute function private.guard_mail_update();

alter table public.mail enable row level security;

create policy "mail: 本人或管理員可讀" on public.mail
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_staff()));

create policy "mail: 本人可標記已讀" on public.mail
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "mail: 管理員可寄送" on public.mail
  for insert to authenticated
  with check ((select private.is_staff()));

create policy "mail: 管理員可修改" on public.mail
  for update to authenticated
  using ((select private.is_staff()))
  with check ((select private.is_staff()));

create policy "mail: 管理員可刪除" on public.mail
  for delete to authenticated
  using ((select private.is_staff()));

-- 領取附件：只能領自己的、未領過、未過期的信；回傳附件讓客戶端加進背包並存檔
create or replace function public.claim_mail(p_mail_id uuid)
returns jsonb
language plpgsql
security definer
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

revoke execute on function public.claim_mail(uuid) from public, anon;
grant execute on function public.claim_mail(uuid) to authenticated;

-- ─────────────────────────────────────────────
-- 6. chat_reports：玩家檢舉
-- ─────────────────────────────────────────────
create table public.chat_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- 被檢舉者的帳號（遊戲伺服器改用帳號 id 之前可能是 null，只有名稱）
  reported_user_id uuid references auth.users (id) on delete set null,
  reported_name text not null check (char_length(reported_name) between 1 and 32),
  reason text not null check (reason in ('spam', 'abuse', 'cheating', 'inappropriate_name', 'other')),
  channel text check (channel in ('say', 'global', 'whisper', 'system')),
  message_text text check (char_length(message_text) <= 500),
  detail text check (char_length(detail) <= 1000),
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  resolution_note text check (char_length(resolution_note) <= 1000),
  handled_by uuid references auth.users (id) on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now()
);
comment on table public.chat_reports is '玩家檢舉（任務 11L）：玩家建立，管理員處理';
create index chat_reports_status_idx on public.chat_reports (status, created_at desc);
create index chat_reports_reported_idx on public.chat_reports (reported_user_id);

alter table public.chat_reports enable row level security;

create policy "chat_reports: 本人可檢舉" on public.chat_reports
  for insert to authenticated
  with check (
    reporter_id = (select auth.uid())
    and status = 'open'
    and handled_by is null
    and handled_at is null
    and resolution_note is null
  );

create policy "chat_reports: 本人或管理員可讀" on public.chat_reports
  for select to authenticated
  using (reporter_id = (select auth.uid()) or (select private.is_staff()));

create policy "chat_reports: 管理員可處理" on public.chat_reports
  for update to authenticated
  using ((select private.is_staff()))
  with check ((select private.is_staff()));

-- ─────────────────────────────────────────────
-- 7. moderation_actions：處分紀錄（警告、禁言、停權）
-- ─────────────────────────────────────────────
create table public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  action text not null check (action in ('warn', 'mute', 'unmute', 'ban', 'unban', 'note')),
  reason text not null check (char_length(reason) between 1 and 500),
  expires_at timestamptz,
  report_id uuid references public.chat_reports (id) on delete set null,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
comment on table public.moderation_actions is '處分紀錄（任務 11L）：玩家目前的狀態在 profiles，這裡保留歷史';
create index moderation_actions_user_idx on public.moderation_actions (user_id, created_at desc);

alter table public.moderation_actions enable row level security;

create policy "moderation_actions: 管理員可讀" on public.moderation_actions
  for select to authenticated
  using ((select private.is_staff()));

create policy "moderation_actions: 管理員可新增" on public.moderation_actions
  for insert to authenticated
  with check ((select private.is_staff()) and created_by = (select auth.uid()));

-- ─────────────────────────────────────────────
-- 8. player_sessions：線上遊玩紀錄（後台的活躍人數統計）
-- ─────────────────────────────────────────────
create table public.player_sessions (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  client text not null check (client in ('web', 'electron')),
  app_version text check (char_length(app_version) <= 32),
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  ended_at timestamptz
);
comment on table public.player_sessions is '線上遊玩紀錄（任務 11L）：進入線上世界時建立，遊玩中定期更新 last_seen_at';
create index player_sessions_user_idx on public.player_sessions (user_id, started_at desc);
create index player_sessions_started_idx on public.player_sessions (started_at desc);

-- 玩家只能更新 last_seen_at 與 ended_at；同時更新 profiles.last_seen_at
create or replace function private.player_sessions_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (
    new.user_id <> old.user_id
    or new.client <> old.client
    or new.app_version is distinct from old.app_version
    or new.started_at <> old.started_at
  ) then
    raise exception '只能更新 last_seen_at 與 ended_at';
  end if;
  if tg_op = 'INSERT' then
    new.started_at := now();
    new.last_seen_at := now();
    new.ended_at := null;
  end if;
  update public.profiles set last_seen_at = now() where id = new.user_id;
  return new;
end;
$$;

create trigger player_sessions_before_write before insert or update on public.player_sessions
  for each row execute function private.player_sessions_before_write();

alter table public.player_sessions enable row level security;

create policy "player_sessions: 本人可建立" on public.player_sessions
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "player_sessions: 本人可更新" on public.player_sessions
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "player_sessions: 本人或管理員可讀" on public.player_sessions
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_staff()));

-- ─────────────────────────────────────────────
-- 9. admin_audit_log：後台操作紀錄（觸發器自動寫入）
-- ─────────────────────────────────────────────
create table public.admin_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  target_table text not null,
  target_id text,
  detail jsonb,
  created_at timestamptz not null default now()
);
comment on table public.admin_audit_log is '後台操作紀錄（任務 11L）：管理員對資料的新增、修改、刪除由觸發器寫入，只有 admin 可讀';
create index admin_audit_log_created_idx on public.admin_audit_log (created_at desc);
create index admin_audit_log_actor_idx on public.admin_audit_log (actor_id, created_at desc);

alter table public.admin_audit_log enable row level security;

create policy "admin_audit_log: admin 可讀" on public.admin_audit_log
  for select to authenticated
  using ((select private.is_admin()));

-- 管理員（gm / admin）的操作才記錄；玩家改自己的資料不記錄
create or replace function private.audit_staff_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb;
  v_owner text;
begin
  if (select auth.uid()) is null or not private.is_staff() then
    return null;
  end if;
  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_owner := coalesce(v_row ->> 'user_id', case when tg_table_name = 'profiles' then v_row ->> 'id' end);
  -- 管理員改自己的資料（例如自己的角色存檔）不記錄
  if tg_table_name in ('profiles', 'characters') and v_owner = (select auth.uid())::text then
    return null;
  end if;
  insert into public.admin_audit_log (actor_id, action, target_table, target_id, detail)
  values (
    (select auth.uid()),
    lower(tg_op),
    tg_table_name,
    v_row ->> 'id',
    case
      when tg_op = 'UPDATE' and tg_table_name = 'characters' then jsonb_build_object('user_id', v_owner, 'revision', v_row -> 'revision')
      when tg_op = 'UPDATE' then jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new))
      when tg_table_name = 'characters' then jsonb_build_object('user_id', v_owner)
      else v_row
    end
  );
  return null;
end;
$$;

create trigger profiles_audit after update on public.profiles
  for each row execute function private.audit_staff_change();
create trigger characters_audit after update or delete on public.characters
  for each row execute function private.audit_staff_change();
create trigger game_config_audit after update on public.game_config
  for each row execute function private.audit_staff_change();
create trigger announcements_audit after insert or update or delete on public.announcements
  for each row execute function private.audit_staff_change();
create trigger mail_audit after insert or update or delete on public.mail
  for each row execute function private.audit_staff_change();
create trigger chat_reports_audit after update on public.chat_reports
  for each row execute function private.audit_staff_change();
create trigger moderation_actions_audit after insert on public.moderation_actions
  for each row execute function private.audit_staff_change();

-- ─────────────────────────────────────────────
-- 10. 權限收斂：anon（未登入）只能讀公告與遊戲設定
-- ─────────────────────────────────────────────
revoke all on table
  public.profiles, public.characters, public.mail, public.chat_reports,
  public.moderation_actions, public.player_sessions, public.admin_audit_log
from anon;
revoke insert, update, delete on table public.game_config, public.announcements from anon;
-- 後台紀錄只能由觸發器寫入
revoke insert, update, delete on table public.admin_audit_log from authenticated;
