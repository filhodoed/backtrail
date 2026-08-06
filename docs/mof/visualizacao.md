# MoF — Domínio Visualização

> Parte do Map of Functions do Backtrail. Índice, relacionamentos cross-domínio, regras de impacto e histórico de revisões: [`../MOF.md`](../MOF.md).

## Funções

```yaml
functions:
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

  - id: 'F_MONITOR_VIEW'
    name: 'Exibir e Alternar Exclusão de Caminhos'
    type: 'UI Component'
    domain: 'Visualização'
    status: 'verified'
    responsibilities:
      - 'TreeView backtrail.monitor: uma árvore por pasta rastreada espelhando o filesystem real (sem filtro de nome/extensão — é o ponto de exclusão granular que shouldIgnore por nome não cobre), carregada sob demanda por nó'
      - 'Checkbox por nó (exceto a raiz) refletindo se aquele relPath está excluído — direto (nele mesmo) ou por herança de um ancestral excluído — usando a mesma regra de prefixo de F_IGNORE'
    non_responsibilities:
      - 'NÃO decide o que acontece ao (des)marcar o checkbox — isso é de F_STOP_TRACKING_PATH (registerMonitorCheckboxHandler consome o evento e delega)'
      - 'NÃO filtra por nome/extensão/tamanho como F_WATCH/F_BASELINE — mostra o filesystem real para o usuário poder excluir qualquer coisa'
    entities: ['PastaRastreada', 'CaminhosExcluidos']
    interfaces:
      code_ref: 'src/monitorProvider.ts:MonitorProvider'
      inputs:
        - 'refresh()'
      outputs:
        - 'MonitorNode[] {folder, relPath} via TreeDataProvider; TreeItem com checkboxState'
      state: 'stateless (relê o filesystem e o globalState a cada getChildren/getTreeItem)'
      side_effects:
        database: null
        events_published: []
        events_consumed: []
        external_calls: ['VS Code TreeView API (readdirSync/statSync do filesystem real)']
    boundaries:
      depends_on: ['F_REGISTRY', 'F_EXCLUDED_PATHS']
      exposed_to: ['F_ACTIVATE', 'usuário', 'F_STOP_TRACKING_PATH (via TreeView.onDidChangeCheckboxState)']
    notes:
      - 'Adicionada na Fase 5 (27/07), tópico 7, peça 4 — usa TreeItem.checkboxState nativo (disponível desde VS Code 1.72), mesmo padrão de F_TRACKED_VIEW, não é webview customizada'
      - 'A raiz (relPath vazio, a própria pasta rastreada) não tem checkbox — excluir a pasta inteira já é o Stop Tracking (F_UNTRACK_FOLDER)'

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

```

## Entidades

```yaml
entities:
  - name: 'MapaDeVistos (globalState backtrail.seenVersions: seriesId → timestamp)'
    owner_domain: 'Visualização'
    read_by: ['F_SEEN (getDecorationState)', 'F_DECORATE', 'F_CHANGES_VIEW']
    modified_by: ['F_SEEN (markSeen/markManySeen)', 'F_OPEN_CHANGE']

```

## Eventos

Nenhum evento é publicado por função deste domínio.

## Relacionamentos (internos ao domínio)

```yaml
relationships:
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
```
