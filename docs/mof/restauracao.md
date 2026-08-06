# MoF — Domínio Restauração

> Parte do Map of Functions do Backtrail. Índice, relacionamentos cross-domínio, regras de impacto e histórico de revisões: [`../MOF.md`](../MOF.md).

## Funções

```yaml
functions:
  - id: 'F_RESTORE'
    name: 'Restaurar Versão'
    type: 'API'
    domain: 'Restauração'
    status: 'verified'
    responsibilities:
      - 'Comando backtrail.restoreVersion: ler blob e gravar cópia em {pasta}/restored/{caminho-slugificado}/nome.restored-AAAA-MM-DD-HHMM[-n].ext — NUNCA sobrescreve o arquivo original'
      - "Resolver colisões com sufixo incremental; oferecer 'Open' no toast"
      - 'Slugificar segmentos de pasta (NFD, sem acentos, kebab) para o caminho restaurado'
    non_responsibilities:
      - 'NÃO restaura in-place nem apaga a versão restaurada do histórico'
    entities: ['ArquivoRestaurado', 'Blob']
    interfaces:
      code_ref: 'src/restoreCommand.ts:restoreVersion + src/restoreService.ts:writeRestoredFile,resolveRestorePath,slugify'
      inputs:
        - '{folder, version}: RestoreCommandArg (do context menu da History view)'
      outputs:
        - 'string — caminho absoluto do arquivo restaurado'
      state: 'stateless'
      side_effects:
        database: 'escreve arquivo dentro da pasta rastreada (subpasta restored/)'
        events_published: []
        events_consumed: []
        external_calls: ['filesystem']
    boundaries:
      depends_on: ['F_STORE_QUERY']
      exposed_to: ['usuário (context menu backtrail.restoreVersion)']
    notes:
      - 'restored/ está em DEFAULT_IGNORED_FOLDERS (F_IGNORE) desde 2026-07-26 (Fase 1 de hardening) — restaurações não entram mais no histórico. Decisão do owner de 26/07 implementada.'
      - 'readSnapshotContent (F_STORE_QUERY) verifica sha256 do blob contra o hash gravado — mismatch lança erro; showDiff/restoreVersion capturam e mostram mensagem clara em vez de propagar exceção crua.'
```

## Entidades

```yaml
entities:
  - name: 'ArquivoRestaurado ({pasta}/restored/...)'
    owner_domain: 'Restauração'
    read_by: ['usuário']
    modified_by: ['F_RESTORE']

```

## Eventos

Nenhum evento é publicado por função deste domínio.

## Relacionamentos (internos ao domínio)

Nenhum relacionamento é interno a este domínio — F_RESTORE só se relaciona com F_STORE_QUERY (Armazenamento), ver [`../MOF.md`](../MOF.md).
