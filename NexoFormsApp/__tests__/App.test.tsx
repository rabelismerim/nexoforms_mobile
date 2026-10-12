import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Pressable, Text, TextInput } from 'react-native';
import App from '../App';
import * as api from '../src/workspace/service';
jest.setTimeout(15000);

jest.mock('react-native-image-crop-picker', () => ({
  openCamera: jest.fn(),
  openPicker: jest.fn(),
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaProvider: View, SafeAreaView: View };
});
jest.mock('../src/workspace/service', () => ({
  initialize: jest.fn(async () => 'https://example.com/api'),
  configure: jest.fn(async () => {}),
  needsSetup: jest.fn(async () => false),
  login: jest.fn(),
  pendingCount: jest.fn(() => 0),
  errorMessage: jest.fn(),
}));
const snapshot = (role: string) => ({
  user: { id: 'u1', name: 'Ana', email: 'ana@example.com', role },
  users: [],
  forms: [],
  answers: [],
});
const labels = (app: renderer.ReactTestRenderer) =>
  app.root
    .findAllByType(Text)
    .map(node => node.props.children)
    .flat()
    .filter(x => typeof x === 'string')
    .join(' ');
async function mountAndLogin(role: string, data?: api.Snapshot) {
  (api.login as jest.Mock).mockResolvedValue(data ?? snapshot(role));
  let app!: renderer.ReactTestRenderer;
  await act(async () => {
    app = renderer.create(<App />);
  });
  act(() => {
    app.root
      .findAllByType(TextInput)
      .find(input => input.props.accessibilityLabel === 'E-mail')!
      .props.onChangeText('ana@example.com');
    app.root
      .findAllByType(TextInput)
      .find(input => input.props.accessibilityLabel === 'Senha')!
      .props.onChangeText('Password123');
  });
  await act(async () => {
    app.root
      .findAllByType(Pressable)
      .find(node =>
        node.findAllByType(Text).some(text => text.props.children === 'Entrar'),
      )!
      .props.onPress();
  });
  return app;
}
it('participant sees own questionnaire area without administration controls', async () => {
  const app = await mountAndLogin('member');
  expect(labels(app)).toContain('Meus questionários');
  expect(
    app.root
      .findAllByType(Pressable)
      .some(node =>
        node
          .findAllByType(Text)
          .some(text => text.props.children === 'Gerenciar'),
      ),
  ).toBe(false);
  expect(api.login).toHaveBeenCalledWith(
    'ana@example.com',
    'Password123',
    false,
  );
  act(() => app.unmount());
});
it('participant starts with pending forms assigned to their account and can view completed forms', async () => {
  const member = snapshot('member').user;
  const question = {
    id: 'q1',
    title: 'Pergunta',
    type: 'text' as const,
    required: true,
    options: [],
  };
  const app = await mountAndLogin('member', {
    user: member,
    users: [member],
    forms: [
      {
        id: 'pending',
        title: 'Minha inspeção pendente',
        userIds: ['u1'],
        questions: [question],
      },
      {
        id: 'done',
        title: 'Minha inspeção concluída',
        userIds: ['u1'],
        questions: [question],
      },
      {
        id: 'someone-else',
        title: 'Formulário de outro usuário',
        userIds: ['u2'],
        questions: [question],
      },
    ],
    answers: [
      {
        formId: 'done',
        userId: 'u1',
        values: { q1: 'Resposta' },
        photos: {},
        completed: true,
        revision: 1,
      },
    ],
  });
  expect(labels(app)).toContain('Minha inspeção pendente');
  expect(labels(app)).not.toContain('Minha inspeção concluída');
  expect(labels(app)).not.toContain('Formulário de outro usuário');
  act(() =>
    app.root
      .findAllByType(Pressable)
      .find(node =>
        node
          .findAllByType(Text)
          .some(text => text.props.children === 'Concluídos'),
      )!
      .props.onPress(),
  );
  expect(labels(app)).toContain('Minha inspeção concluída');
  expect(labels(app)).not.toContain('Minha inspeção pendente');
  act(() => app.unmount());
});
it('initial login contains only email and password fields', async () => {
  let app!: renderer.ReactTestRenderer;
  await act(async () => {
    app = renderer.create(<App />);
  });
  expect(
    app.root
      .findAllByType(TextInput)
      .map(input => input.props.accessibilityLabel),
  ).toEqual(['E-mail', 'Senha']);
  expect(labels(app)).not.toContain('Servidor');
  act(() => app.unmount());
});
it('administrator can reach team and questionnaire creation from the app', async () => {
  const app = await mountAndLogin('admin');
  act(() =>
    app.root
      .findAllByType(Pressable)
      .find(node =>
        node
          .findAllByType(Text)
          .some(text => text.props.children === 'Gerenciar'),
      )!
      .props.onPress(),
  );
  expect(labels(app)).toContain('Cadastrar usuário');
  expect(labels(app)).toContain('Atribuir aos usuários');
  expect(labels(app)).toContain('Publicar questionário');
  act(() => app.unmount());
});
