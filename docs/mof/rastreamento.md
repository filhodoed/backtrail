# MoF — Domínio Rastreamento

> Parte do Map of Functions do Backtrail. Índice, relacionamentos cross-domínio, regras de impacto e histórico de revisões: [`../MOF.md`](../MOF.md).

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
      - 'Criar o output channel "Backtrail" na ativação e um logWarning (fechado sobre esse channel), repassado a F_TRACK_LIFECYCLE'
      - 'Rodar prune de retenção periodicamente (setInterval de 24h) e sob demanda (comando backtrail.pruneNow) para toda pasta rastreada — Fase 2 de performance, 26/07'
      - 'Instanciar F_TRACK_LIFECYCLE (createTrackedFolderLifecycle) e conectá-la aos comandos (registerCommands, registerTrackedFoldersCommands, registerMonitorCheckboxHandler, registerStopTrackingPathCommand) e ao dispose de ativação'
      - 'Iniciar o watch de toda pasta persistida na ativação, delegando a F_TRACK_LIFECYCLE.startWatching'
      - 'Marcar arquivo ativo como visto a cada troca de editor'
    non_responsibilities:
      - 'NÃO contém lógica de captura, armazenamento ou filtragem — só orquestra'
      - 'NÃO implementa o ciclo de vida de rastreamento de pastas (start/stop watcher, track/untrack, baseline, exclusão) — isso é F_TRACK_LIFECYCLE desde a Fase 7 (31/07, PR #50); F_ACTIVATE só instancia e conecta'
    entities: ['PastaRastreada']
    interfaces:
      code_ref: 'src/extension.ts:activate'
      inputs:
        - 'context: vscode.ExtensionContext'
      outputs:
        - 'BacktrailApi — objeto exposto para testes de integração (globalState, storeRoot, providers)'
      state: 'stateful: Map<folder, Disposable> de watchers ativos na memória da sessão'
      side_effects:
        database: 'globalState (backtrail.trackedFolders, backtrail.bucketIds) + storeRoot (via funções que orquestra)'
        events_published: ['EVT_FOLDER_TRACKED', 'EVT_FOLDER_UNTRACKED']
        events_consumed: ['EVT_EDITOR_CHANGED', 'EVT_SNAPSHOT_CAPTURED']
        external_calls: ['VS Code API (TreeView, FileDecorationProvider, withProgress, createOutputChannel)']
    boundaries:
      depends_on:
        [
          'F_TRACK_LIFECYCLE',
          'F_PRUNE',
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
          'F_EXCLUDED_PATHS',
          'F_MONITOR_VIEW',
          'F_STOP_TRACKING_PATH',
        ]
      exposed_to: ['VS Code (entry point)', 'testes de integração via BacktrailApi']
    notes:
      - 'Fase 6 (28/07): output channel "Backtrail" criado na ativação; logWarning fecha sobre ele e é repassado a F_TRACK_LIFECYCLE, que o encaminha a watchTrackedFolder — ver F_WATCH'
      - 'backtrail.pruneNow (F_PRUNE para toda pasta rastreada) e o setInterval periódico são desfeitos no dispose de ativação; o dispose dos watchers em si é delegado a F_TRACK_LIFECYCLE.dispose() desde a Fase 7 (31/07, PR #50)'

  - id: 'F_TRACK_LIFECYCLE'
    name: 'Gerenciar Ciclo de Vida de Pastas Rastreadas'
    type: 'Domain Service'
    domain: 'Rastreamento'
    status: 'verified'
    responsibilities:
      - 'Iniciar/parar o watcher de uma pasta (startWatching/stopWatching), incluindo hardening de permissões (hardenBucketPermissions) e prune de retenção da pasta antes do primeiro watch'
      - 'Orquestrar onFolderTracked: persistir o bucketId (F_REGISTRY.recordBucketId) enquanto a pasta ainda existe no disco, iniciar o watcher, refrescar as 3 views e disparar o baseline scan com toast de progresso cancelável (cancelar desfaz o rastreamento inteiro)'
      - 'Orquestrar onFolderUntracked (parar watcher + refrescar views) e untrackAndForget (cancelamento de baseline: para o watcher, apaga o bucket incondicionalmente, esquece o bucketId, desfaz o rastreio)'
      - 'Reiniciar o watcher de uma única pasta quando um caminho dela é excluído (onExclusionChanged, Fase 5, 27/07) — mesma mecânica de restart usada por onFolderTracked/onFolderUntracked, mas escopada a uma pasta só'
      - 'Expor dispose() que encerra todos os watchers ativos (Map<folder, Disposable>)'
    non_responsibilities:
      - 'NÃO registra comandos VS Code nem cria tree views — recebe as instâncias já criadas via TrackedFolderLifecycleDeps e só as chama para refresh'
      - 'NÃO decide a política de retenção nem roda o prune periódico/sob demanda de toda a extensão (isso é F_ACTIVATE.pruneAllTrackedFolders) — só roda pruneOlderThan da pasta específica antes de iniciar o watch dela'
    entities: ['PastaRastreada']
    interfaces:
      code_ref: 'src/trackedFolderLifecycle.ts:createTrackedFolderLifecycle'
      inputs:
        - 'deps: TrackedFolderLifecycleDeps — globalState, storeRoot, os providers (history/decoration/trackedFolders/changes/monitor) e logWarning'
      outputs:
        - 'TrackedFolderLifecycle — { startWatching, stopWatching, onFolderTracked, onFolderUntracked, untrackAndForget, onExclusionChanged, dispose }'
      state: 'stateful: Map<folder, Disposable> de watchers ativos na memória da sessão'
      side_effects:
        database: 'globalState (backtrail.bucketIds via F_REGISTRY, backtrail.trackedFolders via untrackFolder) + storeRoot (via F_WATCH, F_BASELINE, F_DELETE_BUCKET)'
        events_published: ['EVT_FOLDER_TRACKED', 'EVT_FOLDER_UNTRACKED']
        events_consumed: []
        external_calls: ['VS Code API (withProgress, updateWorkspaceFolders)']
    boundaries:
      depends_on: ['F_WATCH', 'F_BASELINE', 'F_STORE_QUERY', 'F_REGISTRY', 'F_DELETE_BUCKET']
      exposed_to: ['F_ACTIVATE']
    notes:
      - 'Extraído de dentro do corpo de activate() na Fase 7 (31/07, PR #50) — mesmos corpos e mesma ordem de chamadas de antes, só mudou de arquivo (ver IR_008: watcher inicia ANTES do baseline; bucketId é persistido ANTES de updateWorkspaceFolders; cancelar o baseline desfaz o rastreio inteiro — as três garantias foram preservadas mecanicamente, não re-derivadas)'
      - 'Falha ao iniciar watcher de pasta inacessível não aborta o startWatching desta pasta nem a ativação (try/catch)'
      - "untrackAndForget (cancelamento de baseline) chama F_DELETE_BUCKET incondicionalmente, sem perguntar — esse caminho já significa 'desfazer o rastreio inteiro' (Fase 1 de hardening, 26/07)"
      - 'onFolderTracked persiste o bucketId da pasta (F_REGISTRY.recordBucketId) enquanto ela ainda existe no disco — é o único fallback que F_DELETE_BUCKET tem quando a pasta já sumiu no momento do untrack (Fase 6, 28/07)'

  - id: 'F_REGISTRY'
    name: 'Registro de Pastas Rastreadas'
    type: 'Domain Service'
    domain: 'Rastreamento'
    status: 'verified'
    responsibilities:
      - 'Listar, adicionar e remover pastas rastreadas persistidas em globalState (chave backtrail.trackedFolders)'
      - 'Resolver se um caminho absoluto pertence a alguma pasta rastreada (resolveTrackedFolder)'
      - 'Filtrar entradas corrompidas defensivamente na leitura'
      - 'Fase 6 (28/07): persistir e recuperar o bucketId de cada pasta (globalState backtrail.bucketIds, Record<folder, bucketId>) via getBucketId/recordBucketId/forgetBucketId — fallback para quando F_DELETE_BUCKET precisa apagar o histórico de uma pasta que já não existe mais no disco (ver nota em F_DELETE_BUCKET)'
    non_responsibilities:
      - 'NÃO inicia/para watchers nem atualiza views — isso é de F_TRACK_LIFECYCLE'
      - 'NÃO valida se a pasta existe no disco'
      - 'NÃO calcula o bucketId sozinho (isso é bucketIdFor, em F_CAPTURE) — só guarda o valor que o caller já calculou, deliberadamente sem importar snapshotStore.ts (mantém F_REGISTRY testável sem depender do formato de armazenamento)'
    entities: ['PastaRastreada']
    interfaces:
      code_ref: 'src/trackedFolders.ts (listTrackedFolders, isTracked, trackFolder, untrackFolder, resolveTrackedFolder, getBucketId, recordBucketId, forgetBucketId)'
      inputs:
        - 'store: KeyValueStore (abstração do Memento) + caminho absoluto'
      outputs:
        - 'string[] de pastas; ResolvedTrackedFolder {folder, relPath} | undefined; bucketId: string | undefined'
      state: 'stateless (persistência delegada ao KeyValueStore)'
      side_effects:
        database: 'globalState: backtrail.trackedFolders, backtrail.bucketIds'
        events_published: []
        events_consumed: []
        external_calls: []
    boundaries:
      depends_on: []
      exposed_to:
        [
          'F_ACTIVATE',
          'F_TRACK_LIFECYCLE',
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
      - 'backtrail.bucketIds vive numa chave separada de backtrail.trackedFolders (Fase 6, 28/07) para não migrar o formato do array já existente — recordBucketId/forgetBucketId fazem leitura-modificação-escrita completa do mapa a cada chamada, aceitável dado o volume (uma pasta rastreada por vez, não por evento de arquivo)'

  - id: 'F_EXCLUDED_PATHS'
    name: 'Registro de Caminhos Excluídos por Pasta'
    type: 'Domain Service'
    domain: 'Rastreamento'
    status: 'verified'
    responsibilities:
      - 'Listar, adicionar e remover caminhos relativos excluídos, por pasta rastreada, em globalState (chave backtrail.excludedPaths — Record<folder, relPath[]>)'
    non_responsibilities:
      - 'NÃO decide se um relPath cai sob um prefixo excluído — isso é de F_IGNORE (matching) e F_MONITOR_VIEW (exibição do checkbox)'
      - 'NÃO purga histórico já capturado nem reinicia watchers — isso é de F_STOP_TRACKING_PATH'
    entities: ['CaminhosExcluidos']
    interfaces:
      code_ref: 'src/excludedPaths.ts (listExcludedPaths, excludePath, includePath)'
      inputs:
        - 'store: KeyValueStore + folder: string + relPath: string'
      outputs:
        - 'string[] de relPaths excluídos para aquela pasta'
      state: 'stateless (persistência delegada ao KeyValueStore, mesmo padrão de F_REGISTRY)'
      side_effects:
        database: 'globalState: backtrail.excludedPaths'
        events_published: []
        events_consumed: []
        external_calls: []
    boundaries:
      depends_on: []
      exposed_to: ['F_IGNORE (via getIgnoreConfigForFolder)', 'F_MONITOR_VIEW', 'F_STOP_TRACKING_PATH']
    notes:
      - 'Adicionada na Fase 5 (27/07), tópico 7, peça 1 — convive com backtrail.trackedFolders (F_REGISTRY) e com ignoredFolders (F_IGNORE, matching por NOME em qualquer profundidade); esta é matching por CAMINHO relativo a uma pasta específica, não substitui a outra'

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
      - 'Variante untrackAndForget (interna a F_TRACK_LIFECYCLE): usada quando o usuário cancela o baseline — desfaz o rastreamento inteiro sem perguntar'
    non_responsibilities:
      - "Stop Tracking manual não apaga o bucket automaticamente — pergunta via warning prompt (fire-and-forget, não bloqueia o untrack em si); untrackAndForget (cancelamento de baseline) apaga incondicionalmente, sem perguntar, pois esse caminho já significa 'desfazer tudo'. Decisão do owner de 26/07 implementada em 2026-07-26 (Fase 1 de hardening)."
    entities: ['PastaRastreada']
    interfaces:
      code_ref: 'src/trackedFoldersCommands.ts:untrackFolderCommand + src/trackedFolderLifecycle.ts:untrackAndForget'
      inputs:
        - 'folder: string — caminho absoluto (do context menu da view Tracked Folders)'
      outputs:
        - 'void — feedback via mensagens'
      state: 'stateless'
      side_effects:
        database: 'globalState: backtrail.trackedFolders, backtrail.bucketIds'
        events_published: ['EVT_FOLDER_UNTRACKED']
        events_consumed: []
        external_calls: ['VS Code API (updateWorkspaceFolders)']
    boundaries:
      depends_on: ['F_REGISTRY', 'F_DELETE_BUCKET']
      exposed_to: ['usuário (comando VS Code)', 'F_TRACK_LIFECYCLE']
    notes:
      - 'A pergunta de exclusão de histórico é assíncrona e não é aguardada pelo comando — evita que um teste de integração headless trave esperando resposta de UI; o untrack em si (globalState) sempre completa de imediato, como antes.'
      - "Fase 6 (28/07): untrackFolderCommand lê o bucketId persistido (F_REGISTRY.getBucketId) ANTES de qualquer coisa, para ter um fallback pronto se a pasta já não existir quando o usuário responder 'Delete Saved History'; forgetBucketId roda logo após o untrack, nas duas escolhas (deletar ou manter histórico) — se o usuário retrackar a mesma pasta depois, onFolderTracked regrava o id na hora. untrackAndForget (agora em F_TRACK_LIFECYCLE, Fase 7) segue o mesmo padrão."

  - id: 'F_STOP_TRACKING_PATH'
    name: 'Parar de Rastrear um Caminho'
    type: 'API'
    domain: 'Rastreamento'
    status: 'verified'
    responsibilities:
      - 'Comando backtrail.stopTrackingPath (menu de contexto da view Changes) e o handler de checkbox da view Monitor: excluir um relPath (F_EXCLUDED_PATHS) e oferecer purgar seu histórico já salvo (F_PURGE_PATH)'
      - 'Reiniciar o watcher só da pasta afetada após excluir, para a exclusão valer a partir da próxima captura sem exigir reload da janela'
    non_responsibilities:
      - 'Mesma assimetria de F_UNTRACK_FOLDER: excluir é imediato e incondicional; purgar o histórico salvo é perguntado à parte (fire-and-forget), pois só essa parte é irreversível'
      - 'NÃO decide o estado do checkbox — isso é de F_MONITOR_VIEW (getTreeItem, a cada render)'
    entities: ['CaminhosExcluidos', 'SérieDeVersões', 'Blob']
    interfaces:
      code_ref: 'src/pathExclusion.ts:stopTrackingPath + src/monitorCommands.ts:registerMonitorCheckboxHandler + src/changesCommands.ts:registerStopTrackingPathCommand'
      inputs:
        - 'globalState, storeRoot, folder: string, relPath: string, onChanged: () => void'
      outputs:
        - 'void (Promise) — feedback via mensagens; onChanged notifica o caller para reiniciar o watcher e atualizar as views'
      state: 'stateless'
      side_effects:
        database: 'globalState: backtrail.excludedPaths (via F_EXCLUDED_PATHS) + storeRoot (via F_PURGE_PATH, se confirmado)'
        events_published: []
        events_consumed: []
        external_calls:
          [
            'VS Code API (showWarningMessage/showInformationMessage/showErrorMessage, TreeView.onDidChangeCheckboxState)',
          ]
    boundaries:
      depends_on: ['F_EXCLUDED_PATHS', 'F_PURGE_PATH']
      exposed_to: ['usuário (comando VS Code, checkbox da view Monitor)', 'F_ACTIVATE (onExclusionChanged)']
    notes:
      - 'Adicionada na Fase 5 (27/07), tópico 7, peças 4 e 5 — mesmo fluxo compartilhado pelos dois pontos de entrada (checkbox e menu de contexto), para não duplicar a lógica de confirmação'
      - 'Reincluir (marcar o checkbox de volta) não passa por aqui — é F_EXCLUDED_PATHS.includePath direto, sem diálogo, por não ser destrutivo'

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

```

## Entidades

```yaml
entities:
  - name: 'PastaRastreada'
    owner_domain: 'Rastreamento'
    read_by:
      [
        'F_ACTIVATE',
        'F_REGISTRY',
        'F_DECORATE',
        'F_SEEN',
        'F_HISTORY_VIEW',
        'F_CHANGES_VIEW',
        'F_TRACKED_VIEW',
        'F_MONITOR_VIEW',
      ]
    modified_by: ['F_TRACK_FOLDER', 'F_UNTRACK_FOLDER']

  - name: 'CaminhosExcluidos (globalState backtrail.excludedPaths: folder → relPath[])'
    owner_domain: 'Rastreamento'
    read_by: ['F_IGNORE (via getIgnoreConfigForFolder)', 'F_MONITOR_VIEW']
    modified_by: ['F_STOP_TRACKING_PATH (via F_EXCLUDED_PATHS)']
```

## Eventos

```yaml
events:
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

## Relacionamentos (internos ao domínio)

```yaml
relationships:
  - {
      id: 'R_001',
      from: 'F_ACTIVATE',
      to: 'F_TRACK_LIFECYCLE',
      type: 'calls',
      coupling: 'tight',
      channel: 'in-process',
      criticality: 'critical',
      description: 'Instancia e conecta o ciclo de vida de rastreamento aos comandos, views e ao dispose de ativação (Fase 7, 31/07, PR #50)',
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
      id: 'R_025',
      from: 'F_TRACK_LIFECYCLE',
      to: 'F_REGISTRY',
      type: 'writes_to',
      coupling: 'tight',
      channel: 'Shared Database',
      criticality: 'critical',
      description: 'recordBucketId/forgetBucketId em onFolderTracked/untrackAndForget; untrackFolder em untrackAndForget',
    }
```
