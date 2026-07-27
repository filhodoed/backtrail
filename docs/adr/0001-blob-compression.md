# ADR-0001: Compressão gzip dos blobs, formato dual sem migração

- **Status**: aceito
- **Data**: 2026-07-27

## Contexto

`snapshotStore.ts` grava cada versão de arquivo como um blob imutável em `blobs/{sha256}.blob`. O corpus de benchmark vivo (`~/.claude`, tracked propositalmente — ver [snapshot-store-maintainability.md](../../../../../Library/Mobile%20Documents/com~apple~CloudDocs/Claude/workspace/projects/backtrail/docs/snapshot-store-maintainability.md)) tinha 97% do espaço em `.jsonl` (transcripts de sessão, append-only, altamente repetitivo) — o tipo de conteúdo onde compressão genérica rende mais.

## Decisão

Blobs novos são gravados via `gzipSync` (node:zlib, stdlib — sem dependência nova). Nome do arquivo continua `{contentHash}.blob`; `contentHash` e `sizeBytes` continuam calculados sobre o conteúdo **original**, nunca sobre os bytes comprimidos — compressão é puro detalhe de armazenamento, invisível ao resto do sistema (índice, diff, restore).

Leitura (`readSnapshotContent`) detecta o formato pelos magic bytes do gzip (`1f 8b`) nos dois primeiros bytes do blob: se presentes, descomprime antes de conferir o hash; caso contrário, trata como raw. Isso significa:

- **Zero migração obrigatória.** Blobs gravados antes desta fase continuam legíveis para sempre, sem batch job de conversão.
- Um mesmo bucket convive com blobs raw (antigos) e gzip (novos) indefinidamente.
- A verificação de integridade da Fase 1 (sha256 contra `contentHash`) permanece intacta — só passou a rodar depois da descompressão.

## Alternativas consideradas

- **Migração em lote de blobs existentes**: descartada — reescrever milhares de blobs num corpus de 800MB+ na ativação da extensão é custo e risco desnecessários quando a leitura dual resolve o mesmo problema sem tocar em nada existente.
- **Algoritmo mais forte (brotli, zstd)**: zstd não é stdlib do Node; brotli é (`node:zlib`), mas gzip já é amplamente suficiente para o ganho medido e mantém o código mais simples — sem gatilho real para trocar.

## Medição (corpus real `~/.claude`, 2026-07-27)

```
blobs: 2106
original: 833.4MB
gzipped: 221.8MB
ratio: 3.76x
espaço economizado: 73.4%
```

Abaixo da estimativa de ~10× registrada no plano original (baseada só na taxa de crescimento do `.jsonl`, não numa medição de compressão real) — o corpus mistura conteúdo muito repetitivo com conteúdo menos compressível, e a média geral fica em ~3.76×. Ainda assim, um ganho substancial (quase 3/4 do espaço) pelo custo de uma dependência stdlib e nenhuma migração.

## Consequências

- Trade-off aceito: descompressão custa CPU a cada leitura (diff, restore, decoração). Não medido nesta fase — reavaliar se `F_STORE_QUERY` virar hot path perceptível (é cache de índice, não de conteúdo — Fase 2 não cobre isso).
- Formato dual é permanente por design, não um estado de transição — não há plano de eventualmente forçar todos os blobs a gzip.

## Gatilhos de revisita — criptografia de blobs (adiada, Fase 1)

A decisão de adiar criptografia de blobs (registrada em [snapshot-store-maintainability.md](../../../../../Library/Mobile%20Documents/com~apple~CloudDocs/Claude/workspace/projects/backtrail/docs/snapshot-store-maintainability.md) § Eixo segurança) não muda com compressão — gzip não é criptografia, blobs continuam legíveis por qualquer processo com acesso ao arquivo (mitigado por permissões 0600 da Fase 1). Gatilhos que reabrem essa decisão continuam os mesmos: sync entre máquinas, ou pedido explícito do usuário.
