# Local AI Writing Studio

**Um ambiente local de escrita assistida por IA para revisar, reescrever, organizar e desenvolver diferentes tipos de texto.**

O Local AI Writing Studio oferece um espaço privado de trabalho com dois agentes configuráveis: um Revisor e um Assistente de Escrita. A aplicação pode ser adaptada pelo usuário para diferentes finalidades — livros, artigos, textos acadêmicos, documentação técnica, conteúdo profissional, material educativo, ficção, não ficção, anotações ou outros formatos.

Os agentes não são modelos treinados separadamente. São perfis de comportamento e operações definidos por prompts editáveis, executados sobre o mesmo modelo local do Ollama.

**Autoria, concepção e manutenção:** [RhogHub](https://github.com/RhogHub).

> Ferramentas de inteligência artificial foram utilizadas como apoio técnico durante a implementação, depuração, revisão técnica e preparação da documentação. A autoria do projeto, sua concepção, direção, decisões e manutenção são de RhogHub. A IA é declarada como ferramenta de assistência, não como autora ou coautora do software.

## Objetivos

- Executar a aplicação localmente e manter os textos na própria máquina.
- Permitir que o usuário escolha explicitamente a operação a realizar.
- Preservar o texto original e apresentar o resultado separadamente.
- Comparar versões antes de aplicar alterações.
- Manter projetos, documentos, capítulos e histórico de revisões.
- Permitir personalizar os agentes por meio de prompts em Markdown, sem alterar o código da aplicação.
- Não impor um gênero textual ou método editorial: cada usuário pode adaptar os prompts ao seu próprio fluxo de trabalho.

## Agentes e operações

### Revisor

O Revisor é destinado a correções e melhorias conservadoras:

- **Revisar ortografia:** ortografia, acentuação, digitação e pontuação.
- **Melhorar gramática:** concordância, regência, sintaxe e construção das frases.
- **Melhorar clareza:** coesão, fluidez, compreensão e transições.
- **Reescrever profissionalmente:** adequação de linguagem, tom e formalidade.

### Assistente de Escrita

O segundo agente auxilia no desenvolvimento e na organização do conteúdo:

- **Transformar ideia em lição:** desenvolver notas ou rascunhos em um texto coerente.
- **Desenvolver conteúdo:** aprofundar, explicar e expandir ideias.
- **Estruturar capítulo:** organizar o material em uma sequência lógica.
- **Criar exemplos e exercícios:** criar recursos complementares relacionados ao conteúdo fornecido.
- **Preservar voz autoral:** aprimorar a leitura sem descaracterizar o estilo do autor.

Os nomes e as instruções das operações são personalizáveis. Por exemplo, o usuário pode configurar o Assistente de Escrita para trabalhar com textos acadêmicos, artigos, histórias, manuais, documentação técnica, aulas, ensaios ou livros. O comportamento efetivo de cada operação é determinado pelos prompts locais.

## Funcionalidades

- Frontend React + TypeScript.
- Backend Node.js + TypeScript + Fastify.
- Ollama para inferência local.
- Modelo configurável por variável de ambiente; padrão `qwen3.5:9b`.
- Compatibilidade com GPU NVIDIA via Docker Compose e NVIDIA Container Toolkit.
- Respostas em streaming.
- Editor e workspace para documentos.
- Projetos e capítulos persistidos em SQLite.
- Histórico de revisões e comparação entre original e resultado.
- Aplicação seletiva das alterações, sem sobrescrever o original automaticamente.
- Exclusão de projetos e capítulos pela interface.
- Exportação de conteúdo em Markdown.
- Prompts separados por agente e por operação, editáveis em arquivos Markdown.
- Comunicação browser → Nginx → API pela rede local do Docker Compose.

## Requisitos

- Docker Engine e Docker Compose v2.
- Para utilizar GPU NVIDIA: driver instalado e NVIDIA Container Toolkit configurado para Docker.
- 32 GB de RAM é uma boa base para o perfil de modelo sugerido; a VRAM disponível influencia a parcela do modelo executada na GPU e a velocidade.
- Espaço em disco para imagens Docker, banco SQLite e pesos do modelo Ollama.

A aplicação não precisa de serviços de IA externos. O download inicial das imagens Docker, das dependências durante o build e do modelo Ollama exige internet. Depois que tudo estiver baixado e iniciado corretamente, o uso normal pode ser feito offline.

## Início rápido

Na primeira execução, prepare o ambiente e os prompts locais:

```bash
cp .env.example .env
./scripts/init-prompts.sh
```

Ou use o atalho do Makefile, que executa as duas etapas:

```bash
make setup
```

Suba os containers:

```bash
docker compose up -d --build
```

Baixe o modelo configurado (somente na primeira execução):

```bash
docker compose exec ollama ollama pull qwen3.5:9b
```

Acesse:

- Aplicação: <http://localhost:5173>
- Diagnóstico: <http://localhost:5173/api/health>

O Ollama carrega o modelo sob demanda. A primeira operação pode demorar mais enquanto os pesos são carregados na memória e/ou VRAM.

> O comando `make up` também prepara `.env` e os prompts locais antes de iniciar o Compose.

## Prompts: personalize os agentes

**Os prompts personalizados do mantenedor não são distribuídos neste repositório.** O projeto inclui apenas modelos genéricos de partida para que cada usuário crie as próprias instruções.

A estrutura pública de exemplos está em `backend/prompts.example/`. Na primeira configuração, o script `scripts/init-prompts.sh` copia esses arquivos para `backend/prompts/`, que é o diretório utilizado pela aplicação.

```text
backend/
├── prompts.example/              # templates genéricos versionados no Git
│   ├── reviewer/
│   │   ├── agent.md
│   │   └── actions/
│   └── book-writer/
│       ├── agent.md
│       └── actions/
└── prompts/                       # prompts locais, personalizados pelo usuário
    ├── reviewer/
    └── book-writer/
```

O diretório `backend/prompts/` está no `.gitignore` e no `.dockerignore`:

- Os prompts personalizados não são enviados ao GitHub.
- Os prompts personalizados não são incluídos no contexto do build Docker.
- Cada pessoa pode definir o comportamento dos agentes de acordo com seu tipo de texto, idioma, público e preferências.

### Como personalizar

1. Execute `./scripts/init-prompts.sh` ou `make setup` para criar `backend/prompts/` a partir dos templates genéricos.
2. Edite os arquivos dentro de `backend/prompts/`, não os arquivos de exemplo.
3. Use `agent.md` para definir as regras gerais de cada agente.
4. Edite os arquivos em `actions/` para configurar uma operação específica.
5. Salve o arquivo. O backend relê os prompts a cada operação; não é necessário reconstruir a imagem nem reiniciar o serviço.

O script de inicialização copia somente arquivos ausentes e nunca sobrescreve prompts locais existentes. Assim, executar `make setup` novamente preserva suas personalizações.

Exemplos de personalização:

- Revisor de textos acadêmicos, técnicos ou jurídicos.
- Assistente para artigos, ensaios, relatórios e documentação.
- Escrita criativa, ficção, não ficção, aulas ou conteúdo profissional.
- Produção de livros, lições, exercícios e materiais de estudo.

Os rótulos das ações exibidos na interface identificam as operações disponíveis; os prompts definem como cada operação deve se comportar. Para personalizações avançadas que exijam novos botões ou operações, será necessário alterar também o mapeamento de ações no backend e a interface.

Consulte [`PROMPTS.md`](PROMPTS.md) para um guia de edição.

## Uso offline

O navegador chama o caminho relativo `/api` no próprio frontend. O Nginx encaminha as chamadas para `api:3000` pela rede interna do Docker Compose. O Ollama também permanece na rede interna.

Para trabalhar sem internet:

1. Enquanto estiver conectado, baixe as imagens Docker e o modelo Ollama.
2. Conclua o build e confirme que os containers iniciam corretamente.
3. Desconecte a internet, mantendo Docker e os containers em execução.
4. Continue trabalhando normalmente.

Durante o uso offline, não execute comandos que precisem baixar imagens, dependências ou modelos, como `docker compose pull` ou `ollama pull` para um modelo ainda não instalado. Alterar prompts locais não exige internet nem rebuild.

## Diagnóstico e logs

```bash
docker compose ps
curl http://localhost:5173/api/health
docker compose logs --tail=150 frontend
docker compose logs --tail=150 api
docker compose logs --tail=150 ollama
```

Se uma operação falhar, verifique primeiro se os containers estão ativos. Consulte os logs do backend para falhas na chamada ao Ollama e os logs do frontend para falhas de proxy.

## Modelo e GPU

O modelo padrão é `qwen3.5:9b`. É possível alterar `OLLAMA_MODEL` no `.env`. Modelos maiores exigem mais memória; a VRAM disponível determina se o modelo cabe integralmente na GPU. Caso não caiba, o Ollama pode distribuir o processamento entre GPU e RAM/CPU, com impacto na velocidade.

Confira o uso do modelo:

```bash
docker compose exec ollama ollama ps
```

Ter uma GPU NVIDIA instalada, por si só, não garante que o container consiga acessá-la. O driver e o NVIDIA Container Toolkit precisam estar configurados corretamente no host.

## Persistência e backup

- Banco SQLite: `./data/writing-studio.sqlite`.
- Modelos Ollama: volume Docker `ollama_data`.
- Prompts personalizados: `./backend/prompts/`.

Faça backup de `./data/` para preservar projetos e capítulos. Guarde também uma cópia de `backend/prompts/` para preservar as configurações personalizadas dos agentes. Esses diretórios e o arquivo `.env` não devem ser enviados ao GitHub.

## Testes

Prepare os prompts antes de executar os testes, pois os testes do backend carregam os arquivos de prompt:

```bash
make setup

cd backend
npm install
npm test
npm run typecheck

cd ../frontend
npm install
npm run build
```

## Limites e observações

- A qualidade depende do modelo Ollama escolhido, do contexto e dos prompts personalizados.
- Modelos locais podem omitir trechos ou alterar detalhes. Compare o resultado antes de aplicá-lo.
- O limite padrão de entrada por operação é 30.000 caracteres. Para textos extensos, trabalhe por documento ou capítulo.
- Não há autenticação; a aplicação é destinada a uma máquina local confiável. Não exponha as portas à rede pública.
- Os agentes são perfis de prompt sobre um mesmo modelo Ollama; não são modelos treinados separadamente nem fine-tunings.
- O conteúdo gerado deve ser revisado pelo usuário, especialmente afirmações factuais, citações, referências e orientações práticas.

## WSL2 / Windows

Se utilizar Docker Desktop com WSL2:

1. Ative a integração da sua distribuição Ubuntu em Docker Desktop → Resources → WSL Integration.
2. Confirme que `nvidia-smi` funciona dentro do WSL, se utilizar NVIDIA.
3. Confirme que o Docker consegue disponibilizar a GPU aos containers.
4. Execute os comandos a partir do diretório do projeto no WSL.

## Autoria e assistência de IA

O Local AI Writing Studio é um projeto de **RhogHub**, responsável por sua concepção, direção, decisões de produto e arquitetura, validação e manutenção.

Ferramentas de inteligência artificial foram utilizadas como apoio durante a implementação, depuração, revisão técnica e elaboração da documentação. Essa assistência é declarada por transparência e não constitui coautoria do projeto. A autoria e a responsabilidade pelas decisões e pela evolução do software permanecem com RhogHub.

Consulte [`AUTHORS.md`](AUTHORS.md) para a declaração de autoria.

## Licença e direitos de uso

Este projeto é disponibilizado sob a licença **MIT**, permitindo seu uso livre, cópia, fork, modificação, redistribuição e utilização comercial, inclusive em projetos derivados, desde que preservados os avisos de direitos autorais e o texto da licença.

Os prompts genéricos disponibilizados neste repositório são exemplos abertos para que cada usuário possa criar, personalizar e utilizar suas próprias instruções e agentes.

Os prompts personalizados, instruções internas e configurações privadas desenvolvidos pelo autor e não incluídos neste repositório não fazem parte desta distribuição e permanecem sob sua titularidade.

Bibliotecas, dependências, imagens de containers, modelos de IA e demais componentes de terceiros permanecem sujeitos às respectivas licenças e termos de uso.

**A proposta é manter o software aberto e incentivar a comunidade a criar, adaptar, compartilhar e evoluir suas próprias soluções a partir dele.**

Consulte o arquivo `LICENSE` na raiz do repositório para conhecer os termos completos da licença MIT.
