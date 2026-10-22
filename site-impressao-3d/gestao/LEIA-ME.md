# Gestão do ateliê: aplicativo administrativo e financeiro

O aplicativo fica na pasta `gestao/` do site e abre em `https://SEU-SITE/gestao/`.
Ele não altera nada no site. O site continua estático, e o aplicativo tem login e banco de dados próprios no **Supabase** (plano gratuito).

```
gestao/
├── index.html            casca do aplicativo (não indexada por buscadores)
├── css/app.css           identidade visual (as mesmas cores e fontes do site)
├── js/config.js          ← ÚNICO arquivo que você edita (URL e chave pública do Supabase)
├── js/api.js             conexão com o Supabase (login, banco, comprovantes)
├── js/finance.js         todos os cálculos financeiros (em centavos)
├── js/store.js, nav.js, ui.js, charts.js, format.js, main.js
├── js/views/             telas: painel, lançamentos, contas, orçamento, resultados, metas, configurações
└── supabase/schema.sql   banco de dados completo: tabelas, segurança, histórico, recorrências
```

## Por que um aplicativo separado, ligado a um banco próprio

O site não guarda pedidos, vendas nem clientes: o orçamento vira uma mensagem no WhatsApp e os produtos são vitrine.
Como não havia dados para compartilhar, integrar os dois só traria risco ao site.

- **Prós:** o site fica intacto, os dados financeiros ficam fora do código público, o login é real e funciona no celular e no computador, e a hospedagem continua gratuita.
- **Contras:** é preciso criar uma conta no Supabase (cerca de 10 minutos), e as vendas são lançadas à mão, porque elas acontecem no WhatsApp e no Instagram.
- **Integração futura já prevista:** os lançamentos têm o campo `origem` com o valor `site`. Uma função no servidor (como a do frete) pode gravar cada pedido de orçamento do site como "receita a receber". Para isso, ela precisa da chave *secret* do Supabase, guardada só no servidor.

## Configuração (uma vez só)

### 1. Criar o banco
1. Crie uma conta grátis em **supabase.com** e depois um projeto (região: São Paulo). Guarde a senha do banco.
2. Vá em **SQL Editor → New query**, cole todo o conteúdo de `gestao/supabase/schema.sql` e clique em **Run**.
   O script cria as tabelas, as regras de segurança, o histórico, as contas iniciais ("Conta do Pix" e "Dinheiro em espécie") e 24 categorias pensadas para o ateliê.
   Você pode rodá-lo de novo sem perder dados.

### 2. Configurar o login
1. Em **Authentication → Sign In / Providers**, **desligue "Allow new users to sign up"**. Assim, ninguém de fora cria conta.
2. Em **Authentication → URL Configuration**:
   - *Site URL*: `https://SEU-SITE/gestao/`
   - *Redirect URLs*: adicione `https://SEU-SITE/gestao/`
3. Em **Authentication → Users → Add user → Create new user**, crie o seu usuário com e-mail e senha e marque *Auto Confirm User*.
   **O primeiro usuário criado vira administrador automaticamente.**

### 3. Conectar o aplicativo
Em **Project Settings → API Keys**, copie a *Project URL* e a chave **publishable** (ou, em projetos antigos, a *anon public*). Cole as duas em `gestao/js/config.js`:

```js
export const SUPABASE_URL = 'https://xxxxxxxx.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_...';
```

Essas duas informações são públicas por natureza. Quem protege os dados é o login, junto com as regras de segurança do banco.
**Nunca coloque a chave *secret* / *service_role* nesse arquivo.**

Depois, faça commit e push. A Vercel ou a Netlify publica a pasta junto com o site.

### 4. Adicionar o ajudante
1. No Supabase, vá em **Authentication → Users → Add user → Send invitation** e informe o e-mail dele.
2. Ele recebe o link, cria a senha e entra. O acesso começa **bloqueado**.
3. No aplicativo, vá em **Configurações → Usuários**, escolha o papel **Administrador** (as permissões dele ficam iguais às suas), marque *Liberado* e salve.

> O envio de e-mails do plano gratuito do Supabase tem um limite baixo por hora. Para dois usuários, isso basta.

## Primeiros dados (o painel mostra a lista de passos)

1. **Configurações → Contas:** informe quanto há hoje em cada conta e a data desse saldo.
2. **Configurações → Recorrências:** cadastre as despesas fixas mensais (energia, internet, DAS do MEI, assinaturas de modelos 3D). Elas aparecem sozinhas em "A pagar", sem duplicar.
3. **+ Receita** a cada venda. Se o cliente pagou só o sinal, lance o sinal como *Recebido* e o restante como *A receber*, com a data combinada.
4. **+ Despesa** a cada compra de filamento, resina, tinta, embalagem e frete. Sem esses lançamentos, o lucro aparece maior do que é, e o aplicativo avisa.
5. **Orçamento:** defina limites por categoria. O botão "Sugerir pela média" ajuda a partir do terceiro mês.
6. **Metas:** por exemplo, faturar R$ X no mês ou manter o material abaixo de R$ Y.

O aplicativo começa vazio e não usa dados de exemplo.

## Como os números são calculados

| Indicador | Regra |
|---|---|
| Faturamento | vendas + frete cobrado, pela **data da venda**, recebidas ou não (cancelados não contam) |
| Recebido / pago | só o que tem **data de pagamento** |
| Lucro estimado | faturamento + outras receitas − custos de produção − despesas operacionais − impostos |
| Fora do lucro | equipamentos (investimento), retirada do dono e aporte do dono: mudam o caixa, mas não o lucro |
| Saldo de caixa | saldo inicial de cada conta + recebido − pago, a partir da data do saldo inicial |
| Vencido | pendente com vencimento anterior a hoje |
| Projeções | lineares (o ritmo diário até hoje continua) e sempre identificadas como estimativa |

O grupo de cada categoria (em Configurações → Categorias) define em qual linha ela entra.

## Segurança

- Login pelo Supabase Auth, com senha de no mínimo 8 caracteres (letras e números) e recuperação por e-mail.
- **Segurança por linha (RLS)** em todas as tabelas: sem um perfil **ativo**, ninguém lê nem grava nada, nem mesmo quem tenha a chave pública.
- Papéis: **Administrador** (tudo), **Gerente** (tudo, menos usuários e dados do negócio) e **Funcionário** (vê, registra e altera só o que ele mesmo criou; não exclui).
- O banco valida os dados (valor positivo, categoria do tipo certo, pagamento sem data futura, conta obrigatória quando pago) e impede ficar sem nenhum administrador.
- O **histórico de alterações** é gravado pelo próprio banco e não pode ser editado pelo aplicativo.
- Os comprovantes (PDF e imagens de até 5 MB) ficam em um *bucket* privado e abrem por links temporários de 5 minutos.

## Backup

O plano gratuito do Supabase **não oferece backups para download**.
Use **Configurações → Backup → Baixar backup completo** toda semana e guarde o arquivo no Google Drive.
A restauração fica na mesma tela (só para administradores).

## Limites do plano gratuito do Supabase (para ficar de olho)

- O projeto **pausa depois de 7 dias sem uso**. Para reativar, clique em *Restore* no painel do Supabase. Com o uso normal do aplicativo, isso não acontece.
- 500 MB de banco e 1 GB de arquivos: suficiente para muitos anos de lançamentos.

## Testes realizados

Os testes rodaram com PostgreSQL 16, GoTrue (o mesmo servidor de login do Supabase) e PostgREST reais:
- Cálculos financeiros: faturamento × recebido × lucro, saldo, fluxo previsto, orçamento, metas, duplicidade e arredondamento em centavos.
- Segurança: anônimo bloqueado, usuário inativo sem acesso, funcionário limitado, autor do lançamento impossível de forjar, histórico impossível de escrever, último administrador protegido.
- Recorrências: geram sem duplicar (o dia 31 vira o último dia do mês).
- Fluxos completos no navegador: login, receitas, despesas, baixa, calendário, orçamento, metas, backup e restauração, e persistência depois de recarregar, no computador, no tablet e no celular, sem rolagem horizontal.

O que não foi testado aqui: o Supabase Storage real (testado com um equivalente local) e o envio real de e-mails de convite e recuperação.
