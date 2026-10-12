import axios from 'axios';
import SQLite from 'react-native-sqlite-storage';
import * as Keychain from 'react-native-keychain';
import bcrypt from 'bcryptjs';
import { DEFAULT_API_URL } from './config';

export type User = { id: string; name: string; email: string; role: string };
export type Question = {
  id: string;
  title: string;
  type: 'text' | 'yesno' | 'choice';
  required: boolean;
  options: string[];
};
export type Form = {
  id: string;
  title: string;
  questions: Question[];
  userIds: string[];
};
export type Answer = {
  formId: string;
  userId: string;
  values: Record<string, string>;
  photos: Record<string, string[]>;
  completed: boolean;
  revision: number;
};
export type Snapshot = {
  user: User;
  users: User[];
  forms: Form[];
  answers: Answer[];
};
type Pending = { operationId: string; answer: Answer };
type Cache = { data: Snapshot; pending: Pending[] };
const CONFIG = 'nexo.server';
const cacheKey = (email: string) => `${server}|${email.trim().toLowerCase()}`;
const credentials = (email: string) =>
  `nexo.offline.${encodeURIComponent(server)}.${email.trim().toLowerCase()}`;
export const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;
let db: SQLite.SQLiteDatabase;
let token = '';
let server = DEFAULT_API_URL;
let cache: Cache;
const client = () =>
  axios.create({
    baseURL: `${server.replace(/\/$/, '')}/workspace`,
    timeout: 30000,
    headers: { Authorization: `Bearer ${token}` },
  });
async function persist() {
  await db.executeSql(
    'INSERT OR REPLACE INTO workspace_cache (email, payload) VALUES (?, ?)',
    [cacheKey(cache.data.user.email), JSON.stringify(cache)],
  );
}
export async function initialize() {
  SQLite.enablePromise(true);
  db = await SQLite.openDatabase({ name: 'nexoforms.db', location: 'default' });
  await db.executeSql(
    'CREATE TABLE IF NOT EXISTS workspace_cache (email TEXT PRIMARY KEY, payload TEXT NOT NULL)',
  );
  const config = await Keychain.getGenericPassword({ service: CONFIG });
  server = config ? config.password : DEFAULT_API_URL;
  return server;
}
export async function configure(url: string) {
  if (!/^https?:\/\/[^\s]+\/api\/?$/.test(url)) {
    throw new Error('Informe a URL da API terminando em /api.');
  }
  const nextServer = url.replace(/\/$/, '');
  if (nextServer !== server) {
    token = '';
  }
  server = nextServer;
  const saved = await Keychain.setGenericPassword('server', server, {
    service: CONFIG,
  });
  if (!saved) {
    throw new Error('Não foi possível salvar a configuração do servidor.');
  }
}
export async function needsSetup() {
  return (await client().get('/status')).data.needsSetup as boolean;
}
export async function setup(
  name: string,
  email: string,
  password: string,
  code: string,
) {
  await client().post(
    '/setup',
    { name, email, password, role: 'admin' },
    { headers: { 'X-Setup-Code': code } },
  );
}
async function load(email: string): Promise<Cache | undefined> {
  const [result] = await db.executeSql(
    'SELECT payload FROM workspace_cache WHERE email = ?',
    [cacheKey(email)],
  );
  return result.rows.length
    ? JSON.parse(result.rows.item(0).payload)
    : undefined;
}
export async function login(
  email: string,
  password: string,
  offline: boolean,
): Promise<Snapshot> {
  email = email.trim().toLowerCase();
  if (offline) {
    const credential = await Keychain.getGenericPassword({
      service: credentials(email),
    });
    const saved = await load(email);
    if (!credential || !saved) {
      throw new Error('Faça o primeiro login online e crie sua senha offline.');
    }
    const { hash, expires } = JSON.parse(credential.password);
    if (Date.now() > expires || !(await bcrypt.compare(password, hash))) {
      throw new Error('Senha offline inválida ou expirada.');
    }
    cache = saved;
    token = '';
    return cache.data;
  }
  const response = await client().post('/login', { email, password });
  token = response.data.token;
  const saved = await load(email);
  cache = { data: response.data.data, pending: saved?.pending ?? [] };
  overlay();
  await persist();
  return cache.data;
}
function overlay() {
  cache.pending.forEach(p => {
    cache.data.answers = cache.data.answers.filter(
      a => a.formId !== p.answer.formId || a.userId !== p.answer.userId,
    );
    cache.data.answers.push(p.answer);
  });
}
export async function createOfflinePassword(password: string) {
  if (!token) {
    throw new Error('Faça login online para criar ou renovar a senha offline.');
  }
  if (password.length < 8) {
    throw new Error('Use pelo menos 8 caracteres.');
  }
  if (encodeURIComponent(password).replace(/%[0-9A-F]{2}/g, '_').length > 72) {
    throw new Error(
      'A senha offline excede o limite de 72 bytes. Use uma senha mais curta.',
    );
  }
  // React Native does not provide Node's randomBytes. Obtain a fresh cryptographic
  // salt from the authenticated server, then hash the offline password locally.
  const { salt } = (await client().get('/offline-salt')).data;
  if (typeof salt !== 'string' || !/^[0-9a-f]{32}$/i.test(salt)) {
    throw new Error('O servidor não forneceu um salt válido.');
  }
  const bytes = salt.match(/.{2}/g)!.map(value => parseInt(value, 16));
  const hash = await bcrypt.hash(
    password,
    `$2a$10$${bcrypt.encodeBase64(bytes, 16)}`,
  );
  const saved = await Keychain.setGenericPassword(
    cache.data.user.email,
    JSON.stringify({ hash, expires: Date.now() + 30 * 86400000 }),
    { service: credentials(cache.data.user.email) },
  );
  if (!saved) {
    throw new Error('Não foi possível salvar a senha offline no dispositivo.');
  }
}
export async function addUser(
  name: string,
  email: string,
  password: string,
  role: string,
) {
  if (!token) {
    throw new Error('Entre online para administrar usuários.');
  }
  await client().post('/users', { name, email, password, role });
  return refreshSnapshot();
}
export async function addForm(form: Form) {
  if (!token) {
    throw new Error('Entre online para publicar questionários.');
  }
  await client().post('/forms', form);
  return refreshSnapshot();
}
export async function assignUsers(formId: string, userIds: string[]) {
  if (!token) {
    throw new Error('Entre online para alterar atribuições.');
  }
  await client().put(`/forms/${encodeURIComponent(formId)}/users`, userIds);
  return refreshSnapshot();
}
export async function inspectConflict() {
  if (!token || !cache.pending.length) {
    throw new Error('Entre online e sincronize primeiro.');
  }
  const snapshot: Snapshot = (await client().get('/snapshot')).data;
  const pending = cache.pending.find(
    p =>
      p.answer.revision !==
      (snapshot.answers.find(
        a => a.formId === p.answer.formId && a.userId === p.answer.userId,
      )?.revision ?? 0),
  );
  if (!pending) {
    throw new Error('Nenhum conflito de revisão encontrado.');
  }
  return {
    local: pending.answer,
    remote: snapshot.answers.find(
      a =>
        a.formId === pending.answer.formId &&
        a.userId === pending.answer.userId,
    ),
  };
}
export async function resolveConflict(
  formId: string,
  keepLocal: boolean,
  remoteRevision: number,
) {
  const pending = cache.pending.find(p => p.answer.formId === formId);
  if (!pending) {
    throw new Error('Rascunho não encontrado.');
  }
  if (keepLocal) {
    pending.answer.revision = remoteRevision;
    pending.operationId = uid();
  } else {
    cache.pending = cache.pending.filter(p => p !== pending);
  }
  await persist();
  return sync();
}
export async function saveAnswer(answer: Answer) {
  const previous = cache.pending.find(
    p => p.answer.formId === answer.formId && p.answer.userId === answer.userId,
  );
  // Keep the server revision until acknowledged. Coalesce local edits into one durable operation.
  const next = {
    ...answer,
    revision: previous?.answer.revision ?? answer.revision,
  };
  cache.pending = cache.pending.filter(p => p !== previous);
  cache.pending.push({ operationId: uid(), answer: next });
  overlay();
  await persist();
  return cache.data;
}
let syncing = false;
async function refreshSnapshot(): Promise<Snapshot> {
  cache.data = (await client().get('/snapshot')).data;
  overlay();
  await persist();
  return cache.data;
}
export async function sync(): Promise<Snapshot> {
  if (!token) {
    throw new Error(
      'Entre online para sincronizar. Os rascunhos continuam salvos.',
    );
  }
  if (syncing) {
    throw new Error('Sincronização em andamento.');
  }
  syncing = true;
  try {
    while (cache.pending.length) {
      const pending = cache.pending[0];
      const response = await client().post('/answers', pending);
      const current = cache.pending.find(
        p =>
          p.answer.formId === pending.answer.formId &&
          p.answer.userId === pending.answer.userId,
      );
      if (current === pending) {
        cache.pending.shift();
      } else if (current) {
        current.answer.revision = response.data.revision;
      }
      await persist();
    }
    return refreshSnapshot();
  } finally {
    syncing = false;
  }
}
export function pendingCount() {
  return cache?.pending.length ?? 0;
}
export async function logout() {
  try {
    if (token) {
      await client().post('/logout');
    }
  } finally {
    token = '';
  }
}
export function errorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    if (error.response?.status === 409) {
      if (
        typeof error.response.data === 'string' &&
        !error.response.data.includes('outro aparelho')
      ) {
        return error.response.data;
      }
      return 'Há um conflito com dados de outro aparelho. Seu rascunho foi preservado. Revise a resposta antes de resolver o conflito.';
    }
    if (error.response?.status === 401) {
      return 'Credenciais inválidas ou sessão expirada. Entre novamente.';
    }
    return typeof error.response?.data === 'string'
      ? error.response.data
      : 'Não foi possível acessar o servidor. Verifique a conexão e a URL da API.';
  }
  return error instanceof Error
    ? error.message
    : 'Não foi possível concluir a operação.';
}
