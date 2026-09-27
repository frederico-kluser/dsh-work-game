/*
 * data.js — dsh-work-game
 * Conteúdo simulado de apresentação: dados falsos usados apenas para a
 * demo visual do escritório 2D. Nada aqui representa trabalho, pessoas
 * ou resultados reais.
 */
window.DSH_DEMO_DATA = {
  firstNames: [
    'Lia', 'Rui', 'Bia', 'Tom', 'Maya', 'Alex', 'Nara', 'Caio',
    'Iris', 'Otto', 'Davi', 'Léo', 'Nina', 'Ivo', 'Zoe', 'Ravi',
    'Cleo', 'Théo', 'Lila', 'Enzo', 'Mila', 'Téo', 'Lara', 'Gael',
    'Sofia', 'Ruan', 'Dara', 'Noa', 'Yara', 'Iuri', 'Levi', 'Mel',
    'Tati', 'Vitor', 'Ari', 'Bel', 'Cauã', 'Duda', 'Ely', 'Fábio',
    'Gil', 'Hana', 'Iara', 'Júlia', 'Kai', 'Luan', 'Manu', 'Nilo'
  ],
  lastNames: [
    'Silva', 'Souza', 'Lima', 'Cruz', 'Melo', 'Rosa', 'Dias', 'Reis',
    'Luz', 'Moraes', 'Fontes', 'Braga', 'Prado', 'Rocha', 'Sales',
    'Tavares', 'Alves', 'Pinto', 'Moura', 'Vieira', 'Campos',
    'Freitas', 'Nunes', 'Bastos'
  ],
  outputs: [
    // kind: file (8)
    { kind: 'file', text: 'atualizou src/components/Tabela.tsx' },
    { kind: 'file', text: 'criou src/pages/Cadastro.jsx' },
    { kind: 'file', text: 'corrigiu src/utils/formataData.js' },
    { kind: 'file', text: 'removeu src/styles/legado.css' },
    { kind: 'file', text: 'renomeou api/user.js para api/conta.js' },
    { kind: 'file', text: 'editou docs/README.md na seção de setup' },
    { kind: 'file', text: 'atualizou as rotas em src/router.js' },
    { kind: 'file', text: 'criou o componente CardProduto.tsx' },
    // kind: tool (8)
    { kind: 'tool', text: 'rodou: npm test -- --watch=false' },
    { kind: 'tool', text: 'rodou: npm run build --production' },
    { kind: 'tool', text: 'rodou: npx eslint src --fix' },
    { kind: 'tool', text: 'rodou: git rebase -i HEAD~3' },
    { kind: 'tool', text: 'rodou: npm install axios@latest' },
    { kind: 'tool', text: 'rodou: docker compose up -d' },
    { kind: 'tool', text: 'rodou: pnpm run typecheck' },
    { kind: 'tool', text: 'rodou: git commit -m "fix: login"' },
    // kind: test (8)
    { kind: 'test', text: 'a suíte passou: 18 testes em 2.4s' },
    { kind: 'test', text: '3 testes do carrinho falharam' },
    { kind: 'test', text: 'cobertura subiu de 72% para 81%' },
    { kind: 'test', text: 'adicionou teste para o cálculo de frete' },
    { kind: 'test', text: 'corrigiu o teste instável do relógio' },
    { kind: 'test', text: 'os testes de integração passaram' },
    { kind: 'test', text: 'snapshot do formulário atualizado' },
    { kind: 'test', text: 'validou o teste do token expirado' },
    // kind: result (8)
    { kind: 'result', text: 'resultado pronto para revisão' },
    { kind: 'result', text: 'a busca agora retorna em 40ms' },
    { kind: 'result', text: 'o build caiu de 3MB para 1.2MB' },
    { kind: 'result', text: 'relatório de desempenho gerado' },
    { kind: 'result', text: 'a migração do banco foi concluída' },
    { kind: 'result', text: 'novo layout aprovado no design review' },
    { kind: 'result', text: 'o erro 500 no checkout foi resolvido' },
    { kind: 'result', text: 'deploy no ambiente de teste concluído' },
    // kind: message (8)
    { kind: 'message', text: 'preciso de uma decisão sobre o fluxo' },
    { kind: 'message', text: 'alguém pode revisar meu PR hoje?' },
    { kind: 'message', text: 'vou assumir a tarefa do painel' },
    { kind: 'message', text: 'a API de pagamento está fora do ar' },
    { kind: 'message', text: 'qual versão do Node usamos na CI?' },
    { kind: 'message', text: 'sugiro adiar o release para segunda' },
    { kind: 'message', text: 'terminei, pode conferir quando der' },
    { kind: 'message', text: 'a documentação da API está desatualizada' }
  ],
  tasks: [
    'criar a tela de login',
    'corrigir o teste do carrinho',
    'refatorar o módulo de pagamentos',
    'escrever a API de usuários',
    'melhorar o tempo de carregamento',
    'adicionar filtro na lista de pedidos',
    'atualizar as dependências do projeto',
    'corrigir o layout no celular',
    'criar o script de backup',
    'revisar o fluxo de recuperação de senha',
    'documentar os endpoints da API',
    'implementar o modo escuro'
  ],
  statuses: {}
};
