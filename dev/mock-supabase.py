#!/usr/bin/env python3
"""FAUX SUPABASE (tests uniquement) : imite les quelques adresses utilisées par sudo
(connexion par code, comptes invités, tables records / transfers / groupes, fichiers photos)
avec les mêmes règles d'accès que supabase.sql. Tout reste en mémoire, rien ne sort de l'ordinateur.
Lancer : python3 dev/mock-supabase.py   → http://localhost:54321 , clé : sb_publishable_test
Code de connexion : toujours 123456."""
import json, re, time, uuid, random, itertools
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs, unquote

KEY = 'sb_publishable_test'
users, sessions, refresh = {}, {}, {}
records, transfers, groups, members, items, files = {}, {}, {}, {}, {}, {}
seq = itertools.count(1)

def new_session(u):
    t, r = 'tok-' + uuid.uuid4().hex, 'ref-' + uuid.uuid4().hex
    sessions[t] = u['id']; refresh[r] = u['id']
    return {'access_token': t, 'refresh_token': r, 'expires_in': 3600, 'expires_at': int(time.time()) + 3600, 'token_type': 'bearer', 'user': u}

def lww(store, key, row):
    old = store.get(key)
    if old and row['mtime'] < old['mtime']: return
    row['seq'] = next(seq); store[key] = row

def is_member(g, uid): return (g, uid) in members

class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS')
    def out(self, code, body=None, raw=None, ctype='application/json'):
        self.send_response(code); self.cors()
        data = raw if raw is not None else (b'' if body is None else json.dumps(body).encode())
        self.send_header('Content-Type', ctype); self.send_header('Content-Length', str(len(data))); self.end_headers()
        self.wfile.write(data)
    def err(self, code, msg): self.out(code, {'message': msg, 'msg': msg})
    def body(self):
        n = int(self.headers.get('Content-Length') or 0)
        return self.rfile.read(n) if n else b''
    def jbody(self):
        b = self.body(); return json.loads(b) if b else {}
    def user(self):
        a = self.headers.get('Authorization', '')
        uid = sessions.get(a[7:]) if a.startswith('Bearer ') else None
        return users.get(uid)
    def do_OPTIONS(self): self.out(204)
    def do_GET(self): self.route('GET')
    def do_POST(self): self.route('POST')
    def do_PATCH(self): self.route('PATCH')
    def do_DELETE(self): self.route('DELETE')

    def route(self, m):
        if self.headers.get('apikey') != KEY: return self.err(401, 'Invalid API key')
        u = urlparse(self.path); p = u.path; q = {k: v[0] for k, v in parse_qs(u.query).items()}
        try:
            if p.startswith('/auth/v1/'): return self.auth(m, p[9:], q)
            if p.startswith('/rest/v1/'): return self.rest(m, p[9:], q)
            if p.startswith('/storage/v1/object'): return self.storage(m, p[18:])
            self.err(404, 'not found')
        except Exception as e:
            import traceback; traceback.print_exc(); self.err(500, str(e))

    def auth(self, m, ep, q):
        if ep == 'settings': return self.out(200, {'external': {'email': True}})
        if ep == 'otp':
            b = self.jbody(); print('  [mock] code 123456 envoyé à', b.get('email')); return self.out(200, {})
        if ep == 'verify':
            b = self.jbody()
            if b.get('token') != '123456': return self.err(403, 'Token has expired or is invalid')
            em = b['email'].lower()
            u = next((x for x in users.values() if x['email'] == em), None)
            if not u: u = {'id': str(uuid.uuid4()), 'email': em, 'is_anonymous': False}; users[u['id']] = u
            return self.out(200, new_session(u))
        if ep == 'signup':
            u = {'id': str(uuid.uuid4()), 'email': '', 'is_anonymous': True}; users[u['id']] = u
            return self.out(200, new_session(u))
        if ep == 'token':
            b = self.jbody(); uid = refresh.pop(b.get('refresh_token'), None)
            if not uid: return self.err(400, 'Invalid Refresh Token')
            return self.out(200, new_session(users[uid]))
        if ep == 'user':
            u = self.user(); return self.out(200, u) if u else self.err(401, 'invalid JWT')
        if ep == 'logout': return self.out(204)
        self.err(404, 'auth endpoint')

    def rest(self, m, table, q):
        me = self.user()
        if not me: return self.err(401, 'JWT required')
        uid, guest = me['id'], me['is_anonymous']
        def num(k):
            v = q.get(k, ''); return int(v[3:]) if v.startswith('gt.') else 0
        def eq(k): v = q.get(k, ''); return v[3:] if v.startswith('eq.') else None
        lim = int(q.get('limit', 1000))
        if table == 'rpc/create_group':
            if guest: return self.err(400, 'Connecte-toi avec ton e-mail pour créer un groupe')
            b = self.jbody(); g = str(uuid.uuid4())
            code = ''.join(random.choice('ABCDEFGHJKLMNPQRSTUVWXYZ23456789') for _ in range(6))
            groups[g] = {'id': g, 'code': code, 'name': b.get('p_name') or '', 'owner': uid}
            members[(g, uid)] = {'group_id': g, 'user_id': uid, 'name': b.get('p_member') or '', 'role': '', 'joined_at': time.time()}
            return self.out(200, {'id': g, 'code': code})
        if table == 'rpc/join_group':
            b = self.jbody(); code = (b.get('p_code') or '').strip().upper()
            g = next((x for x in groups.values() if x['code'] == code), None)
            if not g: return self.err(400, 'Code inconnu')
            k = (g['id'], uid)
            if k in members: members[k]['name'] = b.get('p_member') or ''
            else: members[k] = {'group_id': g['id'], 'user_id': uid, 'name': b.get('p_member') or '', 'role': '', 'joined_at': time.time()}
            return self.out(200, {'id': g['id'], 'code': g['code'], 'name': g['name']})
        if table == 'records':
            if guest: return self.err(403, 'new row violates row-level security policy')
            if m == 'GET':
                rows = sorted([r for r in records.values() if r['user_id'] == uid and r['seq'] > num('seq')], key=lambda r: r['seq'])[:lim]
                return self.out(200, rows)
            if m == 'POST':
                for r in self.jbody():
                    if r['user_id'] != uid: return self.err(403, 'new row violates row-level security policy')
                    lww(records, (uid, r['store'], r['rid']), dict(r))
                return self.out(201)
        if table == 'transfers':
            if guest: return self.err(403, 'rls')
            if m == 'GET': return self.out(200, sorted([t for t in transfers.values() if t['user_id'] == uid], key=lambda t: t['created_at'])[:lim])
            if m == 'POST':
                b = self.jbody(); t = {'id': str(uuid.uuid4()), 'user_id': uid, 'path': b['path'], 'note': b.get('note', ''), 'created_at': time.time()}
                transfers[t['id']] = t; return self.out(201, [t])
            if m == 'DELETE':
                t = transfers.get(eq('id'))
                if t and t['user_id'] == uid: del transfers[t['id']]
                return self.out(204)
        if table == 'group_members':
            g = eq('group_id')
            if not is_member(g, uid): return self.out(200, [])
            if m == 'GET': return self.out(200, sorted([dict(x) for (gg, _), x in members.items() if gg == g], key=lambda x: x['joined_at']))
            target = eq('user_id'); k = (g, target)
            allowed = target == uid or groups[g]['owner'] == uid
            if m == 'PATCH':
                if allowed and k in members: members[k].update(self.jbody())
                return self.out(204)
            if m == 'DELETE':
                if allowed: members.pop(k, None)
                return self.out(204)
        if table == 'group_items':
            if m == 'GET':
                g = eq('group_id')
                if not is_member(g, uid): return self.out(200, [])
                return self.out(200, sorted([x for (gg, _), x in items.items() if gg == g and x['seq'] > num('seq')], key=lambda x: x['seq'])[:lim])
            if m == 'POST':
                for r in self.jbody():
                    if not is_member(r['group_id'], uid): return self.err(403, 'new row violates row-level security policy')
                    lww(items, (r['group_id'], r['id']), dict(r))
                return self.out(201)
        self.err(404, f'Could not find the table public.{table}')

    def storage(self, m, rest):
        me = self.user()
        if not me: return self.err(401, 'JWT required')
        def ok(path):
            parts = path.split('/')
            if parts[0] == 'u': return parts[1] == me['id']
            if parts[0] == 'g': return is_member(parts[1], me['id'])
            return False
        if m == 'POST' and rest.startswith('/sudo/'):
            path = unquote(rest[6:])
            if not ok(path): return self.err(403, 'new row violates row-level security policy')
            files[path] = (self.body(), self.headers.get('Content-Type', 'image/jpeg')); return self.out(200, {'Key': 'sudo/' + path})
        if m == 'GET' and rest.startswith('/authenticated/sudo/'):
            path = unquote(rest[20:])
            if not ok(path) or path not in files: return self.err(404, 'Object not found')
            data, ct = files[path]; return self.out(200, raw=data, ctype=ct)
        if m == 'DELETE' and rest == '/sudo':
            for path in self.jbody().get('prefixes', []):
                if ok(path): files.pop(path, None)
            return self.out(200, [])
        self.err(404, 'storage')

if __name__ == '__main__':
    print('Faux Supabase sur http://localhost:54321  (clé : %s, code : 123456)' % KEY)
    ThreadingHTTPServer(('127.0.0.1', 54321), H).serve_forever()
