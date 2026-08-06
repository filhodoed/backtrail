# Map of Functions — Backtrail

> Consulte este documento antes de criar, modificar ou refatorar código.
> Avalie sempre o raio de impacto: verifique `exposed_to` e `impact_rules`
> antes de alterar qualquer função.

## Metadados

```yaml
mof_meta:
  system_name: 'Backtrail'
  purpose: 'Extensão VS Code que mantém histórico contínuo de arquivos em pastas sem git — captura cada save, exibe diffs e restaura versões sem sobrescrever os arquivos originais.'
  version: '0.10.0'
  last_updated: '2026-08-05'
  owners: ['Edson Junior (filhodoed)']
  domains: ['Rastreamento', 'Captura', 'Armazenamento', 'Visualização', 'Restauração']
  external_dependencies: ['VS Code Extension API (^1.125.0)', 'Node.js stdlib (fs, crypto, path, os)']
```

## Impact Index

```yaml
impact_index:
  - 'F_CAPTURE | src/snapshotStore.ts:captureSnapshot,captureSnapshotsBatch,applyCapture,hashContent,bucketIdFor | dom:Armazenamento | dep:F_PRUNE | exp:F_BASELINE,F_WATCH | ent:SérieDeVersões (StoreIndex.series: seriesId → SnapshotVersion[])(w) | evt:- | ir:IR_001,IR_003'
  - 'F_STORE_QUERY | src/snapshotStore.ts:listVersions,readSnapshotContent,findActiveSeriesId,getActiveSeries,listActiveFiles,hardenBucketPermissions | dom:Armazenamento | dep:- | exp:F_BASELINE,F_CHANGES_VIEW,F_DECORATE,F_DIFF,F_HISTORY_VIEW,F_RESTORE,F_SEEN,F_TRACK_LIFECYCLE,F_WATCH | ent:SérieDeVersões (StoreIndex.series: seriesId → SnapshotVersion[])(r) | evt:- | ir:IR_002,IR_012'
  - 'F_PRUNE | src/snapshotStore.ts:pruneOlderThan | dom:Armazenamento | dep:- | exp:F_ACTIVATE,F_CAPTURE,F_TRACK_LIFECYCLE | ent:SérieDeVersões (StoreIndex.series: seriesId → SnapshotVersion[])(w) | evt:- | ir:IR_006'
  - 'F_DELETE_BUCKET | src/snapshotStore.ts:deleteBucket,deleteBucketById | dom:Armazenamento | dep:- | exp:F_TRACK_LIFECYCLE,F_UNTRACK_FOLDER | ent:- | evt:- | ir:IR_011'
  - 'F_PURGE_PATH | src/snapshotStore.ts:purgePath | dom:Armazenamento | dep:- | exp:F_STOP_TRACKING_PATH | ent:SérieDeVersões (StoreIndex.series: seriesId → SnapshotVersion[])(w) | evt:- | ir:IR_014'
  - 'F_WATCH | src/fileWatcher.ts:watchTrackedFolder,createWatcherSession,captureIfNotIgnored,scheduleDebouncedCapture,registerPendingDeletion,consumeMatchingPendingDeletion | dom:Captura | dep:F_ACTIVATE,F_BINARY,F_CAPTURE,F_IGNORE,F_RENAME_CORRELATION,F_STORE_QUERY | exp:F_TRACK_LIFECYCLE | ent:SérieDeVersões (StoreIndex.series: seriesId → SnapshotVersion[])(r) | evt:+EVT_SNAPSHOT_CAPTURED -EVT_FS_CREATE_CHANGE,EVT_FS_DELETE | ir:IR_013'
  - 'F_BASELINE | src/fileWatcher.ts:captureBaselineSnapshots,walkFiles | dom:Captura | dep:F_BINARY,F_CAPTURE,F_IGNORE,F_STORE_QUERY | exp:F_TRACK_LIFECYCLE | ent:SérieDeVersões (StoreIndex.series: seriesId → SnapshotVersion[])(r) | evt:- | ir:-'
  - 'F_RENAME_CORRELATION | src/renameCorrelation.ts:findMatchingPendingDeletion | dom:Captura | dep:- | exp:F_WATCH | ent:- | evt:- | ir:IR_009'
  - 'F_IGNORE | src/ignoreFilters.ts:shouldIgnore,pathHasPrefix + src/config.ts:getIgnoreConfig,getIgnoreConfigForFolder,getRetentionDays | dom:Captura | dep:F_EXCLUDED_PATHS | exp:F_ACTIVATE,F_BASELINE,F_WATCH | ent:- | evt:- | ir:IR_007'
  - 'F_BINARY | src/binaryDetector.ts:isBinaryContent | dom:Captura | dep:- | exp:F_BASELINE,F_WATCH | ent:- | evt:- | ir:-'
  - 'F_ACTIVATE | src/extension.ts:activate | dom:Rastreamento | dep:F_CHANGES_VIEW,F_DECORATE,F_DIFF,F_EXCLUDED_PATHS,F_HISTORY_VIEW,F_IGNORE,F_MONITOR_VIEW,F_OPEN_CHANGE,F_PRUNE,F_REGISTRY,F_RESTORE,F_SEEN,F_STOP_TRACKING_PATH,F_TRACKED_VIEW,F_TRACK_FOLDER,F_TRACK_LIFECYCLE,F_UNTRACK_FOLDER | exp:F_WATCH | ent:PastaRastreada(r) | evt:- | ir:-'
  - 'F_TRACK_LIFECYCLE | src/trackedFolderLifecycle.ts:createTrackedFolderLifecycle | dom:Rastreamento | dep:F_BASELINE,F_DELETE_BUCKET,F_REGISTRY,F_STORE_QUERY,F_WATCH | exp:F_ACTIVATE | ent:- | evt:- | ir:IR_008'
  - 'F_REGISTRY | src/trackedFolders.ts (listTrackedFolders, isTracked, trackFolder, untrackFolder, resolveTrackedFolder, getBucketId, recordBucketId, forgetBucketId) | dom:Rastreamento | dep:- | exp:F_ACTIVATE,F_CHANGES_VIEW,F_DECORATE,F_HISTORY_VIEW,F_SEEN,F_TRACKED_VIEW,F_TRACK_FOLDER,F_TRACK_LIFECYCLE,F_UNTRACK_FOLDER | ent:PastaRastreada(r) | evt:- | ir:IR_005'
  - 'F_EXCLUDED_PATHS | src/excludedPaths.ts (listExcludedPaths, excludePath, includePath) | dom:Rastreamento | dep:- | exp:F_IGNORE,F_MONITOR_VIEW,F_STOP_TRACKING_PATH | ent:- | evt:- | ir:IR_015'
  - 'F_TRACK_FOLDER | src/commands.ts:trackFolderCommand + src/trackedFoldersCommands.ts:addFolderCommand,addFolderByPathCommand,validateFolderPath | dom:Rastreamento | dep:F_GIT_GUARD,F_REGISTRY | exp:F_ACTIVATE | ent:PastaRastreada(w) | evt:+EVT_FOLDER_TRACKED | ir:-'
  - 'F_UNTRACK_FOLDER | src/trackedFoldersCommands.ts:untrackFolderCommand + src/trackedFolderLifecycle.ts:untrackAndForget | dom:Rastreamento | dep:F_DELETE_BUCKET,F_REGISTRY | exp:F_TRACK_LIFECYCLE | ent:PastaRastreada(w) | evt:+EVT_FOLDER_UNTRACKED | ir:-'
  - 'F_STOP_TRACKING_PATH | src/pathExclusion.ts:stopTrackingPath + src/monitorCommands.ts:registerMonitorCheckboxHandler + src/changesCommands.ts:registerStopTrackingPathCommand | dom:Rastreamento | dep:F_EXCLUDED_PATHS,F_PURGE_PATH | exp:F_ACTIVATE | ent:- | evt:- | ir:-'
  - 'F_GIT_GUARD | src/gitGuard.ts:isInsideGitRepo | dom:Rastreamento | dep:- | exp:F_TRACK_FOLDER | ent:- | evt:- | ir:-'
  - 'F_RESTORE | src/restoreCommand.ts:restoreVersion + src/restoreService.ts:writeRestoredFile,resolveRestorePath,slugify | dom:Restauração | dep:F_STORE_QUERY | exp:- | ent:Blob (blobs/{sha256}.blob, conteúdo endereçado)(r),ArquivoRestaurado ({pasta}/restored/...)(w) | evt:- | ir:-'
  - 'F_DIFF_ELIGIBILITY | src/diffEligibility.ts:canShowDiff | dom:Visualização | dep:- | exp:F_CHANGES_VIEW,F_HISTORY_VIEW | ent:- | evt:- | ir:IR_010'
  - 'F_HISTORY_VIEW | src/historyTreeProvider.ts:BacktrailHistoryProvider | dom:Visualização | dep:F_DIFF,F_DIFF_ELIGIBILITY,F_REGISTRY,F_STORE_QUERY | exp:F_ACTIVATE | ent:SérieDeVersões (StoreIndex.series: seriesId → SnapshotVersion[])(r),PastaRastreada(r) | evt:- | ir:-'
  - 'F_CHANGES_VIEW | src/changesProvider.ts:ChangesProvider | dom:Visualização | dep:F_DIFF_ELIGIBILITY,F_REGISTRY,F_SEEN,F_STORE_QUERY | exp:F_ACTIVATE | ent:SérieDeVersões (StoreIndex.series: seriesId → SnapshotVersion[])(r),PastaRastreada(r),MapaDeVistos (globalState backtrail.seenVersions: seriesId → timestamp)(r) | evt:- | ir:-'
  - 'F_TRACKED_VIEW | src/trackedFoldersProvider.ts:TrackedFoldersProvider | dom:Visualização | dep:F_REGISTRY | exp:F_ACTIVATE | ent:PastaRastreada(r) | evt:- | ir:-'
  - 'F_MONITOR_VIEW | src/monitorProvider.ts:MonitorProvider | dom:Visualização | dep:F_EXCLUDED_PATHS,F_REGISTRY | exp:F_ACTIVATE,F_STOP_TRACKING_PATH | ent:PastaRastreada(r),CaminhosExcluidos (globalState backtrail.excludedPaths: folder → relPath[])(r) | evt:- | ir:-'
  - 'F_DECORATE | src/decorationProvider.ts:createDecorationProvider | dom:Visualização | dep:F_REGISTRY,F_SEEN,F_STORE_QUERY | exp:F_ACTIVATE | ent:SérieDeVersões (StoreIndex.series: seriesId → SnapshotVersion[])(r),PastaRastreada(r),MapaDeVistos (globalState backtrail.seenVersions: seriesId → timestamp)(r) | evt:- | ir:-'
  - 'F_SEEN | src/seenVersions.ts:markSeen,markManySeen,getDecorationState + src/decorationProvider.ts:markFileAsSeen,markFolderAsSeen | dom:Visualização | dep:F_REGISTRY,F_STORE_QUERY | exp:F_ACTIVATE,F_CHANGES_VIEW,F_DECORATE,F_OPEN_CHANGE,F_TRACK_FOLDER | ent:PastaRastreada(r) | evt:- | ir:IR_004'
  - 'F_DIFF | src/diffCommand.ts:registerDiffCommand,showDiff,showVersionInfo,writeTempSide | dom:Visualização | dep:F_STORE_QUERY | exp:F_CHANGES_VIEW,F_HISTORY_VIEW,F_OPEN_CHANGE | ent:Blob (blobs/{sha256}.blob, conteúdo endereçado)(r) | evt:- | ir:-'
  - 'F_OPEN_CHANGE | src/changesCommands.ts:registerOpenChangedFileCommand | dom:Visualização | dep:F_DIFF,F_SEEN | exp:F_CHANGES_VIEW | ent:MapaDeVistos (globalState backtrail.seenVersions: seriesId → timestamp)(w) | evt:- | ir:-'
```

> Este arquivo é o índice do MoF. Funções, entidades, eventos e relacionamentos internos vivem por domínio em `docs/mof/` — ver § Domínios abaixo. Nunca duplique uma função entre este índice e um arquivo de domínio.

## Domínios

| Domínio       | Arquivo                                        | Funções                                                                                                                          |
| ------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Rastreamento  | [`mof/rastreamento.md`](mof/rastreamento.md)   | F_ACTIVATE, F_TRACK_LIFECYCLE, F_REGISTRY, F_EXCLUDED_PATHS, F_TRACK_FOLDER, F_UNTRACK_FOLDER, F_STOP_TRACKING_PATH, F_GIT_GUARD |
| Captura       | [`mof/captura.md`](mof/captura.md)             | F_WATCH, F_BASELINE, F_RENAME_CORRELATION, F_IGNORE, F_BINARY                                                                    |
| Armazenamento | [`mof/armazenamento.md`](mof/armazenamento.md) | F_CAPTURE, F_STORE_QUERY, F_PRUNE, F_DELETE_BUCKET, F_PURGE_PATH                                                                 |
| Visualização  | [`mof/visualizacao.md`](mof/visualizacao.md)   | F_DIFF_ELIGIBILITY, F_HISTORY_VIEW, F_CHANGES_VIEW, F_TRACKED_VIEW, F_MONITOR_VIEW, F_DECORATE, F_SEEN, F_DIFF, F_OPEN_CHANGE    |
| Restauração   | [`mof/restauracao.md`](mof/restauracao.md)     | F_RESTORE                                                                                                                        |

## Workflows

```yaml
workflows:
  - id: 'W_TRACK'
    name: 'Rastrear uma pasta nova'
    starts_at: 'F_TRACK_FOLDER'
    ends_at: 'F_BASELINE'
    sequence:
      ['F_TRACK_FOLDER', 'F_GIT_GUARD', 'F_REGISTRY', 'F_ACTIVATE', 'F_TRACK_LIFECYCLE', 'F_WATCH', 'F_BASELINE']

  - id: 'W_EDIT'
    name: 'Save de arquivo vira versão no histórico'
    starts_at: 'F_WATCH'
    ends_at: 'F_CHANGES_VIEW'
    sequence:
      [
        'F_WATCH',
        'F_IGNORE',
        'F_BINARY',
        'F_STORE_QUERY',
        'F_CAPTURE',
        'F_ACTIVATE',
        'F_DECORATE',
        'F_HISTORY_VIEW',
        'F_CHANGES_VIEW',
      ]

  - id: 'W_RENAME'
    name: 'Rename preserva a série de versões'
    starts_at: 'F_WATCH'
    ends_at: 'F_CAPTURE'
    sequence: ['F_WATCH', 'F_STORE_QUERY', 'F_RENAME_CORRELATION', 'F_CAPTURE']

  - id: 'W_VIEW_DIFF'
    name: 'Ver diff de uma versão'
    starts_at: 'F_HISTORY_VIEW'
    ends_at: 'F_DIFF'
    sequence: ['F_HISTORY_VIEW', 'F_DIFF_ELIGIBILITY', 'F_DIFF']

  - id: 'W_OPEN_CHANGE'
    name: 'Abrir mudança da lista de Changes (e marcar vista)'
    starts_at: 'F_CHANGES_VIEW'
    ends_at: 'F_SEEN'
    sequence: ['F_CHANGES_VIEW', 'F_OPEN_CHANGE', 'F_DIFF', 'F_SEEN']

  - id: 'W_RESTORE'
    name: 'Restaurar versão sem sobrescrever'
    starts_at: 'F_RESTORE'
    ends_at: 'F_WATCH'
    sequence: ['F_RESTORE', 'F_STORE_QUERY', 'F_WATCH']

  - id: 'W_RETENTION'
    name: 'Retenção na ativação'
    starts_at: 'F_ACTIVATE'
    ends_at: 'F_PRUNE'
    sequence: ['F_ACTIVATE', 'F_PRUNE']
```

## Relacionamentos (cross-domínio)

Relacionamentos internos a um único domínio vivem no arquivo de domínio correspondente. Os que atravessam domínios ficam aqui.

```yaml
relationships:
  - {
      id: 'R_002',
      from: 'F_TRACK_LIFECYCLE',
      to: 'F_WATCH',
      type: 'calls',
      coupling: 'tight',
      channel: 'in-process',
      criticality: 'critical',
      description: 'Cria um watcher por pasta rastreada na ativação e a cada track',
    }
  - {
      id: 'R_003',
      from: 'F_ACTIVATE',
      to: 'F_PRUNE',
      type: 'calls',
      coupling: 'tight',
      channel: 'in-process',
      criticality: 'degraded_ok',
      description: 'Prune por pasta: na ativação, a cada 24h (setInterval) e sob demanda (comando backtrail.pruneNow) — Fase 2, 26/07',
    }
  - {
      id: 'R_007',
      from: 'F_WATCH',
      to: 'F_CAPTURE',
      type: 'writes_to',
      coupling: 'tight',
      channel: 'File',
      criticality: 'critical',
      description: 'Grava snapshot no store por evento',
    }
  - {
      id: 'R_009',
      from: 'F_WATCH',
      to: 'F_STORE_QUERY',
      type: 'reads_from',
      coupling: 'tight',
      channel: 'File',
      criticality: 'critical',
      description: 'findActiveSeriesId/listVersions para decidir série do evento',
    }
  - {
      id: 'R_010',
      from: 'F_BASELINE',
      to: 'F_CAPTURE',
      type: 'writes_to',
      coupling: 'tight',
      channel: 'File',
      criticality: 'critical',
      description: 'captureSnapshotsBatch por chunk de 200',
    }
  - {
      id: 'R_011',
      from: 'F_HISTORY_VIEW',
      to: 'F_STORE_QUERY',
      type: 'reads_from',
      coupling: 'tight',
      channel: 'File',
      criticality: 'critical',
      description: 'Lista versões do arquivo ativo',
    }
  - {
      id: 'R_012',
      from: 'F_CHANGES_VIEW',
      to: 'F_STORE_QUERY',
      type: 'reads_from',
      coupling: 'tight',
      channel: 'File',
      criticality: 'critical',
      description: 'listActiveFiles por pasta rastreada',
    }
  - {
      id: 'R_015',
      from: 'F_DECORATE',
      to: 'F_STORE_QUERY',
      type: 'reads_from',
      coupling: 'tight',
      channel: 'File',
      criticality: 'critical',
      description: 'Série ativa + última versão por uri visível',
    }
  - {
      id: 'R_016',
      from: 'F_DIFF',
      to: 'F_STORE_QUERY',
      type: 'reads_from',
      coupling: 'tight',
      channel: 'File',
      criticality: 'critical',
      description: 'readSnapshotContent para materializar os lados do diff',
    }
  - {
      id: 'R_017',
      from: 'F_RESTORE',
      to: 'F_STORE_QUERY',
      type: 'reads_from',
      coupling: 'tight',
      channel: 'File',
      criticality: 'critical',
      description: 'readSnapshotContent do blob a restaurar',
    }
  - {
      id: 'R_021',
      from: 'F_WATCH',
      to: 'F_ACTIVATE',
      type: 'publishes',
      coupling: 'loose',
      channel: 'callback',
      criticality: 'degraded_ok',
      description: 'onCapture notifica para refresh de views/decorações',
    }
  - {
      id: 'R_022',
      from: 'F_SEEN',
      to: 'F_STORE_QUERY',
      type: 'reads_from',
      coupling: 'tight',
      channel: 'File',
      criticality: 'critical',
      description: 'markFileAsSeen/markFolderAsSeen resolvem série e timestamp atuais',
    }
  - {
      id: 'R_024',
      from: 'F_TRACK_LIFECYCLE',
      to: 'F_BASELINE',
      type: 'calls',
      coupling: 'tight',
      channel: 'in-process',
      criticality: 'degraded_ok',
      description: 'Dispara baseline cancelável em onFolderTracked',
    }
  - {
      id: 'R_026',
      from: 'F_TRACK_LIFECYCLE',
      to: 'F_DELETE_BUCKET',
      type: 'calls',
      coupling: 'tight',
      channel: 'in-process',
      criticality: 'critical',
      description: 'untrackAndForget apaga o bucket incondicionalmente ao cancelar um baseline',
    }
  - {
      id: 'R_027',
      from: 'F_TRACK_LIFECYCLE',
      to: 'F_STORE_QUERY',
      type: 'calls',
      coupling: 'tight',
      channel: 'File',
      criticality: 'degraded_ok',
      description: 'hardenBucketPermissions e pruneOlderThan da pasta, antes do primeiro watch (startWatching)',
    }
```

## Regras de Impacto

```yaml
impact_rules:
  - id: 'IR_001'
    trigger:
      function_id: 'F_CAPTURE'
      change: 'contrato — formato do StoreIndex/index.json ou SnapshotVersion'
    affected_direct: ['F_STORE_QUERY', 'F_PRUNE']
    affected_indirect:
      ['F_WATCH', 'F_BASELINE', 'F_HISTORY_VIEW', 'F_CHANGES_VIEW', 'F_DECORATE', 'F_SEEN', 'F_DIFF', 'F_RESTORE']
    impact_type: 'breaking'
    risk: 'high'
    recommended_actions:
      - 'Índices existentes no disco dos usuários NÃO são migráveis automaticamente — qualquer mudança de schema exige migração ou leitura retrocompatível em readIndex'
      - 'Atualizar test/unit/snapshotStore.test.ts e revisar todos os testes de provider'
      - 'Mesmo princípio se aplica ao formato de blob (não só ao index.json): a Fase 4 (compressão) resolveu isso com leitura retrocompatível por magic bytes em vez de migração — precedente a seguir se o formato de blob mudar de novo (ver ADR-0001)'

  - id: 'IR_002'
    trigger:
      function_id: 'F_STORE_QUERY'
      change: "comportamento — semântica de 'série ativa' (última versão define relPath; primeiro match vence)"
    affected_direct: ['F_WATCH', 'F_BASELINE', 'F_DECORATE', 'F_CHANGES_VIEW', 'F_HISTORY_VIEW', 'F_SEEN']
    affected_indirect: ['F_DIFF', 'F_OPEN_CHANGE']
    impact_type: 'behavioral'
    risk: 'high'
    recommended_actions:
      - 'É o maior fan-in do sistema. Mudar a regra de resolução de série ativa altera qual histórico cada arquivo mostra e qual série recebe o próximo snapshot'
      - 'Rodar test:unit e test:integration completos; revisar W_EDIT e W_RENAME de ponta a ponta'

  - id: 'IR_003'
    trigger:
      function_id: 'F_CAPTURE'
      change: 'regra de negócio — dedup de saves (mesmo hash + mesmo relPath = mesma versão)'
    affected_direct: ['F_WATCH', 'F_BASELINE']
    affected_indirect:
      [
        'F_HISTORY_VIEW (versões duplicadas)',
        'F_CHANGES_VIEW',
        'F_RENAME_CORRELATION (rename de conteúdo idêntico depende de GERAR entrada)',
      ]
    impact_type: 'behavioral'
    risk: 'medium'
    recommended_actions:
      - 'Cuidado com a exceção do rename: conteúdo igual com relPath diferente PRECISA gerar versão — é o único registro do rename'

  - id: 'IR_004'
    trigger:
      function_id: 'F_SEEN'
      change: 'contrato — chave backtrail.seenVersions ou formato do mapa seriesId→timestamp'
    affected_direct: ['F_DECORATE', 'F_CHANGES_VIEW', 'F_OPEN_CHANGE']
    affected_indirect: ['F_ACTIVATE (mark-seen do editor ativo)']
    impact_type: 'breaking'
    risk: 'medium'
    recommended_actions:
      - "Estado persiste no globalState dos usuários — mudança de formato zera o 'visto' de todo mundo (tudo reaparece como New)"
      - 'Comparação lexicográfica de timestamp exige manter toISOString (UTC, formato fixo)'

  - id: 'IR_005'
    trigger:
      function_id: 'F_REGISTRY'
      change: 'contrato — chave backtrail.trackedFolders ou formato (string[] de caminhos absolutos)'
    affected_direct:
      [
        'F_ACTIVATE',
        'F_TRACK_FOLDER',
        'F_UNTRACK_FOLDER',
        'F_DECORATE',
        'F_SEEN',
        'F_HISTORY_VIEW',
        'F_CHANGES_VIEW',
        'F_TRACKED_VIEW',
      ]
    affected_indirect: ['todas as demais — sem registro não há sistema']
    impact_type: 'breaking'
    risk: 'high'
    recommended_actions:
      - 'Formato persiste entre sessões; migração obrigatória se mudar'

  - id: 'IR_006'
    trigger:
      function_id: 'F_PRUNE'
      change: 'comportamento — critério de descarte ou GC de blobs'
    affected_direct: ['F_STORE_QUERY']
    affected_indirect: ['F_DIFF', 'F_RESTORE (blob removido = diff/restore quebrado)']
    impact_type: 'behavioral'
    risk: 'high'
    recommended_actions:
      - 'Única função que apaga dados PARCIALMENTE. Um bug aqui é perda de histórico irrecuperável — teste de regressão obrigatório para qualquer mudança'
      - 'GC só pode remover blob cujo hash não é referenciado por NENHUMA série remanescente'
      - 'Desde a Fase 2 (26/07) é chamada com muito mais frequência (setInterval diário + comando manual, não só na ativação) — qualquer regressão de performance ou corrupção aqui agora se manifesta bem mais rápido para o usuário'
      - 'Desde a Fase 3 (26/07), "critério de descarte" também inclui o cap por versão (maxVersionsPerSeries) — mudar a ordem (cap antes do filtro de idade) ou o critério de corte (ex.: trocar "últimas N" por thinning temporal) exige atualizar test/unit/snapshotStore.test.ts (should_cap_a_series_to_the_configured_max_versions_keeping_the_most_recent, should_remove_blob_orphaned_by_the_version_cap)'

  - id: 'IR_013'
    trigger:
      function_id: 'F_WATCH'
      change: 'comportamento — introduz debounce de captura (captureDebounceSeconds) para relPath com série já ativa'
    affected_direct: ['F_TRACK_LIFECYCLE']
    affected_indirect:
      [
        'F_HISTORY_VIEW (nova versão só aparece após o quiet window)',
        'F_CHANGES_VIEW (badge Modified atrasa até a captura disparar)',
        'F_DECORATE',
      ]
    impact_type: 'behavioral'
    risk: 'low'
    recommended_actions:
      - 'Escopo restrito ao branch existingSeriesId — rename correlation (create sem série ativa) permanece síncrono/imediato, sem interação com a janela de 5s (IR_009). Não estender o debounce para esse branch sem reavaliar a correlação'
      - 'Timer por relPath (captureDebounceTimers) deve ser limpo no dispose junto com os de pending-deletion/grace — teste de regressão: "disposing the watcher cancels a pending debounced capture" em fileWatcher.test.ts. Desde a Fase 7 (31/07) esse dispose vive em createWatcherSession, chamado por watchTrackedFolder via vscode.Disposable — mesmo comportamento, outro arquivo'
      - 'Corrigido na Fase 6 (28/07) — desatualizado até esta revisão (0.8.0, 31/07): lê o conteúdo do disco no momento do EVENTO que agenda a captura (captureIfNotIgnored), não no momento do fire do timer; o conteúdo fica guardado em PendingCapture até o timer decidir persistir. Antes da Fase 6, um delete/rename que chegasse antes do fire causava ENOENT no reread e a edição pendente era descartada em silêncio — ver a nota de Fase 6 em F_WATCH'
      - 'Suítes que testam correção de captura imediata (fileWatcher.test.ts "File Watcher Integration", historyTreeProvider.test.ts) usam captureDebounceSeconds: 0 — não reverter para o default de produção (15s) nelas'

  - id: 'IR_011'
    trigger:
      function_id: 'F_DELETE_BUCKET'
      change: 'comportamento — critério de quando apagar (quem confirma, quem não confirma)'
    affected_direct: ['F_UNTRACK_FOLDER', 'F_TRACK_LIFECYCLE']
    affected_indirect: ['F_STORE_QUERY (bucket some inteiro, não parcialmente)']
    impact_type: 'behavioral'
    risk: 'high'
    recommended_actions:
      - 'Apaga o bucket INTEIRO, não parcialmente como F_PRUNE — irreversível, sem lixeira. Teste de regressão obrigatório (ver test/unit/snapshotStore.test.ts: should_delete_the_whole_bucket_for_a_tracked_folder)'
      - "Preservar a assimetria de confirmação: Stop Tracking manual pergunta antes (warning prompt fire-and-forget); untrackAndForget (cancelamento de baseline) apaga sem perguntar, pois esse caminho já significa 'desfazer tudo'. Trocar essa assimetria por engano remove a única rede de segurança contra perda acidental de histórico"

  - id: 'IR_007'
    trigger:
      function_id: 'F_IGNORE'
      change: 'comportamento — regra de matching (segmento exato, extensão, tamanho)'
    affected_direct: ['F_WATCH', 'F_BASELINE']
    affected_indirect: ['volume do store (ignorar de menos infla blobs; de mais perde histórico)']
    impact_type: 'behavioral'
    risk: 'medium'
    recommended_actions:
      - 'Atualizar test/unit/ignoreFilters.test.ts; lembrar que config só é relida na criação do watcher'

  - id: 'IR_008'
    trigger:
      function_id: 'F_TRACK_LIFECYCLE'
      change: 'comportamento — semântica dos callbacks onFolderTracked/onFolderUntracked/onCapture (extraída de F_ACTIVATE na Fase 7, 31/07 — mesma regra, código só mudou de arquivo)'
    affected_direct: ['F_ACTIVATE', 'F_TRACK_FOLDER', 'F_UNTRACK_FOLDER', 'F_WATCH']
    affected_indirect: ['F_HISTORY_VIEW', 'F_CHANGES_VIEW', 'F_TRACKED_VIEW', 'F_DECORATE', 'F_BASELINE']
    impact_type: 'behavioral'
    risk: 'medium'
    recommended_actions:
      - 'Ordem importa: watcher inicia ANTES do baseline (edits durante o scan); persistir rastreio ANTES de updateWorkspaceFolders (reload do host)'
      - 'Cancelamento do baseline desfaz o rastreio inteiro (untrackAndForget) — preservar essa semântica'

  - id: 'IR_009'
    trigger:
      function_id: 'F_RENAME_CORRELATION'
      change: 'comportamento — janelas de tempo (5000/500ms) ou critério de match por hash'
    affected_direct: ['F_WATCH']
    affected_indirect:
      ['F_HISTORY_VIEW (histórico quebrado em duas séries)', 'F_CHANGES_VIEW (arquivo renomeado aparece como New)']
    impact_type: 'behavioral'
    risk: 'low'
    recommended_actions:
      - 'Falha de correlação não perde dados — só quebra a continuidade da série. Atualizar test/unit/renameCorrelation.test.ts e fileWatcher.test.ts'

  - id: 'IR_010'
    trigger:
      function_id: 'F_DIFF_ELIGIBILITY'
      change: 'comportamento — conjunto de extensões de imagem ou regra binário/texto'
    affected_direct: ['F_HISTORY_VIEW', 'F_CHANGES_VIEW']
    affected_indirect: ['F_DIFF (recebe versões que assume exibíveis)']
    impact_type: 'non_breaking'
    risk: 'low'
    recommended_actions:
      - 'Atualizar test/unit/diffEligibility.test.ts'

  - id: 'IR_012'
    trigger:
      function_id: 'F_STORE_QUERY'
      change: 'comportamento — estratégia de cache/invalidação do índice em memória (indexCache, readMutableIndex)'
    affected_direct: ['F_CAPTURE', 'F_PRUNE']
    affected_indirect: ['F_WATCH', 'F_BASELINE', 'F_DECORATE', 'F_HISTORY_VIEW', 'F_CHANGES_VIEW', 'F_SEEN']
    impact_type: 'behavioral'
    risk: 'medium'
    recommended_actions:
      - 'Caminhos de escrita (captureSnapshot, captureSnapshotsBatch, pruneOlderThan) DEVEM usar readMutableIndex, nunca o índice retornado por readIndex diretamente — mutar o objeto cacheado antes de writeIndex confirmar sucesso deixa o cache à frente do disco se a escrita falhar depois (versão fantasma, nunca persistida, aparece em leituras subsequentes)'
      - 'Cache é keyed pelo mtime do index.json — qualquer escrita que não altere o mtime do arquivo quebraria a invalidação; não trocar por cache por conteúdo/hash sem medir o custo do hash em si'
      - 'Rodar test/unit/snapshotStore.test.ts (cenário de mtime cross-window) a cada mudança nesta área'

  - id: 'IR_014'
    trigger:
      function_id: 'F_PURGE_PATH'
      change: 'comportamento — critério de qual série é purgada, ou GC de blobs'
    affected_direct: ['F_STORE_QUERY', 'F_STOP_TRACKING_PATH']
    affected_indirect: ['F_DIFF', 'F_RESTORE (blob removido = diff/restore quebrado)']
    impact_type: 'behavioral'
    risk: 'high'
    recommended_actions:
      - 'Terceira função que apaga dados (junto de F_PRUNE/IR_006 e F_DELETE_BUCKET/IR_011) — irreversível, sem teste de regressão não se mexe aqui (ver test/unit/snapshotStore.test.ts: should_purge_a_series_currently_living_under_the_given_path_prefix e vizinhos)'
      - "Critério de match DEVE seguir a mesma regra de 'série ativa' de IR_002 (última versão define o relPath corrente) — usar qualquer versão histórica em vez da ativa purgaria série que já foi renomeada para fora do caminho excluído, destruindo histórico de um arquivo que o usuário ainda quer rastrear"
      - 'GC de blob órfão deve usar o mesmo critério de referência de F_PRUNE (IR_006) — as duas funções competem pelos mesmos blobs, uma diferença de critério entre elas deixaria um blob referenciado por uma virar órfão pela outra'

  - id: 'IR_015'
    trigger:
      function_id: 'F_EXCLUDED_PATHS'
      change: 'contrato — chave backtrail.excludedPaths ou formato (Record<folder, relPath[]>)'
    affected_direct: ['F_IGNORE', 'F_MONITOR_VIEW', 'F_STOP_TRACKING_PATH']
    affected_indirect: ['F_WATCH', 'F_BASELINE (via getIgnoreConfigForFolder)']
    impact_type: 'breaking'
    risk: 'medium'
    recommended_actions:
      - 'Formato persiste entre sessões; migração obrigatória se mudar (mesmo princípio de IR_005 para backtrail.trackedFolders)'
      - 'Atualizar test/unit/excludedPaths.test.ts e test/unit/ignoreFilters.test.ts (casos excludedPathPrefixes)'
```

## Regras Transversais (Cross-Cutting)

- **Tolerância a pasta inacessível:** toda superfície que toca uma pasta rastreada (watcher, baseline, Changes view, ativação) engole a falha e segue — uma pasta movida/deletada/desmontada nunca derruba o resto. Callbacks do FileSystemWatcher engolem QUALQUER exceção: um throw ali derruba o extension host inteiro.
- **Restauração nunca destrutiva:** restore sempre escreve cópia nova em `restored/`, nunca sobrescreve o original. É promessa de produto (está no README e no nome da feature).
- **Sem git:** pastas dentro de repositório git são bloqueadas nos dois comandos de track (F_GIT_GUARD). Regra de produto, não limitação técnica.
- **Persistência em três lugares:** `globalState` (pastas rastreadas + mapa de vistos), `globalStorageUri` (index.json + blobs por bucket sha256-de-realpath), e tmpdir (lados de diff, limpos no dispose). Nenhum dado do usuário vai para fora da máquina.
- **Resiliência de índice:** index.json corrompido (crash mid-write, duas janelas concorrentes) é tratado como vazio e substituído na próxima escrita. Não há lock entre janelas do VS Code — duas janelas gravando no mesmo bucket podem perder escritas (last-writer-wins), limitação conhecida e aceita.
- **Prune na ativação, periodicamente e sob demanda:** retenção roda por pasta na ativação, a cada 24h via `setInterval` (F_ACTIVATE) e a qualquer momento via comando `backtrail.pruneNow` — Fase 2 de performance (26/07) resolveu a limitação anterior (janela aberta por semanas não aplicava retenção até reativar).
- **Duas mitigações para crescimento de série sem teto (Fase 3, 26/07):** debounce de 15s em F_WATCH reduz a taxa de captura na origem (saves consecutivos do mesmo arquivo colapsam em uma versão); cap de 100 versões por série em F_PRUNE é o backstop que age no que passar do debounce mesmo assim. As duas são independentes e configuráveis (`backtrail.captureDebounceSeconds`, `backtrail.maxVersionsPerSeries`).

### Decisões registradas (2026-07-26) — implementadas na Fase 1 de hardening

Respostas do owner às perguntas em aberto do bootstrap — implementadas em 2026-07-26 (branch `feat/store-hardening`):

1. **`restored/` nasce fora do tracking.** ✅ Implementado: `restored` está em `DEFAULT_IGNORED_FOLDERS` (F_IGNORE). Afetou F_RESTORE, F_WATCH, F_BASELINE.
2. **Untrack dispara prune automático.** ✅ Implementado com a assimetria de confirmação que o owner sinalizou como necessária: `Stop Tracking` manual pergunta antes de apagar (F_UNTRACK_FOLDER, warning prompt); `untrackAndForget` do cancelamento de baseline (F_TRACK_LIFECYCLE desde a Fase 7, 31/07 — antes vivia em F_ACTIVATE) apaga sem perguntar. Nova função F_DELETE_BUCKET (IR_011) faz a exclusão em si; F_PRUNE (IR_006) continua sendo a exclusão parcial por idade.

## Perguntas em Aberto

```yaml
open_questions: [] # perguntas do bootstrap respondidas em 2026-07-26 — ver Regras Transversais § Decisões registradas
```

## Histórico de Revisões

| Versão | Data       | Autor            | Mudanças                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------ | ---------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1.0  | 2026-07-26 | Claude (fde-mof) | Criação inicial — bootstrap completo, 100% verificado no código (v0.5.0)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 0.1.1  | 2026-07-26 | Claude (fde-mof) | Open questions respondidas pelo owner: restored/ fora do tracking; prune automático no untrack. Registradas como decisões pendentes de implementação                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 0.2.0  | 2026-07-26 | Claude (fde-mof) | Fase 1 de hardening implementada (branch feat/store-hardening): nova F_DELETE_BUCKET + IR_011; F_CAPTURE/F_STORE_QUERY atualizadas (escrita atômica, .bak, permissões 0600/0700, verificação de hash); F_IGNORE com ignoredFiles; F_RESTORE e F_UNTRACK_FOLDER com as duas decisões do owner implementadas                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 0.3.0  | 2026-07-26 | Claude (fde-mof) | Fase 2 de performance implementada (branch perf/index-cache): F_STORE_QUERY ganha cache de StoreIndex por mtime + readMutableIndex (nova IR_012); índice compacto sem pretty-print (F_CAPTURE); F_ACTIVATE ganha prune periódico (setInterval 24h) + comando backtrail.pruneNow, substituindo a limitação "só na ativação" (F_PRUNE não-responsabilidade e regra transversal atualizadas)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 0.4.0  | 2026-07-26 | Claude (fde-mof) | Fase 3 de captura inteligente implementada (branch feat/capture-throttle, commit 86f21a7): F_WATCH ganha debounce de 15s por relPath com série ativa (scheduleDebouncedCapture, nova IR_013), escopado para não tocar a correlação de rename (IR_009); F_PRUNE ganha cap de 100 versões por série após o filtro de idade (IR_006 atualizada); regra transversal nova sobre as duas mitigações combinadas                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 0.5.0  | 2026-07-27 | Claude (fde-mof) | Fase 4 de compressão implementada (branch feat/blob-compression, PR #36): F_CAPTURE grava blobs novos em gzip (node:zlib), F_STORE_QUERY descomprime por magic bytes e aceita os dois formatos sem migração (IR_001 atualizada com o mesmo precedente); primeira ADR do repo (docs/adr/0001-blob-compression.md) — medição real no corpus ~/.claude: 3.76x, não os ~10x estimados no plano                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 0.6.0  | 2026-07-27 | Claude (fde-mof) | Fase 5 de exclusão granular implementada (branch feat/path-exclusion): tópico 7 completo — novas F_EXCLUDED_PATHS (persistência, IR_015), F_PURGE_PATH (purga retroativa, IR_014), F_MONITOR_VIEW (TreeView com checkbox nativo) e F_STOP_TRACKING_PATH (orquestra exclusão + purga opcional, compartilhada pelo checkbox e pelo menu de contexto da view Changes); F_IGNORE ganha excludedPathPrefixes (matching por segmento); F_ACTIVATE reinicia só o watcher da pasta afetada para a exclusão valer sem reload de janela                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 0.7.0  | 2026-07-28 | Claude (fde-mof) | Retroativo — Fase 6 de hardening (28/07) não tinha entrada nesta tabela apesar de já estar documentada inline nas funções: F_WATCH corrige a leitura do debounce (conteúdo lido no evento, não no fire — PendingCapture); F_STORE_QUERY valida o formato do índice (parseStoreIndex) em vez de só JSON.parse+cast; F_REGISTRY ganha bucketIds (getBucketId/recordBucketId/forgetBucketId); F_DELETE_BUCKET ganha deleteBucketById e fallbackBucketId; F_ACTIVATE cria o output channel "Backtrail" e passa logWarning ao watcher. IR_013 foi corrigida nesta revisão (0.8.0) para refletir o comportamento pós-Fase-6, que estava desatualizada até agora                                                                                                                                                                                                                                                                                                                                   |
| 0.8.0  | 2026-07-31 | Claude (fde-mof) | Fase 7 — sincronização pós-PR #50 (refactor: deepen hot-spot modules): nova F_TRACK_LIFECYCLE (src/trackedFolderLifecycle.ts) extraída de F_ACTIVATE — mesmos corpos e ordem de chamadas de onFolderTracked/onFolderUntracked/untrackAndForget/onExclusionChanged/startWatching/stopWatching, só mudou de arquivo (IR_008 realocada, IR_011/IR_013 atualizadas, novos R_024–R_027); F_STORE_QUERY ganha getActiveSeries (wrapper de findActiveSeriesId+listVersions, elimina duplicação em decorationProvider.ts e historyTreeProvider.ts); F_WATCH ganha createWatcherSession (pendingDeletions/pendingCaptureTimers/captureDebounceTimers saem de parâmetros posicionais para um closure por pasta vigiada). Candidato de unificar bucketIds/excludedPaths/seenVersions num helper genérico foi tentado e revertido — quebra test:unit (node --test não resolve import de valor sem extensão entre .ts do pacote, mesma restrição já documentada na nota de F_IGNORE sobre pathHasPrefix) |
| 0.9.0  | 2026-08-01 | Claude (fde-mof) | Migrado para o padrão de MoF dividido por domínio (fde-mof, novo padrão): Funções, Entidades, Eventos e Relacionamentos internos movidos para `docs/mof/{rastreamento,captura,armazenamento,visualizacao,restauracao}.md`; este arquivo virou índice — Metadados, Inventário, Domínios, Workflows, Relacionamentos e Regras de Impacto cross-domínio, Regras Transversais, Perguntas em Aberto e Histórico. Nenhuma função, entidade, evento, regra de impacto ou decisão de conteúdo foi alterada — reorganização estrutural apenas                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 0.10.0 | 2026-08-05 | Claude (mof)     | Adicionado o Impact Index (28 funções) no topo do índice — Modo B agora lê só ele, abrindo o bloco completo de uma função apenas quando ela entra no raio calculado; nunca se divide, mesmo com os domínios divididos. Removida a seção `Inventário (pré-classificação)`: rascunho de sessão do Modo A, 100% classificado, sem leitor em nenhum modo — deixou de ser persistido. `dep:`/`exp:` vêm da união de `relationships[]` com o `boundaries` de cada função (fonte antiga, ainda mais completa que `relationships[]` em ~78 arestas) — nenhuma aresta já registrada foi perdida na migração. `docs/MOF.html` regerado a partir do shell fixo v0.4.0 da skill (`mof-shell.html`), corrigindo labels ilegíveis em dark mode presentes desde a geração original (skill `fde-mof`, Modo D). Nenhuma função, relacionamento ou regra de impacto de negócio alterada — migração de formato, verificado sem commits em `src/` desde a v0.9.0                                                |
