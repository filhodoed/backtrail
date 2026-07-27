# Map of Functions — Backtrail

> Consulte este documento antes de criar, modificar ou refatorar código.
> Avalie sempre o raio de impacto: verifique `exposed_to` e `impact_rules`
> antes de alterar qualquer função.

## Metadados

```yaml
mof_meta:
  system_name: 'Backtrail'
  purpose: 'Extensão VS Code que mantém histórico contínuo de arquivos em pastas sem git — captura cada save, exibe diffs e restaura versões sem sobrescrever os arquivos originais.'
  version: '0.5.0'
  last_updated: '2026-07-27'
  owners: ['Edson Junior (filhodoed)']
  domains: ['Rastreamento', 'Captura', 'Armazenamento', 'Visualização', 'Restauração']
  external_dependencies: ['VS Code Extension API (^1.125.0)', 'Node.js stdlib (fs, crypto, path, os)']
```

## Inventário (pré-classificação)

```yaml
inventory:
  - { name: 'Ativação da extensão (extension.ts)', kind: 'function', status: 'verified' }
  - { name: 'Registro de pastas rastreadas (trackedFolders.ts)', kind: 'function', status: 'verified' }
  - { name: 'Comandos de rastreamento (commands.ts, trackedFoldersCommands.ts)', kind: 'function', status: 'verified' }
  - { name: 'Guarda de git (gitGuard.ts)', kind: 'function', status: 'verified' }
  - { name: 'Vigilância de pasta (fileWatcher.ts)', kind: 'function', status: 'verified' }
  - { name: 'Baseline de pasta recém-rastreada (fileWatcher.ts)', kind: 'function', status: 'verified' }
  - { name: 'Correlação de renomeações (renameCorrelation.ts)', kind: 'function', status: 'verified' }
  - { name: 'Snapshot store (snapshotStore.ts)', kind: 'function', status: 'verified' }
  - { name: 'Retenção/prune (snapshotStore.ts)', kind: 'function', status: 'verified' }
  - { name: 'Filtros de ignore (ignoreFilters.ts, config.ts)', kind: 'function', status: 'verified' }
  - { name: 'Detector de binário (binaryDetector.ts)', kind: 'function', status: 'verified' }
  - { name: 'Elegibilidade de diff (diffEligibility.ts)', kind: 'function', status: 'verified' }
  - { name: 'Árvore de histórico (historyTreeProvider.ts)', kind: 'function', status: 'verified' }
  - { name: 'Árvore de mudanças (changesProvider.ts, changesCommands.ts)', kind: 'function', status: 'verified' }
  - { name: 'Árvore de pastas rastreadas (trackedFoldersProvider.ts)', kind: 'function', status: 'verified' }
  - { name: 'Decoração de arquivos (decorationProvider.ts)', kind: 'function', status: 'verified' }
  - { name: 'Estado visto/não-visto (seenVersions.ts)', kind: 'function', status: 'verified' }
  - { name: 'Diff entre versões (diffCommand.ts)', kind: 'function', status: 'verified' }
  - { name: 'Restauração de versão (restoreCommand.ts, restoreService.ts)', kind: 'function', status: 'verified' }
  - { name: 'Formatação de bytes (format.ts)', kind: 'function', status: 'verified' }
  - { name: 'PastaRastreada', kind: 'entity', status: 'verified' }
  - { name: 'SérieDeVersões / SnapshotVersion', kind: 'entity', status: 'verified' }
  - { name: 'Blob (conteúdo endereçado por hash)', kind: 'entity', status: 'verified' }
  - { name: 'MapaDeVistos (seenVersions)', kind: 'entity', status: 'verified' }
  - { name: 'ArquivoRestaurado', kind: 'entity', status: 'verified' }
  - { name: 'FileSystemWatcher do VS Code', kind: 'integration', status: 'verified' }
  - { name: 'globalState (Memento) do VS Code', kind: 'integration', status: 'verified' }
  - { name: 'globalStorageUri (storeRoot)', kind: 'integration', status: 'verified' }
```

## Funções

```yaml
functions:
  - id: 'F_ACTIVATE'
    name: 'Ativar e Orquestrar Extensão'
    type: 'Infrastructure'
    domain: 'Rastreamento'
    status: 'verified'
    responsibilities:
      - 'Instanciar e registrar as três tree views, o decoration provider e todos os comandos'
      - 'Iniciar um watcher por pasta rastreada persistida e rodar prune de retenção + hardening de permissões (hardenBucketPermissions) na ativação'
      - 'Rodar prune de retenção periodicamente (setInterval de 24h) e sob demanda (comando backtrail.pruneNow) para toda pasta rastreada — Fase 2 de performance, 26/07'
      - 'Coordenar callbacks de ciclo de vida (onFolderTracked/onFolderUntracked) entre comandos, watchers e views'
      - 'Disparar baseline scan com toast de progresso cancelável (cancelar desfaz o rastreamento inteiro)'
      - 'Marcar arquivo ativo como visto a cada troca de editor'
    non_responsibilities:
      - 'NÃO contém lógica de captura, armazenamento ou filtragem — só orquestra'
    entities: ['PastaRastreada']
    interfaces:
      code_ref: 'src/extension.ts:activate'
      inputs:
        - 'context: vscode.ExtensionContext'
      outputs:
        - 'BacktrailApi — objeto exposto para testes de integração (globalState, storeRoot, providers)'
      state: 'stateful: Map<folder, Disposable> de watchers ativos na memória da sessão'
      side_effects:
        database: 'globalState + storeRoot (via funções que orquestra)'
        events_published: ['EVT_FOLDER_TRACKED', 'EVT_FOLDER_UNTRACKED']
        events_consumed: ['EVT_EDITOR_CHANGED', 'EVT_SNAPSHOT_CAPTURED']
        external_calls: ['VS Code API (TreeView, FileDecorationProvider, withProgress)']
    boundaries:
      depends_on:
        [
          'F_WATCH',
          'F_BASELINE',
          'F_PRUNE',
          'F_DELETE_BUCKET',
          'F_STORE_QUERY',
          'F_REGISTRY',
          'F_SEEN',
          'F_HISTORY_VIEW',
          'F_CHANGES_VIEW',
          'F_TRACKED_VIEW',
          'F_DECORATE',
          'F_DIFF',
          'F_RESTORE',
          'F_OPEN_CHANGE',
          'F_TRACK_FOLDER',
          'F_UNTRACK_FOLDER',
          'F_IGNORE',
        ]
      exposed_to: ['VS Code (entry point)', 'testes de integração via BacktrailApi']
    notes:
      - 'Falha ao iniciar watcher de pasta inacessível não aborta a ativação (try/catch em startWatching)'
      - 'Watcher inicia ANTES do baseline scan de propósito — edits reais durante o scan não podem ser perdidos; captureSnapshotsBatch resolve a corrida'
      - "untrackAndForget (cancelamento de baseline) chama F_DELETE_BUCKET incondicionalmente, sem perguntar — esse caminho já significa 'desfazer o rastreio inteiro' (Fase 1 de hardening, 26/07)"
      - 'backtrail.pruneNow (F_PRUNE para toda pasta rastreada) e o setInterval periódico são desfeitos no dispose junto com os watchers (Fase 2 de performance, 26/07)'

  - id: 'F_REGISTRY'
    name: 'Registro de Pastas Rastreadas'
    type: 'Domain Service'
    domain: 'Rastreamento'
    status: 'verified'
    responsibilities:
      - 'Listar, adicionar e remover pastas rastreadas persistidas em globalState (chave backtrail.trackedFolders)'
      - 'Resolver se um caminho absoluto pertence a alguma pasta rastreada (resolveTrackedFolder)'
      - 'Filtrar entradas corrompidas defensivamente na leitura'
    non_responsibilities:
      - 'NÃO inicia/para watchers nem atualiza views — isso é do orquestrador (F_ACTIVATE)'
      - 'NÃO valida se a pasta existe no disco'
    entities: ['PastaRastreada']
    interfaces:
      code_ref: 'src/trackedFolders.ts (listTrackedFolders, isTracked, trackFolder, untrackFolder, resolveTrackedFolder)'
      inputs:
        - 'store: KeyValueStore (abstração do Memento) + caminho absoluto'
      outputs:
        - 'string[] de pastas; ResolvedTrackedFolder {folder, relPath} | undefined'
      state: 'stateless (persistência delegada ao KeyValueStore)'
      side_effects:
        database: 'globalState: backtrail.trackedFolders'
        events_published: []
        events_consumed: []
        external_calls: []
    boundaries:
      depends_on: []
      exposed_to:
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
    notes:
      - 'KeyValueStore é a interface que permite testes unitários sem VS Code'

  - id: 'F_TRACK_FOLDER'
    name: 'Rastrear Pasta'
    type: 'API'
    domain: 'Rastreamento'
    status: 'verified'
    responsibilities:
      - 'Comandos backtrail.trackFolder (contexto do Explorer), backtrail.addFolder (picker) e backtrail.addFolderByPath (input manual, único caminho para pastas ocultas)'
      - 'Bloquear pastas dentro de repositório git (via F_GIT_GUARD)'
      - 'Confirmar em modal quando a pasta é o home inteiro do usuário'
      - 'Persistir o rastreio ANTES de mexer no workspace (adicionar 1ª pasta pode recarregar o extension host)'
      - 'Anexar a pasta ao workspace do VS Code sem substituir pastas existentes'
    non_responsibilities:
      - 'NÃO captura baseline nem inicia watcher diretamente — delega ao callback onFolderTracked de F_ACTIVATE'
    entities: ['PastaRastreada']
    interfaces:
      code_ref: 'src/commands.ts:trackFolderCommand + src/trackedFoldersCommands.ts:addFolderCommand,addFolderByPathCommand,validateFolderPath'
      inputs:
        - 'folderUri?: vscode.Uri — do menu de contexto, picker ou input de caminho'
      outputs:
        - 'void — feedback via showInformationMessage/showWarningMessage/showErrorMessage'
      state: 'stateless'
      side_effects:
        database: 'globalState: backtrail.trackedFolders (via F_REGISTRY)'
        events_published: ['EVT_FOLDER_TRACKED']
        events_consumed: []
        external_calls: ['VS Code API (showOpenDialog, showInputBox, updateWorkspaceFolders)']
    boundaries:
      depends_on: ['F_REGISTRY', 'F_GIT_GUARD']
      exposed_to: ['usuário (comandos VS Code)', 'F_ACTIVATE (via registerCommands/registerTrackedFoldersCommands)']
    notes:
      - 'Erro no callback onFolderTracked é engolido de propósito: o rastreio já foi persistido e não deve reportar falha'

  - id: 'F_UNTRACK_FOLDER'
    name: 'Parar de Rastrear Pasta'
    type: 'API'
    domain: 'Rastreamento'
    status: 'verified'
    responsibilities:
      - 'Comando backtrail.untrackFolder: remover do registro, parar watcher (via callback), oferecer remoção da pasta do Explorer'
      - 'Variante untrackAndForget (interna a F_ACTIVATE): usada quando o usuário cancela o baseline — desfaz o rastreamento inteiro sem perguntar'
    non_responsibilities:
      - "Stop Tracking manual não apaga o bucket automaticamente — pergunta via warning prompt (fire-and-forget, não bloqueia o untrack em si); untrackAndForget (cancelamento de baseline) apaga incondicionalmente, sem perguntar, pois esse caminho já significa 'desfazer tudo'. Decisão do owner de 26/07 implementada em 2026-07-26 (Fase 1 de hardening)."
    entities: ['PastaRastreada']
    interfaces:
      code_ref: 'src/trackedFoldersCommands.ts:untrackFolderCommand + src/extension.ts:untrackAndForget'
      inputs:
        - 'folder: string — caminho absoluto (do context menu da view Tracked Folders)'
      outputs:
        - 'void — feedback via mensagens'
      state: 'stateless'
      side_effects:
        database: 'globalState: backtrail.trackedFolders'
        events_published: ['EVT_FOLDER_UNTRACKED']
        events_consumed: []
        external_calls: ['VS Code API (updateWorkspaceFolders)']
    boundaries:
      depends_on: ['F_REGISTRY', 'F_DELETE_BUCKET']
      exposed_to: ['usuário (comando VS Code)', 'F_ACTIVATE']
    notes:
      - 'A pergunta de exclusão de histórico é assíncrona e não é aguardada pelo comando — evita que um teste de integração headless trave esperando resposta de UI; o untrack em si (globalState) sempre completa de imediato, como antes.'

  - id: 'F_GIT_GUARD'
    name: 'Bloquear Pastas em Repositório Git'
    type: 'Domain Service'
    domain: 'Rastreamento'
    status: 'verified'
    responsibilities:
      - 'Detectar se um caminho está dentro de um repositório git subindo a árvore até a raiz procurando .git'
    non_responsibilities:
      - 'NÃO valida se .git é repositório válido — presença do entry basta'
    entities: []
    interfaces:
      code_ref: 'src/gitGuard.ts:isInsideGitRepo'
      inputs:
        - 'folderPath: string'
      outputs:
        - 'boolean'
      state: 'stateless'
      side_effects:
        database: null
        events_published: []
        events_consumed: []
        external_calls: []
    boundaries:
      depends_on: []
      exposed_to: ['F_TRACK_FOLDER']
    notes:
      - 'Regra de produto central: backtrail existe para pastas SEM git; git já resolve o problema onde existe'

  - id: 'F_WATCH'
    name: 'Vigiar Pasta Rastreada'
    type: 'Infrastructure'
    domain: 'Captura'
    status: 'verified'
    responsibilities:
      - 'Criar FileSystemWatcher (**/*) por pasta rastreada e capturar snapshot a cada create/change não ignorado'
      - 'Registrar deleções como pendentes para correlação de rename (janela de 5s)'
      - 'Aplicar janela de graça de 500ms antes de finalizar arquivo aparentemente novo sob série nova (create pode chegar antes do delete do mesmo rename)'
      - 'Debounce de 15s (configurável) para saves consecutivos de um relPath que já tem série ativa — reagenda o timer a cada evento e só captura o conteúdo do disco (o mais recente, não o do evento que disparou) quando o arquivo fica quieto pelo período configurado (Fase 3, 26/07)'
      - 'Notificar consumidores via callback onCapture após cada captura (imediata ou debounced)'
    non_responsibilities:
      - 'NÃO decide o que é ignorado (delega a F_IGNORE) nem como armazenar (delega a F_CAPTURE)'
      - 'NÃO aplica debounce à correlação de rename — só ao caminho de série já ativa (existingSeriesId); create/delete seguem imediatos para não atrasar o match contra a janela de 5s'
    entities: ['SérieDeVersões']
    interfaces:
      code_ref: 'src/fileWatcher.ts:watchTrackedFolder,captureIfNotIgnored,scheduleDebouncedCapture,registerPendingDeletion,consumeMatchingPendingDeletion'
      inputs:
        - 'absoluteFolderPath, storeRoot, ignoreConfig, onCapture?: (uri) => void, captureDebounceSeconds = 15'
      outputs:
        - 'vscode.Disposable — encerra watcher e limpa todos os timers pendentes (deleção, grace e debounce de captura)'
      state: 'stateful: Map de deleções pendentes + Set de timers de graça + Map de timers de debounce por relPath, por watcher'
      side_effects:
        database: 'storeRoot (via F_CAPTURE)'
        events_published: ['EVT_SNAPSHOT_CAPTURED']
        events_consumed: ['EVT_FS_CREATE_CHANGE', 'EVT_FS_DELETE']
        external_calls: ['VS Code createFileSystemWatcher']
    boundaries:
      depends_on: ['F_IGNORE', 'F_BINARY', 'F_CAPTURE', 'F_STORE_QUERY', 'F_RENAME_CORRELATION']
      exposed_to: ['F_ACTIVATE']
    notes:
      - 'Callbacks do watcher engolem exceções: um throw não tratado ali derruba o extension host inteiro'
      - 'Constantes: RENAME_CORRELATION_WINDOW_MS=5000, RENAME_GRACE_WINDOW_MS=500, DEFAULT_CAPTURE_DEBOUNCE_SECONDS=15 (backtrail.captureDebounceSeconds)'
      - 'captureIfNotIgnored checa findActiveSeriesId (só índice, já cacheado) ANTES de ler o conteúdo do arquivo — se há série ativa, o conteúdo só é lido quando o timer de debounce dispara, nunca no evento que o agendou'

  - id: 'F_BASELINE'
    name: 'Capturar Baseline de Pasta Recém-Rastreada'
    type: 'Domain Service'
    domain: 'Captura'
    status: 'verified'
    responsibilities:
      - 'Percorrer a árvore da pasta e capturar o estado atual de cada arquivo não ignorado como primeira versão (dá ao primeiro edit real um predecessor de diff)'
      - 'Trabalhar em chunks de 200 arquivos, cedendo o event loop entre chunks e escrevendo o índice uma vez por chunk (nunca por arquivo)'
      - 'Respeitar token de cancelamento e pular arquivos que já têm série ativa (edit real durante o scan vence)'
    non_responsibilities:
      - 'NÃO bloqueia o extension host nem trata cancelamento como erro'
    entities: ['SérieDeVersões', 'Blob']
    interfaces:
      code_ref: 'src/fileWatcher.ts:captureBaselineSnapshots,walkFiles'
      inputs:
        - 'absoluteFolderPath, storeRoot, ignoreConfig, token?: {isCancellationRequested}'
      outputs:
        - 'Promise<void> — arquivos ilegíveis/sumidos são pulados silenciosamente'
      state: 'stateless entre execuções'
      side_effects:
        database: 'storeRoot index.json + blobs (via captureSnapshotsBatch)'
        events_published: []
        events_consumed: []
        external_calls: []
    boundaries:
      depends_on: ['F_IGNORE', 'F_BINARY', 'F_CAPTURE', 'F_STORE_QUERY']
      exposed_to: ['F_ACTIVATE (onFolderTracked)']
    notes:
      - 'BASELINE_CHUNK_SIZE=200 — trade-off documentado no código entre custo de índice e memória'

  - id: 'F_RENAME_CORRELATION'
    name: 'Correlacionar Renomeações'
    type: 'Domain Service'
    domain: 'Captura'
    status: 'verified'
    responsibilities:
      - 'Casar um create com uma deleção pendente de mesmo contentHash para manter a mesma série (o histórico sobrevive ao rename)'
      - 'Escolher a deleção MAIS RECENTE quando várias têm o mesmo hash (rename real dispara delete-create colados)'
    non_responsibilities:
      - 'NÃO gerencia timers nem o Map de pendências — isso vive em F_WATCH'
    entities: ['SérieDeVersões']
    interfaces:
      code_ref: 'src/renameCorrelation.ts:findMatchingPendingDeletion'
      inputs:
        - 'pending: ReadonlyMap<string, PendingDeletion>, contentHash: string'
      outputs:
        - 'PendingDeletion | undefined'
      state: 'stateless'
      side_effects:
        database: null
        events_published: []
        events_consumed: []
        external_calls: []
    boundaries:
      depends_on: []
      exposed_to: ['F_WATCH']
    notes:
      - "Depende da ordem de inserção do Map para 'mais recente vence'"

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
    non_responsibilities:
      - 'NÃO escreve nada no store'
    entities: ['SérieDeVersões', 'Blob']
    interfaces:
      code_ref: 'src/snapshotStore.ts:listVersions,readSnapshotContent,findActiveSeriesId,listActiveFiles,hardenBucketPermissions'
      inputs:
        - 'storeRoot, absoluteFolderPath, seriesId|relPath'
      outputs:
        - 'SnapshotVersion[] | Buffer | string|undefined | ActiveFile[]'
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
          'F_ACTIVATE (hardenBucketPermissions, uma vez por bucket, marcada por sentinel .permissions-hardened)',
        ]
    notes:
      - 'É o maior fan-in do sistema: qualquer mudança de semântica aqui atravessa quase toda a UI'
      - 'readSnapshotContent verifica sha256 do blob lido contra version.contentHash e lança erro em mismatch (Fase 1 de hardening, 26/07) — F_DIFF e F_RESTORE capturam e mostram mensagem, não deixam a exceção crua propagar'
      - 'readIndex cacheia o StoreIndex parseado em memória, keyed pelo caminho do index.json e pelo mtime do arquivo (Fase 2 de performance, 26/07) — uma escrita de outra janela ou ferramenta externa muda o mtime e o cache é ignorado na próxima leitura, sem mensageria de invalidação. Leituras puras (listVersions/findActiveSeriesId/listActiveFiles) compartilham o objeto cacheado sem cópia — é o caminho quente da decoração do Explorer'
      - 'Caminhos de escrita (F_CAPTURE, F_PRUNE) NUNCA usam o objeto do cache diretamente — chamam readMutableIndex, que faz cópia rasa do mapa de séries antes de mutar. Sem isso, uma escrita que falhasse depois de mutar o índice em memória deixaria o cache à frente do disco (leituras mostrando uma versão nunca persistida). Ver IR_012'
      - 'readSnapshotContent detecta blob gzip pelos magic bytes (1f 8b) e descomprime antes de conferir o hash; blob sem magic bytes é lido como raw (formato pré-Fase-4) — os dois formatos convivem no mesmo bucket indefinidamente, sem migração (Fase 4, 27/07, ADR-0001)'

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
      exposed_to: ['F_ACTIVATE']
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
    non_responsibilities:
      - 'NÃO decide QUANDO apagar nem SE deve confirmar com o usuário — isso é responsabilidade do caller (F_UNTRACK_FOLDER pergunta; untrackAndForget em F_ACTIVATE apaga sem perguntar)'
    entities: ['SérieDeVersões', 'Blob']
    interfaces:
      code_ref: 'src/snapshotStore.ts:deleteBucket'
      inputs:
        - 'storeRoot, absoluteFolderPath'
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
      exposed_to: ['F_UNTRACK_FOLDER', 'F_ACTIVATE (untrackAndForget)']
    notes:
      - 'Adicionada na Fase 1 de hardening (26/07) — implementa a decisão do owner de que untrack deve poder apagar o histórico da pasta, em vez de deixá-lo órfão no storeRoot para sempre'
      - 'Junto com F_PRUNE, é a segunda função que DELETA dados do store — irreversível, sem teste de regressão não se mexe aqui'

  - id: 'F_IGNORE'
    name: 'Filtrar Arquivos Ignorados'
    type: 'Domain Service'
    domain: 'Captura'
    status: 'verified'
    responsibilities:
      - 'Decidir se um relPath deve ser ignorado: tamanho > maxFileSizeMB, segmento de pasta em ignoredFolders (qualquer profundidade), nome exato de arquivo em ignoredFiles, extensão em ignoredExtensions'
      - 'Ler configuração do usuário (backtrail.* em settings) com defaults: node_modules/.git/dist/build/restored, .env/.env.local/id_rsa/id_ed25519/.npmrc/.netrc, 50MB, sem extensões (defaults atualizados na Fase 1 de hardening, 26/07)'
    non_responsibilities:
      - 'NÃO suporta globs — matching é por nome exato de segmento, nome de arquivo e extensão'
    entities: []
    interfaces:
      code_ref: 'src/ignoreFilters.ts:shouldIgnore + src/config.ts:getIgnoreConfig,getRetentionDays'
      inputs:
        - 'relPath, sizeBytes, config: IgnoreConfig'
      outputs:
        - 'boolean'
      state: 'stateless'
      side_effects:
        database: null
        events_published: []
        events_consumed: []
        external_calls: ['VS Code workspace.getConfiguration']
    boundaries:
      depends_on: []
      exposed_to: ['F_WATCH', 'F_BASELINE', 'F_ACTIVATE (lê config na criação do watcher)']
    notes:
      - 'Config é lida no momento em que o watcher é criado — mudanças em settings só valem para watchers novos (reativação)'
      - 'ignoredFiles existe porque dotfiles como .env não têm extensão pela própria regra de extensionOf (ponto inicial não conta como separador) — o filtro por extensão nunca os alcançaria'

  - id: 'F_BINARY'
    name: 'Detectar Conteúdo Binário'
    type: 'Library'
    domain: 'Captura'
    status: 'verified'
    responsibilities:
      - 'Classificar conteúdo como binário se houver byte nulo nos primeiros 8000 bytes (mesma heurística do git)'
    non_responsibilities: []
    entities: []
    interfaces:
      code_ref: 'src/binaryDetector.ts:isBinaryContent'
      inputs:
        - 'content: Uint8Array'
      outputs:
        - 'boolean'
      state: 'stateless'
      side_effects:
        database: null
        events_published: []
        events_consumed: []
        external_calls: []
    boundaries:
      depends_on: []
      exposed_to: ['F_WATCH', 'F_BASELINE']
    notes:
      - 'O flag isBinary gravado na versão alimenta F_DIFF_ELIGIBILITY depois'

  - id: 'F_DIFF_ELIGIBILITY'
    name: 'Decidir Elegibilidade de Diff'
    type: 'Library'
    domain: 'Visualização'
    status: 'verified'
    responsibilities:
      - 'Texto sempre pode diff; binário só se for imagem (.png/.jpg/.jpeg/.gif/.bmp/.webp — VS Code tem diff nativo de imagem)'
    non_responsibilities: []
    entities: []
    interfaces:
      code_ref: 'src/diffEligibility.ts:canShowDiff'
      inputs:
        - "version: Pick<SnapshotVersion, 'isBinary'|'relPath'>"
      outputs:
        - 'boolean'
      state: 'stateless'
      side_effects:
        database: null
        events_published: []
        events_consumed: []
        external_calls: []
    boundaries:
      depends_on: []
      exposed_to: ['F_HISTORY_VIEW', 'F_CHANGES_VIEW']
    notes: []

  - id: 'F_HISTORY_VIEW'
    name: 'Exibir Histórico do Arquivo Ativo'
    type: 'UI Component'
    domain: 'Visualização'
    status: 'verified'
    responsibilities:
      - 'TreeView backtrail.history: listar versões (mais recente primeiro) do arquivo do editor ativo'
      - 'Clique abre diff (SHOW_DIFF_COMMAND) ou info (SHOW_VERSION_INFO_COMMAND) conforme elegibilidade'
      - 'Re-renderizar em troca de editor ativo e em captura do arquivo ativo (notifyChange)'
    non_responsibilities:
      - 'NÃO mostra histórico de arquivo não-ativo nem lista de pastas'
    entities: ['SérieDeVersões']
    interfaces:
      code_ref: 'src/historyTreeProvider.ts:BacktrailHistoryProvider'
      inputs:
        - 'setActiveUri(uri), notifyChange(uri)'
      outputs:
        - 'VersionTreeItem[] via TreeDataProvider'
      state: 'stateful: activeUri da sessão'
      side_effects:
        database: null
        events_published: []
        events_consumed: ['EVT_EDITOR_CHANGED', 'EVT_SNAPSHOT_CAPTURED']
        external_calls: ['VS Code TreeView API']
    boundaries:
      depends_on: ['F_REGISTRY', 'F_STORE_QUERY', 'F_DIFF_ELIGIBILITY', 'F_DIFF']
      exposed_to: ['F_ACTIVATE', 'usuário']
    notes: []

  - id: 'F_CHANGES_VIEW'
    name: 'Exibir Mudanças Não Vistas'
    type: 'UI Component'
    domain: 'Visualização'
    status: 'verified'
    responsibilities:
      - 'TreeView backtrail.changes: agrupar arquivos ativos por estado (Modified acima de New, espelhando o Source Control do git)'
      - 'Clique dispara OPEN_CHANGED_FILE_COMMAND com par (anterior, atual) e flag canDiff'
      - 'Tolerar pasta rastreada inacessível sem quebrar a lista das demais'
    non_responsibilities:
      - 'NÃO marca como visto — isso é do comando de abertura (F_OPEN_CHANGE) e do fluxo de editor ativo'
    entities: ['SérieDeVersões', 'MapaDeVistos']
    interfaces:
      code_ref: 'src/changesProvider.ts:ChangesProvider'
      inputs:
        - 'refresh() — disparado por captura, track/untrack, mark-seen'
      outputs:
        - 'ChangeNode[] (grupos e arquivos) via TreeDataProvider'
      state: 'stateless entre renders (recoleta a cada getChildren)'
      side_effects:
        database: null
        events_published: []
        events_consumed: ['EVT_SNAPSHOT_CAPTURED', 'EVT_FOLDER_TRACKED', 'EVT_FOLDER_UNTRACKED']
        external_calls: ['VS Code TreeView API']
    boundaries:
      depends_on: ['F_REGISTRY', 'F_STORE_QUERY', 'F_SEEN', 'F_DIFF_ELIGIBILITY']
      exposed_to: ['F_ACTIVATE', 'usuário']
    notes: []

  - id: 'F_TRACKED_VIEW'
    name: 'Exibir Pastas Rastreadas'
    type: 'UI Component'
    domain: 'Visualização'
    status: 'verified'
    responsibilities:
      - 'TreeView backtrail.trackedFolders: listar pastas rastreadas com context menu (Stop Tracking, Mark All Seen)'
    non_responsibilities:
      - 'NÃO executa as ações do menu — só declara contextValue backtrailTrackedFolder'
    entities: ['PastaRastreada']
    interfaces:
      code_ref: 'src/trackedFoldersProvider.ts:TrackedFoldersProvider'
      inputs:
        - 'refresh()'
      outputs:
        - 'string[] (caminhos) via TreeDataProvider'
      state: 'stateless'
      side_effects:
        database: null
        events_published: []
        events_consumed: ['EVT_FOLDER_TRACKED', 'EVT_FOLDER_UNTRACKED']
        external_calls: ['VS Code TreeView API']
    boundaries:
      depends_on: ['F_REGISTRY']
      exposed_to: ['F_ACTIVATE', 'usuário']
    notes: []

  - id: 'F_DECORATE'
    name: 'Decorar Arquivos no Explorer'
    type: 'UI Component'
    domain: 'Visualização'
    status: 'verified'
    responsibilities:
      - 'FileDecorationProvider: badge N (novo) ou M (mudou desde a última visualização) em arquivos de pastas rastreadas, com propagate para as pastas pais'
      - 'Expor refresh(uri) e refreshAll() para invalidação dirigida'
    non_responsibilities:
      - 'NÃO altera o estado visto — só o lê'
    entities: ['MapaDeVistos', 'SérieDeVersões']
    interfaces:
      code_ref: 'src/decorationProvider.ts:createDecorationProvider'
      inputs:
        - 'uri: vscode.Uri (chamado pelo VS Code para cada arquivo visível)'
      outputs:
        - 'FileDecoration | undefined'
      state: 'stateless (emitter para invalidação)'
      side_effects:
        database: null
        events_published: []
        events_consumed: ['EVT_SNAPSHOT_CAPTURED']
        external_calls: ['VS Code FileDecorationProvider API']
    boundaries:
      depends_on: ['F_REGISTRY', 'F_STORE_QUERY', 'F_SEEN']
      exposed_to: ['F_ACTIVATE', 'VS Code Explorer']
    notes:
      - 'provideFileDecoration roda para TODO uri visível no Explorer — precisa continuar barato'

  - id: 'F_SEEN'
    name: 'Gerenciar Estado Visto/Não-Visto'
    type: 'Domain Service'
    domain: 'Visualização'
    status: 'verified'
    responsibilities:
      - 'Persistir seriesId → último timestamp visto (globalState backtrail.seenVersions) e derivar estado: sem entrada = new; entrada < último timestamp = changed; senão none'
      - 'markManySeen: aplicar N entradas com uma única leitura/escrita do mapa (mark-all em pasta grande)'
      - 'markFileAsSeen (arquivo ativo) e markFolderAsSeen (comando Mark All Changes As Seen)'
    non_responsibilities:
      - 'NÃO conhece a UI — invalidação de decoração é responsabilidade de quem chama'
    entities: ['MapaDeVistos']
    interfaces:
      code_ref: 'src/seenVersions.ts:markSeen,markManySeen,getDecorationState + src/decorationProvider.ts:markFileAsSeen,markFolderAsSeen'
      inputs:
        - 'store, seriesId, latestTimestamp | entries[]'
      outputs:
        - "DecorationState ('new'|'changed'|'none') | Promise<void>"
      state: 'stateless (persistência no globalState)'
      side_effects:
        database: 'globalState: backtrail.seenVersions'
        events_published: []
        events_consumed: []
        external_calls: []
    boundaries:
      depends_on: ['F_REGISTRY', 'F_STORE_QUERY']
      exposed_to:
        ['F_ACTIVATE', 'F_DECORATE', 'F_CHANGES_VIEW', 'F_OPEN_CHANGE', 'F_TRACK_FOLDER (comando markFolderSeen)']
    notes:
      - 'Comparação de timestamps é lexicográfica sobre ISO 8601 — válida porque toISOString é sempre UTC com mesmo formato'

  - id: 'F_DIFF'
    name: 'Mostrar Diff entre Versões'
    type: 'API'
    domain: 'Visualização'
    status: 'verified'
    responsibilities:
      - "Comando backtrail.showDiff: materializar os dois lados em tmpdir (keyed por contentHash, cache por sessão) e abrir vscode.diff; lado vazio quando não há versão anterior ('created')"
      - 'Comando backtrail.showVersionInfo: mensagem informativa para binários sem diff'
      - 'Limpar o tmpdir inteiro no dispose'
    non_responsibilities:
      - 'NÃO decide elegibilidade (recebe a decisão dos callers via qual comando invocar)'
    entities: ['Blob']
    interfaces:
      code_ref: 'src/diffCommand.ts:registerDiffCommand,showDiff,showVersionInfo,writeTempSide'
      inputs:
        - 'folder, older?: SnapshotVersion, newer: SnapshotVersion'
      outputs:
        - 'aba de diff/mensagem no VS Code'
      state: 'stateful: tmpRoot por sessão com arquivos cacheados por hash'
      side_effects:
        database: null
        events_published: []
        events_consumed: []
        external_calls: ['VS Code vscode.diff', 'filesystem tmpdir']
    boundaries:
      depends_on: ['F_STORE_QUERY']
      exposed_to: ['F_HISTORY_VIEW', 'F_CHANGES_VIEW (via F_OPEN_CHANGE)', 'usuário']
    notes:
      - 'Nome do arquivo temp usa o basename real (não o hash) para o VS Code detectar extensão → syntax highlighting e image-diff'

  - id: 'F_OPEN_CHANGE'
    name: 'Abrir Mudança da Lista de Changes'
    type: 'API'
    domain: 'Visualização'
    status: 'verified'
    responsibilities:
      - 'Comando backtrail.openChangedFile: rotear para diff ou info, depois marcar a série como vista explicitamente e refrescar decoração + lista'
    non_responsibilities:
      - "NÃO abre o arquivo em si como editor ativo (por isso o mark-seen explícito — o caminho 'seen on active editor' nunca dispara aqui)"
    entities: ['MapaDeVistos']
    interfaces:
      code_ref: 'src/changesCommands.ts:registerOpenChangedFileCommand'
      inputs:
        - 'folder, seriesId, older?, newer, canDiff'
      outputs:
        - 'void'
      state: 'stateless'
      side_effects:
        database: 'globalState: backtrail.seenVersions (via markSeen)'
        events_published: []
        events_consumed: []
        external_calls: []
    boundaries:
      depends_on: ['F_DIFF', 'F_SEEN']
      exposed_to: ['F_CHANGES_VIEW (item.command)']
    notes: []

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
  - name: 'PastaRastreada'
    owner_domain: 'Rastreamento'
    read_by: ['F_ACTIVATE', 'F_REGISTRY', 'F_DECORATE', 'F_SEEN', 'F_HISTORY_VIEW', 'F_CHANGES_VIEW', 'F_TRACKED_VIEW']
    modified_by: ['F_TRACK_FOLDER', 'F_UNTRACK_FOLDER']

  - name: 'SérieDeVersões (StoreIndex.series: seriesId → SnapshotVersion[])'
    owner_domain: 'Armazenamento'
    read_by: ['F_STORE_QUERY', 'F_WATCH', 'F_BASELINE', 'F_HISTORY_VIEW', 'F_CHANGES_VIEW', 'F_DECORATE']
    modified_by: ['F_CAPTURE', 'F_PRUNE']

  - name: 'Blob (blobs/{sha256}.blob, conteúdo endereçado)'
    owner_domain: 'Armazenamento'
    read_by: ['F_STORE_QUERY (readSnapshotContent)', 'F_DIFF', 'F_RESTORE']
    modified_by: ['F_CAPTURE (cria)', 'F_PRUNE (GC de órfãos)']

  - name: 'MapaDeVistos (globalState backtrail.seenVersions: seriesId → timestamp)'
    owner_domain: 'Visualização'
    read_by: ['F_SEEN (getDecorationState)', 'F_DECORATE', 'F_CHANGES_VIEW']
    modified_by: ['F_SEEN (markSeen/markManySeen)', 'F_OPEN_CHANGE']

  - name: 'ArquivoRestaurado ({pasta}/restored/...)'
    owner_domain: 'Restauração'
    read_by: ['usuário']
    modified_by: ['F_RESTORE']
```

## Eventos

```yaml
# Eventos in-process (callbacks e emitters) — não há message queue.
events:
  - id: 'EVT_FS_CREATE_CHANGE'
    name: 'Arquivo Criado ou Alterado no Disco'
    published_by: ['VS Code FileSystemWatcher']
    consumed_by: ['F_WATCH']

  - id: 'EVT_FS_DELETE'
    name: 'Arquivo Deletado do Disco'
    published_by: ['VS Code FileSystemWatcher']
    consumed_by: ['F_WATCH']

  - id: 'EVT_SNAPSHOT_CAPTURED'
    name: 'Snapshot Capturado (callback onCapture)'
    published_by: ['F_WATCH']
    consumed_by:
      [
        'F_ACTIVATE (→ F_HISTORY_VIEW.notifyChange, F_DECORATE.refresh, F_CHANGES_VIEW.refresh, mark-seen do arquivo ativo)',
      ]

  - id: 'EVT_FOLDER_TRACKED'
    name: 'Pasta Passou a Ser Rastreada (callback onFolderTracked)'
    published_by: ['F_TRACK_FOLDER']
    consumed_by: ['F_ACTIVATE (inicia watcher + baseline + refresh das views)']

  - id: 'EVT_FOLDER_UNTRACKED'
    name: 'Pasta Deixou de Ser Rastreada (callback onFolderUntracked)'
    published_by: ['F_UNTRACK_FOLDER']
    consumed_by: ['F_ACTIVATE (para watcher + refresh das views)']

  - id: 'EVT_EDITOR_CHANGED'
    name: 'Editor Ativo Trocou'
    published_by: ['VS Code onDidChangeActiveTextEditor']
    consumed_by: ['F_ACTIVATE (→ F_HISTORY_VIEW.setActiveUri + markFileAsSeen)']
```

## Workflows

```yaml
workflows:
  - id: 'W_TRACK'
    name: 'Rastrear uma pasta nova'
    starts_at: 'F_TRACK_FOLDER'
    ends_at: 'F_BASELINE'
    sequence: ['F_TRACK_FOLDER', 'F_GIT_GUARD', 'F_REGISTRY', 'F_ACTIVATE', 'F_WATCH', 'F_BASELINE']

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

## Relacionamentos

```yaml
relationships:
  - {
      id: 'R_001',
      from: 'F_ACTIVATE',
      to: 'F_WATCH',
      type: 'calls',
      coupling: 'tight',
      channel: 'in-process',
      criticality: 'critical',
      description: 'Cria um watcher por pasta rastreada na ativação e a cada track',
    }
  - {
      id: 'R_002',
      from: 'F_ACTIVATE',
      to: 'F_BASELINE',
      type: 'calls',
      coupling: 'tight',
      channel: 'in-process',
      criticality: 'degraded_ok',
      description: 'Dispara baseline cancelável em onFolderTracked',
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
      id: 'R_004',
      from: 'F_TRACK_FOLDER',
      to: 'F_GIT_GUARD',
      type: 'calls',
      coupling: 'tight',
      channel: 'in-process',
      criticality: 'critical',
      description: 'Bloqueio de pastas git antes de persistir',
    }
  - {
      id: 'R_005',
      from: 'F_TRACK_FOLDER',
      to: 'F_REGISTRY',
      type: 'writes_to',
      coupling: 'tight',
      channel: 'Shared Database',
      criticality: 'critical',
      description: 'Persiste a pasta em globalState',
    }
  - {
      id: 'R_006',
      from: 'F_WATCH',
      to: 'F_IGNORE',
      type: 'calls',
      coupling: 'tight',
      channel: 'in-process',
      criticality: 'critical',
      description: 'Filtro por evento de arquivo',
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
      id: 'R_008',
      from: 'F_WATCH',
      to: 'F_RENAME_CORRELATION',
      type: 'calls',
      coupling: 'tight',
      channel: 'in-process',
      criticality: 'degraded_ok',
      description: 'Correlação delete↔create; sem ela o rename vira série nova',
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
      id: 'R_013',
      from: 'F_CHANGES_VIEW',
      to: 'F_SEEN',
      type: 'reads_from',
      coupling: 'tight',
      channel: 'Shared Database',
      criticality: 'critical',
      description: 'getDecorationState decide grupo Modified/New/omitido',
    }
  - {
      id: 'R_014',
      from: 'F_DECORATE',
      to: 'F_SEEN',
      type: 'reads_from',
      coupling: 'tight',
      channel: 'Shared Database',
      criticality: 'critical',
      description: 'Badge N/M derivado do estado visto',
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
      id: 'R_018',
      from: 'F_OPEN_CHANGE',
      to: 'F_DIFF',
      type: 'calls',
      coupling: 'loose',
      channel: 'VS Code command',
      criticality: 'critical',
      description: 'executeCommand SHOW_DIFF/SHOW_VERSION_INFO',
    }
  - {
      id: 'R_019',
      from: 'F_OPEN_CHANGE',
      to: 'F_SEEN',
      type: 'writes_to',
      coupling: 'tight',
      channel: 'Shared Database',
      criticality: 'degraded_ok',
      description: 'markSeen explícito — sem ele a entrada nunca sai da lista',
    }
  - {
      id: 'R_020',
      from: 'F_HISTORY_VIEW',
      to: 'F_DIFF',
      type: 'calls',
      coupling: 'loose',
      channel: 'VS Code command',
      criticality: 'critical',
      description: 'item.command aponta para SHOW_DIFF/SHOW_VERSION_INFO',
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
    affected_direct: ['F_ACTIVATE']
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
      - 'Timer por relPath (captureDebounceTimers) deve ser limpo no dispose junto com os de pending-deletion/grace — teste de regressão: "disposing the watcher cancels a pending debounced capture" em fileWatcher.test.ts'
      - 'Ao disparar, lê o conteúdo do disco no momento do fire, não o do evento que agendou — captura sempre o estado mais recente; se o arquivo sumiu nesse meio-tempo (deletado/renomeado), a captura é descartada silenciosamente (mesmo padrão best-effort dos outros callbacks do watcher)'
      - 'Suítes que testam correção de captura imediata (fileWatcher.test.ts "File Watcher Integration", historyTreeProvider.test.ts) usam captureDebounceSeconds: 0 — não reverter para o default de produção (15s) nelas'

  - id: 'IR_011'
    trigger:
      function_id: 'F_DELETE_BUCKET'
      change: 'comportamento — critério de quando apagar (quem confirma, quem não confirma)'
    affected_direct: ['F_UNTRACK_FOLDER', 'F_ACTIVATE']
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
      function_id: 'F_ACTIVATE'
      change: 'comportamento — semântica dos callbacks onFolderTracked/onFolderUntracked/onCapture'
    affected_direct: ['F_TRACK_FOLDER', 'F_UNTRACK_FOLDER', 'F_WATCH']
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
2. **Untrack dispara prune automático.** ✅ Implementado com a assimetria de confirmação que o owner sinalizou como necessária: `Stop Tracking` manual pergunta antes de apagar (F_UNTRACK_FOLDER, warning prompt); `untrackAndForget` do cancelamento de baseline (F_ACTIVATE) apaga sem perguntar. Nova função F_DELETE_BUCKET (IR_011) faz a exclusão em si; F_PRUNE (IR_006) continua sendo a exclusão parcial por idade.

## Perguntas em Aberto

```yaml
open_questions: [] # perguntas do bootstrap respondidas em 2026-07-26 — ver Regras Transversais § Decisões registradas
```

## Histórico de Revisões

| Versão | Data       | Autor            | Mudanças                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------ | ---------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1.0  | 2026-07-26 | Claude (fde-mof) | Criação inicial — bootstrap completo, 100% verificado no código (v0.5.0)                                                                                                                                                                                                                                                                                                                                 |
| 0.1.1  | 2026-07-26 | Claude (fde-mof) | Open questions respondidas pelo owner: restored/ fora do tracking; prune automático no untrack. Registradas como decisões pendentes de implementação                                                                                                                                                                                                                                                     |
| 0.2.0  | 2026-07-26 | Claude (fde-mof) | Fase 1 de hardening implementada (branch feat/store-hardening): nova F_DELETE_BUCKET + IR_011; F_CAPTURE/F_STORE_QUERY atualizadas (escrita atômica, .bak, permissões 0600/0700, verificação de hash); F_IGNORE com ignoredFiles; F_RESTORE e F_UNTRACK_FOLDER com as duas decisões do owner implementadas                                                                                               |
| 0.3.0  | 2026-07-26 | Claude (fde-mof) | Fase 2 de performance implementada (branch perf/index-cache): F_STORE_QUERY ganha cache de StoreIndex por mtime + readMutableIndex (nova IR_012); índice compacto sem pretty-print (F_CAPTURE); F_ACTIVATE ganha prune periódico (setInterval 24h) + comando backtrail.pruneNow, substituindo a limitação "só na ativação" (F_PRUNE não-responsabilidade e regra transversal atualizadas)                |
| 0.4.0  | 2026-07-26 | Claude (fde-mof) | Fase 3 de captura inteligente implementada (branch feat/capture-throttle, commit 86f21a7): F_WATCH ganha debounce de 15s por relPath com série ativa (scheduleDebouncedCapture, nova IR_013), escopado para não tocar a correlação de rename (IR_009); F_PRUNE ganha cap de 100 versões por série após o filtro de idade (IR_006 atualizada); regra transversal nova sobre as duas mitigações combinadas |
