import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const a = '00000000-0000-4000-8000-000000000001';
const b = '00000000-0000-4000-8000-000000000002';
const c = '00000000-0000-4000-8000-000000000003';

before(async () => {
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create table auth.users(id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated;
    create schema realtime;
    create table realtime.messages(extension text not null);
    alter table realtime.messages enable row level security;
    grant usage on schema realtime to authenticated;
    grant select, insert on realtime.messages to authenticated;
    create function realtime.topic() returns text language sql stable as
      $$ select current_setting('realtime.topic', true) $$;
  `);
  for (const migration of ['20261121000100_first_space.sql', '20261121000200_room_style.sql', '20261121000300_couple_onboarding.sql', '20261126000200_six_digit_invitation_codes.sql', '20261127000100_onboarding_while_waiting.sql', '20261127000200_avatar_customization.sql', '20261127000300_task_backlog_details.sql', '20261127000400_expenses.sql', '20261127000500_live_room_presence.sql', '20261128000100_courier_role_avatar.sql', '20261128000200_courier_work.sql', '20261128000300_self_deletion.sql']) {
    await db.exec(await readFile('supabase/migrations/' + migration, 'utf8'));
  }
  await db.exec(`
    insert into private.allowed_emails values ('a@example.test'), ('b@example.test'), ('c@example.test');
    insert into auth.users values ('${a}', 'a@example.test'), ('${b}', 'b@example.test'), ('${c}', 'c@example.test');
  `);
});

after(() => db.close());

async function as(user, sql, params = []) {
  return db.transaction(async (tx) => {
    await tx.exec(user ? 'set local role authenticated' : 'set local role anon');
    if (user) await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [user]);
    return (await tx.query(sql, params)).rows;
  });
}

async function value(user, sql, params) {
  const [row] = await as(user, sql, params);
  return row && Object.values(row)[0];
}

async function asRealtime(user, topic, sql) {
  return db.transaction(async (tx) => {
    await tx.exec(user ? 'set local role authenticated' : 'set local role anon');
    if (user) await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [user]);
    await tx.query("select set_config('realtime.topic', $1, true)", [topic]);
    return (await tx.query(sql)).rows;
  });
}

async function pair(owner, partner, email) {
  const code = await value(owner, 'select issue_invitation()');
  assert.match(code, /^[0-9]{6}$/);
  assert.equal(await value(partner, 'select request_invitation($1)', [code]), true);
  assert.equal(await value(owner, 'select pending_partner()'), email);
  assert.equal(await value(owner, 'select approve_partner($1)', [email]), true);
  return { code, home: await value(owner, 'select id from spaces') };
}

test('el registro privado rechaza correos ajenos y las funciones requieren sesión', async () => {
  await assert.rejects(db.query('insert into auth.users values ($1, $2)', [
    '00000000-0000-4000-8000-000000000004', 'outside@example.test',
  ]), /limited to invited/);
  await assert.rejects(as(null, 'select issue_invitation()'), /permission denied/);
  await assert.rejects(as(a, 'select * from private.allowed_emails'), /permission denied/);
});

test('invitación caduca, solo el dueño aprueba y el código se consume', async () => {
  const expired = await value(a, 'select issue_invitation()');
  await db.exec("update private.invitations set expires_at = now() - interval '1 second'");
  assert.equal(await value(b, 'select request_invitation($1)', [expired]), false);
  const code = await value(a, 'select issue_invitation()');
  assert.equal(await value(b, 'select request_invitation($1)', [code]), true);
  assert.equal(await value(c, 'select request_invitation($1)', [code]), false);
  assert.equal(await value(c, 'select approve_partner($1)', ['b@example.test']), false);
  assert.equal(await value(a, 'select approve_partner($1)', ['c@example.test']), false);
  assert.equal(await value(b, 'select id from spaces'), undefined);
  assert.equal(await value(a, 'select approve_partner($1)', ['b@example.test']), true);
  assert.equal(await value(c, 'select request_invitation($1)', [code]), false);
  assert.equal(await value(a, 'select id from spaces'), await value(b, 'select id from spaces'));
});

test('la decoración tiene permisos de pareja y protege cambios simultáneos', async () => {
  const home = await value(a, 'select id from spaces');
  assert.equal(await value(a, "select save_room_style('sunset', 0)"), true);
  assert.equal(await value(b, 'select palette from room_styles where space_id = $1', [home]), 'sunset');
  assert.equal(await value(b, "select save_room_style('forest', 0)"), false);
  assert.equal(await value(c, "select save_room_style('night', 1)"), false);
  assert.deepEqual(await as(c, 'select * from room_styles'), []);
  await assert.rejects(as(b, "update room_styles set palette = 'night'"), /permission denied/);
  assert.equal(await value(b, "select save_room_style('night', 1)"), true);
  assert.equal(await value(a, 'select revision from room_styles'), 2);
});

test('la bienvenida guarda cada presentación y protege la fecha compartida', async () => {
  const home = await value(a, 'select id from spaces');
  const save = (actor, ...values) => value(actor, 'select save_couple_onboarding($1,$2,$3,$4,$5,$6,$7,$8)', [home, ...values]);

  assert.equal(await save(a, '  Ana ', 'Cocinar', 'Salir este mes', 'Viajar', '2024-01-12', null, 0), 'saved');
  assert.equal(await save(c, 'Otra cuenta', '', '', '', null, null, 0), 'unavailable');
  assert.equal(await value(c, 'select get_couple_onboarding($1)', [home]), null);
  await assert.rejects(as(b, 'select * from private.couple_introductions'), /permission denied/);
  assert.equal(await save(a, 'Ana', '', '', '', '2099-11-21', '2024-01-12', 1), 'invalid');
  assert.equal(await save(b, 'Luis', 'Películas', 'Cocinar juntos', '', '2024-01-14', null, 0), 'date_conflict');
  assert.equal(await save(b, 'Luis', 'Películas', 'Cocinar juntos', '', null, null, 0), 'saved');
  assert.equal(await save(b, 'Otro nombre', '', '', '', null, null, 0), 'profile_conflict');
  const story = await value(b, 'select get_couple_onboarding($1)', [home]);
  assert.equal(story.relationship_since, '2024-01-12');
  assert.deepEqual(story.introductions.map(({ display_name, is_mine }) => [display_name, is_mine]), [
    ['Luis', true], ['Ana', false],
  ]);
  assert.equal(story.introductions[1].long_goals, 'Viajar');
  assert.equal(await save(a, 'Ana', 'Cocinar', 'Salir este mes', 'Viajar juntos', '2024-01-12', '2024-01-12', 1), 'saved');
});

test('los gastos personales son privados y los compartidos validan al pagador', async () => {
  const home = await value(a, 'select id from spaces');
  const insert = 'insert into expenses(owner_id, space_id, paid_by, occurred_on, amount, category, description) values ($1,$2,$3,$4,$5,$6,$7) returning id';
  const personal = await value(a, insert, [a, null, a, '2026-11-27', '12.50', 'food', 'Almuerzo']);
  const shared = await value(b, insert, [b, home, a, '2026-11-27', '30.00', 'home', 'Casa']);
  assert.deepEqual((await as(a, 'select description from expenses order by description')).map(row => row.description), ['Almuerzo', 'Casa']);
  assert.deepEqual((await as(b, 'select description from expenses')).map(row => row.description), ['Casa']);
  assert.deepEqual(await as(c, 'select * from expenses'), []);
  assert.deepEqual(await as(b, 'update expenses set amount = 99 where id = $1 returning id', [personal]), []);
  await assert.rejects(as(a, insert, [a, home, c, '2026-11-27', '3.00', 'other', 'Ajeno']), /Payer must be a current space member/);
  await assert.rejects(as(c, insert, [c, home, a, '2026-11-27', '3.00', 'other', 'Ajeno']), /row-level security/);
  assert.deepEqual((await value(a, 'select household_member_ids()')).sort(), [a, b].sort());
  assert.equal(await value(a, 'update expenses set paid_by = $1 where id = $2 returning paid_by', [b, shared]), b);
});

test('la presencia y movimiento en vivo sólo permiten integrantes vinculados', async () => {
  const home = await value(a, 'select id from spaces');
  const topic = `ourspace:room:${home}`;
  assert.deepEqual(await asRealtime(a, topic, "insert into realtime.messages(extension) values ('presence') returning extension"), [{ extension: 'presence' }]);
  assert.deepEqual(await asRealtime(b, topic, "insert into realtime.messages(extension) values ('broadcast') returning extension"), [{ extension: 'broadcast' }]);
  assert.equal((await asRealtime(b, topic, 'select extension from realtime.messages')).length, 2);
  assert.deepEqual(await asRealtime(c, topic, 'select extension from realtime.messages'), []);
  await assert.rejects(asRealtime(c, topic, "insert into realtime.messages(extension) values ('presence')"), /row-level security/);
  await assert.rejects(asRealtime(a, 'ourspace:room:otro', "insert into realtime.messages(extension) values ('presence')"), /row-level security/);
});

test('el rol de repartidor desbloquea su skin y mantiene privado el trabajo', async () => {
  assert.equal(await value(a, "select save_member_avatar('neutral','short','brown','courier_red')"), 'locked');
  await as(a, 'insert into courier_accounts(user_id, enabled) values ($1, true)', [a]);
  assert.equal((await value(a, 'select get_member_avatar()')).progress.courier_enabled, true);
  assert.equal(await value(a, "select save_member_avatar('neutral','short','brown','courier_red')"), 'saved');
  assert.equal((await value(b, 'select get_member_avatar()')).progress.courier_enabled, false);
  const platform = await value(a, "select id from courier_platforms where name = 'PedidosYa'");
  assert.deepEqual(await as(b, 'select * from courier_platforms'), []);
  await assert.rejects(as(b, 'insert into courier_shifts(user_id, platform_id) values ($1, $2)', [b, platform]), /permission denied/);
  const shift = await value(a, 'select id from courier_start_shift($1, 100, 20)', [platform]);
  await assert.rejects(as(a, "select courier_transition_shift($1, 'pause')", [shift]), /Odometer required/);
  assert.equal(await value(a, "select status from courier_transition_shift($1, 'pause', 105)", [shift]), 'paused');
  assert.equal(await value(a, "select status from courier_transition_shift($1, 'resume', 106)", [shift]), 'active');
  assert.equal(await value(a, "select status from courier_transition_shift($1, 'finish', 112)", [shift]), 'completed');
  await assert.rejects(as(b, "select courier_count_cash($1, 30)", [shift]), /unavailable/);
  assert.deepEqual(await as(b, 'select * from courier_shifts'), []);
  const earning = await value(a, `insert into courier_earnings(user_id,platform_id,shift_id,earned_on,mode,reported_amount)
    values ($1,$2,$3,'2026-11-28','shift',40) returning id`, [a, platform, shift]);
  assert.equal(await value(a, 'update courier_earnings set reported_amount = 45, revision = 1 where id = $1 returning revision', [earning]), 1);
  assert.equal(await value(a, 'select count(*) from courier_earnings_history where earning_id = $1', [earning]), 1);
  assert.deepEqual(await as(b, 'select * from courier_earnings_history'), []);
  await assert.rejects(as(b, `insert into courier_earnings(user_id,platform_id,shift_id,earned_on,mode,reported_amount)
    values ($1,$2,$3,'2026-11-28','shift',40)`, [b, platform, shift]), /violates foreign key|Shift and platform/);
  await as(a, 'update courier_accounts set enabled = false where user_id = $1', [a]);
  assert.equal((await value(a, 'select get_member_avatar()')).appearance.outfit, 'sage');
});

test('finanzas de reparto evitan duplicados y referencias cruzadas', async () => {
  const platform = await value(a, 'select id from courier_platforms limit 1');
  const shift = await value(a, 'select id from courier_shifts limit 1');
  const shiftStart = await value(a, 'select started_at from courier_shifts where id = $1', [shift]);
  const otherPlatform = await value(a, "insert into courier_platforms(user_id,name) values ($1,'Otra') returning id", [a]);
  const earnedOn = await value(a, 'select earned_on from courier_earnings where shift_id = $1', [shift]);
  await assert.rejects(as(a, `insert into courier_earnings(user_id,platform_id,earned_on,mode,reported_amount)
    values ($1,$2,$3,'daily',10)`, [a, platform, earnedOn]), /cannot overlap/);
  await assert.rejects(as(a, `insert into courier_receipts(user_id,platform_id,shift_id,amount,payment_method)
    values ($1,$2,$3,12,'cash')`, [a, otherPlatform, shift]), /do not match/);
  await as(a, `insert into courier_receipts(user_id,platform_id,shift_id,occurred_at,amount,payment_method,cash_received)
    values ($1,$2,$3,$4,12,'cash',20)`, [a, platform, shift, shiftStart]);
  const category = await value(a, `insert into courier_categories(user_id,name,kind)
    values ($1,'Comida de turno','operational') returning id`, [a]);
  await as(a, `insert into courier_expenses(user_id,category_id,shift_id,amount,description,payment_method,cash_paid)
    values ($1,$2,$3,5,'Almuerzo','cash',10)`, [a, category, shift]);
  await as(a, `insert into courier_fuel(user_id,shift_id,amount,liters,payment_method)
    values ($1,$2,8,2,'yape')`, [a, shift]);
  assert.equal(await value(a, 'select courier_remove_category($1)', [category]), 'in_use');
  const replacement = await value(a, "select id from courier_categories where name = 'Comida de trabajo'");
  assert.equal(await value(a, 'select courier_remove_category($1,$2)', [category, replacement]), 'deleted');
  assert.equal(await value(a, "select count(*) from courier_expenses where category_id = $1", [replacement]), 1);
  assert.deepEqual(await as(b, 'select * from courier_receipts'), []);
  assert.deepEqual(await as(b, 'select * from courier_expenses'), []);
  assert.deepEqual(await as(b, 'select * from courier_fuel'), []);
  assert.equal(await value(a, 'select cash_counted from courier_count_cash($1, 27)', [shift]), '27.00');
});

test('una tarea privada queda aislada, la compartida persiste y el exmiembro pierde acceso', async () => {
  const home = await value(a, 'select id from spaces');
  await as(a, 'insert into tasks(owner_id, title) values ($1, $2)', [a, 'Privada']);
  const shared = await value(b, 'insert into tasks(owner_id, space_id, title) values ($1, $2, $3) returning id', [b, home, 'Compartida']);
  assert.equal(await value(b, 'select title from tasks'), 'Compartida');
  assert.deepEqual(await as(c, 'select * from tasks'), []);
  await assert.rejects(as(c, 'insert into tasks(owner_id, space_id, title) values ($1, $2, $3)', [c, home, 'Ajena']), /row-level security/);
  await assert.rejects(as(b, 'update tasks set owner_id = $1 where id = $2', [b, shared]), /permission denied/);
  assert.equal(await value(a, 'update tasks set completed = true where id = $1 returning completed', [shared]), true);
  assert.equal(await value(b, 'select completed from tasks where id = $1', [shared]), true);
  assert.equal(await value(a, 'select leave_space()'), true);
  assert.deepEqual(await asRealtime(a, `ourspace:room:${home}`, 'select extension from realtime.messages'), []);
  assert.deepEqual(await asRealtime(b, `ourspace:room:${home}`, 'select extension from realtime.messages'), []);
  assert.equal(await value(a, 'select title from tasks'), 'Privada');
  assert.equal(await value(a, 'select export_separated_space()'), null);
  assert.equal(await value(a, 'select get_couple_onboarding($1)', [home]), null);
  assert.equal(await value(b, 'select save_couple_onboarding($1,$2,$3,$4,$5,$6,$7,$8)', [
    home, 'Luis', '', '', '', null, null, 1,
  ]), 'unavailable');
  assert.equal(await value(b, 'update tasks set completed = false where id = $1 returning completed', [shared]), undefined);
  assert.deepEqual(await as(a, 'select * from room_styles'), []);
  assert.equal(await value(b, "select save_room_style('forest', 2)"), false);
  const archive = await value(b, 'select export_separated_space()');
  assert.deepEqual(archive.tasks.map(task => task.title), ['Compartida']);
  assert.deepEqual(archive.expenses.map(expense => expense.description), ['Casa']);
  assert.equal(archive.room.palette, 'night');
  assert.equal(archive.onboarding.relationship_since, '2024-01-12');
  assert.equal(archive.onboarding.introductions[0].long_goals, 'Viajar juntos');
  assert.equal(await value(b, 'select settle_space(false)'), true);
  assert.deepEqual((await db.query('select * from public.room_styles')).rows, []);
  assert.deepEqual((await db.query('select * from private.couple_introductions')).rows, []);
  assert.deepEqual((await db.query('select * from public.expenses where space_id = $1', [home])).rows, []);
  assert.deepEqual(await as(b, 'select * from tasks'), []);
  assert.equal(await value(a, 'select title from tasks'), 'Privada');
});

test('la persona que permanece puede conservar la casa y su historial', async () => {
  const { home } = await pair(a, b, 'b@example.test');
  await as(a, 'insert into tasks(owner_id, space_id, title) values ($1, $2, $3)', [a, home, 'Historial']);
  assert.equal(await value(a, "select save_room_style('sunset', 0)"), true);
  assert.equal(await value(b, 'select leave_space()'), true);
  assert.equal(await value(a, 'select settle_space(true)'), true);
  assert.equal(await value(a, 'select palette from room_styles'), 'sunset');
  assert.equal(await value(a, "select save_room_style('forest', 1)"), true);
  assert.equal(await value(a, 'select state from spaces'), 'retained');
  assert.equal(await value(a, 'select title from tasks where space_id = $1', [home]), 'Historial');
  assert.deepEqual(await as(b, 'select * from tasks'), []);
});

test('se limita la cantidad de intentos de vinculación', async () => {
  for (let attempt = 0; attempt < 10; attempt++) {
    assert.equal(await value(c, 'select request_invitation($1)', ['incorrecto']), false);
  }
  const { rows } = await db.query('select attempts from private.join_attempts where user_id = $1', [c]);
  assert.equal(rows[0].attempts, 9);
});

test('borrar la cuenta respeta las dependencias de la casa y elimina la cuenta libre', async () => {
  assert.equal(await value(a, 'select delete_own_account()'), 'resolve_home_first');
  assert.equal(await value(c, 'select delete_own_account()'), 'deleted');
  assert.equal((await db.query('select id from auth.users where id = $1', [c])).rows.length, 0);
  const courier = '00000000-0000-4000-8000-000000000004';
  await db.exec("insert into private.allowed_emails values ('courier@example.test')");
  await db.query('insert into auth.users(id,email) values ($1,$2)', [courier, 'courier@example.test']);
  await as(courier, 'insert into courier_accounts(user_id,enabled) values ($1,true)', [courier]);
  const platform = await value(courier, "insert into courier_platforms(user_id,name) values ($1,'Peya') returning id", [courier]);
  const shift = await value(courier, 'select id from courier_start_shift($1)', [platform]);
  await as(courier, `insert into courier_earnings(user_id,platform_id,shift_id,earned_on,mode,reported_amount)
    values ($1,$2,$3,'2026-11-28','shift',10)`, [courier, platform, shift]);
  assert.equal(await value(courier, 'select delete_own_account()'), 'deleted');
  assert.equal((await db.query('select id from auth.users where id = $1', [courier])).rows.length, 0);
});
