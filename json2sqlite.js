#!/usr/bin/env node

/**
 * json2sqlite.js — 通用 JSON → SQLite 转换工具
 *
 * 用法:
 *   node json2sqlite.js [input.json] [output.db]
 *
 * 默认:
 *   input  = ./database.json
 *   output = ./database.db
 *
 * 支持的 JSON 结构:
 *   1. 顶层键值为 Array  → 直接建表，每个元素是一行
 *   2. 顶层键值为 Object → 如果每个 value 都是对象，则展开为表（外层 key 作为 _key 列）
 *                          否则作为 key-value 对存入 {tableName}_kv 表
 *   3. 顶层键值为标量    → 存入 _meta 表 (key TEXT, value TEXT)
 *
 * 所有嵌套对象 / 数组字段自动序列化为 JSON TEXT。
 * 依赖: sqlite3 (npm install sqlite3)
 */

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// ─── 配置 ───────────────────────────────────────────────
const args = process.argv.slice(2);
const inputFile = path.resolve(args[0] || 'database.json');
const outputFile = path.resolve(args[1] || 'database.db');

// ─── 工具函数 ──────────────────────────────────────────
/**
 * 推断 SQLite 列类型
 */
function inferSqliteType(value) {
  if (value === null || value === undefined) return 'TEXT';
  if (typeof value === 'boolean') return 'INTEGER'; // SQLite 没有 BOOLEAN
  if (typeof value === 'number') return Number.isInteger(value) ? 'INTEGER' : 'REAL';
  if (typeof value === 'string') return 'TEXT';
  // 数组、对象 → 存为 JSON 字符串
  return 'TEXT';
}

/**
 * 将 JS 值转换为 SQLite 可存储的值
 */
function toSqliteValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number' || typeof value === 'string') return value;
  // 数组、对象 → JSON 字符串
  return JSON.stringify(value);
}

/**
 * 对表名/列名进行安全引用
 */
function q(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

/**
 * 从数据行数组中收集所有列及其类型（取第一个非空值推断）
 */
function collectColumns(rows) {
  const colTypes = new Map(); // column -> SQLite type
  for (const row of rows) {
    if (typeof row !== 'object' || row === null) continue;
    for (const [key, value] of Object.entries(row)) {
      if (!colTypes.has(key) || colTypes.get(key) === 'TEXT') {
        const t = inferSqliteType(value);
        if (value !== null && value !== undefined) {
          colTypes.set(key, t);
        } else if (!colTypes.has(key)) {
          colTypes.set(key, 'TEXT');
        }
      }
    }
  }
  return colTypes;
}

/**
 * 判断一个 object 的所有 value 是否都是「扁平对象」（用于决定是否展开）
 */
function allValuesAreObjects(obj) {
  const values = Object.values(obj);
  if (values.length === 0) return false;
  return values.every(v => typeof v === 'object' && v !== null && !Array.isArray(v));
}

// ─── 数据库操作封装 ─────────────────────────────────────
function dbRun(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

// ─── 主流程 ─────────────────────────────────────────────
async function main() {
  // 1. 读取 JSON
  console.log(`📂 读取: ${inputFile}`);
  if (!fs.existsSync(inputFile)) {
    console.error(`❌ 文件不存在: ${inputFile}`);
    process.exit(1);
  }
  const raw = fs.readFileSync(inputFile, 'utf-8');
  const data = JSON.parse(raw);

  if (typeof data !== 'object' || data === null) {
    console.error('❌ JSON 顶层必须是对象 (Object)');
    process.exit(1);
  }

  // 2. 如果输出文件已存在则删除（保证幂等）
  if (fs.existsSync(outputFile)) {
    fs.unlinkSync(outputFile);
    console.log(`🗑  已删除旧数据库: ${outputFile}`);
  }

  // 3. 打开 SQLite
  const db = new sqlite3.Database(outputFile);
  console.log(`💾 输出: ${outputFile}\n`);

  // 开启 WAL 和外键
  await dbRun(db, 'PRAGMA journal_mode=WAL');
  await dbRun(db, 'PRAGMA foreign_keys=ON');

  const metaRows = []; // 收集标量，最后统一写入 _meta

  for (const [tableName, value] of Object.entries(data)) {
    // ── 情况 1: 数组 → 直接建表 ─────────────────────
    if (Array.isArray(value)) {
      if (value.length === 0) {
        console.log(`⏭  跳过空数组: ${tableName}`);
        continue;
      }
      const colTypes = collectColumns(value);
      if (colTypes.size === 0) {
        // 全是标量数组（不常见），存为单列
        const createSql = `CREATE TABLE ${q(tableName)} ("value" TEXT)`;
        await dbRun(db, createSql);
        await dbRun(db, 'BEGIN TRANSACTION');
        for (const item of value) {
          await dbRun(db, `INSERT INTO ${q(tableName)} ("value") VALUES (?)`, [toSqliteValue(item)]);
        }
        await dbRun(db, 'COMMIT');
        console.log(`✅ ${tableName}: ${value.length} 行 × 1 列 (标量数组)`);
        continue;
      }

      // 建表
      const colDefs = Array.from(colTypes.entries())
        .map(([col, type]) => `${q(col)} ${type}`)
        .join(', ');
      const createSql = `CREATE TABLE ${q(tableName)} (${colDefs})`;
      await dbRun(db, createSql);

      // 插入数据
      const cols = Array.from(colTypes.keys());
      const placeholders = cols.map(() => '?').join(', ');
      const insertSql = `INSERT INTO ${q(tableName)} (${cols.map(q).join(', ')}) VALUES (${placeholders})`;

      await dbRun(db, 'BEGIN TRANSACTION');
      for (const row of value) {
        const params = cols.map(c => toSqliteValue(row[c]));
        await dbRun(db, insertSql, params);
      }
      await dbRun(db, 'COMMIT');
      console.log(`✅ ${tableName}: ${value.length} 行 × ${cols.length} 列`);

    // ── 情况 2: 对象 ────────────────────────────────
    } else if (typeof value === 'object' && value !== null) {
      const entries = Object.entries(value);
      if (entries.length === 0) {
        console.log(`⏭  跳过空对象: ${tableName}`);
        continue;
      }

      if (allValuesAreObjects(value)) {
        // 2a. 所有 value 都是对象 → 展开为表，外层 key 作为 _key 列
        const rows = entries.map(([k, v]) => ({ _key: k, ...v }));
        const colTypes = collectColumns(rows);

        const colDefs = Array.from(colTypes.entries())
          .map(([col, type]) => `${q(col)} ${type}`)
          .join(', ');
        const createSql = `CREATE TABLE ${q(tableName)} (${colDefs})`;
        await dbRun(db, createSql);

        const cols = Array.from(colTypes.keys());
        const placeholders = cols.map(() => '?').join(', ');
        const insertSql = `INSERT INTO ${q(tableName)} (${cols.map(q).join(', ')}) VALUES (${placeholders})`;

        await dbRun(db, 'BEGIN TRANSACTION');
        for (const row of rows) {
          const params = cols.map(c => toSqliteValue(row[c]));
          await dbRun(db, insertSql, params);
        }
        await dbRun(db, 'COMMIT');
        console.log(`✅ ${tableName}: ${rows.length} 行 × ${cols.length} 列 (对象展开)`);

      } else {
        // 2b. 混合 value → 存为 key-value 表
        const tName = `${tableName}_kv`;
        await dbRun(db, `CREATE TABLE ${q(tName)} ("key" TEXT PRIMARY KEY, "value" TEXT)`);
        await dbRun(db, 'BEGIN TRANSACTION');
        for (const [k, v] of entries) {
          await dbRun(db, `INSERT INTO ${q(tName)} ("key", "value") VALUES (?, ?)`, [k, toSqliteValue(v)]);
        }
        await dbRun(db, 'COMMIT');
        console.log(`✅ ${tName}: ${entries.length} 行 (key-value)`);
      }

    // ── 情况 3: 标量 → 收集到 _meta ─────────────────
    } else {
      metaRows.push([tableName, String(value)]);
    }
  }

  // 写入 _meta 表
  if (metaRows.length > 0) {
    await dbRun(db, 'CREATE TABLE "_meta" ("key" TEXT PRIMARY KEY, "value" TEXT)');
    await dbRun(db, 'BEGIN TRANSACTION');
    for (const [k, v] of metaRows) {
      await dbRun(db, 'INSERT INTO "_meta" ("key", "value") VALUES (?, ?)', [k, v]);
    }
    await dbRun(db, 'COMMIT');
    console.log(`✅ _meta: ${metaRows.length} 行 (标量配置)`);
  }

  // 关闭数据库
  await new Promise((resolve, reject) => {
    db.close(err => (err ? reject(err) : resolve()));
  });

  console.log('\n🎉 转换完成！');
}

main().catch(err => {
  console.error('❌ 转换失败:', err.message);
  process.exit(1);
});
