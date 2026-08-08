import http.server
import socketserver
import json
import os
import base64
import time
import threading
import cgi
import shutil
import sqlite3
from urllib.parse import urlparse, parse_qs

PORT = 8002

# 全局写锁：保证所有写操作串行，防止并发竞态
_write_lock = threading.Lock()
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_FILE = os.path.join(BASE_DIR, "database.db")
JSON_FILE = os.path.join(BASE_DIR, "database.json")  # 用于首次迁移
UPLOAD_URL = "uploads"
VIDEO_URL = "video"
PDF_URL = "pdf"
UPLOAD_DIR = os.path.join(BASE_DIR, UPLOAD_URL)
VIDEO_DIR = os.path.join(BASE_DIR, VIDEO_URL)
PDF_DIR = os.path.join(BASE_DIR, PDF_URL)
MAX_VIDEO_BYTES = 200 * 1024 * 1024
MAX_PDF_BYTES = 200 * 1024 * 1024
ALLOWED_VIDEO_EXTS = {"mp4", "webm", "mov", "ogg"}
ALLOWED_VIDEO_MIME = {"video/mp4", "video/webm", "video/quicktime", "video/ogg"}

# 自动创建必要的文件夹
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(VIDEO_DIR, exist_ok=True)
os.makedirs(PDF_DIR, exist_ok=True)

# ─── 动态 SQLite 工具函数 ───────────────────────────────────
def get_db():
    """获取 SQLite 连接（线程安全，每次调用新建连接）"""
    conn = sqlite3.connect(DB_FILE, timeout=10)
    conn.execute('PRAGMA journal_mode=WAL')
    conn.execute('PRAGMA foreign_keys=ON')
    conn.row_factory = sqlite3.Row
    return conn

def _infer_type(val):
    """推断 SQLite 列数据类型"""
    if isinstance(val, bool):
        return 'INTEGER'
    if isinstance(val, int):
        return 'INTEGER'
    if isinstance(val, float):
        return 'REAL'
    return 'TEXT'

def _to_sqlite_val(val):
    """将 Python 值转换为 SQLite 可存储的值"""
    if val is None:
        return None
    if isinstance(val, bool):
        return 1 if val else 0
    if isinstance(val, (int, float, str)):
        return val
    # 数组、字典 → JSON 字符串
    return json.dumps(val, ensure_ascii=False)

def _from_sqlite_row(row):
    """将 sqlite3.Row 转为 Python dict，自动反序列化 JSON 字段"""
    d = {}
    for k in row.keys():
        if k in ('_key', '_rowid'):
            continue
        val = row[k]
        if val is None:
            continue
        if isinstance(val, str):
            s = val.strip()
            if (s.startswith('[') and s.endswith(']')) or (s.startswith('{') and s.endswith('}')):
                try:
                    val = json.loads(val)
                except Exception:
                    pass
        if k in ('allowRedo', 'isFirstSubmission', 'isArchived', 'isOffline') and isinstance(val, int):
            val = bool(val)
        d[k] = val
    return d

def _get_table_cols(conn, table_name):
    """从数据库元数据中获取某表现有的全部列名"""
    rows = conn.execute(f'PRAGMA table_info("{table_name}")').fetchall()
    return [r['name'] for r in rows]

def db_read(key):
    """从 SQLite 动态读取 key 对应的数据"""
    conn = get_db()
    try:
        # 1. 检查是否存在名为 "{key}" 的主表
        row = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?", (key,)).fetchone()
        if row:
            cols = _get_table_cols(conn, key)
            rows = conn.execute(f'SELECT * FROM "{key}"').fetchall()
            if '_key' in cols:
                # 扁平对象展开表（如 studentPoints, timerRecords）
                res = {}
                for r in rows:
                    res[r['_key']] = _from_sqlite_row(r)
                return res
            else:
                # 数组列表表（如 gradePapers, studentAnswers）
                return [_from_sqlite_row(r) for r in rows]

        # 2. 检查是否存在 "{key}_kv" 键值表
        row_kv = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?", (f'{key}_kv',)).fetchone()
        if row_kv:
            rows = conn.execute(f'SELECT key, value FROM "{key}_kv"').fetchall()
            res = {}
            for r in rows:
                v = r['value']
                if isinstance(v, str):
                    s = v.strip()
                    if (s.startswith('[') and s.endswith(']')) or (s.startswith('{') and s.endswith('}')):
                        try:
                            v = json.loads(v)
                        except Exception:
                            pass
                res[r['key']] = v
            return res

        # 3. 检查 _meta 标量配置表
        row_meta = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='_meta'").fetchone()
        if row_meta:
            m = conn.execute("SELECT value FROM _meta WHERE key=?", (key,)).fetchone()
            if m:
                return m['value']

        return None
    finally:
        conn.close()

def db_append_row(table_name, record):
    """动态往表中追加一行数据（若遇到新列自动 ALTER TABLE 添加）"""
    with _write_lock:
        conn = get_db()
        try:
            cols = _get_table_cols(conn, table_name)
            if not cols:
                col_defs = [f'"{k}" {_infer_type(v)}' for k, v in record.items()]
                conn.execute(f'CREATE TABLE "{table_name}" ({", ".join(col_defs)})')
                cols = list(record.keys())
            else:
                for k, v in record.items():
                    if k not in cols:
                        conn.execute(f'ALTER TABLE "{table_name}" ADD COLUMN "{k}" {_infer_type(v)}')
                        cols.append(k)

            present_cols = list(record.keys())
            placeholders = ', '.join(['?'] * len(present_cols))
            col_names = ', '.join([f'"{k}"' for k in present_cols])
            values = [_to_sqlite_val(record[k]) for k in present_cols]
            conn.execute(f'INSERT INTO "{table_name}" ({col_names}) VALUES ({placeholders})', values)
            conn.commit()
        finally:
            conn.close()

def db_upsert_student_point(student_id, data):
    """单行 upsert：只更新 studentPoints 表中指定学生的一行，不影响其他学生"""
    with _write_lock:
        conn = get_db()
        try:
            cols = _get_table_cols(conn, 'studentPoints')
            row = {'_key': str(student_id), **{k: v for k, v in data.items() if k != '_key'}}
            if not cols:
                # 表不存在时先整体建表（只含这一行）
                col_defs = [f'"{k}" {_infer_type(v)}' for k, v in row.items()]
                conn.execute(f'CREATE TABLE "studentPoints" ({", ".join(col_defs)})')
                cols = list(row.keys())
            else:
                # 动态补充新列
                for k, v in row.items():
                    if k not in cols:
                        conn.execute(f'ALTER TABLE "studentPoints" ADD COLUMN "{k}" {_infer_type(v)}')
                        cols.append(k)
            # 删除该学生旧行，再插入新行（模拟 UPSERT）
            conn.execute('DELETE FROM "studentPoints" WHERE "_key" = ?', (str(student_id),))
            present_cols = [c for c in cols if c in row]
            col_names = ', '.join([f'"{c}"' for c in present_cols])
            placeholders = ', '.join(['?'] * len(present_cols))
            values = [_to_sqlite_val(row.get(c)) for c in present_cols]
            conn.execute(f'INSERT INTO "studentPoints" ({col_names}) VALUES ({placeholders})', values)
            conn.commit()
        finally:
            conn.close()

def db_upsert_timer_record(student_id, paper_id, record_data):
    """精确更新 timerRecords 表中单个学生×单个套题的计时格，不影响其他行/列"""
    with _write_lock:
        conn = get_db()
        try:
            col_name = str(paper_id)  # 列名即套题ID
            student_key = str(student_id)
            value_str = _to_sqlite_val(record_data)  # JSON字符串

            cols = _get_table_cols(conn, 'timerRecords')
            if not cols:
                # 表不存在，整体建表
                conn.execute(f'CREATE TABLE "timerRecords" ("_key" TEXT, "{col_name}" TEXT)')
                conn.execute(f'INSERT INTO "timerRecords" ("_key", "{col_name}") VALUES (?, ?)',
                             (student_key, value_str))
            else:
                # 确保该套题列存在
                if col_name not in cols:
                    conn.execute(f'ALTER TABLE "timerRecords" ADD COLUMN "{col_name}" TEXT')
                    cols.append(col_name)
                # 查该学生行是否存在
                row = conn.execute('SELECT "_key" FROM "timerRecords" WHERE "_key" = ?',
                                   (student_key,)).fetchone()
                if row:
                    # 行存在：只更新该列
                    conn.execute(f'UPDATE "timerRecords" SET "{col_name}" = ? WHERE "_key" = ?',
                                 (value_str, student_key))
                else:
                    # 行不存在：插入新行，只设该列
                    conn.execute(f'INSERT INTO "timerRecords" ("_key", "{col_name}") VALUES (?, ?)',
                                 (student_key, value_str))
            conn.commit()
        finally:
            conn.close()

def db_save_key(key, data):
    """动态保存/覆盖某个 key 的整体数据"""
    with _write_lock:
        conn = get_db()
        try:
            if data is None:
                conn.execute(f'DROP TABLE IF EXISTS "{key}"')
                conn.execute(f'DROP TABLE IF EXISTS "{key}_kv"')
                row_meta = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='_meta'").fetchone()
                if row_meta:
                    conn.execute("DELETE FROM _meta WHERE key=?", (key,))
                conn.commit()
                return

            if isinstance(data, list):
                conn.execute(f'DROP TABLE IF EXISTS "{key}"')
                if len(data) > 0:
                    col_types = {}
                    for row in data:
                        if isinstance(row, dict):
                            for k, v in row.items():
                                if k not in col_types or col_types[k] == 'TEXT':
                                    if v is not None:
                                        col_types[k] = _infer_type(v)
                                    elif k not in col_types:
                                        col_types[k] = 'TEXT'
                    if col_types:
                        col_defs = [f'"{k}" {t}' for k, t in col_types.items()]
                        conn.execute(f'CREATE TABLE "{key}" ({", ".join(col_defs)})')
                        cols = list(col_types.keys())
                        placeholders = ', '.join(['?'] * len(cols))
                        col_names = ', '.join([f'"{k}"' for k in cols])
                        insert_sql = f'INSERT INTO "{key}" ({col_names}) VALUES ({placeholders})'
                        for row in data:
                            vals = [_to_sqlite_val(row.get(c)) for c in cols]
                            conn.execute(insert_sql, vals)
                    else:
                        conn.execute(f'CREATE TABLE "{key}" ("value" TEXT)')
                        for item in data:
                            conn.execute(f'INSERT INTO "{key}" ("value") VALUES (?)', [_to_sqlite_val(item),])
                else:
                    conn.execute(f'CREATE TABLE "{key}" ("value" TEXT)')
                conn.commit()

            elif isinstance(data, dict):
                all_objs = len(data) > 0 and all(isinstance(v, dict) for v in data.values())
                if all_objs:
                    conn.execute(f'DROP TABLE IF EXISTS "{key}"')
                    rows = [{'_key': k, **v} for k, v in data.items()]
                    col_types = {}
                    for row in rows:
                        for k, v in row.items():
                            if k not in col_types or col_types[k] == 'TEXT':
                                if v is not None:
                                    col_types[k] = _infer_type(v)
                                elif k not in col_types:
                                    col_types[k] = 'TEXT'
                    col_defs = [f'"{k}" {t}' for k, t in col_types.items()]
                    conn.execute(f'CREATE TABLE "{key}" ({", ".join(col_defs)})')
                    cols = list(col_types.keys())
                    placeholders = ', '.join(['?'] * len(cols))
                    col_names = ', '.join([f'"{k}"' for k in cols])
                    insert_sql = f'INSERT INTO "{key}" ({col_names}) VALUES ({placeholders})'
                    for row in rows:
                        vals = [_to_sqlite_val(row.get(c)) for c in cols]
                        conn.execute(insert_sql, vals)
                else:
                    t_name = f'{key}_kv'
                    conn.execute(f'DROP TABLE IF EXISTS "{t_name}"')
                    conn.execute(f'CREATE TABLE "{t_name}" ("key" TEXT PRIMARY KEY, "value" TEXT)')
                    for k, v in data.items():
                        conn.execute(f'INSERT INTO "{t_name}" ("key", "value") VALUES (?, ?)', (k, _to_sqlite_val(v)))
                conn.commit()

            else:
                conn.execute('CREATE TABLE IF NOT EXISTS _meta ("key" TEXT PRIMARY KEY, "value" TEXT)')
                conn.execute('INSERT OR REPLACE INTO _meta (key, value) VALUES (?, ?)', (key, str(data)))
                conn.commit()
        finally:
            conn.close()


class RequestHandler(http.server.SimpleHTTPRequestHandler):
    def do_POST(self):
        # 1. 处理图片独立上传
        if self.path == '/api/upload':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            try:
                data = json.loads(post_data)
                b64_str = data.get('image', '')
                
                if b64_str.startswith('data:image'):
                    header, b64_str = b64_str.split(',', 1)
                    ext = header.split('/')[1].split(';')[0]
                else:
                    ext = 'png'
                
                img_data = base64.b64decode(b64_str)
                filename = f"img_{int(time.time() * 1000)}_{threading.get_native_id()}.{ext}"
                filepath = os.path.join(UPLOAD_DIR, filename)
                
                with open(filepath, 'wb') as f:
                    f.write(img_data)
                    
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'url': f'/{UPLOAD_URL}/{filename}'}).encode())
            except Exception as e:
                print(f"❌ 图片上传失败: {e}")
                self.send_response(500)
                self.end_headers()
            return

        # 1.5 处理视频上传 (自学成才)
        if self.path == '/api/upload_video':
            try:
                content_length = int(self.headers.get('Content-Length', '0'))
                if content_length <= 0:
                    self.send_response(411)
                    self.end_headers()
                    return
                if content_length > MAX_VIDEO_BYTES:
                    self.send_response(413)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({'error': 'file_too_large'}).encode())
                    return

                content_type = self.headers.get('Content-Type', '')
                if not content_type.startswith('multipart/form-data'):
                    self.send_response(400)
                    self.end_headers()
                    return

                form = cgi.FieldStorage(
                    fp=self.rfile,
                    headers=self.headers,
                    environ={'REQUEST_METHOD': 'POST', 'CONTENT_TYPE': content_type}
                )
                if 'video' not in form:
                    self.send_response(400)
                    self.end_headers()
                    return

                file_item = form['video']
                if not file_item.file or not file_item.filename:
                    self.send_response(400)
                    self.end_headers()
                    return

                original_name = os.path.basename(file_item.filename)
                name_root, ext = os.path.splitext(original_name)
                ext = ext.lower().lstrip('.') or 'mp4'
                safe_root = (name_root.strip() or 'video').replace(' ', '_')
                safe_name = f"{safe_root}_{int(time.time() * 1000)}.{ext}"
                filepath = os.path.join(VIDEO_DIR, safe_name)
                with open(filepath, 'wb') as f:
                    shutil.copyfileobj(file_item.file, f)

                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'url': f'{VIDEO_URL}/{safe_name}'}).encode())
            except Exception as e:
                print(f"❌ 视频上传失败: {e}")
                self.send_response(500)
                self.end_headers()
            return

        # 1.6 处理 PDF 上传
        if self.path == '/api/upload_pdf':
            try:
                content_length = int(self.headers.get('Content-Length', '0'))
                if content_length <= 0:
                    self.send_response(411)
                    self.end_headers()
                    return
                if content_length > MAX_PDF_BYTES:
                    self.send_response(413)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({'error': 'file_too_large'}).encode())
                    return

                content_type = self.headers.get('Content-Type', '')
                if not content_type.startswith('multipart/form-data'):
                    self.send_response(400)
                    self.end_headers()
                    return

                form = cgi.FieldStorage(
                    fp=self.rfile,
                    headers=self.headers,
                    environ={'REQUEST_METHOD': 'POST', 'CONTENT_TYPE': content_type}
                )
                if 'pdf' not in form:
                    self.send_response(400)
                    self.end_headers()
                    return

                file_item = form['pdf']
                if not file_item.file or not file_item.filename:
                    self.send_response(400)
                    self.end_headers()
                    return

                original_name = os.path.basename(file_item.filename)
                name_root, ext = os.path.splitext(original_name)
                ext = ext.lower().lstrip('.') or 'pdf'
                safe_root = (name_root.strip() or 'pdf').replace(' ', '_')
                safe_name = f"{safe_root}_{int(time.time() * 1000)}.{ext}"
                filepath = os.path.join(PDF_DIR, safe_name)
                with open(filepath, 'wb') as f:
                    shutil.copyfileobj(file_item.file, f)

                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'url': f'{PDF_URL}/{safe_name}'}).encode())
            except Exception as e:
                print(f"❌ PDF 上传失败: {e}")
                self.send_response(500)
                self.end_headers()
            return

        # 2. 处理数据保存 (SQLite 模式，天然并发安全)
        if self.path == '/api/submit':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            try:
                req = json.loads(post_data.decode('utf-8'))
                action = req.get('action')  # 获取前端的暗号
                key = req.get('key')
                new_data = req.get('data')

                if action == 'submit_paper':
                    # 🚀 动态追加一行答题记录，自动拓展新列
                    if isinstance(new_data, dict):
                        new_data = dict(new_data)
                        new_data['submitTime'] = time.strftime('%Y-%m-%d %H:%M:%S', time.localtime())
                        db_append_row('studentAnswers', new_data)
                elif action == 'upsert_student_points':
                    # 🔒 单行更新：只写当前学生，不覆盖其他学生数据
                    if isinstance(new_data, dict) and new_data.get('id'):
                        db_upsert_student_point(str(new_data['id']), new_data)
                elif action == 'upsert_timer_record':
                    # 🔒 单格更新：只写当前学生×当前套题的计时格，不覆盖其他数据
                    sid = new_data.get('studentId') if isinstance(new_data, dict) else None
                    pid = new_data.get('paperId') if isinstance(new_data, dict) else None
                    rec = new_data.get('record') if isinstance(new_data, dict) else None
                    if sid and pid and rec is not None:
                        db_upsert_timer_record(str(sid), str(pid), rec)
                else:
                    # 动态保存/覆盖配置数据
                    if key is not None:
                        db_save_key(key, new_data)

                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'status': 'success'}).encode())
            except Exception as e:
                print(f"❌ 数据保存失败: {e}")
                self.send_response(500)
                self.end_headers()
            return

    def do_GET(self):
        # 2.5 列出视频文件
        if self.path.startswith('/api/videos'):
            try:
                videos = []
                for name in os.listdir(VIDEO_DIR):
                    if name.startswith('.'):
                        continue
                    path = os.path.join(VIDEO_DIR, name)
                    if not os.path.isfile(path):
                        continue
                    stat = os.stat(path)
                    videos.append({
                        'name': name,
                        'size': stat.st_size,
                        'mtime': stat.st_mtime
                    })
                videos.sort(key=lambda v: v['mtime'], reverse=True)
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps(videos).encode('utf-8'))
            except Exception as e:
                print(f"❌ 视频列表读取失败: {e}")
                self.send_response(500)
                self.end_headers()
            return

        # 2.6 列出 PDF 文件
        if self.path.startswith('/api/pdfs'):
            try:
                pdfs = []
                for name in os.listdir(PDF_DIR):
                    if name.startswith('.'):
                        continue
                    path = os.path.join(PDF_DIR, name)
                    if not os.path.isfile(path):
                        continue
                    stat = os.stat(path)
                    pdfs.append({
                        'name': name,
                        'size': stat.st_size,
                        'mtime': stat.st_mtime
                    })
                pdfs.sort(key=lambda v: v['mtime'], reverse=True)
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps(pdfs).encode('utf-8'))
            except Exception as e:
                print(f"❌ PDF 列表读取失败: {e}")
                self.send_response(500)
                self.end_headers()
            return

        # 3. 处理数据的读取 (SQLite 模式)
        if self.path.startswith('/api/data'):
            query = parse_qs(urlparse(self.path).query)
            key = query.get('key', [None])[0]

            data = db_read(key)

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))
            return
            
        return super().do_GET()

class ThreadedHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True

if __name__ == '__main__':
    server = ThreadedHTTPServer(('0.0.0.0', PORT), RequestHandler)
    print(f"🚀 服务器已启动！(企业级多线程防爆卡模式)")
    print(f"📁 图片将独立存储于: ./{UPLOAD_DIR}/")
    print(f"📄 PDF 将独立存储于: ./{PDF_DIR}/")
    print(f"👉 本机管理入口: http://localhost:{PORT}/admin.html")
    server.serve_forever()
