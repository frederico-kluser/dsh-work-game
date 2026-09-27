/**
 * Entry host do plugin `dsh-work-game-plugin`.
 *
 * O escritório vive no lado browser: o módulo `modules` do web-app lê o bloco
 * `dsh.client` do manifesto (inject + platform) e serve o entrypoint
 * `exports["./client"]`. Este entry só existe para o Cordis conseguir importar
 * a camada declarada em `cordis.patch.yml` — comportamento de host nenhum.
 */
export default {
  name: 'dsh-work-game',
  inject: [],
  reusable: true,
  apply(_ctx) {
    // Sem efeitos no host: estado, adapter e renderização são do cliente.
  },
};
