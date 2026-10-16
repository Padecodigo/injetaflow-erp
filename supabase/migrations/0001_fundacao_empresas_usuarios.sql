-- InjetaFlow ERP | Supabase foundation
-- Migration 0001: tenants, active modules and user control

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.empresas (
  id uuid primary key default gen_random_uuid(),
  razao_social text not null,
  nome_fantasia text not null,
  documento text,
  slug text not null unique,
  status text not null default 'ATIVA' check (status in ('ATIVA', 'SUSPENSA', 'INATIVA')),
  timezone text not null default 'America/Sao_Paulo',
  configuracoes jsonb not null default '{}'::jsonb,
  modulos_ativos jsonb not null default jsonb_build_object(
    'dashboard', true,
    'empresas', true,
    'usuarios', true,
    'auditoria', true,
    'documentos', true,
    'producao', false,
    'qualidade', false,
    'estoque', false,
    'manutencao', false,
    'rh', false,
    'rh_ponto', false,
    'financeiro', false,
    'contabil', false,
    'fiscal', false,
    'saude_seguranca', false,
    'meio_ambiente', false,
    'licencas', false,
    'rastreabilidade_360', false,
    'sala_limpa', false,
    'cep', false,
    'laudos_coa', false
  ),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.usuarios (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete restrict,
  empresa_id uuid not null references public.empresas(id) on delete restrict,
  nome_completo text not null,
  email text not null,
  matricula text,
  cargo text,
  setor text,
  perfil text not null default 'COLABORADOR',
  permissoes jsonb not null default '[]'::jsonb,
  status text not null default 'ATIVO' check (status in ('ATIVO', 'BLOQUEADO', 'INATIVO')),
  registro_operador text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (empresa_id, matricula),
  unique (empresa_id, registro_operador)
);

create index if not exists idx_usuarios_empresa_status on public.usuarios (empresa_id, status);
create index if not exists idx_usuarios_auth_user on public.usuarios (auth_user_id);
create index if not exists idx_empresas_status on public.empresas (status);

 drop trigger if exists trg_empresas_updated_at on public.empresas;
 create trigger trg_empresas_updated_at before update on public.empresas
 for each row execute function public.set_updated_at();

 drop trigger if exists trg_usuarios_updated_at on public.usuarios;
 create trigger trg_usuarios_updated_at before update on public.usuarios
 for each row execute function public.set_updated_at();

create or replace function public.minhas_empresas()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select empresa_id from public.usuarios
  where auth_user_id = auth.uid() and status = 'ATIVO';
$$;

revoke all on function public.minhas_empresas() from public;
grant execute on function public.minhas_empresas() to authenticated;

alter table public.empresas enable row level security;
alter table public.usuarios enable row level security;

drop policy if exists empresas_select_membro on public.empresas;
create policy empresas_select_membro on public.empresas
for select to authenticated
using (id in (select public.minhas_empresas()));

drop policy if exists empresas_update_admin on public.empresas;
create policy empresas_update_admin on public.empresas
for update to authenticated
using (id in (select public.minhas_empresas()))
with check (id in (select public.minhas_empresas()));

drop policy if exists usuarios_select_mesma_empresa on public.usuarios;
create policy usuarios_select_mesma_empresa on public.usuarios
for select to authenticated
using (empresa_id in (select public.minhas_empresas()));

drop policy if exists usuarios_update_mesma_empresa on public.usuarios;
create policy usuarios_update_mesma_empresa on public.usuarios
for update to authenticated
using (empresa_id in (select public.minhas_empresas()))
with check (empresa_id in (select public.minhas_empresas()));

comment on column public.empresas.modulos_ativos is 'Feature flags por tenant. Sempre validar no frontend, caso de uso e backend/RLS.';
comment on column public.usuarios.registro_operador is 'Identificador obrigatório para rastrear mutações operacionais.';
