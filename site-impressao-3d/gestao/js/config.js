/* =================================================================
   Configuração da conexão com o Supabase
   -----------------------------------------------------------------
   Supabase → Project Settings → API (ou "API Keys"):
     • SUPABASE_URL  → "Project URL"   (ex.: https://abcdxyz.supabase.co)
     • SUPABASE_KEY  → chave PÚBLICA: "publishable" (sb_publishable_…)
                       ou, em projetos antigos, a "anon public".
   Essas duas informações são públicas por natureza: quem protege os
   dados são o login e as regras de segurança (RLS) do banco.

   ⚠ NUNCA coloque aqui a chave "secret" / "service_role".
   ================================================================= */
export const SUPABASE_URL = 'https://bgnxtyjrrguhdxtkqyfs.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_e88hySebCdDLDr4DJ22CSw_byVJ0n60';
