"""Serve an isolated demonstration workspace for UI screenshots; never touches App_Data."""
from pathlib import Path
import base64
import json
import os
import secrets
import subprocess
import time
import urllib.request

root = Path(__file__).resolve().parent.parent
verification = root / '.verification'
verification.mkdir(exist_ok=True)
store = verification / ('preview-' + secrets.token_hex(6))
assert store.resolve().is_relative_to(root.resolve())
env = os.environ.copy()
env.update({'ASPNETCORE_ENVIRONMENT': 'Development', 'NEXO_DATA_DIR': str(store),
            'NEXO_SETUP_CODE': secrets.token_hex(32), 'Nexo__OwnerEmail': 'admin.demo@example.com'})
password = 'DemoNexo2026!'
credentials = {'email': 'admin.demo@example.com', 'password': password, 'participantEmail': 'ana.demo@example.com', 'server': 'http://10.0.2.2:5000/api'}
(verification / 'preview-credentials.json').write_text(json.dumps(credentials), encoding='utf-8')
base = 'http://127.0.0.1:5000/api/workspace'
log = (verification / 'preview-api.log').open('w', encoding='utf-8')
process = subprocess.Popen([str(root / '.tools/dotnet/dotnet.exe'), str(root / 'NexoFormsApi/bin/Debug/net10.0/NexoFormsApi.dll'), '--urls', 'http://0.0.0.0:5000'],
    cwd=root / 'NexoFormsApi', env=env, stdout=log, stderr=subprocess.STDOUT,
    creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)

def post(path, body, token=None, headers=None):
    request_headers = {'Content-Type': 'application/json', **(headers or {})}
    if token: request_headers['Authorization'] = 'Bearer ' + token
    request = urllib.request.Request(base + path, data=json.dumps(body).encode(), headers=request_headers)
    return json.load(urllib.request.urlopen(request, timeout=10))

try:
    for attempt in range(60):
        if process.poll() is not None: raise RuntimeError('Preview API did not start; see preview-api.log.')
        try:
            urllib.request.urlopen(base + '/status', timeout=1).close(); break
        except OSError: time.sleep(0.25)
    owner = post('/setup', {'name': 'Administrador', 'email': credentials['email'], 'password': password, 'role': 'admin'}, headers={'X-Setup-Code': env['NEXO_SETUP_CODE']})
    admin = post('/login', {'email': credentials['email'], 'password': password})['token']
    member = post('/users', {'name': 'Ana Costa', 'email': credentials['participantEmail'], 'password': password, 'role': 'member'}, admin)
    post('/users', {'name': 'João Lima', 'email': 'joao.demo@example.com', 'password': password, 'role': 'member'}, admin)
    form = {'id': 'vistoria', 'title': 'Vistoria de campo', 'userIds': [owner['id'], member['id']], 'questions': [
        {'id': 'condicoes', 'title': 'As condições do local estão adequadas?', 'type': 'yesno', 'required': True, 'options': []},
        {'id': 'observacoes', 'title': 'Observações da visita', 'type': 'text', 'required': False, 'options': []}]}
    post('/forms', form, admin)
    member_token = post('/login', {'email': credentials['participantEmail'], 'password': password})['token']
    post('/answers', {'operationId': 'preview-answer', 'answer': {'formId': 'vistoria', 'userId': member['id'],
        'values': {'condicoes': 'Sim', 'observacoes': 'Visita concluída. Equipe orientada e ambiente organizado.'},
        'photos': {}, 'completed': True, 'revision': 0}}, member_token)
    print('Isolated preview API ready on port 5000. Demonstration data only.', flush=True)
    process.wait()
finally:
    if process.poll() is None: process.terminate(); process.wait(timeout=10)
    log.close()
