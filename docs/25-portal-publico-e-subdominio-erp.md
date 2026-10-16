# Portal público e subdomínio do ERP

## Objetivo

A Wamovale mantém seu site institucional público e oferece uma entrada para o ERP privado. O site público não deve expor dados operacionais, RH, financeiros ou de produção.

## Experiência proposta

```text
www.wamovale.com.br
  └── botão “Área do colaborador”
        ↓
erp.wamovale.com.br
  └── login com e-mail corporativo + senha
        ↓
  └── tenant Wamovale + perfil + módulos liberados
```

O Preview do protótipo simula o mesmo fluxo usando `/` como portal público e `/erp` como entrada privada.

## Separação de responsabilidades

### Site institucional

- Produtos, história, contatos e orçamento;
- Conteúdo público para clientes e fornecedores;
- Pode continuar na hospedagem atual da Wamovale;
- Linka para `https://erp.wamovale.com.br`.

### ERP

- Next.js com App Router;
- Supabase Auth para autenticação;
- PostgreSQL com RLS e `empresa_id` em todas as tabelas de negócio;
- Módulos e permissões por usuário;
- Auditoria de todas as alterações;
- Hospedagem separada ou serviço dedicado;
- HTTPS obrigatório.

## DNS e publicação futura

No provedor DNS do domínio Wamovale, criar:

```text
Tipo: CNAME
Nome: erp
Destino: <host fornecido pela hospedagem do ERP>
TTL: padrão
```

O site institucional não precisa ser migrado para a hospedagem do ERP. O botão “Área do colaborador” deve apontar para o subdomínio.

## Login versus apontamento

O login usa e-mail e senha e abre a área pessoal e os módulos permitidos. O número de registro funcional é solicitado separadamente apenas para ações rápidas, como apontamento de produção, ocorrência, inspeção ou movimentação.

## Segurança mínima para produção

- Senhas armazenadas somente pelo provedor de autenticação;
- MFA opcional ou obrigatório para perfis críticos;
- Expiração e revogação de sessões;
- Recuperação de senha por e-mail corporativo;
- Rate limiting e bloqueio de tentativas;
- RLS por `empresa_id`;
- Logs imutáveis de auditoria;
- Nenhum segredo no frontend;
- Ambiente de homologação separado de produção;
- Domínio e certificado HTTPS válidos.

## Importante

O protótipo utiliza o logo público da Wamovale apenas para demonstrar a experiência do primeiro tenant. Antes de publicação comercial, confirmar autorização da empresa para uso da marca e definir quem administrará domínio, contas, dados e credenciais.
