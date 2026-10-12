import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Image,
  KeyboardAvoidingView,
  PermissionsAndroid,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import ImagePicker from 'react-native-image-crop-picker';
import * as api from './service';
import { Answer, Form, Question, Snapshot } from './service';
import BrandLogo from '../assets/brand/nexo-mark.svg';
import WelcomeLogo from '../assets/brand/nexo-welcome.svg';

function Field({
  label,
  value,
  change,
  secret = false,
  multiline = false,
}: {
  label: string;
  value: string;
  change: (v: string) => void;
  secret?: boolean;
  multiline?: boolean;
}) {
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        style={[s.input, multiline && s.multiline]}
        value={value}
        onChangeText={change}
        secureTextEntry={secret}
        multiline={multiline}
        autoCapitalize="none"
      />
    </View>
  );
}
function Button({
  title,
  press,
  secondary = false,
  disabled = false,
}: {
  title: string;
  press: () => void;
  secondary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={press}
      style={[s.button, secondary && s.secondary, disabled && s.disabled]}>
      <Text style={s.buttonText}>{title}</Text>
    </Pressable>
  );
}
function ReceivedAnswers({
  data,
  viewPhoto,
}: {
  data: Snapshot;
  viewPhoto: (uri: string) => void;
}) {
  const [query, setQuery] = useState('');
  const forms = data.forms.filter(
    f =>
      f.title.toLowerCase().includes(query.toLowerCase()) &&
      data.answers.some(a => a.formId === f.id),
  );
  return (
    <>
      <Text style={s.section}>Respostas recebidas</Text>
      <Text style={s.small}>
        Consulte os envios da equipe e as fotos anexadas. Use Sincronizar para
        buscar novos envios.
      </Text>
      <Field
        label="Buscar formulário recebido"
        value={query}
        change={setQuery}
      />
      {!forms.length && (
        <View style={s.card}>
          <Text style={s.text}>
            Nenhuma resposta recebida neste filtro. Os envios aparecem aqui
            quando os participantes sincronizam.
          </Text>
        </View>
      )}
      {forms.map(f => (
        <View key={f.id} style={s.card}>
          <Text style={s.cardTitle}>{f.title}</Text>
          {data.answers
            .filter(a => a.formId === f.id)
            .map(a => (
              <View key={a.userId} style={s.receivedAnswer}>
                <Text style={s.cardTitle}>
                  {data.users.find(u => u.id === a.userId)?.name ??
                    'Participante'}
                </Text>
                <Text style={s.small}>
                  {a.completed ? 'Concluído' : 'Rascunho sincronizado'}
                </Text>
                {f.questions.map(q => (
                  <View key={q.id}>
                    <Text style={s.label}>{q.title}</Text>
                    <Text style={s.text}>
                      {a.values[q.id] || 'Sem resposta'}
                    </Text>
                    <View style={s.row}>
                      {(a.photos[q.id] ?? []).map((uri, index) => (
                        <Pressable
                          key={index}
                          accessibilityLabel={`Ampliar foto ${index + 1}`}
                          onPress={() => viewPhoto(uri)}>
                          <Image source={{ uri }} style={s.thumbnail} />
                        </Pressable>
                      ))}
                    </View>
                  </View>
                ))}
              </View>
            ))}
        </View>
      ))}
    </>
  );
}
export default function WorkspaceApp() {
  const { width: viewportWidth } = useWindowDimensions();
  const contentRef = useRef<ScrollView>(null);
  const [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [fatal, setFatal] = useState('');
  const [url, setUrl] = useState(''),
    [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [name, setName] = useState(''),
    [code, setCode] = useState('');
  const [first, setFirst] = useState(false),
    [offline, setOffline] = useState(false),
    [data, setData] = useState<Snapshot>(),
    [tab, setTab] = useState('forms');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [connectionDraft, setConnectionDraft] = useState('');
  const [formTitle, setFormTitle] = useState(''),
    [questionTitle, setQuestionTitle] = useState(''),
    [type, setType] = useState<Question['type']>('text'),
    [required, setRequired] = useState(true),
    [options, setOptions] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]),
    [assigned, setAssigned] = useState<string[]>([]);
  const [active, setActive] = useState<Form>(),
    [answer, setAnswer] = useState<Answer>(),
    [photo, setPhoto] = useState<string>(),
    [search, setSearch] = useState(''),
    [filter, setFilter] = useState('all');
  const [conflict, setConflict] = useState<{
    local: Answer;
    remote?: Answer;
  }>();
  const [assignment, setAssignment] = useState<Form>();
  const [assignmentUsers, setAssignmentUsers] = useState<string[]>([]);
  useEffect(() => {
    contentRef.current?.scrollTo({ y: 0, animated: false });
  }, [tab, active?.id, data?.user.id]);
  const run = async (task: () => Promise<void>) => {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      await task();
    } catch (error) {
      Alert.alert('Atenção', api.errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    api
      .initialize()
      .then(saved => {
        setUrl(saved);
        setReady(true);
      })
      .catch(e => setFatal(api.errorMessage(e)));
  }, []);
  const enter = async () => {
    if (!offline) {
      await api.configure(url.trim());
      if (await api.needsSetup()) {
        if (!first) {
          setFirst(true);
          return;
        }
        await api.setup(name, email, password, code);
      }
    }
    const session = await api.login(email, password, offline);
    setData(session);
    setFilter(session.user.role === 'admin' ? 'all' : 'pending');
    setPassword('');
    setEmail('');
    setName('');
    setCode('');
    setFirst(false);
    setTab('forms');
  };
  const open = (f: Form) => {
    setActive(f);
    setAnswer(
      data?.answers.find(
        a => a.formId === f.id && a.userId === data.user.id,
      ) ?? {
        formId: f.id,
        userId: data!.user.id,
        values: {},
        photos: {},
        completed: false,
        revision: 0,
      },
    );
  };
  const save = async (completed: boolean) => {
    if (!answer || !active) {
      return;
    }
    if (
      completed &&
      active.questions.some(q => q.required && !answer.values[q.id]?.trim())
    ) {
      throw new Error('Responda às perguntas obrigatórias.');
    }
    setData({ ...(await api.saveAnswer({ ...answer, completed })) });
    setActive(undefined);
    setAnswer(undefined);
    Alert.alert(
      'Salvo no aparelho',
      'Use Sincronizar para enviar suas respostas e fotos ao servidor.',
    );
  };
  const addPhoto = async (id: string, camera: boolean) => {
    if (!answer) {
      return;
    }
    if ((answer.photos[id]?.length ?? 0) >= 5) {
      throw new Error('Limite de 5 fotos por pergunta.');
    }
    if (
      camera &&
      Platform.OS === 'android' &&
      (await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.CAMERA,
      )) !== PermissionsAndroid.RESULTS.GRANTED
    ) {
      throw new Error('Permita o acesso à câmera.');
    }
    try {
      const config = {
        mediaType: 'photo' as const,
        includeBase64: true,
        compressImageQuality: 0.7,
        compressImageMaxWidth: 1280,
        compressImageMaxHeight: 1280,
        forceJpg: true,
      };
      const image = camera
        ? await ImagePicker.openCamera(config)
        : await ImagePicker.openPicker(config);
      if (!image.data) {
        throw new Error('Não foi possível carregar a foto.');
      }
      if (!['image/jpeg', 'image/png'].includes(image.mime)) {
        throw new Error('Escolha uma foto JPEG ou PNG.');
      }
      const uri = `data:${image.mime};base64,${image.data}`;
      if (uri.length > 3000000) {
        throw new Error('Foto muito grande. Escolha outra imagem.');
      }
      if (
        Object.values(answer.photos)
          .flat()
          .reduce((total, item) => total + item.length, uri.length) > 20000000
      ) {
        throw new Error(
          'Limite de anexos deste questionário atingido. Remova uma foto antes de adicionar outra.',
        );
      }
      setAnswer({
        ...answer,
        photos: { ...answer.photos, [id]: [...(answer.photos[id] ?? []), uri] },
      });
    } catch (error) {
      if ((error as { code?: string }).code !== 'E_PICKER_CANCELLED') {
        throw error;
      }
    }
  };
  useEffect(() => {
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      if (photo) {
        setPhoto(undefined);
        return true;
      }
      if (active) {
        Alert.alert(
          'Voltar ao início?',
          'Salve o rascunho para manter suas respostas.',
          [
            { text: 'Continuar respondendo', style: 'cancel' },
            { text: 'Salvar e voltar', onPress: () => run(() => save(false)) },
          ],
        );
        return true;
      }
      if (conflict) {
        setConflict(undefined);
        return true;
      }
      if (data && tab !== 'forms') {
        setTab('forms');
        return true;
      }
      return false;
    });
    return () => listener.remove();
  }, [photo, active, answer, conflict, data, tab, busy]); // eslint-disable-line react-hooks/exhaustive-deps
  const addQuestion = () => {
    const choices = options
      .split('\n')
      .map(v => v.trim())
      .filter(Boolean);
    if (!questionTitle.trim() || (type === 'choice' && choices.length < 2)) {
      Alert.alert(
        'Revise a pergunta',
        'Informe o enunciado e pelo menos duas opções para múltipla escolha.',
      );
      return;
    }
    setQuestions([
      ...questions,
      {
        id: api.uid(),
        title: questionTitle.trim(),
        type,
        required,
        options: type === 'choice' ? choices : [],
      },
    ]);
    setQuestionTitle('');
    setOptions('');
  };
  const visible =
    data?.forms
      .filter(
        f =>
          f.userIds.includes(data.user.id) &&
          f.title.toLowerCase().includes(search.toLowerCase()),
      )
      .filter(f => {
        const a = data.answers.find(
          x => x.formId === f.id && x.userId === data.user.id,
        );
        return (
          filter === 'all' || (filter === 'done' ? a?.completed : !a?.completed)
        );
      }) ?? [];
  return (
    <SafeAreaProvider>
      <SafeAreaView style={s.root}>
        <StatusBar barStyle="light-content" backgroundColor="#080D16" />
        <KeyboardAvoidingView
          style={s.root}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={s.header}>
            <View style={s.brandGroup}>
              <BrandLogo
                width={44}
                height={44}
                accessibilityLabel="Logo Nexo Forms"
              />
              <View>
                <Text style={s.brand}>
                  NEXO<Text style={s.blue}> FORMS</Text>
                </Text>
                <Text style={s.small}>Seu trabalho, conectado.</Text>
              </View>
            </View>
            {busy && <ActivityIndicator color="#237BFF" />}
            {!data && !busy && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Ajustes do aplicativo"
                onPress={() => {
                  setConnectionDraft(url);
                  setSettingsOpen(true);
                }}
                style={s.settingsButton}>
                <Text style={s.settingsIcon}>⋯</Text>
              </Pressable>
            )}
          </View>
          {!ready ? (
            <View style={s.card}>
              {fatal ? (
                <Text style={s.text}>{fatal}</Text>
              ) : (
                <ActivityIndicator color="#237BFF" />
              )}
            </View>
          ) : (
            <ScrollView
              ref={contentRef}
              contentContainerStyle={s.content}
              keyboardShouldPersistTaps="handled">
              {settingsOpen ? (
                <>
                  <Text style={s.heading}>Ajustes de conexão</Text>
                  <Text style={s.small}>
                    O proprietário configura a conexão uma vez. No uso diário,
                    basta entrar com e-mail e senha.
                  </Text>
                  <View style={s.card}>
                    <Field
                      label="Endereço da API"
                      value={connectionDraft}
                      change={setConnectionDraft}
                    />
                    <Button
                      disabled={busy}
                      title="Salvar conexão"
                      press={() =>
                        run(async () => {
                          await api.configure(connectionDraft.trim());
                          setUrl(connectionDraft.trim());
                          setFirst(false);
                          setOffline(false);
                          setSettingsOpen(false);
                        })
                      }
                    />
                    <Button
                      secondary
                      title="Voltar ao login"
                      press={() => setSettingsOpen(false)}
                    />
                  </View>
                </>
              ) : !data ? (
                <>
                  <Text style={s.eyebrow}>BEM-VINDO</Text>
                  <WelcomeLogo
                    width={viewportWidth - 44}
                    height={((viewportWidth - 44) * 164) / 372}
                    accessibilityLabel="Nexo Forms · formulários conectados"
                  />
                  <Text style={s.heading}>
                    {first ? 'Crie seu espaço.' : 'Tudo começa aqui.'}
                  </Text>
                  <Text style={s.text}>
                    Questionários, equipe e registros em um só lugar.
                  </Text>
                  <Text style={s.small}>
                    Crie formulários, distribua para sua equipe e receba
                    respostas com fotos. Trabalhe offline e sincronize quando
                    estiver conectado.
                  </Text>
                  <View style={s.card}>
                    <Button
                      secondary
                      title={
                        offline
                          ? 'Modo offline · mudar para online'
                          : 'Modo online · usar senha offline'
                      }
                      press={() => {
                        setOffline(!offline);
                        setFirst(false);
                      }}
                    />
                    {first && (
                      <>
                        <Field
                          label="Nome do administrador"
                          value={name}
                          change={setName}
                        />
                        <Field
                          label="Código de configuração do servidor"
                          value={code}
                          change={setCode}
                          secret
                        />
                      </>
                    )}
                    <Field label="E-mail" value={email} change={setEmail} />
                    <Field
                      label={offline ? 'Senha offline' : 'Senha'}
                      value={password}
                      change={setPassword}
                      secret
                    />
                    <Button
                      disabled={busy}
                      title={first ? 'Criar administrador e entrar' : 'Entrar'}
                      press={() => run(enter)}
                    />
                    <Text style={s.small}>
                      O primeiro acesso precisa de internet. Depois, crie sua
                      senha offline no perfil.
                    </Text>
                  </View>
                </>
              ) : photo ? (
                <>
                  <Button
                    title="Voltar"
                    secondary
                    press={() => setPhoto(undefined)}
                  />
                  <Image
                    source={{ uri: photo }}
                    style={s.fullPhoto}
                    resizeMode="contain"
                  />
                </>
              ) : conflict ? (
                <>
                  <Text style={s.heading}>Revisar conflito</Text>
                  <Text style={s.text}>
                    Compare seu rascunho com a resposta enviada por outro
                    aparelho.
                  </Text>
                  {data.forms
                    .find(f => f.id === conflict.local.formId)
                    ?.questions.map(q => (
                      <View key={q.id} style={s.card}>
                        <Text style={s.cardTitle}>{q.title}</Text>
                        <Text style={s.text}>
                          Neste aparelho:{' '}
                          {conflict.local.values[q.id] || 'Sem resposta'}
                        </Text>
                        {(conflict.local.photos[q.id] ?? []).map((uri, i) => (
                          <Pressable
                            key={`local-${i}`}
                            onPress={() => setPhoto(uri)}>
                            <Image source={{ uri }} style={s.thumbnail} />
                          </Pressable>
                        ))}
                        <Text style={s.text}>
                          No servidor:{' '}
                          {conflict.remote?.values[q.id] || 'Sem resposta'}
                        </Text>
                        {(conflict.remote?.photos[q.id] ?? []).map((uri, i) => (
                          <Pressable
                            key={`remote-${i}`}
                            onPress={() => setPhoto(uri)}>
                            <Image source={{ uri }} style={s.thumbnail} />
                          </Pressable>
                        ))}
                      </View>
                    ))}
                  <Button
                    disabled={busy}
                    title="Manter resposta deste aparelho"
                    press={() =>
                      run(async () => {
                        setData(
                          await api.resolveConflict(
                            conflict.local.formId,
                            true,
                            conflict.remote?.revision ?? 0,
                          ),
                        );
                        setConflict(undefined);
                      })
                    }
                  />
                  <Button
                    disabled={busy}
                    secondary
                    title="Usar resposta do servidor"
                    press={() =>
                      Alert.alert(
                        'Substituir rascunho local?',
                        'Suas alterações locais serão substituídas pela resposta do servidor.',
                        [
                          { text: 'Cancelar', style: 'cancel' },
                          {
                            text: 'Substituir',
                            onPress: () =>
                              run(async () => {
                                setData(
                                  await api.resolveConflict(
                                    conflict.local.formId,
                                    false,
                                    conflict.remote?.revision ?? 0,
                                  ),
                                );
                                setConflict(undefined);
                              }),
                          },
                        ],
                      )
                    }
                  />
                  <Button
                    secondary
                    title="Resolver depois"
                    press={() => setConflict(undefined)}
                  />
                </>
              ) : active && answer ? (
                <>
                  <Text style={s.eyebrow}>QUESTIONÁRIO</Text>
                  <Text style={s.heading}>{active.title}</Text>
                  <Text style={s.small}>
                    {Object.values(answer.values).filter(v => v.trim()).length}{' '}
                    de {active.questions.length} perguntas respondidas
                  </Text>
                  {active.questions.map((q, index) => (
                    <View style={s.card} key={q.id}>
                      <Text style={s.cardTitle}>
                        {index + 1}. {q.title}
                        {q.required ? ' *' : ''}
                      </Text>
                      {q.type === 'text' ? (
                        <Field
                          label="Sua resposta"
                          value={answer.values[q.id] ?? ''}
                          multiline
                          change={v =>
                            setAnswer({
                              ...answer,
                              values: { ...answer.values, [q.id]: v },
                            })
                          }
                        />
                      ) : (
                        (q.type === 'yesno' ? ['Sim', 'Não'] : q.options).map(
                          v => (
                            <Button
                              key={v}
                              secondary={answer.values[q.id] !== v}
                              title={v}
                              press={() =>
                                setAnswer({
                                  ...answer,
                                  values: { ...answer.values, [q.id]: v },
                                })
                              }
                            />
                          ),
                        )
                      )}
                      <View style={s.row}>
                        <Button
                          disabled={busy}
                          title="Câmera"
                          secondary
                          press={() => run(() => addPhoto(q.id, true))}
                        />
                        <Button
                          disabled={busy}
                          title="Galeria"
                          secondary
                          press={() => run(() => addPhoto(q.id, false))}
                        />
                      </View>
                      {(answer.photos[q.id] ?? []).map((uri, i) => (
                        <View key={`${q.id}-${i}`} style={s.row}>
                          <Pressable
                            onPress={() => setPhoto(uri)}
                            accessibilityLabel={`Ampliar foto ${i + 1}`}>
                            <Image source={{ uri }} style={s.thumbnail} />
                          </Pressable>
                          <Button
                            secondary
                            title="Remover foto"
                            press={() =>
                              setAnswer({
                                ...answer,
                                photos: {
                                  ...answer.photos,
                                  [q.id]: answer.photos[q.id].filter(
                                    (_, n) => n !== i,
                                  ),
                                },
                              })
                            }
                          />
                        </View>
                      ))}
                    </View>
                  ))}
                  <Button
                    disabled={busy}
                    title="Salvar rascunho"
                    secondary
                    press={() => run(() => save(false))}
                  />
                  <Button
                    disabled={busy}
                    title="Concluir e salvar"
                    press={() => run(() => save(true))}
                  />
                  <Button
                    secondary
                    title="Voltar sem salvar"
                    press={() =>
                      Alert.alert(
                        'Descartar alterações?',
                        'As alterações desta sessão não serão salvas.',
                        [
                          { text: 'Cancelar', style: 'cancel' },
                          {
                            text: 'Descartar',
                            onPress: () => {
                              setActive(undefined);
                              setAnswer(undefined);
                            },
                          },
                        ],
                      )
                    }
                  />
                </>
              ) : (
                <>
                  <Text style={s.eyebrow}>
                    {data.user.role === 'admin'
                      ? 'ESPAÇO DE ADMINISTRAÇÃO'
                      : 'MEU ESPAÇO'}
                  </Text>
                  <Text style={s.heading}>
                    Olá, {data.user.name.split(' ')[0]}.
                  </Text>
                  <View style={s.row}>
                    <Text style={s.small}>
                      {api.pendingCount()} envio(s) pendente(s)
                    </Text>
                    <Button
                      disabled={busy}
                      title="Sincronizar"
                      press={() =>
                        run(async () => {
                          setData(await api.sync());
                          Alert.alert(
                            'Sincronizado',
                            'Os dados estão atualizados.',
                          );
                        })
                      }
                    />
                  </View>
                  {api.pendingCount() > 0 && (
                    <Button
                      disabled={busy}
                      secondary
                      title="Revisar conflitos de sincronização"
                      press={() =>
                        run(async () =>
                          setConflict(await api.inspectConflict()),
                        )
                      }
                    />
                  )}
                  {tab === 'forms' && (
                    <>
                      {data.user.role === 'admin' && (
                        <>
                          <View style={s.row}>
                            <View style={s.stat}>
                              <Text style={s.statNumber}>
                                {data.users.length - 1}
                              </Text>
                              <Text style={s.small}>participantes</Text>
                            </View>
                            <View style={s.stat}>
                              <Text style={s.statNumber}>
                                {data.forms.length}
                              </Text>
                              <Text style={s.small}>formulários</Text>
                            </View>
                            <View style={s.stat}>
                              <Text style={s.statNumber}>
                                {data.answers.filter(a => a.completed).length}
                              </Text>
                              <Text style={s.small}>concluídos</Text>
                            </View>
                          </View>
                          <Button
                            title="Gerenciar equipe e formulários"
                            secondary
                            press={() => setTab('manage')}
                          />
                        </>
                      )}
                      <Text style={s.section}>Meus questionários</Text>
                      {data.user.role !== 'admin' && (
                        <Text style={s.small}>
                          Acompanhe os questionários atribuídos a você. Os
                          pendentes aparecem primeiro; você também pode
                          consultar os concluídos.
                        </Text>
                      )}
                      <Field
                        label="Buscar questionário"
                        value={search}
                        change={setSearch}
                      />
                      <View style={s.row}>
                        {[
                          ['all', 'Todos'],
                          ['pending', 'Pendentes'],
                          ['done', 'Concluídos'],
                        ].map(([v, title]) => (
                          <Button
                            key={v}
                            title={title}
                            secondary={filter !== v}
                            press={() => setFilter(v)}
                          />
                        ))}
                      </View>
                      {!visible.length && (
                        <View style={s.card}>
                          <Text style={s.text}>
                            Nenhum questionário disponível neste filtro. O
                            administrador pode atribuir questionários pela aba
                            Gerenciar.
                          </Text>
                        </View>
                      )}
                      {visible.map(f => (
                        <View key={f.id} style={s.card}>
                          <Text style={s.cardTitle}>{f.title}</Text>
                          <Text style={s.small}>
                            {f.questions.length} perguntas ·{' '}
                            {data.answers.find(
                              a =>
                                a.formId === f.id && a.userId === data.user.id,
                            )?.completed
                              ? 'Concluído'
                              : 'Pendente'}
                          </Text>
                          <Button
                            title="Abrir questionário"
                            press={() => open(f)}
                          />
                        </View>
                      ))}
                    </>
                  )}
                  {tab === 'manage' && data.user.role === 'admin' && (
                    <>
                      <Text style={s.section}>Equipe</Text>
                      <View style={s.card}>
                        <Field label="Nome" value={name} change={setName} />
                        <Field
                          label="E-mail do novo usuário"
                          value={email}
                          change={setEmail}
                        />
                        <Field
                          label="Senha inicial"
                          value={password}
                          change={setPassword}
                          secret
                        />
                        <Text style={s.small}>
                          Novos usuários entram como participantes. A
                          administração é exclusiva do proprietário.
                        </Text>
                        <Button
                          disabled={busy}
                          title="Cadastrar usuário"
                          press={() =>
                            run(async () => {
                              setData(
                                await api.addUser(
                                  name,
                                  email,
                                  password,
                                  'member',
                                ),
                              );
                              setName('');
                              setEmail('');
                              setPassword('');
                            })
                          }
                        />
                      </View>
                      {data.users.map(u => (
                        <Text key={u.id} style={s.small}>
                          {u.name} · {u.email} ·{' '}
                          {u.role === 'admin'
                            ? 'Administrador'
                            : 'Participante'}
                        </Text>
                      ))}
                      <Text style={s.section}>Novo questionário</Text>
                      <View style={s.card}>
                        <Field
                          label="Título"
                          value={formTitle}
                          change={setFormTitle}
                        />
                        {questions.map((q, i) => (
                          <View key={q.id}>
                            <Text style={s.text}>
                              {i + 1}. {q.title}
                            </Text>
                            <Button
                              secondary
                              title="Remover pergunta"
                              press={() =>
                                setQuestions(
                                  questions.filter(x => x.id !== q.id),
                                )
                              }
                            />
                          </View>
                        ))}
                        <Field
                          label="Enunciado da pergunta"
                          value={questionTitle}
                          change={setQuestionTitle}
                          multiline
                        />
                        <View style={s.row}>
                          {(
                            [
                              ['text', 'Texto'],
                              ['yesno', 'Sim / Não'],
                              ['choice', 'Escolha'],
                            ] as const
                          ).map(([v, title]) => (
                            <Button
                              key={v}
                              title={title}
                              secondary={type !== v}
                              press={() => setType(v)}
                            />
                          ))}
                        </View>
                        {type === 'choice' && (
                          <Field
                            label="Opções (uma por linha)"
                            value={options}
                            change={setOptions}
                            multiline
                          />
                        )}
                        <Button
                          secondary
                          title={
                            required ? 'Obrigatória: sim' : 'Obrigatória: não'
                          }
                          press={() => setRequired(!required)}
                        />
                        <Button
                          secondary
                          title="Adicionar pergunta"
                          press={addQuestion}
                        />
                        <Text style={s.cardTitle}>Atribuir aos usuários</Text>
                        {data.users.map(u => (
                          <Button
                            key={u.id}
                            secondary={!assigned.includes(u.id)}
                            title={`${assigned.includes(u.id) ? '✓ ' : ''}${
                              u.name
                            }`}
                            press={() =>
                              setAssigned(
                                assigned.includes(u.id)
                                  ? assigned.filter(id => id !== u.id)
                                  : [...assigned, u.id],
                              )
                            }
                          />
                        ))}
                        <Button
                          disabled={busy}
                          title="Publicar questionário"
                          press={() =>
                            run(async () => {
                              if (
                                !formTitle.trim() ||
                                !questions.length ||
                                !assigned.length
                              ) {
                                throw new Error(
                                  'Informe título, perguntas e usuários.',
                                );
                              }
                              setData(
                                await api.addForm({
                                  id: api.uid(),
                                  title: formTitle.trim(),
                                  questions,
                                  userIds: assigned,
                                }),
                              );
                              setFormTitle('');
                              setQuestions([]);
                              setAssigned([]);
                            })
                          }
                        />
                      </View>
                      <Text style={s.section}>Questionários publicados</Text>
                      {assignment && (
                        <View style={s.card}>
                          <Text style={s.cardTitle}>
                            Atribuição: {assignment.title}
                          </Text>
                          {data.users.map(u => (
                            <Button
                              key={u.id}
                              secondary={!assignmentUsers.includes(u.id)}
                              title={`${
                                assignmentUsers.includes(u.id) ? '✓ ' : ''
                              }${u.name}`}
                              press={() =>
                                setAssignmentUsers(
                                  assignmentUsers.includes(u.id)
                                    ? assignmentUsers.filter(id => id !== u.id)
                                    : [...assignmentUsers, u.id],
                                )
                              }
                            />
                          ))}
                          <Button
                            disabled={busy}
                            title="Salvar atribuição"
                            press={() =>
                              run(async () => {
                                setData(
                                  await api.assignUsers(
                                    assignment.id,
                                    assignmentUsers,
                                  ),
                                );
                                setAssignment(undefined);
                              })
                            }
                          />
                          <Button
                            secondary
                            title="Cancelar"
                            press={() => setAssignment(undefined)}
                          />
                        </View>
                      )}
                      {data.forms.map(f => (
                        <View key={f.id} style={s.card}>
                          <Text style={s.cardTitle}>{f.title}</Text>
                          <Text style={s.small}>
                            {f.userIds
                              .map(
                                id => data.users.find(u => u.id === id)?.name,
                              )
                              .join(', ')}
                          </Text>
                          <Button
                            secondary
                            title="Alterar usuários atribuídos"
                            press={() => {
                              setAssignment(f);
                              setAssignmentUsers(f.userIds);
                            }}
                          />
                          {data.answers
                            .filter(a => a.formId === f.id)
                            .map(a => (
                              <View key={a.userId}>
                                <Text style={s.cardTitle}>
                                  {
                                    data.users.find(u => u.id === a.userId)
                                      ?.name
                                  }{' '}
                                  · {a.completed ? 'Concluído' : 'Rascunho'}
                                </Text>
                                {f.questions.map(q => (
                                  <View key={q.id}>
                                    <Text style={s.text}>
                                      {q.title}:{' '}
                                      {a.values[q.id] || 'Sem resposta'}
                                    </Text>
                                    {(a.photos[q.id] ?? []).map((uri, i) => (
                                      <Pressable
                                        key={i}
                                        onPress={() => setPhoto(uri)}>
                                        <Image
                                          source={{ uri }}
                                          style={s.thumbnail}
                                        />
                                      </Pressable>
                                    ))}
                                  </View>
                                ))}
                              </View>
                            ))}
                        </View>
                      ))}
                    </>
                  )}
                  {tab === 'responses' && data.user.role === 'admin' && (
                    <ReceivedAnswers data={data} viewPhoto={setPhoto} />
                  )}
                  {tab === 'profile' && (
                    <>
                      <Text style={s.section}>Perfil e acesso</Text>
                      <View style={s.card}>
                        <Text style={s.cardTitle}>{data.user.name}</Text>
                        <Text style={s.text}>{data.user.email}</Text>
                        <Text style={s.small}>
                          As respostas ficam salvas neste aparelho até a
                          sincronização. A senha offline vale por 30 dias e
                          permite acessar os questionários já baixados.
                        </Text>
                        <Field
                          label="Nova senha offline (mínimo 8 caracteres)"
                          value={password}
                          change={setPassword}
                          secret
                        />
                        <Button
                          disabled={busy}
                          title="Criar / renovar senha offline"
                          press={() =>
                            run(async () => {
                              await api.createOfflinePassword(password);
                              setPassword('');
                              Alert.alert(
                                'Senha offline criada',
                                'Você pode acessar os dados baixados por 30 dias.',
                              );
                            })
                          }
                        />
                        <Button
                          secondary
                          disabled={busy}
                          title="Sair"
                          press={() =>
                            run(async () => {
                              try {
                                await api.logout();
                              } finally {
                                setData(undefined);
                                setPassword('');
                                setOffline(false);
                              }
                            })
                          }
                        />
                      </View>
                    </>
                  )}
                </>
              )}
            </ScrollView>
          )}
          {data && !active && !photo && !conflict && (
            <View style={s.nav}>
              {[
                ['forms', 'Questionários'],
                ...(data.user.role === 'admin'
                  ? [
                      ['manage', 'Gerenciar'],
                      ['responses', 'Respostas'],
                    ]
                  : []),
                ['profile', 'Perfil'],
              ].map(([v, title]) => (
                <Pressable
                  key={v}
                  onPress={() => {
                    setTab(v);
                    setPassword('');
                  }}
                  style={s.navItem}>
                  <Text style={[s.navText, tab === v && s.blue]}>{title}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#080D16' },
  header: {
    padding: 22,
    borderBottomWidth: 1,
    borderColor: '#263957',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  brandGroup: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  settingsButton: { padding: 8 },
  settingsIcon: { color: '#A7BAD4', fontSize: 24, fontWeight: '700' },
  brand: {
    fontSize: 24,
    fontWeight: '800',
    color: '#F4F7FC',
    letterSpacing: 2,
  },
  blue: { color: '#237BFF' },
  content: { padding: 22, paddingBottom: 40, gap: 12 },
  eyebrow: {
    fontSize: 11,
    letterSpacing: 2,
    color: '#237BFF',
    fontWeight: '700',
    marginTop: 10,
  },
  heading: {
    fontSize: 32,
    color: '#F4F7FC',
    fontWeight: '700',
    marginBottom: 8,
  },
  section: { fontSize: 22, color: '#F4F7FC', fontWeight: '700', marginTop: 20 },
  text: { color: '#F4F7FC', fontSize: 16, lineHeight: 24 },
  small: { color: '#A7BAD4', fontSize: 13, lineHeight: 20, flexShrink: 1 },
  card: {
    backgroundColor: '#131E30',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#263957',
    padding: 20,
    gap: 12,
  },
  cardTitle: { fontSize: 18, fontWeight: '600', color: '#F4F7FC' },
  field: { gap: 7, marginVertical: 6 },
  label: { color: '#A7BAD4', fontSize: 13 },
  input: {
    backgroundColor: '#080D16',
    color: '#F4F7FC',
    borderWidth: 1,
    borderColor: '#263957',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
  },
  multiline: { minHeight: 90, textAlignVertical: 'top' },
  button: {
    backgroundColor: '#237BFF',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginVertical: 4,
    alignItems: 'center',
  },
  secondary: {
    backgroundColor: '#131E30',
    borderWidth: 1,
    borderColor: '#263957',
  },
  disabled: { opacity: 0.45 },
  buttonText: { color: '#F4F7FC', fontWeight: '600', fontSize: 14 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  nav: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderColor: '#263957',
    backgroundColor: '#131E30',
  },
  navItem: { flex: 1, paddingVertical: 20, alignItems: 'center' },
  navText: { color: '#A7BAD4', fontSize: 13 },
  thumbnail: { width: 100, height: 100, borderRadius: 12, marginVertical: 8 },
  fullPhoto: { width: '100%', height: 500 },
  receivedAnswer: {
    borderTopWidth: 1,
    borderColor: '#263957',
    paddingTop: 16,
    gap: 12,
  },
  stat: {
    flex: 1,
    minWidth: 85,
    padding: 14,
    backgroundColor: '#131E30',
    borderRadius: 16,
  },
  statNumber: { color: '#237BFF', fontSize: 28, fontWeight: '700' },
});
