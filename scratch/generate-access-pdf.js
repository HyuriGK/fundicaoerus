require('dotenv').config({ path: '.env.local' });

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const pool = require('../lib/db');

const requestedUsers = [
  'Hyuri',
  'luisspilerefurlan',
  'MOLDAGEM',
  'rafaelle.esteves',
  'ALESSANDRA',
  'nadia.moschem',
  'guilhermefenali',
  'mauricio. milanez',
  'elis2907',
];

const pages = [
  ['index.html', 'Dashboard'],
  ['pedidos.html', 'Carteira de Pedidos'],
  ['clientes.html', 'Clientes'],
  ['apontamentos_produtivos.html', 'Apontamentos Produtivos'],
  ['ordemdeproducao.html', 'Ordens de Produção'],
  ['fichatecmoldagem.html', 'Ficha Moldagem'],
  ['fichatecfusao.html', 'Ficha Fusão'],
  ['fichatecacabamento.html', 'Ficha Acabamento'],
  ['monitoramento.html', 'Monitoramento OPs'],
  ['acabamento_interno.html', 'Acabamento Interno'],
  ['insumosmoldagem.html', 'Insumos de Moldagem'],
  ['fichatecnica.html', 'Ficha Técnica'],
  ['faturamentos.html', 'Produção Faturada'],
  ['acabamento_externo.html', 'Acabamento Externo'],
  ['custos.html', 'Custos Gerais'],
  ['custopeca.html', 'Calculadora de Custos'],
  ['otif.html', 'OTIF'],
  ['planner.html', 'Planner'],
  ['aderencia.html', 'Aderência'],
  ['refugos.html', 'Refugos'],
  ['devolucoes.html', 'Devoluções'],
  ['balanco.html', 'Balanço'],
  ['solicitarchamados.html', 'Solicitar Chamado'],
  ['chamados.html', 'Painel TI'],
  ['comunicacao.html', 'Comunicação'],
  ['reuniao.html', 'Reuniões'],
  ['relatorio.html', 'Relatórios'],
];

function esc(value) {
  return String(value ?? '').replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[char]));
}

function chips(items) {
  return items.map((item) => `<span>${esc(item)}</span>`).join('');
}

async function main() {
  const keys = requestedUsers.map((user) => user.toLowerCase());
  const users = (await pool.query(
    'SELECT username, name, role, approved, can_view_monetary FROM users WHERE lower(username)=ANY($1) OR lower(name)=ANY($1)',
    [keys]
  )).rows;
  const permissions = (await pool.query('SELECT role, page_key, allowed FROM role_permissions')).rows;
  const permMap = new Map();

  for (const permission of permissions) {
    permMap.set(`${String(permission.role).toLowerCase()}|${permission.page_key}`, permission.allowed === true);
  }

  const rows = requestedUsers.map((wanted) => {
    const user = users.find((candidate) =>
      candidate.username.toLowerCase() === wanted.toLowerCase() ||
      candidate.name.toLowerCase() === wanted.toLowerCase()
    );

    if (!user) {
      return `<tr><td class="user"><strong>${esc(wanted)}</strong><span>Não encontrado</span></td><td>-</td><td>-</td><td>-</td><td class="screens"></td></tr>`;
    }

    const role = String(user.role || '').toLowerCase();
    const allowedPages = role === 'desenvolvedor'
      ? ['Todas as telas']
      : pages
          .filter(([key]) => permMap.get(`${role}|${key}`) !== false)
          .map(([, label]) => label);

    return `<tr>
      <td class="user"><strong>${esc(user.username)}</strong><span>${esc(user.name)}</span></td>
      <td><span class="role">${esc(user.role)}</span></td>
      <td><span class="money ${user.can_view_monetary ? 'yes' : 'no'}">${user.can_view_monetary ? 'Sim' : 'Não'}</span></td>
      <td class="screens">${chips(allowedPages)}</td>
    </tr>`;
  }).join('');

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<style>
  @page { size: A4 landscape; margin: 8mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #101827; background: #fff; font-size: 10px; }
  .top { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; border-bottom: 2px solid #111827; padding-bottom: 7px; margin-bottom: 8px; }
  h1 { margin: 0; font-size: 18px; line-height: 1.1; letter-spacing: -0.01em; }
  .meta { text-align: right; color: #64748b; font-size: 9px; line-height: 1.35; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  thead th { background: #111827; color: #fff; padding: 6px 7px; font-size: 8px; text-transform: uppercase; letter-spacing: .06em; border-right: 1px solid #374151; }
  tbody td { vertical-align: top; padding: 5px 7px; border: 1px solid #d9dee7; }
  tbody tr:nth-child(even) td { background: #f8fafc; }
  th:nth-child(1), td:nth-child(1) { width: 20%; }
  th:nth-child(2), td:nth-child(2) { width: 11%; }
  th:nth-child(3), td:nth-child(3) { width: 8%; text-align: center; }
  th:nth-child(4), td:nth-child(4) { width: 61%; }
  .user strong { display: block; font-size: 9.5px; margin-bottom: 2px; }
  .user span { display: block; color: #64748b; font-size: 8.5px; line-height: 1.25; }
  .role { display: inline-block; font-weight: 700; font-size: 8.5px; color: #334155; text-transform: uppercase; line-height: 1.2; }
  .money { display: inline-block; min-width: 30px; border-radius: 999px; padding: 2px 6px; font-size: 8px; font-weight: 700; }
  .money.yes { background: #dbeafe; color: #1d4ed8; }
  .money.no { background: #fee2e2; color: #991b1b; }
  .screens { line-height: 1.45; }
  .screens span { display: inline-block; border: 1px solid #cbd5e1; background: #fff; border-radius: 999px; padding: 1.5px 5px; margin: 0 3px 3px 0; white-space: nowrap; font-size: 8px; color: #1f2937; }
  .note { margin-top: 6px; color: #64748b; font-size: 8px; }
</style></head><body>
  <div class="top"><div><h1>Resumo de acessos por usuário</h1></div><div class="meta">Fundição Erus<br>Permissões por role e permissão monetária</div></div>
  <table><thead><tr><th>Usuário / Nome</th><th>Role</th><th>Monetária</th><th>Telas com acesso</th></tr></thead><tbody>${rows}</tbody></table>
  <div class="note">Observação: telas liberadas foram calculadas pela role do usuário. Permissões ausentes na matriz são tratadas pelo sistema como liberadas.</div>
</body></html>`;

  const htmlPath = path.resolve('scratch/resumo-acessos-usuarios.html');
  const pdfPath = path.resolve('scratch/resumo-acessos-usuarios.pdf');
  fs.writeFileSync(htmlPath, html, 'utf8');

  execFileSync('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
    '--headless',
    '--disable-gpu',
    '--no-pdf-header-footer',
    `--print-to-pdf=${pdfPath}`,
    `file:///${htmlPath.replace(/\\/g, '/')}`,
  ], { stdio: 'inherit' });

  console.log(pdfPath);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
