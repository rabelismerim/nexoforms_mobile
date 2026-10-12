"""Run integration checks against an isolated local API instance."""
from pathlib import Path
import base64
import json
import os
import secrets
import subprocess
import time
import urllib.error
import urllib.request

root = Path(__file__).resolve().parent.parent
verification = root / '.verification'
verification.mkdir(exist_ok=True)
store = verification / ('api-test-' + secrets.token_hex(6))
assert store.resolve().is_relative_to(root.resolve())
log = (verification / 'api-integration.log').open('w', encoding='utf-8')
env = os.environ.copy()
env.update({'ASPNETCORE_ENVIRONMENT': 'Development', 'NEXO_DATA_DIR': str(store),
            'NEXO_SETUP_CODE': secrets.token_hex(32), 'Nexo__OwnerEmail': 'owner@example.com'})
exe = root / '.tools/dotnet/dotnet.exe'
dll = root / 'NexoFormsApi/bin/Debug/net10.0/NexoFormsApi.dll'
base = 'http://127.0.0.1:5081/api/workspace'
process = None
checks = 0

def start():
    global process
    process = subprocess.Popen([str(exe), str(dll), '--urls', 'http://127.0.0.1:5081'],
        cwd=root / 'NexoFormsApi', env=env, stdout=log, stderr=subprocess.STDOUT,
        creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
    for _ in range(60):
        try:
            urllib.request.urlopen(base + '/status', timeout=1).close()
            return
        except (urllib.error.URLError, OSError):
            if process.poll() is not None: raise RuntimeError('API failed to start; see integration log.')
            time.sleep(0.25)
    raise RuntimeError('API startup timed out.')

def call(method, endpoint, body=None, token=None, headers=None, status=200):
    global checks
    request_headers = {'Content-Type': 'application/json', **(headers or {})}
    if token: request_headers['Authorization'] = 'Bearer ' + token
    request = urllib.request.Request(base + endpoint, method=method,
        data=json.dumps(body).encode() if body is not None else None, headers=request_headers)
    try:
        response = urllib.request.urlopen(request, timeout=10)
    except urllib.error.HTTPError as error:
        response = error
    raw = response.read().decode()
    assert response.status == status, f'{method} {endpoint}: expected {status}, got {response.status}'
    checks += 1
    try: return json.loads(raw)
    except json.JSONDecodeError: return raw

try:
    start()
    assert call('GET', '/status')['needsSetup']
    owner = {'name': 'Proprietário', 'email': 'owner@example.com', 'password': 'OwnerPassword123', 'role': 'admin'}
    call('POST', '/setup', owner, status=401)
    setup_header = {'X-Setup-Code': env['NEXO_SETUP_CODE']}
    call('POST', '/setup', {**owner, 'email': 'intruder@example.com'}, headers=setup_header, status=400)
    account = call('POST', '/setup', owner, headers=setup_header)
    call('POST', '/setup', owner, headers=setup_header, status=409)
    call('POST', '/login', {'email': owner['email'], 'password': 'WrongPassword'}, status=401)
    session = call('POST', '/login', owner)
    admin_token = session['token']
    assert session['data']['user']['role'] == 'admin'
    member = call('POST', '/users', {'name': 'Participante', 'email': 'member@example.com', 'password': 'MemberPassword123', 'role': 'admin'}, token=admin_token)
    assert member['role'] == 'member', 'Only the owner may be administrator.'
    member_token = call('POST', '/login', {'email': member['email'], 'password': 'MemberPassword123'})['token']
    call('POST', '/users', owner, token=member_token, status=401)
    form = {'id': 'form-1', 'title': 'Inspeção', 'userIds': [member['id']], 'questions': [{'id': 'question-1', 'title': 'Tudo certo?', 'type': 'yesno', 'required': True, 'options': []}]}
    call('POST', '/forms', form, token=member_token, status=401)
    call('POST', '/forms', form, token=admin_token)
    call('POST', '/forms', {**form, 'id': 'private-form', 'userIds': [account['id']]}, token=admin_token)
    data = call('GET', '/snapshot', token=member_token)
    assert [f['id'] for f in data['forms']] == ['form-1']
    assert len(data['users']) == 1 and data['users'][0]['id'] == member['id']
    assert not any(key in data['users'][0] for key in ('hash', 'salt'))
    salt = call('GET', '/offline-salt', token=member_token)['salt']
    assert len(bytes.fromhex(salt)) == 16
    answer = {'formId': form['id'], 'userId': member['id'], 'values': {}, 'photos': {}, 'completed': True, 'revision': 0}
    call('POST', '/answers', {'operationId': 'missing', 'answer': answer}, token=member_token, status=400)
    call('POST', '/answers', {'operationId': 'spoof', 'answer': {**answer, 'userId': account['id']}}, token=member_token, status=403)
    invalid_photo = {**answer, 'values': {'question-1': 'Sim'}, 'photos': {'question-1': ['data:image/png;base64,YWJj']}}
    call('POST', '/answers', {'operationId': 'invalid-photo', 'answer': invalid_photo}, token=member_token, status=400)
    png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1ioAAAAASUVORK5CYII='
    answer.update(values={'question-1': 'Sim'}, photos={'question-1': [png]})
    operation = {'operationId': 'answer-operation-1', 'answer': answer}
    assert call('POST', '/answers', operation, token=member_token)['revision'] == 1
    assert call('POST', '/answers', operation, token=member_token)['revision'] == 1
    call('POST', '/answers', {'operationId': 'conflict', 'answer': {**answer, 'values': {'question-1': 'Não'}}}, token=member_token, status=409)
    report = call('GET', '/snapshot', token=admin_token)['answers'][0]
    assert report['values']['question-1'] == 'Sim' and report['photos']['question-1'][0] == png
    call('PUT', '/forms/form-1/users', [account['id']], token=admin_token)
    assert call('GET', '/snapshot', token=member_token)['forms'] == []
    call('POST', '/answers', operation, token=member_token, status=403)
    process.terminate(); process.wait(timeout=10); start()
    assert call('GET', '/snapshot', token=admin_token)['answers'][0]['revision'] == 1
    call('POST', '/logout', token=member_token)
    call('GET', '/snapshot', token=member_token, status=401)
    print(f'PASS: {checks} API integration checks, owner permissions, photos, assignments, conflicts, persistence and logout.')
finally:
    if process and process.poll() is None:
        process.terminate(); process.wait(timeout=10)
    log.close()
