# MoF — Domínio Captura

> Parte do Map of Functions do Backtrail. Índice, relacionamentos cross-domínio, regras de impacto e histórico de revisões: [`../MOF.md`](../MOF.md).

## Funções

```yaml
functions:
  - id: 'F_WATCH'
    name: 'Vigiar Pasta Rastreada'
    type: 'Infrastructure'
    domain: 'Captura'
    status: 'verified'
    responsibilities:
      - 'Criar FileSystemWatcher (**/*) por pasta rastreada e capturar snapshot a cada create/change não ignorado'
      - 'Registrar deleções como pendentes para correlação de rename (janela de 5s)'
      - 'Aplicar janela de graça de 500ms antes de finalizar arquivo aparentemente novo sob série nova (create pode chegar antes do delete do mesmo rename)'
      - 'Debounce de 15s (configurável) para saves consecutivos de um relPath que já tem série ativa — lê o conteúdo imediatamente a cada evento (guardado em memória junto do timer) e só ADIA A GRAVAÇÃO no índice até o arquivo ficar quieto pelo período configurado (Fase 3, 26/07; leitura antecipada em vez de leitura no disparo do timer, Fase 6, 28/07 — ver nota abaixo)'
      - 'Notificar consumidores via callback onCapture após cada captura (imediata ou debounced)'
    non_responsibilities:
      - 'NÃO decide o que é ignorado (delega a F_IGNORE) nem como armazenar (delega a F_CAPTURE)'
      - 'NÃO aplica debounce à correlação de rename — só ao caminho de série já ativa (existingSeriesId); create/delete seguem imediatos para não atrasar o match contra a janela de 5s'
    entities: ['SérieDeVersões']
    interfaces:
      code_ref: 'src/fileWatcher.ts:watchTrackedFolder,createWatcherSession,captureIfNotIgnored,scheduleDebouncedCapture,registerPendingDeletion,consumeMatchingPendingDeletion'
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
      exposed_to: ['F_TRACK_LIFECYCLE']
    notes:
      - 'Callbacks do watcher engolem exceções: um throw não tratado ali derruba o extension host inteiro'
      - 'Constantes: RENAME_CORRELATION_WINDOW_MS=5000, RENAME_GRACE_WINDOW_MS=500, DEFAULT_CAPTURE_DEBOUNCE_SECONDS=15 (backtrail.captureDebounceSeconds)'
      - 'Fase 6 (28/07): scheduleDebouncedCapture costumava só reler o arquivo quando o timer disparava — se um delete/rename chegasse antes disso, o readFileSync do disparo falhava (ENOENT) e a edição pendente era descartada em silêncio (catch vazio). Agora captureIfNotIgnored lê o conteúdo NA HORA do evento e guarda os bytes junto do timer (PendingCapture); o timer só decide QUANDO persistir, nunca mais precisa reler o disco. registerPendingDeletion (o handler de delete) também flusha essa captura pendente antes de montar o registro de correlação de rename — sem isso, um rename no meio da janela de debounce comparia o hash pré-edição (ainda no índice) contra o hash pós-edição que o lado create acabou de ler, e nunca correlacionava. Custo aceito: um read síncrono por evento em vez de só no disparo do timer — trade-off documentado, ver README § Known limitations'
      - 'Fase 7 (31/07, PR #50): pendingDeletions/pendingCaptureTimers/captureDebounceTimers, antes passados por parâmetro através de captureIfNotIgnored (10 params), scheduleDebouncedCapture (10 params) e registerPendingDeletion (7 params), agora vivem no closure de createWatcherSession — um por pasta vigiada. watchTrackedFolder só cria o watcher e a sessão e liga os dois; comportamento e assinatura pública inalterados'

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
      exposed_to: ['F_TRACK_LIFECYCLE (onFolderTracked)']
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

  - id: 'F_IGNORE'
    name: 'Filtrar Arquivos Ignorados'
    type: 'Domain Service'
    domain: 'Captura'
    status: 'verified'
    responsibilities:
      - 'Decidir se um relPath deve ser ignorado: tamanho > maxFileSizeMB, segmento de pasta em ignoredFolders (qualquer profundidade), nome exato de arquivo em ignoredFiles, extensão em ignoredExtensions, ou sob um excludedPathPrefixes (Fase 5, 27/07 — matching por segmento, não string bruta)'
      - 'Ler configuração do usuário (backtrail.* em settings) com defaults: node_modules/.git/dist/build/restored, .env/.env.local/id_rsa/id_ed25519/.npmrc/.netrc, 50MB, sem extensões (defaults atualizados na Fase 1 de hardening, 26/07)'
    non_responsibilities:
      - 'NÃO suporta globs — matching é por nome exato de segmento, nome de arquivo e extensão'
    entities: ['CaminhosExcluidos']
    interfaces:
      code_ref: 'src/ignoreFilters.ts:shouldIgnore,pathHasPrefix + src/config.ts:getIgnoreConfig,getIgnoreConfigForFolder,getRetentionDays'
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
      depends_on: ['F_EXCLUDED_PATHS (via getIgnoreConfigForFolder)']
      exposed_to: ['F_WATCH', 'F_BASELINE', 'F_ACTIVATE (lê config na criação do watcher)']
    notes:
      - 'Config é lida no momento em que o watcher é criado — mudanças em settings só valem para watchers novos (reativação)'
      - 'ignoredFiles existe porque dotfiles como .env não têm extensão pela própria regra de extensionOf (ponto inicial não conta como separador) — o filtro por extensão nunca os alcançaria'
      - 'excludedPathPrefixes (Fase 5) sofre a mesma limitação: F_ACTIVATE mitiga reiniciando só o watcher da pasta afetada (onExclusionChanged) quando o usuário exclui um caminho pelo Monitor ou pela view Changes — não resolve a limitação geral de settings.json, só a desta feature nova'
      - 'pathHasPrefix é duplicada (não importada) em snapshotStore.ts:purgePath por restrição do toolchain — node --test exige especificador com extensão para import de valor entre módulos .ts do próprio pacote, e o tsconfig raiz não habilita allowImportingTsExtensions; as duas definições devem ficar em sincronia'

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

```

## Entidades

Nenhuma entidade tem `owner_domain: 'Captura'` — este domínio lê e modifica entidades pertencentes a Armazenamento e Rastreamento (ver [`../MOF.md`](../MOF.md)).

## Eventos

```yaml
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

```

## Relacionamentos (internos ao domínio)

```yaml
relationships:
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
      id: 'R_008',
      from: 'F_WATCH',
      to: 'F_RENAME_CORRELATION',
      type: 'calls',
      coupling: 'tight',
      channel: 'in-process',
      criticality: 'degraded_ok',
      description: 'Correlação delete↔create; sem ela o rename vira série nova',
    }
```
