import * as api from '../src/workspace/service';
import * as Keychain from 'react-native-keychain';

const mockRecords = new Map<string, string>();
const mockSecrets = new Map<string, { username: string; password: string }>();
const mockGet = jest.fn(),
  mockPost = jest.fn(),
  mockPut = jest.fn();
jest.mock('axios', () => ({
  __esModule: true,
  default: {
    create: () => ({ get: mockGet, post: mockPost, put: mockPut }),
    isAxiosError: (e: { isAxiosError?: boolean }) => e?.isAxiosError,
  },
}));
jest.mock('react-native-sqlite-storage', () => ({
  __esModule: true,
  default: {
    enablePromise: jest.fn(),
    openDatabase: async () => ({
      executeSql: async (sql: string, args: string[] = []) => {
        if (sql.startsWith('INSERT')) {
          mockRecords.set(args[0], args[1]);
        }
        const payload = sql.startsWith('SELECT')
          ? mockRecords.get(args[0])
          : undefined;
        return [
          { rows: { length: payload ? 1 : 0, item: () => ({ payload }) } },
        ];
      },
    }),
  },
}));
jest.mock('react-native-keychain', () => ({
  getGenericPassword: jest.fn(
    async ({ service }: { service: string }) =>
      mockSecrets.get(service) ?? false,
  ),
  setGenericPassword: jest.fn(
    async (
      username: string,
      password: string,
      { service }: { service: string },
    ) => {
      mockSecrets.set(service, { username, password });
      return true;
    },
  ),
}));

const user = {
  id: 'u1',
  name: 'Ana',
  email: 'ana@example.com',
  role: 'member',
};
const form: api.Form = {
  id: 'f1',
  title: 'Inspeção',
  userIds: ['u1'],
  questions: [
    {
      id: 'q1',
      title: 'Tudo certo?',
      type: 'yesno',
      required: true,
      options: [],
    },
  ],
};
const cacheKey = 'https://example.com/api|ana@example.com';
const snapshot = (): api.Snapshot => ({
  user,
  users: [user],
  forms: [form],
  answers: [],
});
const answer = (): api.Answer => ({
  formId: 'f1',
  userId: 'u1',
  values: { q1: 'Sim' },
  photos: { q1: ['data:image/jpeg;base64,abc'] },
  completed: true,
  revision: 0,
});
beforeEach(async () => {
  jest.clearAllMocks();
  mockRecords.clear();
  mockSecrets.clear();
  mockGet.mockResolvedValue({data: {salt: '0123456789abcdef0123456789abcdef'}});
  await api.initialize();
  await api.configure('https://example.com/api');
  mockPost.mockResolvedValue({ data: { token: 'session', data: snapshot() } });
  await api.login(user.email, 'online-secret', false);
});
test('validates server URL and stores it in device credential storage', async () => {
  await expect(api.configure('invalid')).rejects.toThrow('URL');
  expect(Keychain.setGenericPassword).toHaveBeenCalledWith(
    'server',
    'https://example.com/api',
    { service: 'nexo.server' },
  );
});
test('persists draft and photos and coalesces local edits without changing server revision', async () => {
  await api.saveAnswer(answer());
  await api.saveAnswer({ ...answer(), values: { q1: 'Não' } });
  expect(api.pendingCount()).toBe(1);
  const saved = JSON.parse(mockRecords.get(cacheKey)!);
  expect(saved.pending[0].answer.values.q1).toBe('Não');
  expect(saved.pending[0].answer.revision).toBe(0);
  expect(saved.pending[0].answer.photos.q1).toEqual([
    'data:image/jpeg;base64,abc',
  ]);
});
test('sends durable operation then refreshes server snapshot', async () => {
  await api.saveAnswer(answer());
  mockPost.mockResolvedValue({ data: { revision: 1 } });
  mockGet.mockResolvedValue({
    data: { ...snapshot(), answers: [{ ...answer(), revision: 1 }] },
  });
  expect((await api.sync()).answers[0].revision).toBe(1);
  expect(api.pendingCount()).toBe(0);
});
test('network failure preserves operation for retry with the same id', async () => {
  await api.saveAnswer(answer());
  mockPost.mockRejectedValueOnce(new Error('network'));
  await expect(api.sync()).rejects.toThrow('network');
  const sent = mockPost.mock.calls.at(-1)![1];
  mockPost.mockResolvedValue({ data: { revision: 1 } });
  mockGet.mockResolvedValue({ data: snapshot() });
  await api.sync();
  expect(mockPost.mock.calls.at(-1)![1].operationId).toBe(sent.operationId);
});
test('conflict does not overwrite local draft and resolution uses inspected remote revision', async () => {
  await api.saveAnswer(answer());
  mockPost.mockRejectedValueOnce(new Error('conflict'));
  await expect(api.sync()).rejects.toThrow();
  const remote = { ...answer(), revision: 3, values: { q1: 'Não' } };
  mockGet.mockResolvedValue({ data: { ...snapshot(), answers: [remote] } });
  const conflict = await api.inspectConflict();
  expect(conflict.local.values.q1).toBe('Sim');
  expect(conflict.remote?.revision).toBe(3);
  mockPost.mockResolvedValue({ data: { revision: 4 } });
  await api.resolveConflict('f1', true, 3);
  expect(mockPost.mock.calls.at(-1)![1].answer.revision).toBe(3);
});
test('offline password is hashed, expires after 30 days and never stored in SQLite', async () => {
  await api.createOfflinePassword('Offline123');
  const credential = mockSecrets.get(
    'nexo.offline.https%3A%2F%2Fexample.com%2Fapi.ana@example.com',
  )!;
  const stored = JSON.parse(credential.password);
  expect(stored.hash).not.toBe('Offline123');
  expect(mockRecords.get(cacheKey)).not.toContain('Offline123');
  expect((await api.login(user.email, 'Offline123', true)).user.id).toBe('u1');
  await expect(api.login(user.email, 'wrong', true)).rejects.toThrow(
    'inválida',
  );
  stored.expires = Date.now() - 1;
  mockSecrets.set(
    'nexo.offline.https%3A%2F%2Fexample.com%2Fapi.ana@example.com',
    { ...credential, password: JSON.stringify(stored) },
  );
  await expect(api.login(user.email, 'Offline123', true)).rejects.toThrow(
    'expirada',
  );
});
test('offline access requires prior cache for the same account and cannot administer online resources', async () => {
  await expect(
    api.login('other@example.com', 'password', true),
  ).rejects.toThrow('primeiro login');
  await api.createOfflinePassword('Offline123');
  await api.login(user.email, 'Offline123', true);
  await expect(api.addForm(form)).rejects.toThrow('online');
  await expect(
    api.addUser('Novo', 'n@example.com', 'Password123', 'admin'),
  ).rejects.toThrow('online');
});
test('online login retains unsent answers from a previous session', async () => {
  await api.saveAnswer(answer());
  await api.login(user.email, 'online-secret', false);
  expect(api.pendingCount()).toBe(1);
  expect(JSON.parse(mockRecords.get(cacheKey)!).data.answers[0].values.q1).toBe(
    'Sim',
  );
});
test('same email on another server cannot access prior server cache or offline credentials', async () => {
  await api.saveAnswer(answer());
  await api.createOfflinePassword('Offline123');
  await api.configure('https://another.example.com/api');
  await expect(api.login(user.email, 'Offline123', true)).rejects.toThrow(
    'primeiro login',
  );
  await api.login(user.email, 'online-secret', false);
  expect(api.pendingCount()).toBe(0);
  expect(JSON.parse(mockRecords.get(cacheKey)!).pending).toHaveLength(1);
});
