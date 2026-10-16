# Novo site institucional Wamovale

## Decisão

O site institucional atual da Wamovale será substituído por uma nova experiência, criada especificamente para apresentar a empresa, converter oportunidades comerciais e atrair profissionais. O site novo será o portal público oficial do projeto; o ERP será a área privada integrada.

## Arquitetura pública e privada

```text
www.wamovale.com.br
  ├── Home institucional
  ├── Quem somos
  ├── Produtos e aplicações
  ├── Injeção plástica
  ├── Moldes e ferramentaria
  ├── Matéria-prima e pigmentação
  ├── Qualidade e capacidades
  ├── Solicitar orçamento
  ├── Trabalhe conosco
  └── Área do colaborador
          ↓
    erp.wamovale.com.br
```

## Princípios do novo site

- Não parecer uma tela de ERP para clientes externos;
- Mostrar claramente o que a Wamovale fabrica e como pode ajudar;
- Falar com compradores de engenharia, compras, desenvolvimento e produção;
- Apresentar moldes, ferramentaria, resinas, matéria-prima, pigmentos, cores, qualidade e rastreabilidade;
- Conduzir cada visitante para o próximo passo correto;
- Solicitar orçamento com informações de projeto, sem formulário genérico;
- Ter uma área “Trabalhe conosco” com currículo por arquivo e QR Code;
- Não depender de links do site antigo na versão final;
- Permitir branding, conteúdo e contatos configuráveis por tenant.

## Estrutura de conversão

1. **Já tenho desenho e quero cotar** — arquivo técnico, material e volume;
2. **Preciso desenvolver uma peça** — conversa com engenharia e ferramentaria;
3. **Quero um fornecedor recorrente** — capacidade, volumes, qualidade e atendimento;
4. **Quero trabalhar na Wamovale** — currículo e banco de talentos;
5. **Sou colaborador** — login privado do ERP.

## Próxima implementação

As rotas públicas que hoje apontam para o site antigo devem ser substituídas por páginas internas do novo site: `/quem-somos`, `/produtos`, `/injecao-plastica`, `/moldes-e-ferramentaria`, `/materiais-e-pigmentos`, `/qualidade`, `/contato`, `/cotacao` e `/trabalhe-conosco`.
