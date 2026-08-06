# MoF — Domínio Armazenamento

> Parte do Map of Functions do Backtrail. Índice, relacionamentos cross-domínio, regras de impacto e histórico de revisões: [`../MOF.md`](../MOF.md).

## Funções

```yaml
functions:
  - id: 'F_CAPTURE'
    name: 'Registrar Snapshot no Store'
    type: 'Domain Service'
    domain: 'Armazenamento'
    status: 'verified'
    responsibilities:
      - 'Anexar versão a uma série no index.json e gravar blob endereçado por sha256 (dedup natural de conteúdo idêntico)'
      - 'Deduplicar saves redundantes: conteúdo E relPath idênticos ao topo da série não geram nova versão (rename com mesmo conteúdo GERA — é o único registro do rename)'
      - 'Variante batch: ler índice uma vez, aplicar N capturas, escrever uma vez; pular relPath com série já ativa'
    non_responsibilities:
      - 'NÃO decide QUANDO capturar (watcher/baseline decidem) nem O QUE ignorar'
    entities: ['SérieDeVersões', 'Blob']
    interfaces:
      code_ref: 'src/snapshotStore.ts:captureSnapshot,captureSnapshotsBatch,applyCapture,hashContent,bucketIdFor'
      inputs:
        - 'storeRoot, absoluteFolderPath, seriesId, relPath, content, isBinary, now?'
      outputs:
        - 'SnapshotVersion — a versão gravada ou a existente quando dedupada'
      state: 'stateless (estado no disco)'
      side_effects:
        database: 'storeRoot/{bucketId}/index.json + storeRoot/{bucketId}/blobs/{hash}.blob'
        events_published: []
        events_consumed: []
        external_calls: []
    boundaries:
      depends_on: []
      exposed_to: ['F_WATCH', 'F_BASELINE']
    notes:
      - 'bucketId = sha256(realpathSync(pasta)) — symlinks para a mesma pasta caem no mesmo bucket'
      - 'writeIndex grava em .tmp e faz rename atômico; a versão anterior válida vira index.json.bak antes do rename — crash mid-write não corrompe mais o index.json em uso (Fase 1 de hardening, 26/07)'
      - 'Novos buckets/índices/blobs nascem em 0700/0600 (antes 0755/0644) — ver hardenBucketPermissions em F_STORE_QUERY para o sweep de buckets legados'
      - 'index.json é gravado sem pretty-print desde a Fase 2 de performance (26/07) — formato compacto, retrocompatível (JSON.parse não depende de indentação)'
      - 'Blobs novos são gravados gzip (node:zlib) desde a Fase 4 (27/07) — sha256 (contentHash) e sizeBytes continuam do conteúdo original, nunca do comprimido; compressão é puro detalhe de armazenamento. Blobs pré-Fase-4 continuam raw no disco, sem migração — ver F_STORE_QUERY para a leitura dual-formato'

  - id: 'F_STORE_QUERY'
    name: 'Consultar Histórico do Store'
    type: 'Domain Service'
    domain: 'Armazenamento'
    status: 'verified'
    responsibilities:
      - 'Listar versões de uma série, ler conteúdo de blob, achar série ativa por relPath, listar arquivos ativos de uma pasta'
      - "Regra 'série ativa': a última versão da série define o relPath atual; primeiro match vence quando há duplicata"
      - 'getActiveSeries (Fase 7, 31/07): achar a série ativa por relPath E devolver seu histórico completo numa única chamada — wrapper de findActiveSeriesId+listVersions, usado por quem precisa do estado atual de UM arquivo (F_DECORATE, F_SEEN via decorationProvider, F_HISTORY_VIEW), não introduz semântica nova'
    non_responsibilities:
      - 'NÃO escreve nada no store'
    entities: ['SérieDeVersões', 'Blob']
    interfaces:
      code_ref: 'src/snapshotStore.ts:listVersions,readSnapshotContent,findActiveSeriesId,getActiveSeries,listActiveFiles,hardenBucketPermissions'
      inputs:
        - 'storeRoot, absoluteFolderPath, seriesId|relPath'
      outputs:
        - 'SnapshotVersion[] | Buffer | string|undefined | ActiveFile[] | ActiveSeries|undefined'
      state: 'stateless'
      side_effects:
        database: null
        events_published: []
        events_consumed: []
        external_calls: []
    boundaries:
      depends_on: []
      exposed_to:
        [
          'F_WATCH',
          'F_BASELINE',
          'F_HISTORY_VIEW',
          'F_CHANGES_VIEW',
          'F_DECORATE',
          'F_SEEN',
          'F_DIFF',
          'F_RESTORE',
          'F_TRACK_LIFECYCLE (hardenBucketPermissions, uma vez por bucket, marcada por sentinel .permissions-hardened)',
        ]
    notes:
      - 'É o maior fan-in do sistema: qualquer mudança de semântica aqui atravessa quase toda a UI'
      - 'Fase 7 (31/07, PR #50): decorationProvider.ts (2 call sites) e historyTreeProvider.ts reimplementavam findActiveSeriesId+listVersions+"pegar a última versão" cada um à sua maneira — getActiveSeries centraliza a resolução de série; quem só precisa da última versão pega `.versions.at(-1)` do resultado'
      - 'readSnapshotContent verifica sha256 do blob lido contra version.contentHash e lança erro em mismatch (Fase 1 de hardening, 26/07) — F_DIFF e F_RESTORE capturam e mostram mensagem, não deixam a exceção crua propagar'
      - 'readIndex cacheia o StoreIndex parseado em memória, keyed pelo caminho do index.json e pelo mtime do arquivo (Fase 2 de performance, 26/07) — uma escrita de outra janela ou ferramenta externa muda o mtime e o cache é ignorado na próxima leitura, sem mensageria de invalidação. Leituras puras (listVersions/findActiveSeriesId/listActiveFiles) compartilham o objeto cacheado sem cópia — é o caminho quente da decoração do Explorer'
      - 'Caminhos de escrita (F_CAPTURE, F_PRUNE) NUNCA usam o objeto do cache diretamente — chamam readMutableIndex, que faz cópia rasa do mapa de séries antes de mutar. Sem isso, uma escrita que falhasse depois de mutar o índice em memória deixaria o cache à frente do disco (leituras mostrando uma versão nunca persistida). Ver IR_012'
      - 'readSnapshotContent detecta blob gzip pelos magic bytes (1f 8b) e descomprime antes de conferir o hash; blob sem magic bytes é lido como raw (formato pré-Fase-4) — os dois formatos convivem no mesmo bucket indefinidamente, sem migração (Fase 4, 27/07, ADR-0001)'
      - 'Fase 6 (28/07): parseIndexFile costumava fazer JSON.parse(...) as StoreIndex — um cast, não uma checagem. JSON válido com formato errado (ex.: {"series": "string"} ou uma versão sem contentHash) passava despercebido e só quebrava mais tarde, em algum consumidor que nunca valida de novo. parseStoreIndex(value: unknown) agora valida series e cada SnapshotVersion antes de aceitar o índice; formato malformado é tratado exatamente como JSON corrompido (fallback para .bak, depois para índice vazio) — mesmo caminho de recuperação de IR_012, não um novo'

  - id: 'F_PRUNE'
    name: 'Aplicar Retenção de Snapshots'
    type: 'Domain Service'
    domain: 'Armazenamento'
    status: 'verified'
    responsibilities:
      - 'Descartar versões mais antigas que retentionDays (default 45), remover séries vazias e coletar blobs órfãos (GC por hash referenciado)'
      - 'Aplicar cap de versões por série — mantém só as maxVersionsPerSeries mais recentes (default 100), após o filtro de idade (Fase 3, 26/07)'
    non_responsibilities:
      - 'NÃO decide QUANDO rodar — isso é orquestrado por F_ACTIVATE (na ativação, a cada 24h via setInterval, e sob demanda via backtrail.pruneNow, desde a Fase 2 de performance, 26/07)'
    entities: ['SérieDeVersões', 'Blob']
    interfaces:
      code_ref: 'src/snapshotStore.ts:pruneOlderThan'
      inputs:
        - 'storeRoot, absoluteFolderPath, maxAgeDays, now?, maxVersionsPerSeries = 100'
      outputs:
        - 'number — quantidade de versões removidas (idade + cap combinados)'
      state: 'stateless'
      side_effects:
        database: 'storeRoot index.json + remoção física de blobs'
        events_published: []
        events_consumed: []
        external_calls: []
    boundaries:
      depends_on: []
      exposed_to: ['F_ACTIVATE', 'F_TRACK_LIFECYCLE (startWatching, antes do primeiro watch de uma pasta)']
    notes:
      - 'Única função que DELETA dados PARCIALMENTE (por idade ou por excesso de versões) — ver F_DELETE_BUCKET para exclusão total de um bucket'
      - 'Idempotente e barata de chamar repetidamente — F_ACTIVATE agora a invoca por pasta em três momentos (ativação, setInterval diário, comando manual), não só uma vez por ativação'
      - 'Cap (DEFAULT_MAX_VERSIONS_PER_SERIES=100, backtrail.maxVersionsPerSeries) roda depois do filtro por idade, no mesmo laço por série — o GC de blob órfão existente já cobre os blobs que o cap deixa sem referência, sem lógica extra'

  - id: 'F_DELETE_BUCKET'
    name: 'Apagar Histórico Completo de uma Pasta'
    type: 'Domain Service'
    domain: 'Armazenamento'
    status: 'verified'
    responsibilities:
      - 'Remover o bucket inteiro (index.json, .bak, blobs/) de uma pasta rastreada — rmSync recursivo, no-op se o bucket não existir'
      - 'Fase 6 (28/07): deleteBucketById(storeRoot, bucketId) — a mesma remoção, mas por id direto, sem depender de bucketIdFor/realpathSync'
    non_responsibilities:
      - 'NÃO decide QUANDO apagar nem SE deve confirmar com o usuário — isso é responsabilidade do caller (F_UNTRACK_FOLDER pergunta; untrackAndForget em F_TRACK_LIFECYCLE apaga sem perguntar)'
    entities: ['SérieDeVersões', 'Blob']
    interfaces:
      code_ref: 'src/snapshotStore.ts:deleteBucket,deleteBucketById'
      inputs:
        - 'storeRoot, absoluteFolderPath, fallbackBucketId?: string'
      outputs:
        - 'void'
      state: 'stateless'
      side_effects:
        database: 'remoção física recursiva de storeRoot/{bucketId}/'
        events_published: []
        events_consumed: []
        external_calls: []
    boundaries:
      depends_on: []
      exposed_to: ['F_UNTRACK_FOLDER', 'F_TRACK_LIFECYCLE (untrackAndForget)']
    notes:
      - 'Adicionada na Fase 1 de hardening (26/07) — implementa a decisão do owner de que untrack deve poder apagar o histórico da pasta, em vez de deixá-lo órfão no storeRoot para sempre'
      - 'Junto com F_PRUNE, é a segunda função que DELETA dados do store — irreversível, sem teste de regressão não se mexe aqui'
      - 'Fase 6 (28/07): deleteBucket tentava bucketIdFor(absoluteFolderPath) incondicionalmente — se a pasta já não existisse (deletada/movida/desmontada), realpathSync lançava e a exclusão falhava em silêncio (unhandled rejection nos dois call sites, que são fire-and-forget: F_UNTRACK_FOLDER e untrackAndForget). Agora aceita um fallbackBucketId opcional (persistido em F_REGISTRY no momento do tracking) — usado só quando bucketIdFor falha; quando a pasta ainda existe, o comportamento é idêntico ao de antes. Sem fallback e sem a pasta, é no-op — não há como saber qual bucket era dela, e não vale a pena adivinhar.'

  - id: 'F_PURGE_PATH'
    name: 'Purgar Histórico Sob um Caminho Excluído'
    type: 'Domain Service'
    domain: 'Armazenamento'
    status: 'verified'
    responsibilities:
      - "Remover retroativamente as séries cujo relPath ATIVO (última versão — mesma regra de 'série ativa' de F_STORE_QUERY/IR_002) cai sob um prefixo de caminho, e fazer GC dos blobs que ficam órfãos (mesmo critério de F_PRUNE/IR_006)"
    non_responsibilities:
      - 'NÃO decide SE deve purgar nem pergunta ao usuário — isso é de F_STOP_TRACKING_PATH'
      - 'NÃO apaga uma série cuja versão ATUAL já saiu do prefixo (ex.: arquivo renomeado para fora da pasta excluída) — só remove versões antigas dessa série via F_PRUNE normal, nunca via purgePath'
    entities: ['SérieDeVersões', 'Blob']
    interfaces:
      code_ref: 'src/snapshotStore.ts:purgePath'
      inputs:
        - 'storeRoot, absoluteFolderPath, relPathPrefix: string'
      outputs:
        - 'number — quantidade de versões purgadas'
      state: 'stateless'
      side_effects:
        database: 'storeRoot/{bucketId}/index.json (séries removidas) + storeRoot/{bucketId}/blobs/ (órfãos removidos)'
        events_published: []
        events_consumed: []
        external_calls: []
    boundaries:
      depends_on: []
      exposed_to: ['F_STOP_TRACKING_PATH']
    notes:
      - 'Adicionada na Fase 5 (27/07), tópico 7: exclusão por nome (F_IGNORE) só impede captura futura — sem isso, o que já foi capturado antes de a pasta virar excluída continuava ocupando espaço para sempre'
      - 'Terceira função que DELETA dados do store (junto de F_PRUNE e F_DELETE_BUCKET) — irreversível, sem teste de regressão não se mexe aqui'
      - 'A definição de "sob o prefixo" (isUnderPathPrefix) é duplicada localmente, não importada de ignoreFilters.ts — ver nota em F_IGNORE sobre a restrição do toolchain (node --test + allowImportingTsExtensions)'

```

## Entidades

```yaml
entities:
  - name: 'SérieDeVersões (StoreIndex.series: seriesId → SnapshotVersion[])'
    owner_domain: 'Armazenamento'
    read_by: ['F_STORE_QUERY', 'F_WATCH', 'F_BASELINE', 'F_HISTORY_VIEW', 'F_CHANGES_VIEW', 'F_DECORATE']
    modified_by: ['F_CAPTURE', 'F_PRUNE', 'F_PURGE_PATH']

  - name: 'Blob (blobs/{sha256}.blob, conteúdo endereçado)'
    owner_domain: 'Armazenamento'
    read_by: ['F_STORE_QUERY (readSnapshotContent)', 'F_DIFF', 'F_RESTORE']
    modified_by: ['F_CAPTURE (cria)', 'F_PRUNE (GC de órfãos)', 'F_PURGE_PATH (GC de órfãos)']

```

## Eventos

Nenhum evento é publicado por função deste domínio.

## Relacionamentos (internos ao domínio)

```yaml
relationships:
  - {
      id: 'R_023',
      from: 'F_CAPTURE',
      to: 'F_PRUNE',
      type: 'writes_to',
      coupling: 'tight',
      channel: 'Shared Database',
      criticality: 'critical',
      description: 'Compartilham o formato StoreIndex/index.json — mudança de schema afeta os dois',
    }
```
