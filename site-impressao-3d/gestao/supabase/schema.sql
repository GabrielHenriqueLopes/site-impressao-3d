-- =====================================================================
--  Gestão do Ateliê — banco de dados (Supabase / PostgreSQL)
--  ---------------------------------------------------------------------
--  Como usar: Supabase → SQL Editor → New query → cole TODO este arquivo
--  → Run. Pode rodar de novo sem perder dados (é idempotente).
--
--  Regras principais
--  • Dinheiro em numeric(12,2) — nunca em ponto flutuante.
--  • Faturamento ≠ recebido ≠ lucro: cada lançamento tem data de
--    competência (quando a venda/gasto aconteceu), vencimento e
--    pagamento (quando o dinheiro entrou/saiu de fato).
--  • Cada categoria pertence a um "grupo" que define como ela entra
--    nos relatórios (custo de produção, despesa, investimento, retirada…).
--  • Segurança por linha (RLS): só usuários ativos cadastrados em
--    "perfis" leem ou gravam qualquer coisa. Visitantes não veem nada.
--  • Histórico (auditoria) gravado pelo próprio banco, sem como ser
--    apagado pelo aplicativo.
-- =====================================================================

create extension if not exists pgcrypto;
create schema if not exists app;

-- ---------------------------------------------------------------------
-- 1. Usuários do aplicativo
-- ---------------------------------------------------------------------
create table if not exists public.perfis (
  id          uuid primary key references auth.users(id) on delete cascade,
  nome        text not null default '',
  email       text,
  papel       text not null default 'funcionario'
              check (papel in ('admin', 'gerente', 'funcionario')),
  ativo       boolean not null default false,
  criado_em   timestamptz not null default now()
);

-- Papel do usuário logado (null = sem acesso). SECURITY DEFINER para
-- poder ser usada dentro das políticas sem recursão.
create or replace function app.papel() returns text
language sql stable security definer set search_path = public as $$
  select papel from public.perfis where id = auth.uid() and ativo
$$;

create or replace function app.pode(papeis text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(app.papel() = any(papeis), false)
$$;

grant usage on schema app to authenticated;
grant execute on all functions in schema app to authenticated;

-- Novo usuário criado no Supabase Auth → perfil automático.
-- O PRIMEIRO usuário vira administrador ativo; os seguintes ficam
-- inativos até um administrador liberar o acesso no aplicativo.
create or replace function app.novo_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
declare primeiro boolean;
begin
  select not exists (select 1 from public.perfis) into primeiro;
  insert into public.perfis (id, nome, email, papel, ativo)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)),
          new.email,
          case when primeiro then 'admin' else 'funcionario' end,
          primeiro)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function app.novo_usuario();

-- Impede ficar sem nenhum administrador ativo.
create or replace function app.protege_ultimo_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'DELETE' and old.papel = 'admin' and old.ativo)
     or (tg_op = 'UPDATE' and old.papel = 'admin' and old.ativo
         and (new.papel <> 'admin' or not new.ativo)) then
    if not exists (select 1 from public.perfis
                   where papel = 'admin' and ativo and id <> old.id) then
      raise exception 'É preciso manter pelo menos um administrador ativo.';
    end if;
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists perfis_ultimo_admin on public.perfis;
create trigger perfis_ultimo_admin before update or delete on public.perfis
  for each row execute function app.protege_ultimo_admin();

-- ---------------------------------------------------------------------
-- 2. Dados do negócio e preferências (uma linha só)
-- ---------------------------------------------------------------------
create table if not exists public.empresa (
  id                      int primary key default 1 check (id = 1),
  nome                    text not null default 'Meu ateliê',
  alerta_orcamento_pct    int  not null default 80 check (alerta_orcamento_pct between 50 and 100),
  alerta_vencimento_dias  int  not null default 7  check (alerta_vencimento_dias between 1 and 60),
  atualizado_em           timestamptz not null default now()
);
insert into public.empresa (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 3. Contas financeiras (onde o dinheiro fica: banco do Pix, dinheiro…)
-- ---------------------------------------------------------------------
create table if not exists public.contas (
  id                   uuid primary key default gen_random_uuid(),
  nome                 text not null check (length(trim(nome)) between 1 and 60),
  saldo_inicial        numeric(12,2) not null default 0,
  data_saldo_inicial   date not null default current_date,
  ativo                boolean not null default true,
  criado_em            timestamptz not null default now()
);
create unique index if not exists contas_nome_uk on public.contas (lower(trim(nome)));

-- ---------------------------------------------------------------------
-- 4. Categorias (personalizáveis)
--    grupo define o papel no relatório:
--      receitas:  venda | frete | outra | aporte
--      despesas:  custo_producao | operacional | imposto | investimento | retirada
-- ---------------------------------------------------------------------
create table if not exists public.categorias (
  id        uuid primary key default gen_random_uuid(),
  tipo      text not null check (tipo in ('receita', 'despesa')),
  nome      text not null check (length(trim(nome)) between 1 and 60),
  grupo     text not null,
  cor       text not null default '#6f6a62' check (cor ~ '^#[0-9a-fA-F]{6}$'),
  ativo     boolean not null default true,
  ordem     int not null default 0,
  criado_em timestamptz not null default now(),
  constraint categorias_grupo_ck check (
    (tipo = 'receita' and grupo in ('venda', 'frete', 'outra', 'aporte')) or
    (tipo = 'despesa' and grupo in ('custo_producao', 'operacional', 'imposto', 'investimento', 'retirada'))
  )
);
create unique index if not exists categorias_nome_uk on public.categorias (tipo, lower(trim(nome)));

-- ---------------------------------------------------------------------
-- 5. Recorrências (despesas/receitas mensais: aluguel, internet, DAS…)
-- ---------------------------------------------------------------------
create table if not exists public.recorrencias (
  id               uuid primary key default gen_random_uuid(),
  tipo             text not null check (tipo in ('receita', 'despesa')),
  descricao        text not null check (length(trim(descricao)) between 1 and 120),
  categoria_id     uuid not null references public.categorias(id),
  conta_id         uuid references public.contas(id),
  valor            numeric(12,2) not null check (valor > 0 and valor <= 10000000),
  dia_vencimento   int not null check (dia_vencimento between 1 and 31),
  natureza         text check (natureza in ('fixa', 'variavel')),
  forma_pagamento  text,
  inicio           date not null,
  fim              date,
  ativo            boolean not null default true,
  criado_em        timestamptz not null default now(),
  check (fim is null or fim >= inicio)
);

-- ---------------------------------------------------------------------
-- 6. Lançamentos (receitas e despesas — inclui contas a pagar/receber)
-- ---------------------------------------------------------------------
create table if not exists public.lancamentos (
  id                uuid primary key default gen_random_uuid(),
  tipo              text not null check (tipo in ('receita', 'despesa')),
  descricao         text not null check (length(trim(descricao)) between 1 and 120),
  categoria_id      uuid not null references public.categorias(id),
  valor             numeric(12,2) not null check (valor > 0 and valor <= 10000000),
  data_competencia  date not null,            -- quando a venda/gasto aconteceu
  data_vencimento   date not null,            -- quando deve ser pago/recebido
  data_pagamento    date,                     -- quando foi pago/recebido de fato
  status            text not null default 'pendente'
                    check (status in ('pendente', 'pago', 'cancelado')),
  conta_id          uuid references public.contas(id),
  forma_pagamento   text check (forma_pagamento in
                    ('pix', 'dinheiro', 'cartao_credito', 'cartao_debito', 'boleto', 'transferencia', 'outro')),
  origem            text check (origem in ('whatsapp', 'instagram', 'site', 'indicacao', 'feira', 'outro')),
  cliente           text check (cliente is null or length(cliente) <= 120),
  natureza          text check (natureza in ('fixa', 'variavel')),
  recorrencia_id    uuid references public.recorrencias(id) on delete set null,
  competencia_rec   date,                     -- mês gerado pela recorrência (evita duplicar)
  observacoes       text check (observacoes is null or length(observacoes) <= 1000),
  comprovante_path  text,
  criado_por        uuid default auth.uid() references auth.users(id),
  criado_em         timestamptz not null default now(),
  atualizado_por    uuid references auth.users(id),
  atualizado_em     timestamptz not null default now(),
  constraint lanc_pago_ck check (
    (status = 'pago' and data_pagamento is not null and conta_id is not null) or
    (status <> 'pago' and data_pagamento is null)
  ),
  constraint lanc_origem_ck check (tipo = 'receita' or origem is null),
  constraint lanc_natureza_ck check (tipo = 'despesa' or natureza is null),
  constraint lanc_datas_ck check (data_vencimento >= data_competencia - 366)
);
create index if not exists lanc_competencia_ix on public.lancamentos (data_competencia);
create index if not exists lanc_vencimento_ix on public.lancamentos (data_vencimento) where status = 'pendente';
create index if not exists lanc_pagamento_ix on public.lancamentos (data_pagamento);
create unique index if not exists lanc_recorrencia_uk
  on public.lancamentos (recorrencia_id, competencia_rec) where recorrencia_id is not null;

-- Validações que dependem de outras tabelas ou da data de hoje.
create or replace function app.valida_lancamento() returns trigger
language plpgsql security definer set search_path = public as $$
declare cat_tipo text;
begin
  select tipo into cat_tipo from public.categorias where id = new.categoria_id;
  if cat_tipo is distinct from new.tipo then
    raise exception 'A categoria escolhida não é de %.', new.tipo;
  end if;
  if new.data_pagamento is not null and new.data_pagamento > current_date + 1 then
    raise exception 'A data de pagamento não pode estar no futuro.';
  end if;
  new.descricao := trim(new.descricao);
  new.atualizado_em := now();
  new.atualizado_por := auth.uid();
  if tg_op = 'UPDATE' then
    new.criado_por := old.criado_por;
    new.criado_em := old.criado_em;
  end if;
  return new;
end $$;

drop trigger if exists lanc_valida on public.lancamentos;
create trigger lanc_valida before insert or update on public.lancamentos
  for each row execute function app.valida_lancamento();

-- ---------------------------------------------------------------------
-- 7. Orçamento: limite de gasto por categoria e mês
-- ---------------------------------------------------------------------
create table if not exists public.orcamentos (
  id            uuid primary key default gen_random_uuid(),
  mes           date not null check (extract(day from mes) = 1),
  categoria_id  uuid not null references public.categorias(id) on delete cascade,
  limite        numeric(12,2) not null check (limite >= 0 and limite <= 10000000),
  criado_em     timestamptz not null default now(),
  unique (mes, categoria_id)
);

-- ---------------------------------------------------------------------
-- 8. Metas
-- ---------------------------------------------------------------------
create table if not exists public.metas (
  id             uuid primary key default gen_random_uuid(),
  tipo           text not null check (tipo in
                 ('faturamento', 'lucro', 'reduzir_despesas', 'economia', 'limite_gastos', 'superar_mes_anterior')),
  titulo         text not null check (length(trim(titulo)) between 1 and 80),
  valor_alvo     numeric(12,2) check (valor_alvo is null or (valor_alvo >= 0 and valor_alvo <= 100000000)),
  percentual     numeric(5,2)  check (percentual is null or (percentual > 0 and percentual <= 100)),
  categoria_id   uuid references public.categorias(id) on delete set null,
  inicio         date not null,
  fim            date not null,
  ativo          boolean not null default true,
  criado_em      timestamptz not null default now(),
  check (fim >= inicio)
);

-- ---------------------------------------------------------------------
-- 9. Auditoria (histórico de alterações) — escrita só pelo banco
-- ---------------------------------------------------------------------
create table if not exists public.auditoria (
  id           bigint generated always as identity primary key,
  tabela       text not null,
  registro_id  text not null,
  acao         text not null,
  usuario_id   uuid,
  usuario_nome text,
  antes        jsonb,
  depois       jsonb,
  em           timestamptz not null default now()
);
create index if not exists auditoria_em_ix on public.auditoria (em desc);
create index if not exists auditoria_registro_ix on public.auditoria (tabela, registro_id);

create or replace function app.audita() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  a jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  d jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  k text;
begin
  if tg_op = 'UPDATE' then
    -- guarda só os campos que mudaram (ignora carimbos de data/autor)
    for k in select jsonb_object_keys(d) loop
      if (a->k) is not distinct from (d->k) or k in ('atualizado_em', 'atualizado_por') then
        a := a - k; d := d - k;
      end if;
    end loop;
    if d = '{}'::jsonb then return new; end if;
  end if;
  insert into public.auditoria (tabela, registro_id, acao, usuario_id, usuario_nome, antes, depois)
  values (tg_table_name,
          coalesce(d->>'id', a->>'id', (to_jsonb(coalesce(new, old)))->>'id'),
          lower(tg_op), auth.uid(),
          (select nome from public.perfis where id = auth.uid()), a, d);
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['lancamentos', 'categorias', 'contas', 'orcamentos', 'metas', 'recorrencias', 'perfis', 'empresa'] loop
    execute format('drop trigger if exists %I_audita on public.%I', t, t);
    execute format('create trigger %I_audita after insert or update or delete on public.%I
                    for each row execute function app.audita()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 10. Gerar lançamentos das recorrências até uma data (sem duplicar)
-- ---------------------------------------------------------------------
create or replace function public.gerar_recorrencias(ate date default (date_trunc('month', current_date) + interval '2 month - 1 day')::date)
returns int
language plpgsql security invoker set search_path = public as $$
declare
  r record; mes date; venc date; criados int := 0; n int;
begin
  if app.papel() is null then raise exception 'Sem acesso.'; end if;
  if ate > current_date + 400 then ate := current_date + 400; end if;
  for r in select * from public.recorrencias where ativo loop
    mes := date_trunc('month', r.inicio)::date;
    while mes <= ate and (r.fim is null or mes <= r.fim) loop
      venc := least(mes + (r.dia_vencimento - 1),
                    (mes + interval '1 month - 1 day')::date);
      if venc >= r.inicio then
        insert into public.lancamentos (tipo, descricao, categoria_id, valor, data_competencia,
               data_vencimento, status, conta_id, forma_pagamento, natureza, recorrencia_id, competencia_rec)
        values (r.tipo, r.descricao, r.categoria_id, r.valor, venc, venc, 'pendente', r.conta_id,
                r.forma_pagamento, case when r.tipo = 'despesa' then coalesce(r.natureza, 'fixa') end,
                r.id, mes)
        on conflict (recorrencia_id, competencia_rec) where recorrencia_id is not null do nothing;
        get diagnostics n = row_count;
        criados := criados + n;
      end if;
      mes := (mes + interval '1 month')::date;
    end loop;
  end loop;
  return criados;
end $$;

-- ---------------------------------------------------------------------
-- 11. Segurança por linha (RLS)
-- ---------------------------------------------------------------------
alter table public.perfis       enable row level security;
alter table public.empresa      enable row level security;
alter table public.contas       enable row level security;
alter table public.categorias   enable row level security;
alter table public.recorrencias enable row level security;
alter table public.lancamentos  enable row level security;
alter table public.orcamentos   enable row level security;
alter table public.metas        enable row level security;
alter table public.auditoria    enable row level security;

-- visitantes (anon) não têm acesso a nada
revoke all on all tables in schema public from anon;
revoke execute on function public.gerar_recorrencias(date) from anon, public;
grant execute on function public.gerar_recorrencias(date) to authenticated;
grant select, insert, update, delete on
  public.perfis, public.empresa, public.contas, public.categorias, public.recorrencias,
  public.lancamentos, public.orcamentos, public.metas to authenticated;
grant select on public.auditoria to authenticated;
revoke insert, update, delete on public.auditoria from authenticated;

do $$
declare t text;
begin
  foreach t in array array['perfis', 'empresa', 'contas', 'categorias', 'recorrencias', 'lancamentos', 'orcamentos', 'metas', 'auditoria'] loop
    execute format('drop policy if exists ler on public.%I', t);
    execute format('drop policy if exists inserir on public.%I', t);
    execute format('drop policy if exists alterar on public.%I', t);
    execute format('drop policy if exists excluir on public.%I', t);
  end loop;
end $$;

-- Leitura: qualquer usuário ativo (auditoria: admin/gerente; perfis: o próprio sempre vê o seu)
create policy ler on public.perfis       for select to authenticated using (app.papel() is not null or id = auth.uid());
create policy ler on public.empresa      for select to authenticated using (app.papel() is not null);
create policy ler on public.contas       for select to authenticated using (app.papel() is not null);
create policy ler on public.categorias   for select to authenticated using (app.papel() is not null);
create policy ler on public.recorrencias for select to authenticated using (app.papel() is not null);
create policy ler on public.lancamentos  for select to authenticated using (app.papel() is not null);
create policy ler on public.orcamentos   for select to authenticated using (app.papel() is not null);
create policy ler on public.metas        for select to authenticated using (app.papel() is not null);
create policy ler on public.auditoria    for select to authenticated using (app.pode(array['admin', 'gerente']));

-- Lançamentos: todos registram; funcionário só altera o que ele mesmo criou; excluir = admin/gerente
create policy inserir on public.lancamentos for insert to authenticated
  with check (app.papel() is not null);
create policy alterar on public.lancamentos for update to authenticated
  using (app.pode(array['admin', 'gerente']) or (app.papel() = 'funcionario' and criado_por = auth.uid()))
  with check (app.papel() is not null);
create policy excluir on public.lancamentos for delete to authenticated
  using (app.pode(array['admin', 'gerente']));

-- Cadastros e planejamento: admin/gerente
do $$
declare t text;
begin
  foreach t in array array['contas', 'categorias', 'recorrencias', 'orcamentos', 'metas'] loop
    execute format('create policy inserir on public.%I for insert to authenticated with check (app.pode(array[''admin'',''gerente'']))', t);
    execute format('create policy alterar on public.%I for update to authenticated using (app.pode(array[''admin'',''gerente''])) with check (app.pode(array[''admin'',''gerente'']))', t);
    execute format('create policy excluir on public.%I for delete to authenticated using (app.pode(array[''admin'',''gerente'']))', t);
  end loop;
end $$;

-- Empresa e usuários: só admin
create policy alterar on public.empresa for update to authenticated
  using (app.pode(array['admin'])) with check (app.pode(array['admin']));
create policy alterar on public.perfis for update to authenticated
  using (app.pode(array['admin'])) with check (app.pode(array['admin']));
create policy excluir on public.perfis for delete to authenticated
  using (app.pode(array['admin']) and id <> auth.uid());

-- ---------------------------------------------------------------------
-- 12. Comprovantes (Supabase Storage, bucket privado)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('comprovantes', 'comprovantes', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists comprovantes_ler on storage.objects;
drop policy if exists comprovantes_enviar on storage.objects;
drop policy if exists comprovantes_excluir on storage.objects;
create policy comprovantes_ler on storage.objects for select to authenticated
  using (bucket_id = 'comprovantes' and app.papel() is not null);
create policy comprovantes_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'comprovantes' and app.papel() is not null);
create policy comprovantes_excluir on storage.objects for delete to authenticated
  using (bucket_id = 'comprovantes' and app.pode(array['admin', 'gerente']));

-- ---------------------------------------------------------------------
-- 13. Dados iniciais: contas e categorias pensadas para um ateliê de
--     impressão 3D com pintura manual que vende por WhatsApp/Instagram,
--     recebe por Pix e envia pelos Correios. Tudo pode ser editado.
--     (Só é inserido se ainda não existir.)
-- ---------------------------------------------------------------------
insert into public.contas (nome, saldo_inicial, data_saldo_inicial)
select v.nome, 0, current_date
from (values ('Conta do Pix'), ('Dinheiro em espécie')) as v(nome)
where not exists (select 1 from public.contas);

insert into public.categorias (tipo, nome, grupo, cor, ordem)
select v.* from (values
  ('receita', 'Peças pintadas à mão',          'venda',  '#c94a1f', 1),
  ('receita', 'Impressão sem pintura',         'venda',  '#d39a3b', 2),
  ('receita', 'Encomendas personalizadas',     'venda',  '#a3243a', 3),
  ('receita', 'Modelagem 3D / arquivo',        'venda',  '#3450c4', 4),
  ('receita', 'Frete cobrado do cliente',      'frete',  '#2f6b55', 5),
  ('receita', 'Outras receitas',               'outra',  '#6f6a62', 6),
  ('receita', 'Aporte do dono',                'aporte', '#45423d', 7),
  ('despesa', 'Filamento (PLA/PETG)',          'custo_producao', '#d39a3b', 1),
  ('despesa', 'Resina UV',                     'custo_producao', '#a3243a', 2),
  ('despesa', 'Tintas, primer e verniz',       'custo_producao', '#c94a1f', 3),
  ('despesa', 'Pincéis e materiais de pintura','custo_producao', '#e07a4f', 4),
  ('despesa', 'Embalagens',                    'custo_producao', '#8a6d3b', 5),
  ('despesa', 'Frete de envio (Correios)',     'custo_producao', '#2f6b55', 6),
  ('despesa', 'Álcool isopropílico e limpeza', 'custo_producao', '#5f8f9f', 7),
  ('despesa', 'Taxas de pagamento',            'custo_producao', '#6f6a62', 8),
  ('despesa', 'Manutenção e peças de reposição','operacional',   '#3450c4', 9),
  ('despesa', 'Energia elétrica',              'operacional',    '#ccb14a', 10),
  ('despesa', 'Internet e telefone',           'operacional',    '#5a6fb3', 11),
  ('despesa', 'Modelos 3D e assinaturas',      'operacional',    '#7a5ea8', 12),
  ('despesa', 'Divulgação e anúncios',         'operacional',    '#b3477a', 13),
  ('despesa', 'Outras despesas',               'operacional',    '#8c867c', 14),
  ('despesa', 'Impostos (DAS/MEI)',            'imposto',        '#45423d', 15),
  ('despesa', 'Equipamentos (impressoras, ferramentas)', 'investimento', '#1d1b19', 16),
  ('despesa', 'Retirada do dono (pró-labore)', 'retirada',       '#2a2724', 17)
) as v(tipo, nome, grupo, cor, ordem)
where not exists (select 1 from public.categorias);

-- =====================================================================
--  MÓDULO DE PEDIDOS E PRODUÇÃO (impressão 3D)
--  Adicionado depois da primeira versão. Rodar o arquivo inteiro de
--  novo é seguro: nada existente é apagado.
-- =====================================================================

-- 14. Ajustes de produção (na linha única de "empresa")
alter table public.empresa add column if not exists lembrete_horas int not null default 24;
alter table public.empresa add column if not exists folga_dias int not null default 1;
alter table public.empresa add column if not exists impressora_watts numeric(7,1);
alter table public.empresa add column if not exists tarifa_kwh numeric(6,3);
alter table public.empresa add column if not exists fuso text not null default 'America/Sao_Paulo';
do $$ begin
  alter table public.empresa add constraint empresa_lembrete_ck check (lembrete_horas between 1 and 720);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.empresa add constraint empresa_folga_ck check (folga_dias between 0 and 30);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.empresa add constraint empresa_energia_ck check ((impressora_watts is null or impressora_watts between 1 and 5000) and (tarifa_kwh is null or tarifa_kwh between 0.01 and 10));
exception when duplicate_object then null; end $$;

-- 15. Filamentos (catálogo com preço do rolo → custo por grama)
create table if not exists public.filamentos (
  id            uuid primary key default gen_random_uuid(),
  tipo          text not null check (length(trim(tipo)) between 1 and 20),     -- PLA, PETG, ABS, TPU, Resina…
  cor           text not null default '' check (length(cor) <= 40),
  marca         text check (marca is null or length(marca) <= 40),
  preco_rolo    numeric(10,2) not null check (preco_rolo > 0 and preco_rolo <= 100000),
  peso_rolo_g   numeric(8,1) not null default 1000 check (peso_rolo_g > 0 and peso_rolo_g <= 100000),
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now()
);

-- 16. Pedidos
create sequence if not exists public.pedidos_codigo_seq;
create table if not exists public.pedidos (
  id                 uuid primary key default gen_random_uuid(),
  codigo             text not null default ('PED-' || lpad(nextval('public.pedidos_codigo_seq')::text, 4, '0')),
  produto            text not null check (length(trim(produto)) between 1 and 120),
  cliente            text not null check (length(trim(cliente)) between 1 and 120),
  origem             text check (origem in ('whatsapp', 'instagram', 'site', 'indicacao', 'feira', 'outro')),
  recebido_em        date not null,
  prazo              date not null,
  quantidade         int not null check (quantidade between 1 and 10000),
  unidades_prontas   int not null default 0,
  prioridade         text not null default 'normal' check (prioridade in ('normal', 'alta', 'urgente')),
  status             text not null default 'aguardando'
                     check (status in ('aguardando', 'producao', 'pronto', 'entregue', 'cancelado')),
  -- impressão e filamento (estimativas informadas pelo usuário)
  filamento_id       uuid references public.filamentos(id) on delete set null,
  filamento_tipo     text check (filamento_tipo is null or length(filamento_tipo) <= 20),
  filamento_cor      text check (filamento_cor is null or length(filamento_cor) <= 40),
  gramas_unidade     numeric(9,1) check (gramas_unidade is null or (gramas_unidade > 0 and gramas_unidade <= 100000)),
  margem_perda_pct   numeric(5,1) not null default 0 check (margem_perda_pct between 0 and 100),
  custo_kg           numeric(10,2) check (custo_kg is null or (custo_kg >= 0 and custo_kg <= 100000)),
  tempo_unidade_min  int check (tempo_unidade_min is null or tempo_unidade_min between 1 and 100000),
  -- outros custos estimados do pedido inteiro
  custo_energia      numeric(10,2) check (custo_energia is null or custo_energia >= 0),
  custo_acabamento   numeric(10,2) check (custo_acabamento is null or custo_acabamento >= 0),
  custo_embalagem    numeric(10,2) check (custo_embalagem is null or custo_embalagem >= 0),
  custo_outros       numeric(10,2) check (custo_outros is null or custo_outros >= 0),
  preco_venda        numeric(12,2) check (preco_venda is null or (preco_venda >= 0 and preco_venda <= 10000000)),
  observacoes        text check (observacoes is null or length(observacoes) <= 2000),
  -- datas de cada etapa (preenchidas automaticamente)
  iniciado_em        timestamptz,
  concluido_em       timestamptz,
  entregue_em        timestamptz,
  cancelado_em       timestamptz,
  criado_por         uuid default auth.uid() references auth.users(id),
  criado_em          timestamptz not null default now(),
  atualizado_por     uuid references auth.users(id),
  atualizado_em      timestamptz not null default now(),
  constraint pedidos_prontas_ck check (unidades_prontas >= 0 and unidades_prontas <= quantidade),
  constraint pedidos_prazo_ck check (prazo >= recebido_em - 1)
);
create unique index if not exists pedidos_codigo_uk on public.pedidos (upper(trim(codigo)));
create index if not exists pedidos_status_ix on public.pedidos (status, prazo);

-- datas de etapa e carimbos automáticos
create or replace function app.pedido_etapas() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.codigo := upper(trim(new.codigo));
  new.produto := trim(new.produto);
  new.cliente := trim(new.cliente);
  new.atualizado_em := now();
  new.atualizado_por := auth.uid();
  if tg_op = 'UPDATE' then
    new.criado_por := old.criado_por; new.criado_em := old.criado_em;
  end if;
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    if new.status in ('producao', 'pronto', 'entregue') and new.iniciado_em is null then new.iniciado_em := now(); end if;
    if new.status in ('pronto', 'entregue') and new.concluido_em is null then new.concluido_em := now(); end if;
    if new.status = 'entregue' and new.entregue_em is null then new.entregue_em := now(); end if;
    if new.status = 'cancelado' then new.cancelado_em := coalesce(new.cancelado_em, now()); else new.cancelado_em := null; end if;
    -- voltou de etapa: limpa as datas das etapas seguintes
    if new.status = 'aguardando' then new.iniciado_em := null; new.concluido_em := null; new.entregue_em := null; end if;
    if new.status = 'producao' then new.concluido_em := null; new.entregue_em := null; end if;
    if new.status = 'pronto' then new.entregue_em := null; end if;
    if new.status in ('pronto', 'entregue') then new.unidades_prontas := new.quantidade; end if;
  end if;
  return new;
end $$;
drop trigger if exists pedidos_etapas on public.pedidos;
create trigger pedidos_etapas before insert or update on public.pedidos
  for each row execute function app.pedido_etapas();

-- ligação opcional entre pedido e a receita lançada no financeiro (evita lançar duas vezes)
alter table public.lancamentos add column if not exists pedido_id uuid references public.pedidos(id) on delete set null;
-- (a regra "um pedido não é lançado duas vezes" fica na seção de parcelamento, mais abaixo)

-- 17. Notificações (geradas pelo banco, sem duplicar) e leitura por usuário
create table if not exists public.notificacoes (
  id          uuid primary key default gen_random_uuid(),
  pedido_id   uuid references public.pedidos(id) on delete cascade,
  tipo        text not null check (tipo in ('prazo_proximo', 'atrasado', 'iniciar')),
  referencia  date not null,                 -- prazo do pedido quando o aviso nasceu
  titulo      text not null,
  texto       text not null,
  criado_em   timestamptz not null default now(),
  unique (pedido_id, tipo, referencia)
);
create index if not exists notificacoes_criado_ix on public.notificacoes (criado_em desc);

create table if not exists public.notificacoes_lidas (
  notificacao_id uuid not null references public.notificacoes(id) on delete cascade,
  usuario_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  lida_em        timestamptz not null default now(),
  primary key (notificacao_id, usuario_id)
);

/* Cria os avisos que já deveriam existir para os pedidos ativos.
   • prazo_proximo: faltam menos de "lembrete_horas" para o fim do dia do prazo
   • atrasado:      o dia do prazo já passou e o pedido não foi entregue
   • iniciar:       ainda não começou e está na hora de começar
                    (prazo − tempo total de impressão − folga de acabamento)
   O índice único impede avisos repetidos para o mesmo pedido/tipo/prazo. */
create or replace function public.gerar_notificacoes() returns int
language plpgsql security definer set search_path = public as $$
declare
  e record; p record; agora timestamptz := now(); fim_prazo timestamptz; inicio_ate timestamptz;
  horas_imp numeric; n int := 0; k int;
begin
  if app.papel() is null then raise exception 'Sem acesso.'; end if;
  select * into e from public.empresa where id = 1;
  for p in select * from public.pedidos where status in ('aguardando', 'producao', 'pronto') loop
    fim_prazo := ((p.prazo + 1)::timestamp at time zone e.fuso);
    if agora >= fim_prazo and p.status <> 'entregue' then
      insert into public.notificacoes (pedido_id, tipo, referencia, titulo, texto)
      values (p.id, 'atrasado', p.prazo, format('Atrasado: %s', p.produto),
              format('%s (%s) para %s tinha prazo em %s.', p.codigo, p.produto, p.cliente, to_char(p.prazo, 'DD/MM')))
      on conflict do nothing;
      get diagnostics k = row_count; n := n + k;
    elsif agora >= fim_prazo - make_interval(hours => e.lembrete_horas) then
      insert into public.notificacoes (pedido_id, tipo, referencia, titulo, texto)
      values (p.id, 'prazo_proximo', p.prazo, format('Prazo chegando: %s', p.produto),
              format('%s (%s) para %s vence em %s.', p.codigo, p.produto, p.cliente, to_char(p.prazo, 'DD/MM')))
      on conflict do nothing;
      get diagnostics k = row_count; n := n + k;
    end if;
    if p.status = 'aguardando' then
      horas_imp := coalesce(p.tempo_unidade_min, 0) * greatest(p.quantidade - p.unidades_prontas, 0) / 60.0;
      inicio_ate := fim_prazo - make_interval(days => e.folga_dias) - make_interval(secs => horas_imp * 3600);
      if agora >= inicio_ate - make_interval(hours => e.lembrete_horas) and agora < fim_prazo then
        insert into public.notificacoes (pedido_id, tipo, referencia, titulo, texto)
        values (p.id, 'iniciar', p.prazo, format('Hora de começar: %s', p.produto),
                format('%s para %s ainda não começou. Para entregar em %s, inicie até %s.', p.codigo, p.cliente,
                       to_char(p.prazo, 'DD/MM'), to_char(inicio_ate at time zone e.fuso, 'DD/MM "às" HH24"h"')))
        on conflict do nothing;
        get diagnostics k = row_count; n := n + k;
      end if;
    end if;
  end loop;
  return n;
end $$;
revoke execute on function public.gerar_notificacoes() from anon, public;
grant execute on function public.gerar_notificacoes() to authenticated;

-- 18. Segurança dos novos dados
alter table public.filamentos         enable row level security;
alter table public.pedidos            enable row level security;
alter table public.notificacoes       enable row level security;
alter table public.notificacoes_lidas enable row level security;
revoke all on public.filamentos, public.pedidos, public.notificacoes, public.notificacoes_lidas from anon;
grant select, insert, update, delete on public.filamentos, public.pedidos to authenticated;
grant select on public.notificacoes to authenticated;
grant delete on public.notificacoes to authenticated;
grant select, insert, delete on public.notificacoes_lidas to authenticated;
grant usage on sequence public.pedidos_codigo_seq to authenticated;

do $$
declare t text;
begin
  foreach t in array array['filamentos', 'pedidos', 'notificacoes', 'notificacoes_lidas'] loop
    execute format('drop policy if exists ler on public.%I', t);
    execute format('drop policy if exists inserir on public.%I', t);
    execute format('drop policy if exists alterar on public.%I', t);
    execute format('drop policy if exists excluir on public.%I', t);
  end loop;
end $$;

create policy ler on public.filamentos for select to authenticated using (app.papel() is not null);
create policy inserir on public.filamentos for insert to authenticated with check (app.pode(array['admin', 'gerente']));
create policy alterar on public.filamentos for update to authenticated using (app.pode(array['admin', 'gerente'])) with check (app.pode(array['admin', 'gerente']));
create policy excluir on public.filamentos for delete to authenticated using (app.pode(array['admin', 'gerente']));

create policy ler on public.pedidos for select to authenticated using (app.papel() is not null);
create policy inserir on public.pedidos for insert to authenticated with check (app.papel() is not null);
create policy alterar on public.pedidos for update to authenticated
  using (app.pode(array['admin', 'gerente']) or (app.papel() = 'funcionario' and criado_por = auth.uid()))
  with check (app.papel() is not null);
create policy excluir on public.pedidos for delete to authenticated using (app.pode(array['admin', 'gerente']));

create policy ler on public.notificacoes for select to authenticated using (app.papel() is not null);
create policy excluir on public.notificacoes for delete to authenticated using (app.pode(array['admin', 'gerente']));

create policy ler on public.notificacoes_lidas for select to authenticated using (usuario_id = auth.uid());
create policy inserir on public.notificacoes_lidas for insert to authenticated with check (usuario_id = auth.uid() and app.papel() is not null);
create policy excluir on public.notificacoes_lidas for delete to authenticated using (usuario_id = auth.uid());

-- histórico de alterações também para pedidos e filamentos
do $$
declare t text;
begin
  foreach t in array array['pedidos', 'filamentos'] loop
    execute format('drop trigger if exists %I_audita on public.%I', t, t);
    execute format('create trigger %I_audita after insert or update or delete on public.%I
                    for each row execute function app.audita()', t, t);
  end loop;
end $$;

-- =====================================================================
--  PARCELAMENTO (receitas e despesas em várias parcelas)
--  Cada parcela é um lançamento normal (com o próprio vencimento e
--  pagamento). Todas compartilham "parcela_grupo" e a mesma data da
--  venda/compra, então o faturamento e o lucro contam o valor uma vez
--  só, no mês da venda, e o caixa conta cada parcela quando for paga.
-- =====================================================================
alter table public.lancamentos add column if not exists parcela_grupo uuid;
alter table public.lancamentos add column if not exists parcela_num int;
alter table public.lancamentos add column if not exists parcela_total int;
alter table public.lancamentos drop constraint if exists lanc_parcela_ck;
alter table public.lancamentos add constraint lanc_parcela_ck check (
  (parcela_grupo is null and parcela_num is null and parcela_total is null) or
  (parcela_grupo is not null and parcela_num is not null and parcela_total is not null
   and parcela_total between 2 and 120 and parcela_num between 1 and parcela_total));
create index if not exists lanc_parcela_grupo_ix on public.lancamentos (parcela_grupo) where parcela_grupo is not null;
create unique index if not exists lanc_parcela_uk on public.lancamentos (parcela_grupo, parcela_num) where parcela_grupo is not null;

-- um pedido pode ter a receita dividida em parcelas, mas não pode ser lançado duas vezes
drop index if exists public.lanc_pedido_uk;
create unique index if not exists lanc_pedido_parcela_uk on public.lancamentos (pedido_id, (coalesce(parcela_num, 1))) where pedido_id is not null;

notify pgrst, 'reload schema';
