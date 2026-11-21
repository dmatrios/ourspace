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
  `);
  await db.exec(await readFile('supabase/migrations/20261121000100_first_space.sql', 'utf8'));
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

async function pair(owner, partner, email) {
  const code = await value(owner, 'select issue_invitation()');
  assert.match(code, /^[0-9A-F]{32}$/);
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
  assert.equal(await value(a, 'select title from tasks'), 'Privada');
  assert.equal(await value(a, 'select export_separated_space()'), null);
  assert.equal(await value(b, 'update tasks set completed = false where id = $1 returning completed', [shared]), undefined);
  assert.deepEqual((await value(b, 'select export_separated_space()')).tasks.map(task => task.title), ['Compartida']);
  assert.equal(await value(b, 'select settle_space(false)'), true);
  assert.deepEqual(await as(b, 'select * from tasks'), []);
  assert.equal(await value(a, 'select title from tasks'), 'Privada');
});

test('la persona que permanece puede conservar la casa y su historial', async () => {
  const { home } = await pair(a, b, 'b@example.test');
  await as(a, 'insert into tasks(owner_id, space_id, title) values ($1, $2, $3)', [a, home, 'Historial']);
  assert.equal(await value(b, 'select leave_space()'), true);
  assert.equal(await value(a, 'select settle_space(true)'), true);
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
