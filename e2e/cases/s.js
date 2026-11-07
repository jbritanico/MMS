// S group through the UI. S2-S4 and S6 are stored-data checks fully covered by the Phase 1
// backend run (users, templates, permission seed); here they get screen evidence only when the
// screens are reachable. S5 and S7 are checked on screen.
const { as, signOut, signIn, hasText } = require('../lib/ui');
const { toMainMenu } = require('../lib/wizard');

const USERS = [
  ['Jess Britanico', 'Sprint MMS | Jess Britanico | Administrator'],
  ['Suganya Rajendran', 'Sprint MMS | Suganya Rajendran | Operator (Tier 1)'],
  ['Abdulla Qais', 'Sprint MMS | Abdulla Qais | Job Supervisor (Tier 2)'],
  ['Jan-Albert Victorino', 'Sprint MMS | Jan-Albert Victorino | Operations Coordinator (Tier 2)'],
  ['Disantha Perera', 'Sprint MMS | Disantha Perera | Maintenance Supervisor (Tier 2)'],
  ['Kamil Shahzad', 'Sprint MMS | Kamil Shahzad | Maintenance Manager / FSM (Tier 3)'],
  ['Marilyn Tabay', 'Sprint MMS | Marilyn Tabay | Data Miner View (Read Only)'],
];

module.exports = [
  {
    id: 'S5', who: 'Disantha Perera', title: 'Starting state of the two assets (main menu as Disantha)',
    async run(t) {
      const b = t.browser;
      await as(b, 'Disantha Perera');
      await t.shot('main_menu_disantha');
      const txt = await t.text(3000);
      t.check('Fleet Availability tile shows 100.0%', /Fleet Availability\s*100\.0\s*%/.test(txt), txt.match(/Fleet Availability\s*[^\n]*\n?[^\n]*/)?.[0]);
      t.check('Open Defects tile shows 0', /Open Defects\s*0\b/.test(txt), txt.match(/Open Defects\s*[^\n]*\n?[^\n]*/)?.[0]);
      const tab = await b.$('button[aria-label="Open Fault Review"]');
      t.check('no Attention Required tab on clean data', !(await tab.isExisting()), '');
      t.info('assets, triggers, no reports / exemptions / tag history', 'stored data checked in Phase 1 (S5: all ok)');
    },
  },
  {
    id: 'S7', title: 'Title bar shows the signed-in user and level',
    async run(t) {
      const b = t.browser;
      await signOut(b);
      t.eq('picker title', await b.getTitle(), 'Sprint MMS');
      await t.shot('picker');
      for (const [name, want] of USERS) {
        await signIn(b, name);
        t.eq(`title for ${name}`, await b.getTitle(), want);
        await t.shot(`title_${name.split(' ')[0]}`);
        await signOut(b);
        t.eq(`after signing out ${name.split(' ')[0]}`, await b.getTitle(), 'Sprint MMS');
      }
    },
  },
];
