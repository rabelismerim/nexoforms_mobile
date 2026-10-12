// Documentation-only fixtures. This module is excluded from the Android bundle.
import type {Answer, Form, Snapshot} from '../src/workspace/service';
export type {Answer, Form, Question, Snapshot, User} from '../src/workspace/service';
const user = {id: 'owner', name: 'Administrador', email: 'admin.demo@example.com', role: 'admin'};
const previewParams = new URLSearchParams(window.location.search);
let initialized = false;
const demonstrationPhoto = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="720" height="480" viewBox="0 0 720 480"><rect width="720" height="480" fill="#dde5ed"/><path d="M0 300H720V480H0Z" fill="#9aaab8"/><rect x="70" y="60" width="580" height="250" rx="8" fill="#f4f7fa"/><rect x="105" y="100" width="150" height="160" fill="#7190a8"/><rect x="285" y="100" width="150" height="160" fill="#7190a8"/><rect x="465" y="100" width="150" height="160" fill="#7190a8"/><path d="M100 380H620" stroke="#f5c951" stroke-width="10"/><text x="360" y="440" text-anchor="middle" font-family="Arial" font-size="20" fill="#263957">Registro demonstrativo de vistoria</text></svg>');
let data: Snapshot = {
  user,
  users: [user, {id: 'ana', name: 'Ana Costa', email: 'ana.demo@example.com', role: 'member'}, {id: 'joao', name: 'João Lima', email: 'joao.demo@example.com', role: 'member'}],
  forms: [
    {id: 'vistoria', title: 'Vistoria de campo', userIds: ['owner', 'ana'], questions: [{id: 'condicoes', title: 'As condições do local estão adequadas?', type: 'yesno', required: true, options: []}, {id: 'observacoes', title: 'Observações da visita', type: 'text', required: false, options: []}]},
    {id: 'checklist', title: 'Checklist de acompanhamento', userIds: ['owner', 'joao'], questions: [{id: 'resultado', title: 'Como você avalia o atendimento?', type: 'choice', required: true, options: ['Excelente', 'Bom', 'Precisa melhorar']}]},
    {id: 'seguranca', title: 'Inspeção de segurança', userIds: ['ana'], questions: [{id: 'equipamentos', title: 'Os equipamentos estão em boas condições?', type: 'yesno', required: true, options: []}, {id: 'registro', title: 'Descreva sua observação', type: 'text', required: false, options: []}]},
  ],
  answers: [{formId: 'vistoria', userId: 'ana', values: {condicoes: 'Sim', observacoes: 'Visita concluída. Equipe orientada e ambiente organizado.'}, photos: {condicoes: [demonstrationPhoto]}, completed: true, revision: 1}],
};
let pending = 0;
export const initialize = async () => 'https://seu-servidor/api';
export const configure = async () => {};
export const needsSetup = async () => previewParams.get('mode') === 'setup' && !initialized;
export const setup = async () => {initialized = true;};
export const login = async () => {
  if (previewParams.get('profile') === 'member') {
    const member = data.users.find(u => u.id === 'ana')!;
    data = {user: member, users: [member], forms: data.forms.filter(f => f.userIds.includes(member.id)), answers: data.answers.filter(a => a.userId === member.id)};
  }
  return data;
};
export const uid = () => `preview-${Date.now()}`;
export const pendingCount = () => pending;
export const sync = async () => {pending = 0; return {...data};};
export const logout = async () => {};
export const createOfflinePassword = async () => {};
export const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Prévia de demonstração';
export const saveAnswer = async (answer: Answer) => {data.answers = data.answers.filter(a => a.userId !== answer.userId || a.formId !== answer.formId); data.answers.push(answer); pending++; return {...data};};
export const addUser = async (name: string, email: string) => {data.users.push({id: uid(), name, email, role: 'member'}); return {...data};};
export const addForm = async (form: Form) => {data.forms.push(form); return {...data};};
export const assignUsers = async (id: string, userIds: string[]) => {data.forms = data.forms.map(f => f.id === id ? {...f, userIds} : f); return {...data};};
export const inspectConflict = async () => ({
  local: {formId: 'vistoria', userId: 'owner', values: {condicoes: 'Sim', observacoes: 'Registro salvo neste aparelho.'}, photos: {}, completed: false, revision: 0},
  remote: {formId: 'vistoria', userId: 'owner', values: {condicoes: 'Não', observacoes: 'Registro enviado de outro aparelho.'}, photos: {}, completed: false, revision: 1},
});
export const resolveConflict = async () => data;
