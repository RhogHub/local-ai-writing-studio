# Guia de prompts

Os prompts determinam o comportamento dos agentes. O repositório publica somente templates genéricos; os prompts personalizados de cada usuário ficam no diretório local `backend/prompts/`, que é ignorado pelo Git e pelo contexto do build Docker.

## Preparar os arquivos locais

```bash
./scripts/init-prompts.sh
```

O script copia os templates de `backend/prompts.example/` para `backend/prompts/`. Ele copia somente arquivos ausentes e preserva os arquivos que já foram personalizados.

## Organização

- `backend/prompts.example/reviewer/agent.md`: template genérico para as regras gerais do Revisor.
- `backend/prompts.example/reviewer/actions/`: templates por operação de revisão.
- `backend/prompts.example/book-writer/agent.md`: template genérico para o Assistente de Escrita.
- `backend/prompts.example/book-writer/actions/`: templates por operação de escrita.
- `backend/prompts/`: cópias locais que cada usuário pode editar livremente; esse diretório não é versionado.

## Como o backend utiliza os prompts

Para cada solicitação, o backend combina:

1. O prompt geral do agente (`agent.md`).
2. O prompt específico da operação selecionada em `actions/`.
3. O idioma selecionado na interface.
4. As instruções configuradas para o projeto e para a operação, quando fornecidas.

Os arquivos locais são relidos em cada operação. Mudanças nos prompts entram em vigor na próxima solicitação, sem recompilar o backend ou reconstruir a imagem.

## Recomendações

- Defina claramente o papel do agente, o objetivo da operação e o formato esperado.
- Informe o tipo de texto, o público, o tom e o nível de intervenção desejados.
- Explique o que deve ser preservado e o que pode ser alterado.
- Instrua o modelo a não inventar fatos, números, fontes, citações ou experiências.
- Para textos técnicos ou especializados, forneça glossário e convenções terminológicas no prompt do projeto.
- Teste cada mudança com textos curtos e compare o resultado com o original.

Os templates genéricos são apenas pontos de partida. Cada usuário é responsável por definir, testar e manter os prompts adequados ao próprio fluxo de trabalho.
