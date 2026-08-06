# backtrail — Contexto de IA

Regras locais sobrescreve standards, exceto segurança/arquitetura.

## Padrões Base

<!-- prettier-ignore -->
@../../../Library/Mobile Documents/com~apple~CloudDocs/Claude/workspace/CLAUDE.md

## Substância do Projeto

<!-- prettier-ignore -->
@../../../Library/Mobile Documents/com~apple~CloudDocs/Claude/workspace/projects/backtrail/CLAUDE.md

## Map of Functions

Leitura obrigatória antes de qualquer mudança estrutural de código: [docs/MOF.md](docs/MOF.md) — índice (metadados, domínios, relacionamentos e regras de impacto cross-domínio). Funções, entidades, eventos e relacionamentos internos vivem por domínio em `docs/mof/`.

## Estrutura

```
backtrail/
└── docs/
    ├── MOF.md
    └── mof/
        ├── rastreamento.md
        ├── captura.md
        ├── armazenamento.md
        ├── visualizacao.md
        └── restauracao.md
```
